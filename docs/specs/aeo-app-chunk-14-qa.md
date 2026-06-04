# Chunk 14 QA Report — DB queries (after fix iteration 3)

**Branch:** `pipeline-aeo-app-2245556e-chunk-14-dbquer`
**Files under test:** `src/lib/queries.ts`, `src/lib/__tests__/queries.test.ts`
**Test runner:** vitest 2.1.9
**Result:** 40 passed / 0 failed / 0 skipped (3.23s)

## Method

The QA plan calls out three required scenario groups for `lib/queries.ts`:
§2.5 (parameterization), §2.6 (date interval), §2.7 (model filter). The build
plan additionally lists the full set of helpers the module must export. Each
scenario was verified by reading the implementation in `src/lib/queries.ts`,
confirming the matching test cases in `src/lib/__tests__/queries.test.ts`,
then running the full file under vitest. All 40 cases passed cleanly.

## Fix iteration 3 — what changed and why it works

The prior iteration's `buildListPrompts` assertion rejected the substring
`is_active` anywhere in the emitted SQL. The implementation correctly SELECTs
`is_active` as a column (so callers can populate `Prompt.isActive`) without
filtering on it in the WHERE clause — and the spec calls for exactly that
behavior (`listPrompts` returns all prompts; `listActivePrompts` is the
filtered variant). The assertion was the bug, not the implementation.

This fix rescopes the negative match to the WHERE clause only: it captures the
substring between `WHERE` and the next `ORDER BY`/`LIMIT`/end-of-string and
asserts `is_active` does not appear inside it. The test now correctly
encodes the spec rule (no `is_active` filter) while permitting the column to
be selected. With this change the suite is green.

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
schemas, and parameterization. The test suite is now fully green
(40 passed / 0 failed) after the fix iteration 3 assertion rescope.

Overall: pass
