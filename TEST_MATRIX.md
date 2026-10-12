# TEST MATRIX

Updated **2026-10-12**. The previous version of this file described a Jest/Detox setup that
does not exist in this repository and reported "Automated Tests: NONE" while 96 tests were
passing. Corrected below.

## What actually runs

```bash
npm test              # logic (node:test) + behavioural (Vitest + Testing Library)
npm run test:logic    # tests/**/*.test.js  — pure logic, API handlers, migrations
npm run test:ui       # tests/**/*.test.jsx — React components and hooks
npm run lint          # ESLint, now including mobile/
npm run build         # production build
npm run typecheck:mobile
npm audit --omit=dev
```

All of these are enforced by `.github/workflows/ci.yml`.

## Coverage by area

| Area | Status | Notes |
| --- | --- | --- |
| API handlers (auth, rate limit, CORS, redaction, grounding) | **Covered** | `api-handlers.test.js`, `api-ai-lifecycle.test.js` |
| Input/output validation (JSON extraction, image headers, ranges) | **Covered** | `api-validation.test.js` |
| AI lifecycle (retry bounding, cancellation, truthful failure, control-char stripping) | **Covered** | `api-ai-lifecycle.test.js` |
| Migration repeatability and integrity | **Covered** | `migrations-repeatable.test.js` |
| Analytics, streaks, e1RM, local-day handling | **Covered** | `web-analytics-core.test.js`, `web-analytics-scan.test.js` |
| Workout draft, graph idempotency, offline queue | **Covered** | `web-workout-draft.test.js`, `web-workout-pending.test.js` |
| Body metrics formulas | **Covered (web only)** | `athlete-metrics.test.js` |
| Account-switch isolation in chat history | **Covered** | `useChatThread.test.jsx` |
| Offline workouts rendering in History | **Covered** | `historyPending.test.jsx` |
| Import review, row identity, mapping preservation | **Covered** | `importReview.test.jsx` |
| Hold-to-finish keyboard access | **Covered** | `holdButton.test.jsx` |
| Food scanner cancellation and timeout | **Covered** | `nutritionScan.test.jsx` |
| Security headers, CI wiring, secret hygiene | **Covered** | `web-hygiene.test.js` |
| **Cross-user RLS isolation** | **NOT COVERED — skips** | `rls-cross-user.test.js` skips without `SUPABASE_DB_URL` |
| **Mobile behaviour (SQLite, outbox, set validation)** | **NOT COVERED** | See below |
| React components generally | **Partial** | Screens touched by a past defect only |

## Known gaps

### Cross-user RLS is unverified

`tests/sql/rls-cross-user.sql` is committed and proves user B cannot select, update or delete
user A's rows, cannot spoof `user_id`, and that `anon` is denied. It runs in a transaction that
rolls back. The Node runner **skips** unless pointed at a disposable database:

```bash
SUPABASE_DB_URL='postgresql://postgres:<pw>@localhost:54322/postgres' \
ALLOW_RLS_PROBE=1 npm run test:logic
```

The skip is deliberate and loud. A green skip must not be mistaken for proof.

### Mobile has no tests

Lint and TypeScript now cover the Expo app, but no behavioural test does. The local schema and
outbox are the highest-risk untested code in the repository: a broken migration there corrupts
on-device data with no server copy to recover from.

**Why it is not simply "add vitest":** the Expo modules cannot be imported under plain Node.
`react-native` ships Flow syntax, `expo` requires a Metro-only runtime, and `expo-sqlite`
pulls in `expo-asset`. Each workaround exposed another native-coupled import, and the harness
that resulted would be fragile in exactly the way that breaks on the next SDK bump.

**Recommended path:** adopt the supported toolchain —

```bash
cd mobile
npm i -D jest-expo @testing-library/react-native @types/jest
npx jest-expo
```

Target `lib/db.ts` (migration versioning), `lib/sync.ts` (backoff and permanent-error
classification) and `components/SetRow.tsx` (`sanitizeSetInput`).

### No coverage instrumentation

There is no `c8`/`nyc` and therefore no measured coverage figure. Every statement above was
determined by reading the sources.

## Deliberately removed tests

`tests/product-ownership.test.js` counted JSX tag occurrences in source text. It passed when a
component rendered 500 times and failed when a harmless prop was renamed, so it measured
nothing. The behaviour it was gesturing at is now covered properly: error and empty states are
asserted by rendering the component in `historyPending.test.jsx`.

`tests/schema-contract.test.js` still contains regex assertions against migration text. They
have been joined by `migrations-repeatable.test.js`, which asserts the same guarantees without
depending on exact formatting, but the older file has not been deleted because removing it
would drop coverage without a verified replacement for every assertion it makes.
