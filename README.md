# Workout Tracker Pro

A mobile-first fitness app: workout logging, exercise library, history and progress analytics, body metrics, nutrition journal with an AI food scanner, an AI coach that proposes structured workouts, and AI import of free-text workout logs. It ships as a Vite/React web app and an offline-first Expo/React Native app that share one Supabase backend and one set of Vercel API routes.

> Branch note: `master` is the active development branch. `main` is stale.

## Architecture

```
src/            Web app (Vite, React 19, React Router 7)
  product/      Screens (*Experience.jsx), workout draft/sync helpers, React Bits primitives
  lib/          Supabase client, API client, body-metric formulas
mobile/         Expo 57 app (Expo Router, expo-sqlite, SecureStore)
  lib/          db (SQLite), sync (outbox engine), api, metrics, analytics
shared/         Code and assets used by web, mobile AND the API
  exerciseCatalog.js   canonical exercise identity, aliases, movement pattern, photo key
  exerciseScenes.js    drawn movement scenes (SVG strings, never a broken image)
  exercise-art/        bundled exercise photographs
api/            Vercel serverless functions (ai-chat, parse-workout, parse-food)
supabase/       migrations (canonical schema, RLS, RPCs) and legacy/ (superseded, do not run)
tests/          node:test suites (npm test)
```

### Exercise images
One canonical mapping lives in `shared/exerciseCatalog.js`: exercise name/alias → catalog record → `art: { photo, scene }`. `photo` is a bundled JPEG in `shared/exercise-art/` (Vite fingerprinted URL on web, `require()` on Expo). `scene` is a movement-pattern illustration generated as an inline SVG string, so every exercise always has a drawable image; a photo only fades in over it once decoded. No remote image URLs are used. `tests/exercise-catalog.test.js` verifies resolution, files and both platform registries.

### Offline-first sync (mobile)
Finished workouts are written to SQLite and queued in `sync_outbox`. One atomic RPC (`sync_workout_graph`) persists a workout, its exercises and its sets together (parent before child, owner derived from `auth.uid()`, upsert by id so retries are idempotent). Sync state is derived from the outbox for the current user: `local_only`, `syncing`, `synced`, `retrying`, `failed`, `offline`. "Synced" is shown only when the server accepted every pending row. The engine retries on app foreground and every 30 s; network errors do not consume attempts. Sign-out warns about unsynced workouts and clears only that account's local data.

The web app keeps a draft in `localStorage` and queues finished workouts that could not be sent (`wtp_pending_sync_v1_<uid>`), retrying on load and when the browser comes back online.

### API contracts
All routes require `Authorization: Bearer <Supabase access token>`, authenticate **before** parsing or calling a model, then consume a per-user Postgres-backed quota (`consume_api_rate_limit`, fail-closed).

| Route | Request | Response |
| --- | --- | --- |
| `POST /api/ai-chat` | `{ messages: [{role, content}], isNutritionist? }` | `{ text, intent, workoutPlan? }`. Plan exercises carry a real catalog `exerciseId`; names that cannot be resolved are dropped and listed in `workoutPlan.unmatched`. |
| `POST /api/parse-workout` | `{ rawText, exercises? }` | `{ date, split, exercises[], ambiguous[], source }` |
| `POST /api/parse-food` | `{ imageUri: "data:image/(jpeg\|png\|webp);base64,…" }` | `{ text, macros, lowConfidence }`, errors as `{ error, code }` |

## Setup

### Prerequisites
Node 20+, a Supabase project, an NVIDIA NIM API key (OpenAI key optional for food scanning).

### Web
```bash
npm install
cp .env.example .env.local        # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npx vercel dev                    # serves the web app AND /api (recommended)
# or: npm run dev   (Vite only; /api is proxied to VITE_API_PROXY, default http://localhost:3000)
npm run build && npm run preview
```
The app shows a configuration screen if the Supabase variables are missing; there are no hard-coded project fallbacks.

### Mobile
```bash
cd mobile
npm install
cp .env.example .env              # EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_BACKEND_URL
npx expo start                    # development
npx tsc --noEmit                  # typecheck
npx expo export --platform android   # Metro bundle check (also: ios)
```
Production builds require `EXPO_PUBLIC_BACKEND_URL`; there is no localhost fallback outside `__DEV__`. Android emulators reach the dev server at `10.0.2.2`. Build with EAS (`eas build --profile production`). Supabase URL/key must be provided via `eas env` / EAS secrets — never committed.

### Environment variables
| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | web build, API (JWT verification) | Supabase publishable credentials |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | mobile | same values |
| `EXPO_PUBLIC_BACKEND_URL` | mobile | origin hosting `/api` |
| `NVIDIA_API_KEY` | API (server only) | text + vision models |
| `NVIDIA_TEXT_MODEL` | API, optional | default `meta/llama-3.1-8b-instruct` |
| `OPENAI_API_KEY` | API, optional | food-scan fallback |
| `ALLOWED_ORIGINS` | API, optional | comma-separated CORS allow-list |
| `FOOD_SCAN_DIAGNOSTICS` | API, optional | redacted provider logging outside production |

Never expose the Supabase service-role key or any model key to a client bundle; none is needed by this repository.

### Supabase
Apply migrations in `supabase/migrations/` in filename order (`supabase db push`). The two non-timestamped legacy files (`03_*`, `04_*`) are guarded no-ops on an empty database; catalog seeding and slugs are done by `20260922000000_catalog_slugs_and_metrics_integrity.sql`. Files in `supabase/legacy/` are superseded and weaker — do not run them. Run `supabase db reset` against an empty local database before relying on a new environment (this has not been run from this workspace; see the engineering report).

## Testing
```bash
npm test          # node:test: API handlers, validation, schema contract, catalog/images, analytics, workout drafts
npm run lint
npm run build
cd mobile && npx tsc --noEmit
```

## Security notes
- JWT verified with Supabase before any expensive work; user id is never read from payloads.
- RLS on every user table; clients cannot write the shared exercise catalog; SECURITY DEFINER functions pin `search_path` and are revoked from `anon`.
- Food images are validated by MIME, magic bytes and header structure (dimensions, truncation) and capped at 3.5 MB; model output is schema-validated and never trusted for ids.
- AI coach plans can only reference catalog exercises; user text and athlete context are passed as delimited data.
- Mobile session tokens are stored in SecureStore (chunked); no plaintext fallback.

## Deployment
Vercel serves the web build and `api/*` (`vercel.json`, 30 s function limit). The mobile app only needs `EXPO_PUBLIC_BACKEND_URL` pointing at that origin.
