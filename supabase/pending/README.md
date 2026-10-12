# Pending database changes

SQL in this folder is **prepared but never applied**. It is deliberately kept out of
`supabase/migrations/` so that a routine `supabase db push` cannot push it unreviewed.

## Why

Corrective privilege changes against live tables need a reviewed plan and a verified
backup/recovery strategy. That has not happened yet, so these statements are staged.

## Current verification status

| Check | Status |
| --- | --- |
| Migration ledger vs. local files | **VERIFIED** — `supabase db push --linked --dry-run` returns `{"upToDate":true,"migrations":[],"message":"Remote database is up to date."}` |
| `20260921020000` is a duplicate of the function it claims to fix | **VERIFIED** — both bodies are 5687 chars and identical after whitespace normalisation; asserted by `tests/migrations-repeatable.test.js` |
| Live table grants / `TRUNCATE` privileges | **NOT VERIFIED** — no SQL execution path available in this workspace (no Docker for `db dump`, no local Postgres, no `psql`) |
| Live RLS policies as deployed | **NOT VERIFIED** — same reason |
| Cross-user RLS isolation | **NOT VERIFIED** — `tests/rls-cross-user.test.js` **skips** without `SUPABASE_DB_URL` |
| `20260921040000` / `20260922000000` actually applied | **INFERRED APPLIED** — the ledger reports up to date, which implies all local migrations are recorded |

## Before applying `20260923000000_least_privilege_hardening.sql`

1. Run the read-only grant queries at the top of the file and **record the output**.
2. Take a backup: `pg_dump --schema=public "$SUPABASE_DB_URL" > backup.sql`
3. Review with a second pair of eyes. It revokes `TRUNCATE`, `REFERENCES` and `TRIGGER`,
   and adds `FORCE ROW LEVEL SECURITY`.
4. Apply to a disposable clone first, then run `tests/sql/rls-cross-user.sql`.
5. Confirm the application still works: catalogue read, `sync_workout_graph`,
   `save_athlete_metrics`.

## Enabling the RLS probe

```bash
# disposable database only — never production
SUPABASE_DB_URL='postgresql://postgres:<pw>@localhost:54322/postgres' \
ALLOW_RLS_PROBE=1 \
npm run test:logic
```

The probe runs inside a transaction and rolls back. It creates `auth.users` rows
temporarily, so it must never point at production.
