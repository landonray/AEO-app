# Chunk 3 — SQL Schema File — QA Report

**Chunk scope:** `src/sql/schema.sql` — the verbatim schema from §4 of the refined spec
(five `CREATE TABLE IF NOT EXISTS` + seven `CREATE INDEX IF NOT EXISTS`).
**QA scenarios in scope:** §2.1, §2.2, §2.3, §2.4 of the QA plan.
**Verification method:** all four scenarios verified end-to-end against an isolated
Neon test branch (`qa-chunk-03-sqlsch`, branch id `br-floral-wind-a6ieinlf`,
project `cold-night-47214718`). The branch was deleted after verification, so the
dev DB is untouched.

## Summary

| # | Scenario | Result |
|---|---|---|
| 2.1 | Schema applies idempotently | pass |
| 2.2 | Table existence check shows partial state | pass |
| 2.3 | `gen_random_uuid()` works without an extension | pass |
| 2.4 | `ON DELETE CASCADE` removes children | pass |

## Pre-flight verification — file matches the refined spec

The shipped file `src/sql/schema.sql` was diffed against the SQL block in §4 of
`docs/specs/aeo-app-refined.md`. The two are content-identical (whitespace and
inline column comments aside) — same five tables in the same order, same column
list and defaults on every table, same seven `CREATE INDEX IF NOT EXISTS`
statements, and `gen_random_uuid()` PRIMARY KEYs across the board. `JSONB` is
used for `runs.competitor_mentions`; `TEXT[]` is used for `prompts.tags`.

A note on a discrepancy in the QA plan itself: §2.1 of the QA plan says "Verify
counts in `pg_indexes` for the six indexes." The refined spec §4 actually
declares **seven** indexes — the QA plan undercounts by one. The implementation
matches the refined spec (the source of truth), so this does not affect the
result; it is flagged here so the QA plan can be corrected in a later pass.

---

## §2.1 — Schema applies idempotently

**What was verified.** On a fresh Neon branch with zero tables, the full
schema was applied as a single transaction. It returned no errors and created
all five tables. The exact same statements were then applied a second time on
the same branch. The second run also returned no errors — confirming the
`IF NOT EXISTS` clauses on every `CREATE TABLE` and `CREATE INDEX` make the
script safe to re-run, which is what the Chunk 17 migration runner relies on.

After both applies, the `public` schema contained exactly the five expected
tables (`brands`, `citations`, `competitors`, `prompts`, `runs`) and the seven
expected indexes (`idx_runs_prompt_id`, `idx_runs_created_at`, `idx_runs_model`,
`idx_citations_run_id`, `idx_citations_domain`, `idx_prompts_brand_id`,
`idx_competitors_brand_id`) — no duplicates and nothing extra.

**Result: pass.**

---

## §2.2 — Table existence check shows partial state

**What was verified.** Starting from the full schema state, `runs`,
`citations`, and `competitors` were dropped (using `CASCADE` to remove their
foreign-key dependents), leaving only `brands` and `prompts`. A per-table
existence query (the same `information_schema.tables` lookup the migration
runner is expected to use in Chunk 17) was run and returned:

- `brands` → exists: true
- `prompts` → exists: true
- `competitors` → exists: false
- `runs` → exists: false
- `citations` → exists: false

So a per-table existence check correctly distinguishes the partial state, and
an aggregate `allTablesExist` flag derived from this set would be `false` —
matching the §2.2 expectation. The schema was then re-applied, which cleanly
re-created the three missing tables and left the two existing tables
untouched, confirming the migration runner's "heal a partially-populated DB"
path also works.

**Result: pass.**

Caveat (not a failure): the actual `GET /api/setup-db` route handler that
returns the `{ allTablesExist, perTable }` JSON is implemented in Chunk 17,
not this chunk. What this chunk owns is that the schema itself supports the
check, which it does. End-to-end verification of the JSON response shape
belongs to Chunk 17 QA.

---

## §2.3 — `gen_random_uuid()` works without an extension

**What was verified.** Before inserting, I checked `pg_extension` for
`pgcrypto` and `uuid-ossp` — neither is installed on the branch. Then I ran
`INSERT INTO brands (name, domain) VALUES ('AcmeQA', 'acme-qa.test')
RETURNING id` (deliberately omitting `id`). The insert succeeded and returned
a populated UUID (`d14392b8-d1fe-491a-a9ed-6a3ca6e23a20`) with column type
`uuid` and the canonical 36-character text form. This confirms that Neon
Postgres (which is Postgres 14+) ships `gen_random_uuid()` as a built-in and
the schema does not need a `CREATE EXTENSION` preamble — matching the
"Key decisions" note in §4 of the refined spec.

**Result: pass.**

---

## §2.4 — `ON DELETE CASCADE` removes children

**What was verified.** A complete dependency chain was seeded on the branch:
one brand → two competitors → one prompt → one run → two citations
(2 + 1 + 1 + 2 = 6 descendant rows in total). The seed row counts were
confirmed before the delete (brands=1, competitors=2, prompts=1, runs=1,
citations=2).

`DELETE FROM brands WHERE id = '...'` was then issued. Immediately afterward,
all five row counts went to zero — including `citations`, which is two
foreign-key hops away from `brands`. This confirms the cascade chain is
intact end-to-end:

- `competitors.brand_id → brands.id ON DELETE CASCADE` removes competitors.
- `prompts.brand_id → brands.id ON DELETE CASCADE` removes prompts.
- `runs.prompt_id → prompts.id ON DELETE CASCADE` removes runs once prompts go.
- `citations.run_id → runs.id ON DELETE CASCADE` removes citations once runs go.

No orphan rows remained, so deleting a brand cannot leave behind
dependent data that would silently skew metrics later.

**Result: pass.**

---

## Out of scope for this chunk

The chunk note explicitly defers automated test coverage for idempotency to
Chunk 17 ("Tests for idempotency live in the Chunk 17 route tests"). The
schema file itself contains no executable code, so there is no vitest target
to run for this chunk; I have not added unit/integration tests here. The
behavioral verification above is the appropriate check for a schema-only
chunk.

QA scenarios §2.5, §2.6, §2.7 (parameterized SQL, parameterized date
interval, optional model filter) are not in this chunk's scope — they
concern `lib/queries.ts`, which is a later chunk.

---

## What I checked that was not strictly required

- Confirmed via `pg_extension` that no UUID-related extension is enabled, so
  the `gen_random_uuid()` success is genuinely from the Postgres built-in
  and not from an extension someone happened to install on the project's
  default branch.
- Verified the partial-state heal path (drop three tables, re-apply schema)
  works cleanly — relevant to §2.1 and §2.2 in combination, and to the
  Chunk 17 migration runner.
- Cleaned up the Neon test branch (`br-floral-wind-a6ieinlf`) at the end so
  the project's branch list is not polluted.

Overall: pass