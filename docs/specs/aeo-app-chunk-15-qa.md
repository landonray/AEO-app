# Chunk 15 QA Report — Metrics computation (iteration 2)

**Pipeline:** AEO app
**Chunk:** 15 — Metrics computation
**Files in scope:** `src/lib/metrics.ts`, `src/lib/__tests__/metrics.test.ts`
**Scope:** QA plan §8.1–8.9 (visibility, SOV, position, sentiment-mentioned-only, change, trend, sources, URL sources, competitive rank)

## Pre-flight

The prior iteration's QA report flagged the worktree as dirty — implementation files were written but never committed. The fix cycle committed them in `5f04d1e Chunk 15: metrics computation module + tests`. I confirmed the chunk's two in-scope files (`src/lib/metrics.ts`, `src/lib/__tests__/metrics.test.ts`) are now present in `HEAD` via `git ls-tree`, and the worktree is clean. Pre-flight gate cleared.

## Test execution

The committed test file `src/lib/__tests__/metrics.test.ts` was run against the committed `src/lib/metrics.ts` implementation. Vitest reported **55 tests passed, 0 failed**, run duration 210ms (single test file).

`mc_run_tests` couldn't be used directly because this worktree's `node_modules` was installed without a `.bin/` directory, so the `vitest` CLI shim wasn't on PATH. I fell back to running vitest through `node node_modules/vitest/vitest.mjs` with `--reporter=dot` — a narrow, quiet invocation targeting only this chunk's single test file, which is the documented fallback when `mc_run_tests` cannot resolve the framework binary. The full suite was not run.

## Summary table

| # | Scenario | Result |
|---|---|---|
| 8.1 | Visibility — 10/4 → 0.4; zero runs → 0; all unmentioned → 0; all mentioned → 1 | pass |
| 8.2 | Share of Voice — 5/(5+15)=0.25; zero denominator → 0; empty runs → 0 | pass |
| 8.3 | Average position — `[1,2,4,null,null]` → 7/3; all NULL → null; empty → null | pass |
| 8.4 | Avg sentiment — mentioned-only, **null when zero mentioned** (KEY INVARIANT) | pass |
| 8.5 | Visibility change — +Xpp delta; prior empty → null (not +Xpp); both empty → null | pass |
| 8.6 | Weekly trend — Sunday UTC buckets, window = `max(days, 28)`, ordered, sparse-OK | pass |
| 8.7 | Domain sources — `retrievalRate`/`citationRate` formulas; sorted desc; www. normalized | pass |
| 8.8 | URL sources — keyed by full URL; null-URL citations skipped | pass |
| 8.9 | Competitive rank — sorted by visibility desc; brand wins ties (§18.2 default) | pass |

Per the task's chunk-scoped instructions I limited verification to §8.1–§8.9. The test file also covers `computeRankings`, `buildKeyInsight` (§15.D tiers), and `buildActions` (§15.E deterministic rules) — those tests all passed too, but they fall under later QA scenarios and aren't required for the chunk gate.

## Per-scenario detail

### 8.1 Visibility — pass

`computeVisibility(runs)` returns `mentioned / totalRuns` as a 0–1 float. The implementation early-returns `0` for an empty array, which prevents the `0/0 = NaN` failure mode called out in the QA plan. Four assertions ran: 10 runs / 4 mentioned → 0.4; zero runs → 0; all unmentioned → 0; all mentioned → 1. All passed. The null-vs-zero treatment matches §13.1 of the refined spec (visibility is a fraction, not nullable).

### 8.2 Share of Voice — pass

`computeSOV(runs, competitors)` computes `brandMentions / (brandMentions + sum-of-competitor-mentions)`. Three assertions ran: brand=5, competitor sum=15 → 0.25; zero denominator (no mentions at all) → 0; empty runs array → 0. All passed. The zero-denominator guard matches §13.2 of the spec ("Where the denominator is zero, sov = 0") and the QA plan's "never NaN" requirement.

### 8.3 Average position — pass

`computeAvgPosition(runs)` averages `positionScore` over runs where it is a finite number (skipping nulls), returning `null` when no runs qualify. Three assertions ran: `[1,2,4,null,null]` → 7/3 ≈ 2.333; all NULL → null; empty → null. All passed. The `null`-when-empty contract matches §13.3 of the spec (UI renders `—`).

### 8.4 Avg sentiment — mentioned-only, null when empty — pass (KEY INVARIANT)

This is the highest-leverage scenario in the chunk per the QA plan and Q15a, and it is locked in by five separate assertions:

- **8.4.A** 3 mentioned runs (positive + neutral + negative) plus 7 unmentioned runs of various sentiments → average is `(80+55+30)/3 = 55`, proving unmentioned runs are excluded.
- **8.4.B** 10 runs, 0 mentioned → `null` (and explicitly `not 55`). This locks the regression-prone invariant: the metric must NOT default to 55 when there are no mentioned runs.
- **8.4.C** all 10 mentioned + all positive → 80.
- **8.4.D** empty input → `null` (not 55).
- **8.4.E** 1 neutral mentioned + 3 unmentioned-positive runs → 55, confirming unmentioned positives do not raise the score.

`computeAvgSentiment` calls a shared `avgSentimentOver` helper with the predicate `r.mentioned === true`. The helper returns `null` when the filtered count is zero — matching §13.4 of the spec and Q15a's resolution.

### 8.5 Visibility change — pass

`computeVisibilityChange(currentRuns, priorRuns)` returns `(currentVis - priorVis) * 100` as a percentage-point delta, and returns `null` when `priorRuns.length === 0`. Four assertions ran: +10pp delta (current 40%, prior 30%); −30pp delta (current 20%, prior 50%); prior window empty (0 runs) → `null` (not "+40pp" inflation); both empty → `null`. All passed. The empty-prior-window behavior matches §18.1's default ("null → render —") and avoids the "divide-by-no-data inflation" failure the QA plan calls out.

### 8.6 Weekly trend bucketing — pass

`computeWeeklyTrend(runs, brand, competitors, days, now)` groups runs into Sunday-start UTC buckets and emits one row per bucket with `weekStart`, `brand` visibility, and each competitor's visibility. Six assertions ran:

- **8.6.a** Three weeks of seeded data produce 3 ordered buckets; each row carries numeric brand + per-competitor entries.
- **8.6.b** Sunday-00:00-UTC boundary: a run at `2026-05-31T00:00:00Z` (a Sunday) bucketed into the `2026-05-31` row, with brand visibility = 1. This locks the UTC-Sunday boundary rule from §13.6.
- **8.6.c** Window expansion: `days=7` with a run 21 days old still appears (because `max(7, 28) = 28`). Matches §13.6 "Window: max(days, 28)".
- **8.6.d** Runs older than the window (e.g. a 2025 run with `now` in 2026 and `days=7`) are excluded → empty result.
- **8.6.e** Sparse data: 1 run with `days=90` still emits 1 bucket — the chart renders rather than blowing up (matches §17 / QA plan 13.17).
- **8.6.f** Per-week per-entity values are visibility fractions, not raw counts: 2 brand-mentioned + 1 Beta-only in a single week → brand=2/3, Beta=1/3, Gamma=0.

All passed. Implementation note: `windowDays = Math.max(days, 28)`; `getSundayUTC()` shifts via `setUTCDate(date - dow)`; buckets are sorted ascending by string key (safe because YYYY-MM-DD is lexicographically ordered).

### 8.7 Domain sources — pass

`computeDomainSources(runs, citations)` aggregates per normalized-apex domain. Four assertions ran:

- **8.7.a** Domain `foo.com` appearing in 2 distinct runs with 3 citations across 20 runs / 100 citations → `retrievalRate = 2/20`, `citationRate = 3/100`. Exact formula match against §13.7.
- **8.7.b** Rows sorted by `retrievalRate` desc (`a.com`, `b.com`, `c.com`).
- **8.7.c** Empty inputs → `[]`.
- **8.7.d** `www.foo.com` and `foo.com` collapse to the same row via `normalizeDomain`. The QA plan does not require this directly but it's a sensible invariant — covered.

### 8.8 URL sources — pass

`computeUrlSources(runs, citations)` is the URL-keyed twin of 8.7. Two assertions ran: grouping by full URL produces distinct rows for `/a` vs `/b`; citations with `url = null` are skipped entirely. All passed. Same formulas as 8.7 but keyed by URL string.

### 8.9 Competitive rank — pass

`computeCompetitiveRank(brand, competitors)` counts competitors with `visibility > brand.visibility` and returns `aboveCount + 1`. The strict `>` (not `>=`) implements the §18.2 default tie-breaker: brand wins ties. Five assertions ran: brand at top → 1; one competitor above → 2; all competitors above → N+1; two competitors tied at brand's visibility → 1 (brand wins ties); empty competitor list → 1. All passed. The tie behavior is also exercised inside `computeRankings`'s sort (brand sorted first on tie), which passed in the broader rankings test block.

## Non-test code review notes

I read `src/lib/metrics.ts` end-to-end as a static check. No bugs found in the §8.1–§8.9 functions. A few observations that are NOT bugs and NOT in scope to fix here, but worth recording so a downstream reviewer doesn't re-derive them:

- `computeRankings`'s per-competitor sentiment uses `avgSentimentOver(competitorRuns, () => true)`, which averages over the (already filtered) runs where the competitor was mentioned. This matches §13.4's "averaged over runs where that entity was mentioned" and yields `null` when the competitor has zero mentioned runs (locked in by the `gamma.sentiment === null` assertion).
- `computeRankings`'s competitor `position` is hard-coded to `null`. The refined spec (§13.3) only defines `position_score` against the brand; per-competitor position is not stored. Test explicitly asserts this.
- `computeWeeklyTrend` ignores the `brand` argument (prefixed `_brand`) for value computation — it relies on the run set itself rather than brand identity. That's consistent with how brand visibility is derived (`mentioned / total`).

## Conclusion

Every scenario in QA plan §8.1–§8.9 is covered by automated unit tests, and all 55 tests in `src/lib/__tests__/metrics.test.ts` passed against the committed `src/lib/metrics.ts`. The KEY-INVARIANT scenario (§8.4 "null when zero mentioned, not 55") is locked by multiple assertions. The worktree is clean and the implementation is on `HEAD`.

Overall: pass
