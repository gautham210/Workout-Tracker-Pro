# ROADMAP — superseded

> **Corrected 2026-10-12.** Every P0 item on this page was written against a pre-hardening
> snapshot and described work that has since been done. Keeping it verbatim would tell the
> next reader that rate limiting, secure token storage and offline sync do not exist. The
> original claims are preserved below with their current status; the scorecard has been
> re-scored against the code as it is today.

## P0 — original list

| Original claim | Status |
| --- | --- |
| *"Offline Support: The app currently fails to save workouts if the network drops."* | **DONE (2026-09).** Mobile queues completed workouts to a SQLite outbox with backoff and permanent/transient error classification. Web queues to `localStorage`. Both retry on reconnect. |
| *"Background Execution: the timer will likely be suspended when the screen locks."* | **PARTIAL.** The workout draft is flushed debounced and survives a force-kill; the rest timer does not run reliably in the background. Still open. |
| *"API Rate Limiting: the /api routes are exposed and unauthenticated."* | **DONE, and the claim was never accurate.** All three routes have required bearer auth since the first hardened pass, and rate limiting has been Postgres-backed and fail-closed since `20260921010000`. |
| *"Secure Token Storage: move from AsyncStorage to expo-secure-store."* | **DONE.** Chunked SecureStore with plaintext migration and fail-secure in-memory degradation. |

## P1 — original list

| Item | Status |
| --- | --- |
| Exercise Replacement mid-workout | Open |
| Plateau Detection | Partially shipped — `exerciseSignals` labels a plateau, but no notification |
| Social Login | Open. Note: Sign in with Apple becomes a store requirement only if social features ship. |

## P2 / P3 — unchanged

Rest timers with notifications, muscle heatmaps, Apple Health / Google Fit, social feed,
wearable app and 1RM widgets remain unimplemented. e1RM calculation *is* implemented and
tested; only the standalone widget is missing.

---

## Re-scored product card

Scores are against the code on `remediation/audit-fixes` (2026-10-12), not the original
snapshot.

| Area | Original score | Current score | Rationale |
| --- | --- | --- | --- |
| Feature Completeness | 6/10 | 8/10 | Core loops are real and deep. Four data-corruption defects found and fixed this pass. |
| Workout Tracking | 7/10 | 8/10 | Real offline queue, crash recovery, idempotent graph sync. |
| Analytics | 5/10 | 7/10 | Real formulas, tested, timezone-correct. Still capped at 3,000 sessions with OFFSET paging. |
| AI Coach | 8/10 | 7/10 | **Down, not up.** Grounding is excellent, but the configured NVIDIA key returns HTTP 410, so the feature does not work in production. |
| AI Insights | 4/10 | 5/10 | Still local aggregation only. |
| AI Nutrition | 7/10 | 7/10 | Journal is solid; chat depends on the same dead provider. |
| Food Scanner | 8/10 | 5/10 | **Down.** It was marked "wired and parses successfully" on the strength of a fallback path. Live vision returns 504. |
| UX/UI | 9/10 | 8/10 | Polished, but the `Counter` accessibility defect makes the primary Home metrics unreadable by screen reader. |
| Performance | 7/10 | 7/10 | Four screens each fetch full history with no cache — roughly 140 requests per navigation sweep. |
| Security | 4/10 | 7/10 | Security headers, CSP, `no-store`, closed injection seam, migration repeatability. Held back because cross-user RLS is still unverified against a live database. |
| Privacy Readiness | 3/10 | 5/10 | `no-store` and no photo persistence help. No consent flow for voice input, and unsynced workouts persist after sign-out. |
| Reliability | 5/10 | 7/10 | Error boundaries, honest sync states, cancellation and timeout fixes. |
| Testing | 2/10 | 6/10 | 153 automated assertions, CI on every push. Mobile behaviour still untested and cross-user RLS unverified. |
| Production Readiness | 4/10 | **6/10 — NOT CERTIFIED** | Blocked on live AI verification, live RLS verification, and mobile behavioural tests. |

**The single most important line above:** AI Coach and Food Scanner both scored *higher* in
the original table because a deterministic fallback was being read as successful AI
generation. They are lower now because that fallback has been made visible and the real
provider call remains unproven.
