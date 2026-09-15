# ROADMAP & FEATURE GAP ANALYSIS

## P0 — Critical / Security / Blocking
- **Offline Support**: The app currently fails to save workouts if the network drops. Implement local-first caching (e.g., WatermelonDB or robust SQLite fallback).
- **Background Execution**: The `active-workout` timer and state will likely be suspended by iOS/Android when the screen locks. Requires `expo-background-fetch` or `expo-task-manager`.
- **API Rate Limiting**: The Vercel `/api` routes are exposed and unauthenticated (they don't strictly require Supabase JWTs yet for the AI portion). This is a critical billing vector.
- **Secure Token Storage**: Move session storage from `AsyncStorage` to `expo-secure-store`.

## P1 — Important
- **Exercise Replacement**: Users must be able to swap an exercise during an active workout (e.g., if a machine is taken).
- **Plateau Detection**: The AI should actively notify users if they haven't increased volume/weight on a compound lift in 4+ weeks.
- **Social Login**: Implement Sign in with Apple / Google.

## P2 — Useful
- **Rest Timers with Notifications**: Send a local push notification when the rest timer hits 0.
- **Detailed Muscle Heatmaps**: Visual representation of recovered vs. fatigued muscles based on recent `workout_sessions`.
- **Apple Health / Google Fit Sync**: Export workouts and import bodyweight/nutrition automatically.

## P3 — Nice-to-Have
- **Social Feed**: See friends' PRs and consistency streaks.
- **Wearable App**: Apple Watch / WearOS companion for logging sets without the phone.
- **1RM Calculators**: Built-in widget for estimating one-rep max based on the Brzycki formula.

---

## FINAL PRODUCT SCORECARD

*Scores based strictly on current codebase evidence (0-10).*

- **Feature Completeness**: 6/10 (Core loops exist, edge cases missing)
- **Workout Tracking**: 7/10 (Solid UI, lacks mid-workout edits)
- **Analytics**: 5/10 (Basic stats, lacks deep visualization)
- **AI Coach**: 8/10 (Good prompt engineering and intent parsing)
- **AI Insights**: 4/10 (Basic aggregations, not utilizing ML)
- **AI Nutrition**: 7/10 (Chat implemented well)
- **Food Scanner**: 8/10 (Vision endpoint wired and parses successfully)
- **UX/UI**: 9/10 (Liquid Glass design is highly polished)
- **Performance**: 7/10 (React Native runs well, but lacks caching)
- **Security**: 4/10 (API routes lack rate limiting/auth)
- **Privacy Readiness**: 3/10 (Needs consent flows and data deletion UI)
- **Reliability**: 5/10 (Lacks offline mode and background execution)
- **Testing**: 2/10 (Type safety only, no E2E or Unit tests)
- **Production Readiness**: 4/10 (Needs API protection and offline handling)
