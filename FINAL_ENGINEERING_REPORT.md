# Final engineering report

Scope: take over `master`, audit (`AUDIT_CURRENT_STATE.md`), repair, harden, test, and push. Everything below distinguishes **verified** (a command ran and passed) from **NOT VERIFIED** (code written, but no environment here to prove it).

## Verification results

| Check | Result |
| --- | --- |
| `npm test` | 96 / 96 pass (was 21; most old tests were regex-over-source) |
| `npm run lint` | 0 errors, 0 warnings (was 46 errors) |
| `npm run build` (web) | passes; entry JS 377 KB → 235 KB (121 → 75.8 KB gzip); `AppShell` now a lazy chunk |
| `cd mobile && npx tsc --noEmit` | clean |
| `npx expo export --platform android` | Metro bundle succeeds (Hermes 6.1 MB), bundled exercise JPEGs resolved from `shared/` |
| `npx expo export --platform ios` | Metro bundle succeeds (5.7 MB) |
| `npm audit --omit=dev` (web/API) | 0 vulnerabilities |
| `npm audit --omit=dev` (mobile) | 29 (19 high, 10 moderate), all transitive Expo/React-Native build tooling (`@expo/cli`, `metro`, `braces`, …). The only offered "fixes" are downgrades to Expo 44 / RN 0.72, which would break the app, so none were applied. Not exploitable at runtime in the shipped bundle; revisit with the next Expo SDK. |
| Secret scan (tracked + untracked source) | no keys, tokens or service-role keys; only the publishable-key *pattern* in test fixtures. `.env.local` (Vercel OIDC token) is ignored and untracked. |

## NOT VERIFIED (no credentials / device / database available here)

- **All SQL.** Migrations were never executed against Postgres (no local DB). `tests/schema-contract.test.js` only asserts text. Run `supabase db reset` on an empty project and `supabase db push` on staging before production. Risky spots flagged by the author: slug backfill collisions, the `exception … if sqlstate = '22023' then raise` handler in `sync_workout_graph`, and whether live data already has duplicate bodyweight days (the unique index is skipped when it does).
- **Live AI.** No NVIDIA/OpenAI call was made; handlers were tested with mocked providers. Real model output quality, the stricter JPEG check (SOF marker *and* trailing FFD9) rejecting unusual real photos, and the 20 s provider budget are unproven.
- **Authenticated end-to-end flows** (sign-up/login, workout lifecycle against real Supabase, coach → start → complete, scan → save → totals, body metrics propagation). Web layout was measured in headless Chrome with mocked Supabase at 390/393/412/1280 widths for Home/Progress; other screens were not rendered.
- **Mobile on device/emulator:** airplane mode, kill-during-workout, reconnect, duplicate retry, logout/login, account switching, keyboard behaviour with the floating tab bar, camera/library permissions. Only typecheck and Metro bundling ran.
- **Native builds** (EAS Android/iOS, signing, store requirements) — not attempted.
- RLS behaviour with two real accounts (cross-user access) is verified only by reading policies and by handler tests with mocks.

## Bugs found and fixed

### Exercise images (P0)
- Cause: six unowned `googleusercontent` URLs matched by exact name (the incline-press URL already returned HTTP 400), inline-JSX scenes on web only, **no imagery on mobile**, and an ordered `includes` matcher that resolved "Romanian Deadlift" to "Deadlift".
- Fix: one canonical catalog (`shared/exerciseCatalog.js`: 27 exercises, aliases, patterns, longest-label matching, `art:{photo,scene}`), 5 bundled photographs in `shared/exercise-art/` (the dead incline URL falls back to the drawn scene), 20 drawn movement scenes as inline SVG strings (`shared/exerciseScenes.js`). Web (`ExerciseVisual.jsx`) and mobile (`ExerciseVisual.tsx`, Metro `watchFolders`) layer: scene always rendered → photo fades in on load → photo error falls back to scene. Shown in Home, Train, Library, Builder, Active workout, History, Progress, Coach plans, AI import (web) and Train/library/active/session detail/Coach plans/import (mobile). Test asserts no remote URL, every seeded exercise resolves, files are real JPEGs and registered on both platforms.

### Security
- Removed hard-coded Supabase URL/key fallbacks (API, web, mobile); missing config now shows an explicit config screen.
- `/api/ai-chat` authenticates before content-type/body handling (was after); Authorization header length capped; tokens/provider text redacted from logs.
- Coach output grounded to the real catalog: plans carry server-resolved `exerciseId`; unmatched names are dropped and reported, never invented (web used to invent `custom-*` ids that made the whole sync fail). Prose replies cannot create a plan; malformed JSON → 502; control/zero-width characters stripped; user and athlete data passed as delimited data.
- Food images: MIME + magic bytes + structural checks (PNG IHDR/IEND, JPEG SOF/EOI, WebP RIFF length), distinct error codes, one bounded retry on malformed model output.
- SQL: `sync_workout_graph` pinned `search_path`, rows can no longer be re-parented, removed children are deleted on resync, bad casts raise clean `22023`; metrics RPC no longer overwrites with NULL; legacy loose SQL (weaker RLS, anon-readable) moved to `supabase/legacy/`.
- Mobile session in SecureStore (chunked), plaintext AsyncStorage copy deleted, no plaintext fallback.
- Web auth: fixed stale-session resurrection after sign-out; sign-out clears per-user caches (but deliberately keeps the unsynced-workout queue, which is user data).

### Sync / data integrity
- Mobile: DB init awaited before UI/outbox; per-user honest sync states (`local_only/syncing/synced/retrying/failed/offline`) derived from the outbox, never default-"Synced"; network failures don't burn attempts; permanent server rejections surface as failed with last error; auto-retry on foreground + 30 s; concurrent-call rerun; sign-out flushes/warns/clears only that account; History/Home/Progress read local SQLite so unsynced workouts appear with a badge.
- Web: stable workout graph id (retry-idempotent), persisted draft phase/startedAt, offline pending queue with retry on load/online, honest "Not synced yet", draft no longer clobbered by Coach/Import/Library (confirm + merge), reset clears state.

### Product / UX
- Mobile now has: exercise library (search, filters, detail, offline cache), builder, full active-workout editor (add/remove sets/exercises, warm-ups, notes, RPE/RIR, previous performance, isolated rest timer, crash-safe debounced persistence, duplicate-session fix, zero-value fix), history detail, body metrics (same formulas as web), nutrition journal + scan with editable review + save, coach plan cards → real workout, import with review step, athlete space (own stats only), settings (real sync status/retry), tab bar safe-area/keyboard handling.
- Web: Home duplicated sections removed and stacked-digit Counter bug fixed (global `display:block` on spans), bottom padding 278 px → single owner, readable Progress chart and all-time per-exercise PRs, Train heading overlap, one primary CTA, nutrition form 2-column + sticky save, RPE/RIR pickers usable at 390 px, coach timeout 25 s and send icon fixed, profile save verifies the row, streak honours rest days and isn't capped, UTC "today" bugs replaced by local days, food photos downscaled before upload (Vercel 4.5 MB body limit).

### Performance
Web entry chunk −38 %; lazy AppShell; render-blocking font `@import` replaced by non-blocking link; incremental list rendering and debounced/aborting library search; ticking timers isolated in memoized components (web and mobile); 3.7 k lines of dead legacy code and `recharts` removed. Mobile: FlatList for library/history, memoized rows, transactional SQLite writes, versioned migrations (no per-launch PRAGMA scans). No before/after profiling beyond bundle size was done.

### Cleanup
Deleted `src/pages/*`, legacy components/CSS, `tmp_mobile/` template, dead mobile `ai-context.ts`; fixed the Dock Space-key bug; removed demo defaults from `PromptBar`.

## Remaining limitations / follow-ups
1. Run the SQL on a real database (see above) and apply migrations in order; record the result.
2. Hydration reminder remains a minimal, off-by-default feature.
3. Mobile cannot resize photos (`expo-image-manipulator` not installed): photos use quality 0.4 and are rejected with a message if > 3.5 MB.
4. Scan review: editing an item's portion does not recalculate macros; the user edits totals.
5. `title` of a mobile workout is stored locally only; the sync RPC ignores it.
6. No social features exist; Athlete space is honest own-stats only.
7. React Bits: existing selective primitives (Counter, Dock, GlassSurface, PromptBar, AnimatedList, Stepper, HoldButton) are real upstream-derived components; none were added to mobile (web-DOM components are not portable) and no library was installed wholesale.
8. Legacy planning docs (`CURRENT_APP_DOSSIER.md`, `FEATURE_MATRIX.md`, `ROADMAP_RECOMMENDATIONS.md`, …) pre-date this pass and are partly stale.
9. Mobile dependency audit findings (see table) need an Expo SDK upgrade, not a downgrade.
10. A QA sub-task ran `taskkill /IM chrome.exe` once during the web audit; any open Chrome windows on the machine may have been closed.
