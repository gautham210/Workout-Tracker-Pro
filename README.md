# Workout Tracker Pro

A production-grade, mobile-first fitness tracking, strength analytics, nutrition journal, and AI coaching platform. Workout Tracker Pro ships as a **Vite / React 19 web application** and an **offline-first Expo SDK 57 / React Native mobile application**, powered by a unified **Supabase PostgreSQL** backend and a suite of secure **Vercel Serverless Functions**.

> **Branch Note:** `main` represents the verified production release. Active development and feature branches are merged via PRs.

---

## Table of Contents

- [Core Features & Capabilities](#core-features--capabilities)
- [System Architecture](#system-architecture)
- [Exercise Imagery & Visual Engine](#exercise-imagery--visual-engine)
- [Offline-First Sync Engine](#offline-first-sync-engine)
- [AI Engine & Serverless API Contracts](#ai-engine--serverless-api-contracts)
- [Database & Migrations](#database--migrations)
- [UI & Design System (Liquid Glass & React Bits)](#ui--design-system-liquid-glass--react-bits)
- [Setup & Local Development](#setup--local-development)
  - [Prerequisites](#prerequisites)
  - [Web Application](#web-application)
  - [Mobile Application (Expo / React Native)](#mobile-application-expo--react-native)
  - [Environment Variables](#environment-variables)
- [Testing & Quality Verification](#testing--quality-verification)
- [Security & Privacy Engineering](#security--privacy-engineering)
- [Production Deployment](#production-deployment)

---

## Core Features & Capabilities

### 1. Workout Tracking & Session Logging
- **Active Session Logger:** Real-time logging of sets, reps, load (kg/lbs), RPE (Rating of Perceived Exertion 1–10), RIR (Reps in Reserve 0–5+), warm-up designations, and per-set notes.
- **Accidental-Finish Protection:** Features a tactile "Hold to Finish" gesture powered by the accessible `HoldButton` component (WCAG 2.1.1 compliant: hold Space key or tap Enter).
- **Benchmarking & Ghost PRs:** Surfaces previous performance metrics directly inside active exercise cards to guide progressive overload.
- **Integrated Rest Timer:** Isolated, non-blocking countdown timer with vibration feedback upon completion.
- **Resilient Auto-Drafting:** Active sessions auto-save with debounced persistence (`wtp_workout_draft_v2_<uid>` on web, local SQLite on mobile). Switching between Coach proposals, Import, or Library never clobbers active drafts.

### 2. Offline-First Sync & Data Isolation
- **Mobile SQLite Outbox Engine:** All mobile workouts write immediately to local SQLite (`workout_sessions`, `session_exercises`, `sets`, `sync_outbox`).
- **Atomic Cloud Sync:** Workouts synchronize via an atomic PostgreSQL RPC (`sync_workout_graph`) with parent-before-child foreign key guarantees and idempotent upserts.
- **Transparent Sync State Machine:** Honest status indicators (`local_only`, `syncing`, `synced`, `retrying`, `failed`, `offline`). "Synced" is only displayed when the database has acknowledged every row.
- **Web Offline Sync Queue:** Unsynced web sessions queue in `wtp_pending_sync_v1_<uid>` and automatically flush when connectivity is restored.
- **Cross-Account Privacy:** Account switching flushes and purges only the active user's local store; encrypted auth sessions use SecureStore chunking without plaintext fallback.

### 3. AI Coach & AI Nutritionist
- **Conversational Intelligence:** Powered by NVIDIA NIM (`meta/llama-3.1-8b-instruct`) with conversational memory and personality switching between Training Coach and Nutrition Coach.
- **Grounded Workout Generation:** Proposed workouts are strictly grounded against verified database catalog exercises (`exerciseId`). Unmatched movements are omitted and reported in `workoutPlan.unmatched`, eliminating sync failures.
- **Direct Workout Handoff:** Coach-generated workout cards can be loaded directly into the active workout builder with a single tap.
- **Prompt Injection Defense:** Verified athlete facts (body metrics, past 12 workouts, nutrition history) are injected into the prompt as strict, delimited XML/JSON data rather than executable instructions.

### 4. AI Food Scanner & Nutrition Journal
- **Computer Vision Macro Estimation:** Analyzes food photography using NVIDIA NIM (`meta/llama-3.2-11b-vision-instruct`) with an automatic OpenAI (`gpt-4o-mini`) fallback.
- **Multi-Stage Image Validation:** Strict client-side and server-side validation checking MIME types, magic bytes, dimensions, and container structure (JPEG SOF/EOI, PNG IHDR/IEND, WebP RIFF) with a 3.5 MB payload limit.
- **Client-Side Image Downscaling:** Web uploads are resized before dispatch to remain within serverless payload thresholds.
- **Editable Meal Review Sheet:** Detected foods and estimated macro ranges (calories, protein, carbs, fats) are displayed in an interactive review sheet before committing to `nutrition_logs`.
- **Target Tracking:** Daily macro goals and calorie balance rings update dynamically.

### 5. Natural Language AI Workout Import
- **Free-Text Parsing:** Converts workout logs, raw gym notes, or messages into structured workout sessions using AI.
- **Deterministic Serverless Fallback:** If the AI provider times out or fails, a local structural regex parsing algorithm executes automatically to ensure zero data loss.
- **Interactive Review & Mapping:** Review extracted sets, reps, and weights with catalog exercise auto-matching. React input keys remain stable during movement renaming to prevent focus drops.

### 6. Analytics, PRs & Athlete Space
- **Progress Analytics:** Dynamic volume trends, weekly training frequency, and muscle group distribution breakdowns.
- **Personal Records (PRs):** Automatically tracks and celebrates all-time PRs per exercise.
- **Rest-Day-Aware Consistency:** Streak tracking correctly accounts for programmed rest days.
- **Body Metrics Tracking:** Log bodyweight with moving averages, body fat percentage, lean mass, BMI, BMR (Mifflin-St Jeor), and activity-adjusted TDEE.
- **Honest Athlete Space:** Highlights authentic personal milestones, strength standards, and volume tiers without fake social feeds.

---

## System Architecture

```
Workout Tracker Pro/
├── src/                          # Web Client (Vite 8, React 19, React Router 7)
│   ├── product/                  # Production experience screens (*Experience.jsx)
│   │   ├── WorkoutExperience.jsx # Active workout tracker and builder
│   │   ├── HomeExperience.jsx    # Dashboard and training overview
│   │   ├── HistoryExperience.jsx # Workout history and session review
│   │   ├── LibraryExperience.jsx # Exercise catalog browser and search
│   │   ├── ProgressExperience.jsx# PR tracking and volume charts
│   │   ├── NutritionExperience.jsx# Macro journal and food scan UI
│   │   ├── CoachExperience.jsx   # AI Coach conversational interface
│   │   ├── NutritionistExperience.jsx # AI Nutritionist interface
│   │   ├── BodyMetricsExperience.jsx  # Weight, BMR, TDEE, body composition
│   │   ├── ImportExperience.jsx  # Natural language workout import
│   │   ├── AthleteSpaceExperience.jsx # Athlete stats and benchmarks
│   │   ├── ProfileExperience.jsx # User settings and account controls
│   │   ├── react-bits/           # Selective React Bits motion primitives
│   │   ├── workoutDraft.js       # LocalStorage draft persistence & merging
│   │   └── pendingSync.js        # Web offline sync queue engine
│   ├── components/               # ErrorBoundary and foundational UI components
│   ├── context/                  # AuthContext with stale-session guards
│   └── lib/                      # Supabase client, API client, body metric formulas
│
├── mobile/                       # Mobile Client (Expo SDK 57, React Native 0.86, Expo Router)
│   ├── app/                      # File-based routing (Expo Router)
│   │   ├── (auth)/               # Login and sign-up screens
│   │   ├── (tabs)/               # Tab screens (Home, Workout, History, Coach, Nutrition, Profile)
│   │   ├── active-workout.tsx    # Dedicated active workout logging screen
│   │   ├── session/[id].tsx      # Detailed historical session view
│   │   ├── body-metrics.tsx      # Mobile bodyweight and composition logger
│   │   ├── athlete-space.tsx     # Mobile athlete standards view
│   │   └── settings.tsx          # Sync status, manual sync triggers, account data
│   ├── components/               # ExerciseCatalogBrowser, MealReviewSheet, WorkoutTimer, Visuals
│   └── lib/                      # SQLite DB, outbox sync engine, SecureStore auth, analytics
│
├── shared/                       # Cross-platform single source of truth (Web, Mobile, API)
│   ├── exerciseCatalog.js        # 27 canonical exercises, aliases, muscles, movement patterns
│   ├── exerciseCatalog.d.ts      # TypeScript definitions for catalog entries
│   ├── exerciseScenes.js         # 20 vector SVG movement pattern illustrations
│   ├── exerciseScenes.d.ts       # TypeScript definitions for vector illustrations
│   └── exercise-art/             # Bundled, high-resolution exercise photography JPEGs
│
├── api/                          # Vercel Serverless Functions
│   ├── ai-chat.js                # POST /api/ai-chat: AI Coach and Nutritionist
│   ├── parse-workout.js          # POST /api/parse-workout: Natural language workout parser
│   ├── parse-food.js             # POST /api/parse-food: Vision-based food macro scanner
│   ├── _auth.js                  # Bearer token JWT authentication via Supabase GoTrue
│   ├── _rate-limit.js            # Distributed PostgreSQL-backed quota consumer
│   ├── _validation.js            # Payload validation, image verification, JSON repair
│   ├── _athlete-context.js       # RLS-scoped user context loader for AI grounding
│   └── _http.js                  # Security headers, CORS, and sanitized logging
│
├── supabase/                     # Database layer
│   ├── migrations/               # Canonical, idempotent schema migrations
│   ├── pending/                  # Staged least-privilege role hardening migrations
│   └── legacy/                   # Superseded historical SQL (do not run)
│
├── tests/                        # Automated Test Suites (162 total tests)
│   ├── *.test.js                 # Node:test unit and integration suites (128 tests)
│   ├── *.test.jsx                # Vitest + Testing Library behavioural UI suites (34 tests)
│   └── support/                  # In-memory database and provider mocks
│
└── .github/workflows/ci.yml      # GitHub Actions CI matrix (Web, Mobile, Audit, Secrets)
```

---

## Exercise Imagery & Visual Engine

Workout Tracker Pro avoids external image CDNs or unauthenticated third-party URLs. Imagery is handled by a unified, multi-tier engine in `shared/`:

1. **Resolution & Matching:** Exercises and user-entered aliases resolve via `findCatalogExercise()` in `shared/exerciseCatalog.js` using longest-label substring matching to prevent false positives (e.g., "Romanian Deadlift" correctly matches RDL rather than "Deadlift").
2. **Deterministic Vector Scene Layer:** Every exercise maps to an inline SVG movement scene from `shared/exerciseScenes.js`. This guarantees that an exercise card **never renders a broken image or blank layout**.
3. **Bundled Photographic Asset Layer:** High-resolution photographs in `shared/exercise-art/` are bundled directly into client distributions (fingerprinted static assets on Vite, bundled assets on Metro).
4. **Resilient Client Rendering:** `<ExerciseVisual />` (web) and `<ExerciseVisual />` (mobile) render the SVG vector scene immediately; the photograph fades in over the vector scene once loaded. If photo loading fails, the visual gracefully retains the vector movement scene.

---

## Offline-First Sync Engine

### Mobile (Expo SQLite & Outbox Engine)
1. **Immediate Local Persistence:** Completed sessions and set adjustments write directly to SQLite (`workout_tracker.db`).
2. **Queued Sync Outbox:** Workouts are queued in `sync_outbox` with a payload representing the full session graph.
3. **Atomic PostgreSQL Ingestion:** `sync_workout_graph` persists sessions, exercises, and sets in a single transaction. Parent sessions are created before child exercises, sets are inserted with exact foreign keys, and existing IDs are updated idempotently.
4. **Honest Sync Status:** The UI derives sync status from the outbox table for the current user:
   - `synced`: 0 pending rows in outbox.
   - `local_only`: Saved locally; awaiting first sync cycle.
   - `syncing`: Active network transaction in progress.
   - `retrying`: Transient network error encountered; queued for retry.
   - `failed`: Permanent validation error; displays exact diagnostic.
   - `offline`: Device has no active network connection.
5. **Foreground & Periodic Retry:** The sync engine automatically attempts a flush when the app returns to the foreground and every 30 seconds while connected. Network errors do not consume retry counts.
6. **Safe Account Switching:** Signing out warns the user if unsynced workouts remain, and clears only that user's local SQLite tables.

### Web (LocalStorage & Online Listener)
- In-progress workouts continuously save to `wtp_workout_draft_v2_<uid>`.
- Completed workouts that cannot reach Supabase are queued in `wtp_pending_sync_v1_<uid>` with full movement label metadata.
- Workouts automatically sync when the browser triggers the `window.online` event or when the application is reopened.

---

## AI Engine & Serverless API Contracts

All endpoints live in `api/` and run as Vercel Serverless Functions (Node.js runtime).

### Security & Ingestion Rules
- **Authentication First:** Every route requires `Authorization: Bearer <Supabase access token>`. Tokens are verified with Supabase Auth before processing payloads or invoking AI providers.
- **Distributed Quotas:** Quotas are enforced in PostgreSQL via `consume_api_rate_limit(p_user_id, p_feature, p_max_requests, p_window_seconds)`. When exhausted, routes return `429 Too Many Requests` with a `Retry-After` header.
- **Bounded Compute:** AI calls use explicit `AbortController` signals with a 12-second provider timeout and a 25-second total function budget. SDK automatic retries are set to `0` to prevent unbudgeted cost inflation.
- **Sanitized Logging:** Authorization headers, tokens, and raw model prompts are redacted from server logs.
- **Cache Prevention:** All responses include `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

### API Routes

| Endpoint | Request Payload | Response Payload | Description |
|---|---|---|---|
| `POST /api/ai-chat` | `{ messages: [{role, content}], isNutritionist?: boolean }` | `{ text: string, intent: string, workoutPlan?: Object }` | Conversational coaching with catalog-grounded workout generation. Untrusted input is isolated in delimited blocks. |
| `POST /api/parse-workout` | `{ rawText: string, exercises?: string[] }` | `{ date, split, exercises: [...], ambiguous: [...], source: "ai" \| "regex_fallback" }` | Natural language workout parser with automatic regex fallback if AI times out. Annotates matched catalog keys. |
| `POST /api/parse-food` | `{ imageUri: "data:image/...;base64,..." }` | `{ text: string, macros: { detectedFoods, items, caloriesRange, ... }, lowConfidence: boolean }` | Vision-based food macro scanner. Performs MIME, magic byte, and structural header inspection. |

---

## Database & Migrations

Database operations and schemas are managed in `supabase/migrations/` using timestamped migration files:

```
supabase/migrations/
├── 03_rls_and_schema_hardening.sql                 # Baseline hardening (guarded)
├── 04_seed_exercises.sql                           # Seed catalog data (guarded)
├── 20260920000000_canonical_schema_and_sync.sql    # Canonical tables, RLS, sync_workout_graph
├── 20260921000000_harden_function_grants_and_rls.sql# SECURITY DEFINER search_path and grant revokes
├── 20260921010000_distributed_api_rate_limits.sql  # Distributed Postgres-backed rate limiting
├── 20260921020000_fix_sync_graph_uuid_children.sql # Idempotent child UUID cast parity
├── 20260921030000_cascade_auth_account_cleanup.sql # Cascade triggers on auth.users deletion
├── 20260921040000_athlete_context_nutrition_and_exercise_metadata.sql # Nutrition logs & profile fields
├── 20260921050000_repair_athlete_context_permissions.sql # RLS grants for athlete context
└── 20260922000000_catalog_slugs_and_metrics_integrity.sql # Slug generators, metrics integrity & RPCs
```

### Key Security & Schema Patterns
- **Strict Row Level Security (RLS):** Every user table (`workout_sessions`, `session_exercises`, `sets`, `bodyweight_logs`, `nutrition_logs`, `athlete_profiles`, `api_rate_limits`) enforces RLS keyed to `auth.uid() = user_id`.
- **Protected Exercise Catalog:** The `exercises` catalog is readable by authenticated users, but writable only by service roles.
- **Search Path Pinning:** All `SECURITY DEFINER` functions explicitly set `SET search_path = public, pg_temp` to prevent search path hijacking.
- **Public Execute Revocations:** Internal functions are revoked from `anon` and granted only to `authenticated` or internal execution contexts.
- **Legacy Migrations:** Superseded and deprecated scripts are segregated in `supabase/legacy/` and should not be run. Staged least-privilege hardening scripts are stored in `supabase/pending/`.

---

## UI & Design System (Liquid Glass & React Bits)

Workout Tracker Pro features a modern, mobile-first design built with CSS variables, glassmorphism, and selective motion primitives:

- **Liquid Glass Aesthetic:** Deep dark background palettes (`#08090C`, `#0E1117`), translucent blurred surfaces (`backdrop-filter: blur(16px)`), micro-borders, and tactile interaction feedback.
- **Count Up (`Counter`):** Restrained numerical momentum animations for volume, session counts, and consistency metrics.
- **Dock:** Touch-optimized floating bottom navigation in `AppShell` with gesture-friendly tap zones.
- **Glass Surface:** Performance-optimized top navigation header.
- **Prompt Bar:** Composer for Coach and Nutritionist chat with voice dictation styling and clean text handling.
- **Hold Button:** Prevents accidental session finishes; fully accessible via keyboard (Space to hold, Enter to tap).
- **Animated List:** Smooth staggered transitions for workout history cards.

---

## Setup & Local Development

### Prerequisites
- **Node.js:** v20.x or v22.x (v22 recommended)
- **npm:** v10+
- **Supabase Account:** A Supabase project with database migrations applied
- **NVIDIA NIM API Key:** For text coaching and vision food scanning (optional OpenAI API key as vision fallback)

---

### Web Application

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env.local
   ```
   Populate `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

3. **Run local development server:**
   - **Recommended (Vercel CLI with serverless API functions):**
     ```bash
     npx vercel dev
     ```
   - **Vite-only (API proxied to local or remote backend):**
     ```bash
     npm run dev
     ```

4. **Build & validate production bundle:**
   ```bash
   npm run build
   npm run preview
   ```

---

### Mobile Application (Expo / React Native)

1. **Navigate and install mobile dependencies:**
   ```bash
   cd mobile
   npm install
   ```

2. **Configure mobile environment:**
   ```bash
   cp .env.example .env
   ```
   Set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_BACKEND_URL` (points to your Vercel API deployment, or `http://10.0.2.2:3000` for Android emulator).

3. **Start the Expo development server:**
   ```bash
   npx expo start
   ```

4. **Verify TypeScript compilation & Metro bundle export:**
   ```bash
   # From root:
   npm run typecheck:mobile

   # Or from mobile directory:
   npx tsc --noEmit
   npx expo export --platform android
   npx expo export --platform ios
   ```

---

### Environment Variables

| Variable | Target Environment | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Web Client & API | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Web Client & API | Supabase public anonymous key |
| `EXPO_PUBLIC_SUPABASE_URL` | Mobile App | Supabase project URL for Expo |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Mobile App | Supabase public anonymous key for Expo |
| `EXPO_PUBLIC_BACKEND_URL` | Mobile App | Origin hosting the `/api/*` serverless functions |
| `NVIDIA_API_KEY` | Vercel Serverless Functions | NVIDIA NIM API key for Llama 3.1 8B & Llama 3.2 11B Vision |
| `NVIDIA_TEXT_MODEL` | Vercel Serverless (Optional) | Default: `meta/llama-3.1-8b-instruct` |
| `OPENAI_API_KEY` | Vercel Serverless (Optional) | Fallback API key for food vision scanner (`gpt-4o-mini`) |
| `ALLOWED_ORIGINS` | Vercel Serverless (Optional) | Comma-separated list of allowed CORS origins |
| `FOOD_SCAN_DIAGNOSTICS` | Vercel Serverless (Optional) | Set to `'true'` for redacted provider debug logging outside production |

> **Security Note:** Never commit `.env` or `.env.local` files, and never expose service-role keys or AI provider secrets to client bundles.

---

## Testing & Quality Verification

Workout Tracker Pro enforces comprehensive automated verification gates across unit logic, behavioral UI flows, type systems, and code hygiene:

```bash
# Run complete test suite (Logic + UI behavioural tests)
npm test

# Run isolated suites
npm run test:logic         # Node:test unit & integration tests (128 passing tests)
npm run test:ui            # Vitest + Testing Library UI behavioural tests (34 passing tests)

# Code hygiene & type verification
npm run lint               # ESLint across root, web, and mobile
npm run typecheck:mobile   # TypeScript typecheck for Expo mobile app

# Production build verification
npm run build              # Vite web production build (validates chunking and asset hashing)
```

### Test Coverage Highlights
- **162 Automated Tests:** 128 logic tests in `tests/*.test.js` + 34 behavioral UI tests in `tests/*.test.jsx`.
- **Cross-Account Privacy Tests:** Verifies that session switches in `useChatThread` and local databases never leak private workout or conversation data across accounts.
- **Offline History Graph Tests:** Asserts that queued offline workouts display real movement labels rather than empty placeholder states.
- **Input Caret & Key Stability Tests:** Proves that editing movement names in Import review retains focus and preserves catalog linkages.
- **WCAG Keyboard Accessibility Tests:** Validates that the HoldButton finishes on Space hold and Enter tap.
- **Schema & Migrations Parity Tests:** Validates migration ledger integrity, repeatable execution, and RPC signature consistency.

### Continuous Integration (GitHub Actions)
All pull requests and branch pushes run `.github/workflows/ci.yml`:
1. **Web Job:** `npm run lint`, `npm test` (all 162 logic + UI tests), and `npm run build`.
2. **Mobile Job:** Dependency verification, `npm run typecheck:mobile`, and `npm run lint`.
3. **Dependency Audit Job:** `npm audit --omit=dev --audit-level=low` ensuring 0 production vulnerabilities.
4. **Secret Scan Job:** Automated Gitleaks scan preventing committed credentials or keys.

---

## Security & Privacy Engineering

- **Authentication & JWT Verification:** Every API call verifies bearer tokens with Supabase GoTrue; the user ID is extracted from the authenticated session, never trusted from the client payload.
- **Postgres Row Level Security (RLS):** All user tables enforce strict RLS policies. Service role keys are never included in client distributions.
- **Zero In-Memory Cross-Contamination:** Switching accounts on mobile clears all SQLite records and cached credentials. Tokens are stored in Expo SecureStore with chunked key protection.
- **Strict Content & Image Inspection:** Food photos are verified by MIME type, magic bytes, and container headers to prevent malformed or arbitrary file uploads.
- **Grounded AI Boundaries:** Coaching plans are restricted to catalog exercises, preventing custom hallucinated exercises that fail downstream database sync.
- **Prompt Injection Hardening:** User-supplied inputs are treated as untrusted strings and encapsulated in delimited data blocks.

---

## Production Deployment

### Web Application & Serverless API (Vercel)
The repository is configured for automated Vercel deployment via `vercel.json`:
- Deploys Vite production build to global Edge Network.
- Serverless API routes in `api/` are assigned a 30-second execution limit.
- Set environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `NVIDIA_API_KEY`, etc.) in the Vercel Project Settings.

### Mobile Application (Expo Application Services / EAS)
The mobile app is configured for EAS Build (`mobile/eas.json`):
```bash
cd mobile

# Preview build (internal testing)
eas build --profile preview --platform android
eas build --profile preview --platform ios

# Production store release
eas build --profile production --platform all
```
Set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_BACKEND_URL` in EAS Secrets or Environment variables.
