# Production contract

## Canonical database schema

`supabase/migrations/20260920000000_canonical_schema_and_sync.sql` is the canonical migration for `profiles`, `exercises`, `workout_sessions`, `session_exercises`, `sets`, and `bodyweight_logs`. Workout fields use `split_type`, `split_day`, `duration_minutes`, `is_finished`, `order_index`, `set_number`, `weight_kg`, and `completed`.

Apply the migration with the project's Supabase migration workflow before deploying this revision. Its application to the remote database is **not verified** by this repository.

The migration enables RLS for every user-owned table and provides `sync_workout_graph` / `sync_workout_graphs`. Those functions obtain ownership exclusively from `auth.uid()` and atomically persist session, exercise, and set records.

## Mobile offline behavior

The Expo app keeps an account-scoped SQLite workout graph. An unfinished workout remains local until completed. Completion writes the finished graph and durable outbox entry in one local transaction; the outbox later invokes `sync_workout_graph`. “Saved locally” is deliberately distinct from “Synced.” Failed entries retain retry metadata and can be retried from the dashboard.

Local data is retained by account rather than deleted at sign-out, but all workout recovery and queue queries include the authenticated user ID. A second account cannot resume the prior account’s local workout.

## API and AI requirements

Set these server-side variables in Vercel: `VITE_SUPABASE_URL` (or `EXPO_PUBLIC_SUPABASE_URL`), `VITE_SUPABASE_ANON_KEY` (or `EXPO_PUBLIC_SUPABASE_ANON_KEY`), and `NVIDIA_API_KEY`. `OPENAI_API_KEY` is an optional vision fallback. Do not expose provider keys to the mobile or web bundle.

AI APIs require bearer authentication, bounded JSON payloads, validated roles, output validation, timeouts, and a per-instance rate guard. The rate guard is not distributed: use a shared rate-limit provider before treating it as cross-instance abuse protection.

## Validation

Run `npm test`, `npm run build`, and from `mobile`, `npx tsc --noEmit`. An Android emulator, EAS production build, remote Supabase migration, and remote RLS verification require external credentials/infrastructure and are not verified by this checkout.
