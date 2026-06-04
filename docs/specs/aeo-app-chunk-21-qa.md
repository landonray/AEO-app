# Chunk 21 — Sources API Route — QA Report (iteration 2)

## Scope

This chunk ships `GET /api/sources` at `src/app/api/sources/route.ts`. The route accepts
`days`, `model`, and `view=urls|domains` query params; it calls `computeDomainSources` or
`computeUrlSources` (from `src/lib/metrics.ts`) based on `view` and returns
`{ sources, domainTypes, trend, view }`.

QA scope per the pipeline brief: §11.3 (QA plan — `GET /api/sources` contract),
§13.7 (refined spec — Domain sources metric), §13.8 (refined spec — URL sources metric).

## Summary

| # | Scenario | Result |
|---|---|---|
| 1 | §11.3 — Documented response shape `{ sources, domainTypes, trend, view }` | pass |
| 2 | §11.3 — Empty windows return empty arrays (not nulls) | pass |
| 3 | §11.3 — No primary brand returns the documented empty shape | pass |
| 4 | §11.3 / §13.7 — Default view returns domain-keyed sources with correct rates | pass |
| 5 | §11.3 / §13.8 — `view=urls` returns URL-keyed sources | pass |
| 6 | §11.3 — `model=all` is treated as no model filter | pass |
| 7 | §11.3 — Valid model short id is passed through to queries | pass |
| 8 | §11.3 — `days` defaults to 7 when omitted | pass |
| 9 | §13.7 / §13.8 — Trend payload returns weekly retrieval rates for top entities | pass |
| 10 | §13.7 — Domain sources metric (unit, via `computeDomainSources`) | pass |
| 11 | §13.8 — URL sources metric (unit, via `computeUrlSources`) | pass |

## Test runs

- Route tests: `src/app/api/sources/__tests__/route.test.ts`
  - Framework: vitest
  - Result: 9 passed, 0 failed (1.2s)
  - Run id: 662faf9f-a30e-4e27-83c7-e8cbdf45c81a
- Metrics unit tests (back the route's source-computation behavior):
  `src/lib/__tests__/metrics.test.ts`
  - Framework: vitest
  - Result: 55 passed, 0 failed (0.8s) — includes `computeDomainSources — QA §8.7`
    and `computeUrlSources — QA §8.8` describes that lock the §13.7 / §13.8 formulas.
  - Run id: 6da67154-e503-41ce-99a5-5a6410353d85

---

## Scenario 1 — §11.3 documented response shape

**What was verified.** The route's GET handler returns a JSON body whose top-level
keys are exactly `sources`, `domainTypes`, `trend`, `view`. The `SourcesResponse`
type in `src/types/index.ts` enforces this shape at the type layer, and the route
test `returns the documented shape` asserts the runtime key set sorts to
`['domainTypes', 'sources', 'trend', 'view']`.

**Result:** pass.

## Scenario 2 — §11.3 empty windows return empty arrays (not nulls)

**What was verified.** With no runs and no citations in the window, the route
returns `sources: []`, `domainTypes: []`, `trend: []`, and `view: 'domains'`. The
arrays are real arrays, never `null`. This is the QA plan's specific bullet for
this contract. Verified by the route test `empty windows return empty arrays, not
nulls`.

**Result:** pass.

## Scenario 3 — §11.3 no primary brand returns the documented empty shape

**What was verified.** When `getPrimaryBrand()` resolves to `null`, the route
short-circuits and returns the documented empty shape without calling `getRuns`
or `getCitations`. Verified by the route test `returns empty arrays when no
primary brand exists`, which also asserts the downstream queries are never
invoked in that branch.

**Result:** pass.

## Scenario 4 — §11.3 / §13.7 default view returns domain-keyed sources

**What was verified.** Default `view` is `'domains'`. With two runs and four
citations across two domains (reddit.com cited in both runs with 3 total
citations; forbes.com cited in one run with 1 citation), the route returns:

- `sources` keyed by `domain` (no `url` property on each row),
- `retrievalRate` = distinct runs that cited that domain ÷ total runs (reddit
  2/2 = 1.0; forbes 1/2 = 0.5),
- `citationRate` = citations to that domain ÷ total citations (reddit 3/4 = 0.75;
  forbes 1/4 = 0.25),
- rows sorted by `retrievalRate` desc.

This matches the §13.7 formula in the refined spec. `domainTypes` also returns a
percentage breakdown (UGC 3/4, Editorial 1/4). Verified by the route test
`default view=domains returns domain-keyed sources (§13.7)` and the unit
describe `computeDomainSources — QA §8.7` in `metrics.test.ts`.

**Result:** pass.

## Scenario 5 — §11.3 / §13.8 view=urls returns URL-keyed sources

**What was verified.** With `?view=urls`, the route returns rows keyed by full
URL (both `url` and `domain` are present on each row) and reuses the same
retrievalRate/citationRate formula as §13.7 but keyed by URL. With two runs and
three citations split across two URLs on the same domain, the rates are computed
correctly and rows are sorted by `retrievalRate` desc. Verified by the route
test `view=urls returns URL-keyed sources (§13.8)` and the unit describe
`computeUrlSources — QA §8.8` in `metrics.test.ts`.

**Result:** pass.

## Scenario 6 — §11.3 `model=all` is treated as no model filter

**What was verified.** The route's `parseModel` helper returns `undefined` for
`model=all` and for unrecognized values. The route forwards `model=undefined` to
both `getRuns` and `getCitations`, which means neither query adds a `model = $n`
clause — matching §11.3 / §14 (refined). Verified by the route test
`model='all' is treated as no model filter` (asserts both query calls receive
`model: undefined`).

**Result:** pass.

## Scenario 7 — §11.3 valid model short id is passed through

**What was verified.** With `?model=claude&days=30`, the route validates `claude`
against the `MODEL_SHORT_IDS` set and forwards it verbatim to `getRuns` and
`getCitations`, along with `days=30` and `view='domains'` to the citations
query. Verified by the route test `passes a valid model short id through to
queries`.

**Result:** pass.

## Scenario 8 — §11.3 days defaults to 7

**What was verified.** With no `days` param, the route resolves to `days=7` and
passes that to `getRuns`. `parseDays` also defends against non-numeric values
and non-positive integers by falling back to 7, and caps at 3650. Verified by
the route test `defaults days=7 when omitted`.

**Result:** pass.

## Scenario 9 — §13.7 / §13.8 trend payload

**What was verified.** When runs and citations are present across two distinct
weeks, the route returns a `trend` array of `{ weekStart, brand, [entityName]:
number }` rows, with per-week retrieval rate values in the `[0,1]` range for the
top entities. Each `weekStart` is an ISO date string formatted from a UTC Sunday
boundary, matching §8.6 (Sunday boundary, UTC) in the QA plan. Verified by the
route test `builds a trend with per-week retrieval rates for top entities`.

**Result:** pass.

## Scenario 10 — §13.7 Domain sources unit-level formula

**What was verified.** The `computeDomainSources` function in `src/lib/metrics.ts`
is exercised directly by the `computeDomainSources — QA §8.7` describe block in
`src/lib/__tests__/metrics.test.ts`. Those tests cover: correct retrievalRate
and citationRate calculation across multiple domains, sorting by retrievalRate
desc, empty inputs returning `[]`, and the zero-runs / zero-citations guards
that prevent NaN. All passed in the metrics test run above.

**Result:** pass.

## Scenario 11 — §13.8 URL sources unit-level formula

**What was verified.** The `computeUrlSources` function is exercised by the
`computeUrlSources — QA §8.8` describe block in the same metrics test file.
Coverage includes URL keying, identical metric formulas to the domain variant,
and empty-input handling. All passed in the metrics test run above.

---

## Notes

- The pipeline brief referenced "§11.3, §13.7, §13.8" without naming a document. I
  interpreted §11.3 as the QA plan section (`GET /api/sources` contract) and §13.7 /
  §13.8 as the refined-spec metric sections (Domain sources / URL sources). That's
  the interpretation that makes the chunk's scope coherent — the alternate reading
  (refined-spec §11.3 = Sentiment, or QA-plan §13.7/§13.8 = parser edge cases) does
  not match a Sources API route chunk. The scenarios above cover both the API
  contract and the underlying metric definitions.
- No implementation changes were made during QA. All findings are based on the
  committed code in this worktree (`src/app/api/sources/route.ts` at blob
  `75c76fe5b1`, supporting libs at their committed blobs) and the existing tests.
- No scenario was blocked. The full chunk scope is verified by automated tests.

Overall: pass
