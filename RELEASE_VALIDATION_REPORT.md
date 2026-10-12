# RELEASE VALIDATION REPORT — Workout Tracker Pro

**Date:** 2026-10-12
**Branch:** `remediation/audit-fixes`
**Head at time of writing:** `225ad75` (plus the cross-account isolation test commit below)
**Supersedes:** the previous `RELEASE_VALIDATION_REPORT.md`, which recorded `f2ded00` as a
fully certified release while simultaneously reporting that live AI generation was failing
with HTTP 410 and HTTP 504.

---

# VERDICT: NOT CERTIFIED

Three release gates are blocked. Two of them cannot be closed from this workspace at all,
because the environment has no provider credentials and no SQL execution path.

| Gate | Status |
| --- | --- |
| Critical data-corruption defects fixed and tested | **PASS** |
| Automated release gates in place and green | **PASS** |
| Database state verified | **PARTIAL** — ledger verified, schema/RLS/grants NOT verified |
| **Live AI generation** | **BLOCKED** — no provider credentials exist |
| **Cross-user RLS proven against a database** | **BLOCKED** — no SQL execution path |
| **Mobile behavioural tests** | **NOT DONE** — unsupported toolchain in this workspace |

---

## 1. Automated gates — all run, all recorded

Every command below was executed in this workspace. Nothing is quoted from a previous report.

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | **0 errors**, 20 warnings (all pre-existing mobile findings, see §5) |
| Logic tests | `npm run test:logic` | **128 passed, 0 failed, 1 skipped** (129 total) |
| Behavioural tests | `npm run test:ui` | **34 passed**, 6 files |
| Production build | `npm run build` | **succeeds**, entry 237.80 kB / 76.67 kB gzip |
| Mobile typecheck | `npm run typecheck:mobile` | **exit 0**, no type errors |
| Android bundle | `npx expo export --platform android` | **succeeds**, Hermes bytecode 6.1 MB |
| iOS bundle | `npx expo export --platform ios` | **succeeds**, Hermes bytecode 5.7 MB |
| Production dependencies | `npm audit --omit=dev` | **0 vulnerabilities** |

The single skipped test is `rls-cross-user`, which skips **loudly** because no disposable
database is configured. That skip is a blocked gate, not a passing gate.

## 2. Defects found and fixed, each with a test that fails without the fix

### Cross-account privacy leak — `useChatThread`

**Reproduced:** on an account switch the persistence effect ran with the new storage key and
the previous account's messages. Test output before the fix showed
`"alpha secret | assistant reply | beta secret"` written into user A's key.

The guard meant to prevent this was satisfied one tick early: `loadedKey.current` was set
*before* `setMessages` committed. A `messagesKey` ref is now advanced in the same tick that
swaps `messages`, so the persist effect sees a mismatch and skips. Affects Coach and
Nutritionist, which share the hook.

### Fabricated offline history — `HistoryExperience`

**Reproduced:** the rendered DOM read
`Today · Workout · Session · not synced · Training day · 0 movements · 0 kg volume`.
A queued workout was displaying as an empty session dated today, because the adapter read a
shape `enqueuePendingWorkout` never writes and fell back to the *render* timestamp.

Now reads the real graph. Movement names are captured as a `labels` map at enqueue time,
because `exercises.id` is a server-generated uuid that cannot be resolved while the device is
offline — which is exactly when pending work exists. A missing date now falls back to the
stored queue timestamp, never to render time.

### Import row identity and account guard — `ImportExperience`

The React key embedded the user-editable movement name, so every keystroke remounted the row
and dropped the caret after one character. Verified by reverting the key and watching the
focus test fail. Rows now carry a stable key assigned at parse time. `saveHistory`
dereferenced `user.id` without a guard and surfaced `Cannot read properties of undefined` to
the user on a network failure.

> Note: the original audit claimed renaming destroyed *manually mapped* catalogue rows. A test
> was written to check it and **passed** — `{...exercise}` preserves `catalogId`. That claim was
> not acted on.

### Keyboard access — `HoldButton`

`keydown`/`keyup` matched only `''` and `'Enter'`. Space is `' '`, so holding Space did
nothing on the only control that finishes a workout. Space now drives the hold gesture and
Enter fires the component's existing `onTap` immediately, so no keyboard user has to satisfy
an 850 ms timed hold.

### AI request lifecycle

| Problem | Before | After |
| --- | --- | --- |
| SDK retries | default `maxRetries: 2`, unpinned | pinned to `0` on both text endpoints |
| Orphaned provider work | `Promise.race` vs an uncleared `setTimeout`, no signal | real `AbortSignal` per attempt |
| Silent catalogue failure | DB error → `[]` → every plan voided, HTTP 200, no log | logged 503 |
| Bidi spoofing | `validateWorkoutParse` never stripped control characters | stripped on names, splits, ambiguous labels |
| Client vs server timeout | client aborted at 25 s while server could run 25 s | 12 s attempt → ~25 s server → 30 s function → 45 s client |
| Test-only auth seam | `__setDeps` exported from all 3 production handlers | throws on `NODE_ENV=production`, no longer re-exported |
| Caching | responses cacheable | `Cache-Control: no-store`, `nosniff`, `Retry-After` exposed |

## 3. Database — what was verified, and what was not

### Verified (read-only, against the linked project `workout-helper-pro`)

```
supabase db push --linked --dry-run
→ {"upToDate":true,"dryRun":true,"migrations":[],"message":"Remote database is up to date."}
```

This **disproves** a finding in the original audit, which warned that `03_*` / `04_*` might be
missing from the ledger and would silently downgrade production RLS on the next push. With
zero pending migrations, the ledger already contains them.

Also verified statically: `20260921020000 "fix_sync_graph_uuid_children"` is a **genuine
no-op**. Both function bodies are 5687 characters and identical after whitespace
normalisation, and both already contain all five `::uuid` casts the migration claims to
introduce. This is now asserted by a test so it cannot rot silently.

### Changes made (none applied to production)

- `20260920000000` created eight policies with bare `CREATE POLICY`; a second application
  aborted on the first existing policy and left the database half migrated. Added
  `DROP POLICY IF EXISTS` before each.
- All seven `supabase/legacy/*.sql` scripts opened with *"Run this in your Supabase SQL Editor"*
  and would downgrade production if pasted — weaker `USING (true)` policies, a
  `SECURITY DEFINER handle_new_user` without `search_path`, and a `duration_minutes` type
  conflict. Each now raises unconditionally.
- Least-privilege hardening is **staged in `supabase/pending/`, not in `supabase/migrations/`**,
  so a routine `db push` cannot apply it unreviewed.

### NOT VERIFIED

| Item | Why |
| --- | --- |
| Live table grants / `TRUNCATE` privileges | `supabase db dump` requires Docker; no local Postgres, `psql` or SQL client |
| Live RLS policies as deployed | same |
| Cross-user isolation in practice | same — `tests/sql/rls-cross-user.sql` is written and committed but has never been executed |
| `20260921040000` / `20260922000000` actually applied | *inferred* from an up-to-date ledger, not confirmed directly |

The RLS probe exists and is runnable:

```bash
SUPABASE_DB_URL='postgresql://postgres:<pw>@localhost:54322/postgres' \
ALLOW_RLS_PROBE=1 npm run test:logic
```

It runs in a transaction and rolls back, and refuses hosts that look like production.

## 4. Live AI generation — BLOCKED

**No provider call was made.** `NVIDIA_API_KEY` and `OPENAI_API_KEY` are both absent from this
workspace, so no model was ever contacted.

The previous report recorded that the configured NVIDIA key returns **HTTP 410 Gone** and the
food scanner returns **HTTP 504**. Those are the most recent observed production results and
they are consistent with a key that lacks hosted-inference provisioning.

**This gate cannot be closed until a working key is provisioned and all three endpoints are
exercised against it.** Per the release standard, a deterministic fallback must not be counted
as successful AI generation. As a direct result of this pass, the fallback is now *visible to
the user* rather than silent, and `tests/api-ai-lifecycle.test.js` asserts that an aborted or
failed provider call reports `source: "fallback"` rather than `source: "ai"`.

## 5. Mobile — partial

**Done:** TypeScript enforced in CI; `mobile/` removed from ESLint's `globalIgnores` so
Rules of Hooks violations are now detectable; Android and iOS bundles export cleanly.

**Not done:** behavioural tests. `mobile/lib/db.ts` (local schema), `lib/sync.ts` (outbox) and
`components/SetRow.tsx` (`sanitizeSetInput`) remain untested.

A harness was built and then **removed**. `react-native` ships Flow syntax, `expo` requires a
Metro-only runtime, and `expo-sqlite` pulls in `expo-asset`; each workaround exposed another
native-coupled import. Shipping a suite that works only because of five hand-written stubs
would be a false gate that breaks on the next SDK bump.

**Recommended path:** `jest-expo` + `@testing-library/react-native`, per `TEST_MATRIX.md`.

**20 tracked lint warnings** now surface in 16 mobile files (`react-hooks/refs`,
`set-state-in-effect`, `preserve-caught-error`). They are pre-existing and need a deliberate
refactor with on-device verification. They are left visible as warnings rather than
suppressed.

## 6. Test coverage added this pass

| Suite | Tests | Covers |
| --- | --- | --- |
| `useChatThread.test.jsx` | 7 | account-switch isolation, rehydration, error-bubble persistence |
| `historyPending.test.jsx` | 7 | offline workouts render real dates, movements, volume, duration |
| `importReview.test.jsx` | 6 | mapping preservation, row identity, account guard, AI provenance |
| `holdButton.test.jsx` | 9 | Space/Enter, timing-free alternative, Escape cancel, pointer hold |
| `nutritionScan.test.jsx` | 4 | timeout signal, timeout/offline/provider recovery |
| `api-ai-lifecycle.test.js` | 13 | retry bounding, cancellation, truthful failure, stripping, seam |
| `migrations-repeatable.test.js` | 7 | policy/table guards, search_path, duplicate verification, legacy guards |
| `rls-cross-user.test.js` | 3 | probe integrity + **skips** the live probe |
| `cross-account-isolation.test.js` | 6 | queue and draft namespacing, flush containment |
| `web-hygiene.test.js` (extended) | +4 | CSP, `no-store`, CI wiring, seam closure |

## 7. Also done

- **CI**: `.github/workflows/ci.yml` — lint, both test suites, build, mobile typecheck,
  production audit, gitleaks. There was previously **no CI at all**.
- **Error boundaries**: app root and route level. There was previously **none**, so one throw
  blanked the app. The UI shows only a short reference id, never a stack trace or the original
  message, which can contain exercise notes and body metrics.
- **Security headers**: CSP, HSTS, nosniff, DENY framing, Referrer-Policy,
  Permissions-Policy, `no-store` on `/api`. There were previously **none**.
- **Documentation**: `SECURITY_AUDIT.md`, `TEST_MATRIX.md`, `ROADMAP_RECOMMENDATIONS.md` and
  `docs/REACT_BITS_AUDIT.md` all contradicted the code and have been rewritten against it.
  The roadmap had scored AI Coach and the Food Scanner *up* because a fallback was read as
  successful generation; both are lower now.

## 8. Unresolved issues

| # | Issue | Severity |
| --- | --- | --- |
| 1 | Live AI generation unproven; configured key previously returned HTTP 410 | **Blocker** |
| 2 | Cross-user RLS never executed against a real database | **Blocker** |
| 3 | `TRUNCATE` still granted to `authenticated`; RLS does not apply to it | High (staged, unapplied) |
| 4 | Mobile behaviour untested | High |
| 5 | `Counter` renders 10 elements per digit; Home's primary metrics are unreadable by screen reader | High |
| 6 | No `FORCE ROW LEVEL SECURITY` | Medium |
| 7 | Supabase Auth outages surface as 401, telling every user to sign in again | Medium |
| 8 | Four screens each fetch full history with no cache (~140 requests per sweep) | Medium |
| 9 | `save_athlete_metrics` creates an all-NULL row on a height-only save | Medium |
| 10 | Client/DB measurement bounds disagree (300 cm vs 250 cm) → raw Postgres error to user | Medium |
| 11 | 20 pre-existing mobile lint warnings | Low |
| 12 | CSP uses `'unsafe-inline'` for styles | Low |

## 9. Release decision

**NOT CERTIFIED.** Do not promote `remediation/audit-fixes` to `origin/master` as a certified
release.

The branch is safe to merge as **engineering progress**: every defect it fixes was
reproduced first, and every fix is covered by a test that fails without it. Nothing in it has
been applied to the production database.

To certify, the following must be done, in order:

1. Provision a working `NVIDIA_API_KEY` or `OPENAI_API_KEY` and exercise all three endpoints.
2. Run the RLS probe against a disposable database, then against a production *clone*.
3. Run the read-only grant queries in `supabase/pending/` and review the hardening migration
   with a backup in hand.
4. Add mobile tests via `jest-expo`, covering the local schema and outbox.
5. Fix the `Counter` accessibility defect.
6. Then, and only then, merge to `master` and tag a release.
