# Legacy SQL (superseded)

These scripts were the original hand-run setup files for the project. They are
kept for history only.

- They are superseded by the ordered migrations in `supabase/migrations/`.
- They define weaker schemas and row level security than the canonical migrations.
- They must NOT be re-run against any database (live or fresh). Re-running them can
  weaken or overwrite policies, columns and constraints that the migrations enforce.

To build a database, apply only `supabase/migrations/` in order.
