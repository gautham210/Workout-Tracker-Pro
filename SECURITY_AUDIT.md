# SECURITY AUDIT

Scope: Supabase Auth + RLS, Vercel serverless API, web client, Expo mobile app, and the
SQL migration set. Written **2026-10-12** against commit `remediation/audit-fixes`.

> Supersedes the previous version of this file, which stated that the API routes had no rate
> limiting and that mobile sessions were stored in AsyncStorage. **Both statements were false
> when written.** Rate limiting has been distributed and Postgres-backed since
> `20260921010000`; mobile sessions have been in SecureStore since commit `92e0d51`.

## 1. Authentication and authorization

| Area | State | Evidence |
| --- | --- | --- |
| API bearer auth | **Verified** | `api/_auth.js` uses `getUser(token)`, not `getSession()`, so the signature is checked against GoTrue. Auth runs before body parsing, quota, or any provider work. Asserted for all three routes by `tests/api-handlers.test.js`. |
| Malformed headers | **Verified** | Rejected with no network call (`readBearerToken`), so the most-abused entry point cannot be used to amplify traffic. |
| Provider cost authority | **Verified** | The user id is never read from a request payload. `consume_api_rate_limit` derives it from `auth.uid()` inside a `SECURITY DEFINER` function, so a client cannot spend another user's quota. |
| Dependency-override seam | **Hardened** | `__setDeps` / `__resetDeps` throw when `NODE_ENV=production` and are no longer re-exported from any production handler. |
| RLS | **Text-verified only** | Every user-owned table derives ownership from `(select auth.uid())`. **Not proven against a live database** — see §6. |
| Role/permission checks | **Not implemented** | Any valid token reaches all three AI endpoints. There is no plan tier, role, or entitlement. |

## 2. API abuse and rate limiting

The previous file claimed rate limiting was missing. It is implemented and fail-closed:

| Scope | Limit | Mechanism |
| --- | --- | --- |
| `ai-chat` | 20 / min | `consume_api_rate_limit` RPC, atomic `INSERT … ON CONFLICT DO UPDATE`, `security definer`, pinned `search_path` |
| `parse-workout` | 15 / min | same |
| `parse-food` | 10 / min | same |

- **Fail-closed.** `api/_rate-limit.js` returns `unavailable: true` on any RPC error and the
  handlers answer 503 rather than falling back to permissive.
- **Serverless-safe.** The counter row is the mutex, so it survives instance boundaries.
- **Known gap:** per-user only. There is no per-IP or global ceiling, so 20/min sustained is
  28,800 completions per account per day. A daily cap and an IP-level limiter are the next
  step if AI spend becomes material.

## 3. Cost and availability of provider calls

| Control | State |
| --- | --- |
| SDK retries disabled | **Fixed.** The OpenAI SDK defaults to `maxRetries: 2`. Unpinned, one user request produced up to 3 completions for `ai-chat` and 6 for `parse-workout`. Both now pin `maxRetries: 0`. |
| Bounded deliberate retries | `ai-chat` allows exactly one strict-schema retry; `parse-workout` two; `parse-food` one. No unbounded paths remain. |
| Cancelled provider work | **Fixed.** `parse-workout` raced the provider against a `setTimeout` that was never cleared and passed no signal, leaving the request running and billable after the handler returned. Replaced with a real `AbortSignal`. |
| Timeout ordering | **Reconciled.** Provider attempt 12s → server worst case ~25s → Vercel budget 30s → client abort 45s (web and mobile). The client no longer gives up while the provider is still working. |
| Truthful failures | **Fixed.** `loadCatalog` swallowed database errors and returned `[]`, which reads as "grounded with an empty index", silently voiding every plan behind an HTTP 200. Now a logged 503. |
| AI provenance | `ImportExperience` states when a parse came from the deterministic structural parser rather than the model. |

## 4. Input validation and prompt injection

| Control | State |
| --- | --- |
| Prompt injection | **Strong.** Tag escaping after `JSON.stringify`, control/bidi stripping on input, explicit threat-model instructions, and output grounded to the real exercise catalogue. Hallucinated exercises are dropped and reported rather than rendered. |
| Control-character spoofing in output | **Fixed.** `validateWorkoutParse` did not strip control characters (the coach path did), so a U+202E RIGHT-TO-LEFT OVERRIDE in a model-supplied movement name reached the UI and the saved library. Names, splits and ambiguous labels are now stripped. |
| Image intake | **Strong.** MIME allow-list, magic bytes, PNG/JPEG/WebP header parsing with bounds guards at every read, dimension ceiling, SVG rejected. |
| Body limits | Data-URI and image-size ceilings are now aligned to Vercel's 4.5 MB body limit. |
| Prompt injection through forged roles | `validateChatMessages` accepts `role: 'assistant'`, so a client can forge assistant turns. Impact is bounded to steering suggestions, because output is catalogue-grounded and no tool or database access is offered. **Accepted residual risk.** |

## 5. Secrets and data at rest

- No service-role key anywhere in the repository. The API builds an RLS-bound client from the
  caller's own bearer token with the anon key.
- No secrets are committed. `.env.local` is gitignored and untracked; CI runs a gitleaks scan.
- **Food photos are never persisted** — only a capped analysis summary is stored.
- **Personal data responses** carry `Cache-Control: no-store` and `X-Content-Type-Options`.
- **Residual risk:** unsynced workouts (weights, reps, RPE/RIR, free-text notes) remain in web
  `localStorage` across sign-out by deliberate design, so a shared browser can expose them in
  devtools. This is a product decision that should be surfaced to the user, not a code comment.
- **Residual risk:** the Coach voice input streams microphone audio to a third-party speech
  service with no consent gate on the screen that carries the most sensitive data in the app.

## 6. NOT VERIFIED

These are gaps in evidence, not in implementation. They must not be reported as passing.

| Item | Why | How to close |
| --- | --- | --- |
| Cross-user RLS isolation | No SQL execution path in the remediation environment | `SUPABASE_DB_URL=<disposable> ALLOW_RLS_PROBE=1 npm run test:logic` |
| Live grants / `TRUNCATE` privileges | Same | Read-only queries at the top of `supabase/pending/20260923000000_least_privilege_hardening.sql` |
| Live RLS policies as deployed | Same | Compare a dump against `supabase/migrations/` |
| Live AI provider behaviour | No `NVIDIA_API_KEY` or `OPENAI_API_KEY` in the environment | Provision a key and run the three endpoints |
| Row Level Security does not apply to `TRUNCATE` | — | `supabase/pending/` revokes it, but has not been applied |

## 7. Outstanding risks

1. **`TRUNCATE` is still granted to `authenticated`** on user tables. Not reachable through
   PostgREST, but a live privilege. Remediation is staged and unreviewed.
2. **No `FORCE ROW LEVEL SECURITY`** — the table owner bypasses RLS. Standard, but worth
   stating.
3. **Error bodies** may echo `"Server auth is not configured"` when the deployment is
   misconfigured, disclosing deployment state to an unauthenticated caller.
4. **Supabase Auth outages surface as 401**, which tells every user on both platforms to sign
   in again during someone else's incident.
5. **CSP uses `'unsafe-inline'` for styles.** Required by the current inline-style usage; it
   should be removed in favour of nonce- or hash-based styling.
6. **Mobile has no tests.** Lint and typecheck are now enforced; behaviour is not.
