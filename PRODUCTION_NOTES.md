# Production contract

## Canonical database schema

`supabase/migrations/20260920000000_canonical_schema_and_sync.sql` is the canonical migration for `profiles`, `exercises`, `workout_sessions`, `session_exercises`, `sets`, and `bodyweight_logs`. Workout fields use `split_type`, `split_day`, `duration_minutes`, `is_finished`, `order_index`, `set_number`, `weight_kg`, and `completed`.

The migration history has been applied to the linked `workout-helper-pro`
project (`egefeiuyktelihsbbzyt`), including the follow-up hardening,
distributed-rate-limit, UUID child-graph, and Auth-account cascade migrations. The deployed schema,
RLS policy definitions, indexes, and RPC signatures were inspected after
application. A rollback-only database-role/claim probe verified own-record
CRUD, cross-owner denial, graph idempotency, and child ownership checks without
creating persistent test data. End-to-end verification with two real bearer
tokens remains pending because the project's public Auth sign-up endpoint was
rate-limited and no pre-existing test-user credentials are stored in this repo.

The migration enables RLS for every user-owned table and provides `sync_workout_graph` / `sync_workout_graphs`. Those functions obtain ownership exclusively from `auth.uid()` and atomically persist session, exercise, and set records.

`supabase/migrations/20260921040000_athlete_context_nutrition_and_exercise_metadata.sql` is the next additive contract. It adds athlete preferences, body-metric records, nutrition targets, food entries, structured catalogue metadata, and the narrowly scoped `save_athlete_metrics` RPC. All new user-owned tables use RLS and `auth.uid()` ownership checks. **Its remote application was not verified in this workspace:** the Supabase CLI was not available on the active PATH. Apply it with the linked project before enabling meal persistence or the Body Metrics calculator in production.

## Mobile offline behavior

The Expo app keeps an account-scoped SQLite workout graph. An unfinished workout remains local until completed. Completion writes the finished graph and durable outbox entry in one local transaction; the outbox later invokes `sync_workout_graph`. “Saved locally” is deliberately distinct from “Synced.” Failed entries retain retry metadata and can be retried from the dashboard.

Local data is retained by account rather than deleted at sign-out, but all workout recovery and queue queries include the authenticated user ID. A second account cannot resume the prior account’s local workout.

## API and AI requirements

Set these server-side variables in Vercel: `VITE_SUPABASE_URL` (or `EXPO_PUBLIC_SUPABASE_URL`), `VITE_SUPABASE_ANON_KEY` (or `EXPO_PUBLIC_SUPABASE_ANON_KEY`), and `NVIDIA_API_KEY`. `OPENAI_API_KEY` is an optional vision fallback. Do not expose provider keys to the mobile or web bundle.

AI APIs require bearer authentication, bounded JSON payloads, validated roles,
output validation, and timeouts. The linked Supabase project now provides the
authenticated `consume_api_rate_limit` RPC: it atomically enforces per-user,
per-endpoint one-minute quotas and survives serverless-instance boundaries. It
fails closed when unavailable. Provider credentials and origin configuration
still must be configured in the current Vercel production project; this repo
does not contain Vercel credentials.

### AI provider contract

`/api/ai-chat` and `/api/parse-workout` use NVIDIA NIM at `https://integrate.api.nvidia.com/v1` with `NVIDIA_API_KEY` and `NVIDIA_TEXT_MODEL` when supplied (default: `meta/llama-3.1-8b-instruct`). `/api/parse-food` uses NVIDIA NIM model `meta/llama-3.2-11b-vision-instruct` when `NVIDIA_API_KEY` is set; it falls back to OpenAI `gpt-4o-mini` only when NVIDIA is absent and `OPENAI_API_KEY` is explicitly configured. Text requests have 12–15 second timeouts; vision has a 15 second timeout. AI chat receives a fixed, RLS-bound athlete fact projection from the server, never client-provided context or arbitrary database access. A returned workout plan is schema-validated and remains a user-reviewed draft until the athlete starts/completes it.

## Validation

Run `npm test`, `npm run build`, and from `mobile`, `npx tsc --noEmit`. Android
emulator/device verification and an EAS production build require a locally
installed Android SDK/emulator and an authenticated EAS account. Vercel's
current production branch/deployment must also be reconciled before release:
the Git default branch is `main`, while the release work is on `master`.
