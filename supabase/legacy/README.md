# Legacy SQL (superseded)

These scripts were the original hand-run setup files for the project. They are
kept for history only.

- They are superseded by the ordered migrations in `supabase/migrations/`.
- They define weaker schemas and row level security than the canonical migrations.
- They must NOT be re-run against any database (live or fresh). Re-running them can
  weaken or overwrite policies, columns and constraints that the migrations enforce.

**Every file in this folder now aborts with a `RAISE EXCEPTION` if executed.** The warning
above was not enough: each script opens with "Run this in your Supabase SQL Editor", which is
exactly the instruction that turns a historical file into a production incident. The guard
makes an accidental paste fail loudly instead of quietly reverting your RLS.

`tests/migrations-repeatable.test.js` asserts the guard is present, so it cannot be removed
by a later cleanup.

To build a database, apply only `supabase/migrations/` in order.
