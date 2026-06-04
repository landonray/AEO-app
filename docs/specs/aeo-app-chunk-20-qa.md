# Chunk 20 QA — Overview API route

**File in scope:** `src/app/api/overview/route.ts`

**QA scenarios in scope (from the chunk task):** §11.2 (`GET /api/overview` contract), §13.1 (visibility / no-primary-brand), §13.4 (Avg Sentiment empty-state and per-entity rule), §13.5 trend rows (visibility change + weekly trend bucketing). §15.5 round-trip discipline is included as a code-review item because the chunk task calls it out explicitly.

The implementer shipped a focused integration test at `src/app/api/overview/__tests__/route.test.ts` that exercises the `composeOverview` function the route delegates to. That test file is the primary evidence for the deterministic scenarios below. The GET handler's network-edge behavior (no-primary-brand 404, SQL parameterization, round-trip count) is verified by code review of `src/app/api/overview/route.ts` and `src/lib/queries.ts`.

---

## Summary

| # | Scenario | Result |
|---|----------|--------|
| §11.2-a | Every documented top-level key present on the response | pass |
| §11.2-b | `brand` projection omits `isPrimary` / `createdAt` | pass |
| §11.2-c | `metrics` block has exactly the 9 documented fields | pass |
| §11.2-d | `metrics.avgSentiment` is null when zero mentioned runs | pass |
| §11.2-e | `metrics.avgPosition` is null when no positions available | pass |
| §11.2-f | `rankings[].sentiment` null per-entity when entity has zero mentioned runs | pass |
| §11.2-g | `lastUpdated` is returned verbatim from `getLastRunTimestamp` | pass |
| §11.2-h | `keyInsight` matches §15.D tier rules (low / mid / strong) | pass |
| §11.2-i | `actions` reflect deterministic rules in §15.E | pass |
| §11.2-j | `sources` capped at top 8 entries, `totalCitations` reflects raw count | pass |
| §11.2-k | `domainTypes` percentages sum to ~1.0 across categories | pass |
| §11.2-l | `recentChats` returns up to 6 most-recent prompts with model + citation aggregation | pass |
| §11.2-m | `competitors` projection includes name + domain | pass |
| §13.1-a | Visibility counted over current window only (prior window excluded) | pass |
| §13.1-b | Empty current window returns visibility=0, totalRuns=0, mentioned=0 (not NaN) | pass |
| §13.1-c | No-primary-brand path returns 404 with documented error body | pass |
| §13.4-a | `avgSentiment` averages only mentioned runs (positive=80, negative=30, neutral=55) | pass |
| §13.4-b | `avgSentiment` is null when no mentioned runs in window | pass |
| §13.4-c | Rankings sentiment column is null per-entity when entity had zero mentioned runs | pass |
| §13.5-a | `visibilityChange` is `(current - prior) * 100` percentage-point delta | pass |
| §13.5-b | `visibilityChange` is null when prior window is empty | pass |
| §13.5-c | Trend uses max(days, 28)-day window and weekly Sunday-UTC buckets | pass |
| §13.5-d | Each trend row carries `weekStart` (YYYY-MM-DD) and a numeric column per competitor | pass |
| §13.5-e | `competitiveRank` is 1 when brand beats all competitors | pass |
| §15.5 | GET handler issues fewer than 10 DB round-trips | pass |
| Security | SQL parameterization — no string interpolation of inputs | pass |

---

## Detail

### §11.2-a — Every documented top-level key present

**What I verified:** `composeOverview` returns an object with exactly the 11 keys documented in §14 / §11.2 of the spec: `brand`, `competitors`, `metrics`, `rankings`, `trend`, `sources`, `domainTypes`, `recentChats`, `lastUpdated`, `keyInsight`, `actions`. The shape test runs `Object.keys(out).sort()` and asserts equality against the documented set.

**Result:** pass. Test `§11.2 shape contract › returns every documented top-level key` succeeds.

### §11.2-b — Brand projection strips internal fields

**What I verified:** The route projects only `{ id, name, domain, category, description }` onto the response — `isPrimary` and `createdAt` are not leaked.

**Result:** pass. Test `brand projection omits is_primary and created_at` succeeds.

### §11.2-c — Metrics block contains the 9 documented fields

**What I verified:** `metrics` keys are exactly `{ visibility, visibilityChange, mentioned, totalRuns, avgSentiment, avgPosition, sov, competitiveRank, totalCitations }`, matching the spec.

**Result:** pass. Test `metrics block has all 9 documented fields` succeeds.

### §11.2-d / §13.4-b — `metrics.avgSentiment` null on empty window

**What I verified:** When zero runs in the current window have `mentioned = true`, `metrics.avgSentiment` is `null` (not 55 / 0 / undefined). The route delegates to `computeAvgSentiment`, which iterates only over mentioned runs and returns `null` when the count is zero.

**Result:** pass. Test `§13.4 avgSentiment › is null when no run in the window was mentioned` succeeds.

### §11.2-e — `metrics.avgPosition` null when no positions

**What I verified:** `computeAvgPosition` only counts runs whose `positionScore` is a finite number. With an all-`null` window, it returns `null`. Confirmed indirectly via the route's empty-window tests and directly in the metrics unit suite (chunk 15) which also passes against this implementation.

**Result:** pass. Empty-window assertions in `route.test.ts` plus `metrics.test.ts` `computeAvgPosition` suite.

### §11.2-f / §13.4-c — Rankings per-entity sentiment null when entity has zero mentioned runs

**What I verified:** For each competitor row, the route filters runs to those where `competitorMentions[name] === true` and averages sentiment only over that set. When that set is empty (competitor never mentioned in the window), the row's `sentiment` is `null`, not `55`. The test seeds a single brand-only mentioned run and asserts `beta.sentiment === null`.

**Result:** pass. Test `per-entity rankings sentiment is null when entity had zero mentioned runs` succeeds.

### §11.2-g — `lastUpdated` is returned verbatim

**What I verified:** The route reads `getLastRunTimestamp(brand.id)` from a separate query and passes the result through `composeOverview` untouched. Test seeds `'2026-05-31T08:00:00.000Z'` and asserts the response carries that exact ISO string. Null is also propagated (empty-state tests).

**Result:** pass. Test `passes through lastUpdated verbatim` succeeds.

### §11.2-h — `keyInsight` tier rules

**What I verified:** The route calls `buildKeyInsight` with brand visibility, competitor average visibility, and the top-gap topic. Visibility < 10% produces the "Low visibility" string; visibility ≥ 30% produces the "Strong visibility" string. The mid-tier string substitutes brand % / competitor % / topic. This matches §15.D in the refined spec.

**Result:** pass. Test `keyInsight tiers based on visibility` succeeds.

### §11.2-i — `actions` rules (§15.E)

**What I verified:** The "Owned · low · Create an AI-optimized content hub" action is always present, per §15.E ("Always: Owned low"). The route delegates action construction to `buildActions`, which is unit-tested in the metrics suite for the full rule set (top-competitor gap, UGC > 0, visibility < 30%, retrieval rate < 20%, corporate ≥ 3).

**Result:** pass. Route test `always includes the low-priority Owned content hub action` succeeds; the broader rule set is covered by `metrics.test.ts`.

### §11.2-j — `sources` capped at top 8, `totalCitations` raw

**What I verified:** With 12 distinct cited domains seeded, the route returns at most 8 rows in `sources` and reports `totalCitations` = 12. Sort order is by `retrievalRate` desc (handled in `computeDomainSources`).

**Result:** pass. Test `limits sources to top 8` succeeds.

### §11.2-k — `domainTypes` percentages sum to ~1.0

**What I verified:** The route aggregates citations by `domainType` and emits `{ type, count, percentage }` rows. Test with 2 UGC + 1 Editorial citations confirms percentages sum to 1.0 and the largest bucket is first.

**Result:** pass. Test `domainTypes percentages sum to ~1 across categories` succeeds.

### §11.2-l — `recentChats` aggregation

**What I verified:** The route groups runs in the current window by `promptId`, sorts groups by latest-run timestamp desc, takes up to 6 prompts, and aggregates per-prompt: distinct models, citation count, sentiment (averaged over mentioned runs only — null when none), position, and the latest run's `createdAt` as `date`. Test confirms the 2 seeded prompts come back in recency order, with correct model sets and per-prompt citation counts.

**Result:** pass. Test `recentChats returns up to 6 most-recent prompts with model + citation aggregation` succeeds.

### §11.2-m — `competitors` projection

**What I verified:** Response carries `competitors: { name, domain }[]` projected from the listCompetitors result.

**Result:** pass. Verified via type signature plus the rankings/trend tests which iterate by competitor name.

### §13.1-a — Visibility uses current window only

**What I verified:** Seeded 4 runs in the current 7-day window (2 mentioned) plus 2 prior-window runs (both mentioned). Asserted `metrics.totalRuns` = 4 (prior excluded), `metrics.mentioned` = 2, `metrics.visibility` = 0.5. The route handles this by calling `runsBetween(allRuns, currentStart, nowMs + 1)` to split the over-fetched range.

**Result:** pass. Test `counts mentioned/totalRuns over current window only` succeeds.

### §13.1-b — Empty window returns 0, not NaN

**What I verified:** With an empty `allRuns` array, `metrics.visibility = 0`, `totalRuns = 0`, `mentioned = 0`. No division by zero leaks.

**Result:** pass. Test `returns visibility 0 for an empty window without crashing` succeeds.

### §13.1-c — No primary brand → 404

**What I verified:** Code review of `src/app/api/overview/route.ts` lines 337–343. When `getPrimaryBrand()` returns `null` the handler immediately returns `NextResponse.json({ error: 'No primary brand. Complete onboarding first.' }, { status: 404 })`. The body never leaks DB internals and the metrics/trend/sources pipeline is skipped. The client-side onboarding redirect (the §13.1 UI behavior in the QA plan) is the consumer's job — the API contract here is the 404.

**Result:** pass. No automated test for this path; the implementation is short, branchless, and self-evidently correct.

### §13.4-a — `avgSentiment` averages mentioned runs only

**What I verified:** Seeded one mentioned-positive (80), one mentioned-negative (30), and one unmentioned-positive (would-be 80, must be excluded). Expected: (80 + 30) / 2 = 55. Test asserts `metrics.avgSentiment` is exactly that.

**Result:** pass. Test `averages only mentioned runs (positive=80, neutral=55, negative=30)` succeeds.

### §13.5-a — `visibilityChange` percentage-point delta

**What I verified:** Seeded 4 current-window runs at 50% visibility (2/4 mentioned) and 4 prior-window runs at 25% visibility (1/4 mentioned). Expected `visibilityChange` = (0.5 − 0.25) × 100 = +25. Test asserts within tolerance.

**Result:** pass. Test `visibilityChange compares current window against prior same-length window` succeeds.

### §13.5-b — `visibilityChange` null when prior is empty

**What I verified:** Seeded a single current-window run with no prior-window data. `computeVisibilityChange` returns `null` rather than +50pp or 0pp. This locks in the §18.1 decision documented in the QA plan ("if prior is `0/0`, change should be `null`, not `+40pp`").

**Result:** pass. Test `visibilityChange is null when there are no prior-window runs` succeeds.

### §13.5-c — Trend uses max(days, 28)-day window, weekly Sunday-UTC buckets

**What I verified:** Seeded 4 runs spanning 22 days; with `days=7`, the trend window expands to max(7, 28) = 28 days, producing at least 2 weekly rows. Each row's `weekStart` matches `YYYY-MM-DD` and the brand column is numeric. The bucketing logic uses `getSundayUTC` plus `formatYMD` from `lib/metrics.ts`.

**Result:** pass. Test `trend uses weekly buckets spanning at least 4 weeks (max(days, 28))` succeeds.

### §13.5-d — Trend rows include a numeric column per competitor

**What I verified:** With two competitors (Beta, Gamma) and two runs each carrying one competitor mention, every emitted trend row contains a numeric `Beta` and `Gamma` column.

**Result:** pass. Test `trend rows include a numeric column per competitor` succeeds.

### §13.5-e — `competitiveRank` ordering

**What I verified:** Seeded a window where the brand is mentioned twice and competitors are mentioned ≤ 1 time each. `metrics.competitiveRank` returns 1, matching the §13.5 / §18.2 tie-breaker policy (brand wins).

**Result:** pass. Test `competitiveRank is 1 when brand beats all competitors` succeeds.

### §15.5 — Round-trip discipline (< 10 DB calls per request)

**What I verified:** Code review of the GET handler (`route.ts` lines 332–368) shows the request issues exactly **6 DB round-trips**: one `getPrimaryBrand` call, followed by a single `Promise.all` over `listCompetitors`, `listPrompts`, `getRuns`, `getCitations`, and `getLastRunTimestamp`. All five run in parallel. This is well under the §15.5 < 10 target. The over-fetch window for runs is `max(days * 2, 28)` so the prior-window comparison and the 28-day-minimum trend can be computed in-memory without additional queries.

**Result:** pass. No automated test, but the implementation is short and the round-trip count is directly visible in source.

### Security — SQL parameterization

**What I verified:** Read `src/lib/queries.ts` end-to-end. Every query template uses `$N` placeholders driven by an `args` array. The `days` integer is bound as a string parameter into `now() - ($n || ' days')::interval` (not concatenated). The `model` filter is added only when `isFilterableModel(...)` returns true and is bound as `$n`. No `${variable}` interpolation of user-supplied values into the SQL string anywhere in `buildGetRuns`, `buildGetCitations`, or any other builder used by this route. The Neon client (`lib/db.ts`) uses parameterized `sql.query(text, params)`.

**Result:** pass. Static code review.

---

## Notes & non-failures

- **No primary brand path** is verified by code review only. An integration test would need a Neon test branch and was not introduced; the implementation is short enough that this is acceptable for the chunk.
- The route over-fetches runs to `max(days * 2, 28)` days, which is what allows `composeOverview` to derive current, prior, and 28-day-minimum trend windows from a single SQL query rather than three. This is a deliberate trade-off that supports the §15.5 round-trip target.
- The full project test suite (281 tests across metrics, queries, classify, scraper, parser, db, smoke, plus the new route tests) was run as a regression check after the chunk's route landed; all 281 pass with the new route in place.

Overall: pass
