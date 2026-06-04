# Chunk 17 QA — setup-db + brand API routes + migrate script

**Scope:** `src/app/api/setup-db/route.ts`, `src/app/api/brand/route.ts`, `scripts/migrate.ts`,
plus the `db:migrate` npm script referenced from Chunk 1.

**QA scenarios in scope (from `aeo-app-qa-plan.md`):** §2.1, §2.2, §11.1, §13.2.

## Summary

| Scenario | Title | Result |
|---|---|---|
| §2.1 | Schema applies idempotently | pass |
| §2.2 | Table existence check shows partial state | pass |
| §11.1 | `GET /api/brand` — null and onboarded shapes | pass |
| §13.2 | Schema not applied → redirect to `/setup` | blocked |

## Test execution

`mc_run_tests` returned `status: crashed` (exit 127, `sh: vitest: command not found`)
in this worktree because the partial npm install left vitest installed under
`node_modules/vitest/` but never created the `node_modules/.bin/vitest`
symlink the test runner shells out to. That is an environmental issue, not a
suite failure. I fell back to invoking vitest directly via Node against the
two test files this chunk ships. Result:

- Test files: 2 passed (2)
- Tests: 8 passed (8)
- Duration: 5.77s

Both `src/app/api/brand/__tests__/route.test.ts` (3 tests) and
`src/app/api/setup-db/__tests__/route.test.ts` (5 tests) passed cleanly.

---

## §2.1 — Schema applies idempotently

**What was verified.**
1. The schema file `src/sql/schema.sql` uses `CREATE TABLE IF NOT EXISTS`
   for all five tables (brands, competitors, prompts, runs, citations) and
   `CREATE INDEX IF NOT EXISTS` for all seven indexes. Static review of the
   file at HEAD confirms zero unconditional `CREATE` statements, so running
   it a second time against a populated database is a no-op at the SQL level.
2. `POST /api/setup-db` reads `src/sql/schema.sql` from disk via
   `node:fs/promises.readFile`, forwards the SQL text verbatim to
   `runMigration(sqlText)`, then re-runs `checkTables()` and returns the
   updated `{ allTablesExist, results }` shape.
3. The vitest test "reads sql/schema.sql, runs migration, then returns
   updated table status (§2.1)" exercises the POST handler end-to-end with
   `node:fs/promises` and `@/lib/queries` mocked, and verifies all five
   tables come back `exists: true` with `allTablesExist: true`.
4. The vitest test "runs migration before checking tables (ordering)" pins
   the call order so a future refactor cannot accidentally return stale
   table state from before the migration ran.

**Result:** pass.

**Notes.** A live integration test against a fresh Neon branch (apply twice;
assert no SQL error on the second run; assert all 7 indexes present in
`pg_indexes`) is the strongest form of this scenario but requires a Neon
test branch which isn't available in this QA stage. The combined static
review of the schema + handler unit test gives strong evidence the route is
idempotent; the live double-apply check is deferred to the integration QA
stage at the end of the pipeline.

---

## §2.2 — Table existence check shows partial state

**What was verified.**
1. `GET /api/setup-db` calls `checkTables()`, computes
   `allTablesExist = results.every((r) => r.exists)`, and returns
   `{ allTablesExist, results }` with one row per table.
2. `checkTables()` (in `src/lib/queries.ts`) queries
   `information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`
   against the canonical five-table list, then maps the result set into a
   complete `{ table, exists }` array for every expected table — including
   tables that were not returned by the query, which correctly get
   `exists: false`.
3. The vitest test "returns allTablesExist=false when only some tables exist
   (§2.2)" stubs `checkTables()` to return a mixed-existence array and
   confirms the GET handler propagates the per-row `exists` flags verbatim
   and sets `allTablesExist: false`.

**Result:** pass.

---

## §11.1 — `GET /api/brand`

**What was verified.**
1. `GET /api/brand` calls `getPrimaryBrand()` and:
   - Returns `{ brand: null }` when no primary brand exists.
   - Otherwise returns
     `{ brand: { id, name, domain, category, description } }` — only the
     five documented fields. Internal fields like `isPrimary` and
     `createdAt` are explicitly stripped by the handler.
2. The vitest test "returns { brand: null } when no primary brand exists
   (§11.1)" verifies the null path: response is `200`, body is exactly
   `{ brand: null }`.
3. The vitest test "returns only the documented fields when a primary brand
   exists" asserts the brand payload equals the documented five-field
   object and explicitly asserts that
   `Object.keys(body.brand).sort() === ['category','description','domain','id','name']`
   — `isPrimary` and `createdAt` from the underlying Brand record do NOT
   leak into the response.
4. A third test confirms `null` category and description pass through as
   `null` rather than being coerced or omitted.

**Result:** pass.

---

## §13.2 — Schema not applied → redirect to `/setup`

**What was verified.**
- The supporting API contract is verified: `GET /api/setup-db` reports
  `allTablesExist: false` when any of the five tables is missing (covered
  by §2.2). That's the signal a future `/` page-level guard would use to
  trigger the redirect.

**What is NOT in scope here.**
- The actual redirect lives in the root page handler (`src/app/page.tsx`),
  which at this chunk is still the Chunk 1 scaffold ("Luminaire — Scaffold
  ready.") with no redirect logic. The page-level entry guard that calls
  `GET /api/setup-db` and redirects to `/setup` when `allTablesExist` is
  false is a separate, later chunk (the entry page / app shell chunk), not
  part of Chunk 17's three files.
- There is no `src/app/setup/` route in this chunk either.

**Result:** blocked. The API foundation needed by the eventual redirect is
in place and verified, but the redirect itself cannot be verified in this
chunk because the page that does the redirect ships in a later chunk.

---

## Additional notes (out-of-scope checks that still came up clean)

- `scripts/migrate.ts` reads the same `src/sql/schema.sql` file used by the
  POST route and runs it via `sql.query(sqlText)` after validating
  `DATABASE_URL`. Failure modes (no `DATABASE_URL`, unreadable schema
  file, query failure) each exit with code 1 and a clear `console.error`.
  Not an in-scope QA scenario for this chunk, but reviewed since it's one
  of the three files this chunk shipped.
- `package.json` includes both npm scripts called out in the chunk
  description: `db:migrate` (`tsx scripts/migrate.ts`) and `cron`
  (`node scripts/cron.mjs`), in addition to the standard `dev`, `build`,
  `start`, and `test` scripts.

---

Overall: pass
