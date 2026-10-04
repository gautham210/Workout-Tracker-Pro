# Audit of the current state (taken at commit 2728dc7, branch `master`)

This document records what the repository looked like **before** the production pass. `FINAL_ENGINEERING_REPORT.md` records what changed and what could not be verified.

## 1. Branches and release state

- `origin/master` (2728dc7) is the newest engineering line. `origin/main` (10d378d) is an ancestor of `master` and is roughly 60 commits behind. GitHub's visible/default branch is therefore **stale**; all work in this pass was done on and pushed to `master`.
- Local tree was clean. `tmp_mobile/` (an unused Expo template, 1 MB with a nested `package-lock.json`), `scratch/`, `dist/` and `stitch-design/` exist locally; only `tmp_mobile/` was tracked.
- Root contained seven loose, superseded SQL files that weaken RLS if re-run.

## 2. Architecture map

| Layer | Tech | Location |
| --- | --- | --- |
| Web | React 19, Vite 8, plain CSS (`src/product.css`, 118 KB), React Router 7, `motion` | `src/` |
| Mobile | Expo 57, React Native 0.86, Expo Router, expo-sqlite, SecureStore | `mobile/` |
| API | Vercel serverless functions (`api/*.js`), OpenAI SDK pointed at NVIDIA NIM (OpenAI fallback for food) | `api/` |
| Data | Supabase Postgres + Auth + RLS; RPCs `sync_workout_graph(s)`, `save_athlete_metrics`, `consume_api_rate_limit` | `supabase/migrations/` |
| Design source | Stitch exports (gitignored) | `stitch-design/` |

### Web
Only `src/product/*Experience.jsx` is routed from `App.jsx`. All of `src/pages/*` (about 3.7k lines), `components/{MainLayout,Dropdown,HydrationManager,WorkoutTimer}.jsx`, `lib/progressionEngine.js`, `App.css` and the `recharts` dependency were dead legacy code carrying 50 lint errors. Workout drafts live in `localStorage` (`wtp_workout_draft_v2_<uid>`); the only server write is `sync_workout_graph` on finish.

### Mobile
Five tabs (Home, Train, Progress, Coach, Profile) plus hidden Nutrition. Local SQLite (`workout_tracker.db`, `user_version` 2) holds `workout_sessions`, `session_exercises`, `sets`, `exercises`, `sync_outbox`; History/Insights/Home read **Supabase only**, so an offline or just-finished workout was invisible.

### Backend / API
`/api/ai-chat`, `/api/parse-workout`, `/api/parse-food`. All authenticate via `supabase.auth.getUser(token)` and consume a Postgres-backed per-user quota before provider work (fail-closed). Contracts are shared by web (`src/lib/api.js`) and mobile (`mobile/lib/api.ts`).

### Sync
One atomic RPC per finished workout (`sync_workout_graph`, owner = `auth.uid()`, upsert by id → idempotent). Mobile queues it in `sync_outbox`.

### Authentication
Supabase email/password. Web persists in localStorage; mobile in SecureStore with an AsyncStorage fallback.

### AI flow
Chat → authenticated API → RLS-bound context loader (profile, body metrics, nutrition, last 12 sessions) → NVIDIA Llama 3.1 8B → JSON → validator → client preview. Food: image → data-URI validation → Llama 3.2 11B Vision → tolerant parser → validator.

### Image / exercise asset flow (before)
- Six hard-coded `lh3.googleusercontent.com/aida-public/...` URLs matched by exact lower-cased name. **One (incline press) already returns HTTP 400**; the others are unowned, unsigned-expiry links.
- Everything else used an inline-JSX SVG scene system on the web only.
- **Mobile had no exercise imagery at all** (first-letter glyph).
- Matching used `key.includes(label)` over an ordered list, so "Romanian Deadlift" resolved to "Deadlift".

## 3. Issues by priority

### P0 – broken / security / data-loss / blocking
1. Exercise images depend on remote URLs (one dead); none on mobile.
2. Fresh DB cannot be built from migrations: `03_*`/`04_*` sort before the canonical migration; `rls_auto_enable()` revoke targets a function no file defines.
3. AI coach plans carried free-text exercise names; web invented `custom-<random>` ids that `sync_workout_graph` rejects, failing the whole save. No catalog grounding.
4. Mobile sign-out never cleared/flushed the local DB or warned about unsynced workouts; sync state was a global singleton defaulting to **"Synced"** (false success) and shown to the next account.
5. Mobile `initDb()` was fire-and-forget; outbox/screens could run before tables existed.
6. Mobile History/Home/Insights read Supabase only: unsynced/offline workouts invisible.
7. Mobile food scan result was thrown away (nothing persisted); Coach plan discarded.
8. Mobile sign-up claimed "check your email" unconditionally.
9. Web `AuthContext` can resurrect a signed-out user (stale initial-session re-delivery).
10. Hard-coded production Supabase URL/key fallbacks in `api/_auth.js`, `src/lib/supabase.js`, `mobile/lib/supabase.ts`.

### P1 – major functionality
- Loose root SQL downgrades RLS if re-run (anon `using(true)`, no `WITH CHECK`, `handle_new_user` without `search_path`).
- `save_athlete_metrics` overwrote existing values with NULL and created duplicate daily weight rows; ignored `age`.
- `sync_workout_graph` never deleted removed children; allowed moving rows between sessions.
- No automatic sync retry on mobile (no AppState/interval), network errors counted as permanent failures.
- Web: `resetWorkout` left old sets; Coach/Import/Library clobbered an in-progress draft; `split_day` hard-coded `Custom`; `phase/startedAt` not restored; workout id regenerated on retry (duplicates).
- Streak ignored rest days and was capped at 18 sessions; PRs were window-bests, not all-time; UTC "today" bugs in Home/Nutrition/Insights.
- Food photos over ~3.3 MB were rejected by Vercel (4.5 MB body limit) before reaching the validator.
- Coach client timeout (12 s) shorter than server work; send icon `viewBox` invalid; no `functions.maxDuration`.
- Profile save reported success on a 0-row update; wrote literal "Athlete".
- Mobile active workout: duplicate unfinished sessions (effect re-run), zero values lost on resume, no add/remove sets or exercises, no warm-up, edits persisted only on blur.
- Mobile import dropped unmatched exercises silently; library limited to 20 rows.

### P2 – UX / performance
- Home Counter digits stacked vertically (global `display:block` on spans); duplicated Nutrition/Insights/History/Coach sections; stacked ~278 px bottom padding; washed-out Progress chart; Train heading letter-spacing overlap; nutrition form cramped.
- Mobile tab bar (absolute, 86 px) covered CTAs and inputs; deprecated `SafeAreaView`; no keyboard avoidance; ScrollView lists.
- Eager `AppShell` in entry chunk; render-blocking Google Fonts `@import`; library renders up to 120 SVGs without virtualization.
- `userInterfaceStyle: dark` on a light app; no per-profile EAS env; no 192/512 PNG icons.

### P3 – polish / cleanup
Dead HydrationAlert/ai-context on mobile; fake settings labels ("Liquid Dark (Locked)"); emoji icons; duplicate Dock Space-key bug; `dns.google` probe in NetworkToast; unused template app `tmp_mobile/`.

## 4. Security review summary

- Good already: auth precedes quota and expensive work; quota is shared in Postgres; image magic bytes checked; RLS on all user tables; no secrets in repo (publishable key only); user id never read from payloads.
- Gaps: see P0 items 3, 4, 10; CORS allow-list fine; error bodies did not leak provider text.

## 5. Testing at audit time

21 tests, almost entirely regex-over-source; none executed SQL, handlers or analytics. No mobile tests, no CI. ESLint: 46 errors (all in dead legacy code plus a few in `AuthContext`).

## 6. Deployment assumptions

Vercel serves the Vite build and `api/*`; mobile talks to the same origin via `EXPO_PUBLIC_BACKEND_URL` (development default targets an Android emulator host). Supabase project is remote; migrations are applied by CLI and are not verifiable from this workspace.
