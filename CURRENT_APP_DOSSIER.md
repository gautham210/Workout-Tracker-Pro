# CURRENT APP DOSSIER: Workout Tracker Pro

## 1. PRODUCT OVERVIEW

### Core Identity
Workout Tracker Pro is a cross-platform (React Native/Expo mobile app + React/Vite web dashboard) fitness application that emphasizes an AI-first approach to workout tracking, insights, and nutrition analysis. It uses a custom "Liquid Glass" UI aesthetic.

### Target Users
Fitness enthusiasts, weightlifters, and bodybuilders who want frictionless workout logging, AI-driven insights on their progression, and smart tools (like natural language imports and food image scanning).

### Platforms
- **Mobile (Primary)**: React Native / Expo Router (iOS/Android).
- **Web (Legacy/Admin)**: React / Vite.

### Architecture
- **Mobile Client**: Expo Router, React Native, custom Liquid Glass UI components.
- **Backend / API**: Vercel Serverless Functions (`/api`).
- **Database / Auth**: Supabase (PostgreSQL, GoTrue Auth, Row Level Security).
- **AI Infrastructure**: NVIDIA Llama 3.1 8B (Text/Coach) and Llama 3.2 11B Vision Instruct (Food Scanner) via `integrate.api.nvidia.com`, with fallbacks to standard OpenAI (`gpt-4o-mini`) and structural regex algorithms.

### Implementation Status
- **REAL IMPLEMENTED**: Mobile UI, Supabase Auth, Supabase History/Active Workout writes, AI Coach (/api/ai-chat), AI Import (/api/parse-workout), Food Vision endpoint (/api/parse-food).
- **PARTIALLY IMPLEMENTED**: AI Insights (calculates volume/consistency but could use deeper ML analytics).
- **NOT IMPLEMENTED**: Push Notifications (hydration reminders are just local timeouts), Offline Sync (currently fails if network is down), Apple Health/Google Fit integration.
- **UNKNOWN / NEEDS VERIFICATION**: Physical Android/iOS device behavior, App Store compliance, Edge-case AI hallucinations.

## 2. UI/UX
- **Aesthetic**: "Liquid Glass" (glassmorphism), dark mode only, neon accents (emerald green for nutrition, sky blue for workouts).
- **Design System**: Reusable `GlassCard`, Lucide icons, BlurView for native frosted glass.
- **Responsive Behavior**: Mostly flex-based, optimized for mobile screens.
- **Loading States**: Standard ActivityIndicators, some missing skeleton loaders.

## 3. SCREEN-BY-SCREEN DOCUMENTATION (MOBILE)

### `/login` (Auth)
- **Purpose**: Authenticates the user.
- **UI**: Email/Password inputs, Sign In/Up buttons.
- **Data Source**: Supabase Auth.
- **Known Limitations**: No social login (OAuth).

### `/(tabs)/index` (Dashboard)
- **Purpose**: High-level overview.
- **UI**: Greeting, Next Workout, Consistency ring, Hydration widget.
- **Data Source**: Supabase `workout_sessions` for consistency calculations.

### `/(tabs)/history` (History & Insights)
- **Purpose**: Review past workouts, track weight, view AI insights.
- **Data Source**: Supabase `workout_sessions`, `bodyweight_logs`. 
- **AI Calls**: Utilizes local helper functions to derive volume/frequency trends from DB.

### `/(tabs)/workout` (Builder)
- **Purpose**: Select exercises and start a session.
- **Data Source**: Supabase `exercises` table (fetches 20 limit).
- **Navigation**: Passes selected exercises via router params to `/active-workout`.

### `/active-workout` (Live Session)
- **Purpose**: Log sets, reps, weight during a live workout.
- **UI**: Carousel of exercises, rest timers.
- **Data Source**: Writes to Supabase `workout_sessions`, `session_exercises`, `sets`.
- **Known Limitations**: Doesn't support background execution reliably (OS might kill it).

### `/(tabs)/coach` (AI Coach)
- **Purpose**: General fitness advice and workout generation.
- **AI Calls**: Hits Vercel `/api/ai-chat`. 

### `/(tabs)/nutrition` (AI Nutritionist)
- **Purpose**: Food logging via chat and image scanning.
- **AI Calls**: Hits `/api/parse-food` for images, `/api/ai-chat` for text.

### `/settings` (Settings & AI Import)
- **Purpose**: Natural language workout parsing.
- **AI Calls**: Hits `/api/parse-workout`.

## 4. DATABASE DOCUMENTATION
**Schema (`public`):**
- `profiles`: user_id (PK, FK to auth.users), name, height, age, goals.
- `workout_sessions`: id (PK), user_id (FK), date, split, duration.
- `exercises`: id (PK), name, muscle_group.
- `session_exercises`: id (PK), session_id (FK), exercise_id (FK).
- `sets`: id (PK), session_exercise_id (FK), weight_kg, reps.
- `bodyweight_logs`: id (PK), user_id (FK), weight_kg, date.

**RLS**: Enabled on all tables. Users can only select/insert/update/delete rows where `user_id = auth.uid()`.

## 12. CODE QUALITY / ARCHITECTURE
- **Structure**: Expo Router (`app/`), reusable components (`components/`), abstractions (`lib/`).
- **Separation of Concerns**: Good. UI logic is in `app/`, API/DB logic is in `lib/`.
- **State Management**: React `useState`/`useEffect`. No global store (Redux/Zustand) currently.
- **Technical Debt**: `active-workout.tsx` handles too much complex state; could use a reducer or context.
- **Dead Code**: Web dashboard code (`src/`) exists but is not the primary focus.

## 13. DEPLOYMENT
- **Repository**: Single Monorepo (Mobile + Web + API).
- **Vercel**: Hosts the React web app and the Serverless API routes (`/api/*`).
- **Expo**: Used for mobile dev. Production requires EAS Build.
- **Environment Variables**: Requires `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_BACKEND_URL` on mobile. Vercel requires `NVIDIA_API_KEY`, `OPENAI_API_KEY`.
