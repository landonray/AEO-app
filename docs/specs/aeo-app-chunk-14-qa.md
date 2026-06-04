# Chunk 14 QA Report — DB queries (after fix iteration 2)

**Branch:** `pipeline-aeo-app-2245556e-chunk-14-dbquer`
**Files under test:** `src/lib/queries.ts`, `src/lib/__tests__/queries.test.ts`
**Test runner:** vitest 2.1.9 (run locally with `.env` loaded)
**Result:** 39 passed / 1 failed / 0 skipped (4.19s)

## Method

The QA plan calls out three required scenario groups for `lib/queries.ts`:
§2.5 (parameterization), §2.6 (date interval), §2.7 (model filter). The build
plan additionally lists the full set of helpers the module must export. Each was
verified by reading the implementation in `src/lib/queries.ts`, confirming the
matching test cases in `src/lib/__tests__/queries.test.ts`, then running the
full suite under vitest. The implementation file is ~770 lines; the test file
is ~580 lines covering 40 cases.

## Scenario-by-scenario verification

### §2.5 — All write queries use parameterized SQL (PASS)

- The query module exposes pure `build*` helpers returning `{ sql, params }`,
  and every value (brand name, domain, prompt text, run fields, citation rows,
  competitor rows, archive id, etc.) is supplied as a positional placeholder
  (`$1`, `$2`, …). No `${var}` interpolation appears in any SQL template.
- The test suite enumerates 19 builders, feeds each one SQL-injection sentinel
  strings (`Acme'; DROP TABLE brands;--`, `user' OR 1=1--`,
  `brand-id-with-quotes'--`), and asserts none of those strings appear in the
  emitted SQL. It also asserts that the maximum `$n` placeholder never exceeds
  `params.length` and that no params slot is unused.
- Multi-row inserts (`buildInsertCompetitors`, `buildInsertPrompts`,
  `buildInsertCitations`) generate one `VALUES` tuple per input row with shared
  `$1` for the parent id and fresh placeholders for the row fields — also
  parameterized, no interpolation.

### §2.6 — Date filter uses parameterized interval (PASS)

- `buildGetRuns`, `buildGetCitations`, and `buildGetLatestRunPerModelPerPrompt`
  all emit `now() - ($n || ' days')::interval` with the day count bound as a
  parameter. Tests assert the regex match and that the params array contains
  the string day count (`'7'`, `'30'`, `'90'`), not a concatenated `'7 days'`
  literal in the SQL.

### §2.7 — Model filter conditional (PASS)

- A `isFilterableModel()` guard skips the model clause when `model` is
  `undefined` or `'all'` and only appends `r.model = $n` when a concrete
  short id is supplied.
- Tests cover all three states (`undefined`, `'all'`, specific model) for
  `getRuns`, `getCitations`, and `getLatestRunPerModelPerPrompt`. All nine
  assertions pass.

### Build-plan helper coverage (PASS)

Every helper called out in the build plan is exported and matches its expected
signature/shape:

- Brand: `getPrimaryBrand`, `insertBrand`, `primaryBrandExists`.
- Competitor: `insertCompetitors`, `listCompetitors`.
- Prompt: `insertPrompts`, `insertPrompt`, `listPrompts`, `listActivePrompts`,
  `archivePrompt`, `getPrompt`.
- Run: `insertRun` (returns new id), `getRuns({ brandId, days, model? })`,
  `getRunsForPrompt(promptId, limit)`,
  `getLatestRunPerModelPerPrompt({ brandId, days, model? })`.
- Citation: `insertCitations`, `getCitations({ brandId, days, model?, view? })`.
- Table existence: `checkTables()` returns a `{ table, exists }[]` over the
  five tables.
- `runMigration(sqlText)` executes the schema text against Neon.
- `getLastRunTimestamp(brandId)` returns the most recent run timestamp for the
  brand or `null`.

Row mappers (`mapRunRow`, `mapCitationRow`) translate snake-case DB columns to
the camelCase shapes declared in `src/types/index.ts`, coerce numeric strings
to `number | null`, and clamp unknown sentiment / domain-type values to safe
defaults (`'neutral'`, `'Other'`).

### Schema alignment (PASS)

Column names in every builder match the SQL in `src/sql/schema.sql`:
`brands(name, domain, is_primary, category, description)`,
`competitors(name, domain, brand_id)`,
`prompts(text, topic, tags, is_active, brand_id)`,
`runs(prompt_id, model, response, mentioned, position_score, sentiment, competitor_mentions, estimated_cost)`,
`citations(run_id, domain, url, domain_type)`. The `competitor_mentions` insert
is correctly cast to `jsonb` via `$7::jsonb`.

## Failure

One test case fails:

**`prompt builders > buildListPrompts returns all prompts for a brand`**

The assertion `expect(n).not.toMatch(/is_active/)` rejects the substring
`is_active` anywhere in the emitted SQL. The implementation's
`buildListPrompts` correctly SELECTs the `is_active` column (so the calling
code can populate `Prompt.isActive`) without adding a WHERE filter on it —
which is the actual spec requirement: `listPrompts` returns ALL prompts for a
brand, while `listActivePrompts` is the variant that filters to
`is_active = true`.

The implementation behavior is correct per the build plan. The test assertion
is over-strict — it should check the WHERE clause does not constrain on
`is_active` (e.g. `not.toMatch(/WHERE [^)]*is_active/)`), not that the column
name is absent from the entire query.

The chunk's own test file therefore reports a failure even though the
implementation matches spec. A fix cycle should relax the assertion to target
the WHERE clause rather than the full query string.

## Other notes

- `runMigration(sqlText)` calls `sql.query(sqlText)` with a single argument.
  This is fine for executing schema DDL (no parameters needed) and is
  consistent with how the Neon serverless driver accepts non-tagged queries.
- `buildInsertCompetitors([])`, `buildInsertPrompts([])`, and
  `buildInsertCitations([])` short-circuit to a `SELECT 1 WHERE false` no-op
  rather than emitting an invalid `INSERT ... VALUES` clause. This is a
  reasonable defensive pattern and the async wrappers also early-return `[]`
  for empty inputs.
- `getRuns` is intentionally permissive about omitting `brandId` (drops the
  `p.brand_id = $n` clause) — useful for an "all brands" admin view.
  The build plan signature is `getRuns({ brandId, days, model? })`, so callers
  will always pass `brandId`; the optional path is a harmless extension.

## Overall

The implementation satisfies all three required QA scenarios (§2.5, §2.6,
§2.7) and covers every helper named in the build plan with correct shapes,
schemas, and parameterization. However, the chunk's own test suite reports
1 failing case (a flawed assertion in `buildListPrompts`), so the build is not
green.

Overall: fail
