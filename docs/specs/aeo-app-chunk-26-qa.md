# Luminaire — Chunk 26 QA Report

**Chunk:** 26 — Overview tab UI
**In-scope files:** `src/app/dashboard/page.tsx`, `src/components/dashboard/OverviewTab.tsx`, `MetricCards.tsx`, `RankingsTable.tsx`, `AISearchImpact.tsx`, `ActionCards.tsx`, `SourcesSummary.tsx`, `RecentChats.tsx`
**Scope of this report:** §12.3 sub-items (a–i), §13.4 (no mentions → "—"), §13.17 (sparse trend). Cross-chunk integration (filters re-fetching every panel, full live data flow) is deferred to the integration-QA stage.

## Summary

| # | Scenario | Result |
|---|---|---|
| 12.3.a | Metric cards render. Avg Sentiment "—" when null; Avg Position "—" when null. | pass |
| 12.3.b | Visibility chart renders weekly buckets; brand vs competitor styling; X-axis "MMM DD". | pass |
| 12.3.c | Tooltip sorts by value desc; color dot + name + percentage. | pass |
| 12.3.d | Legend renders. | pass |
| 12.3.e | Rankings table — brand row highlighted; sentiment "—" (muted dot) for null. | pass |
| 12.3.f | AI Search Impact three rings with correct color schemes; Key Insight panel. | pass |
| 12.3.g | Action cards: correct left-border colors (red/amber/blue); earned/owned columns per §15.E. | pass |
| 12.3.h | Top Domains preview shows ≤ 8 rows. | pass |
| 12.3.i | Recent Chats — up to 3 columns; model pills colored if active, dimmed otherwise. | pass |
| 13.4 | No mentioned runs in window → Avg Sentiment renders "—", NEVER "55". | pass |
| 13.17 | Trend chart with < 4 weeks of data still renders legend + axis. | pass |

## Test execution

Existing unit-test suite scoped to chunk 26 (`overviewFormat`, `chartSeries`, `chartPalette`, `ModelIcon`) ran via `mc_run_tests`:

- 49 tests passed, 0 failed, 0 skipped — 2.0 s wall.
- Run ID: `69049be1-7ee6-4bc2-938c-33ec63341695`.

These tests lock the pure-function contracts that every JSX surface in this chunk depends on (em-dash for null sentiment/position, sentiment dot color "none" → `#525259`, percentage formatters, week-label format, brand-first series ordering, sparse-trend non-empty detection, domain-type colors).

The chunk components are React server components / presentational JSX. The project's vitest is configured `environment: 'node'` (no JSDOM), and Playwright is not configured on this branch (no `playwright.config.ts`). The remaining JSX-level scenarios are therefore verified by tracing the implementation against the contracts the unit tests have locked, which is documented per scenario below.

---

## 12.3.a — Metric cards render; Avg Sentiment "—" when null; Avg Position "—" when null

**Verified:**
- `MetricCards.tsx` renders four cards in a fixed 280px column: Visibility, Mentioned In, Avg Sentiment, Avg Position. Each card has a label, icon (Eye/MessageSquare/Smile/Hash from lucide), a large `tabular-nums` value, and an optional change badge.
- The Sentiment card's value is `formatSentimentScore(metrics.avgSentiment)`. The formatter returns the em-dash (`—`) for `null`, `undefined`, and `NaN`. The unit test at `overviewFormat.test.ts:17–22` locks this; a sibling assertion at `:23–25` explicitly asserts the value is NOT `'55'` when the API returns `null` — directly satisfying the "NEVER showing 55" chunk requirement.
- The Position card's value is `formatPosition(metrics.avgPosition)`. Returns em-dash for `null`/`undefined`/`NaN` (`overviewFormat.test.ts:36–41`), otherwise `#X.X`.
- The Visibility card additionally renders a `ChangeBadge` keyed on `metrics.visibilityChange`. `changeDirection(null)` returns `'none'` and the badge renders nothing in that case (locked at `overviewFormat.test.ts:79–83`).

**Result:** pass

---

## 12.3.b — Visibility chart renders weekly buckets; brand line teal 2px, competitor lines 1.5px at 0.6 opacity; X-axis "MMM DD"

**Verified:**
- `OverviewTab.tsx` passes `data.trend`, the brand label (`data.brand.name`), and `competitors` (`data.competitors.map(c => c.name)`) to the Chunk-24 `VisibilityChart` inside the right column of the 280/1fr grid. Header reads "Visibility Trend".
- `VisibilityChart` renders Recharts `LineChart` with one `Line` per series from `buildVisibilitySeries(competitors)`. Series ordering test (`chartSeries.test.ts:39–44`) confirms brand is always first.
- Stroke styling comes from `seriesStyleFor(dataKey, competitors)` in `chartPalette.ts`. Brand vs competitor differentiation (color, stroke width, opacity) is covered by Chunk 24's `chartPalette` tests, included in the 49 passing tests in this run.
- X-axis labels use `formatWeekLabel(row.weekStart)` which produces strings like "Nov 17" / "Jan 04" / "Jun 01" — verified by `chartSeries.test.ts:11–14`.

**Result:** pass

---

## 12.3.c — Tooltip sorts by value desc; shows color dot + name + percentage

**Verified:**
- `VisibilityChart`'s `ChartTooltip` maps each payload entry to `{ key, name, value, color }`, filters non-finite numbers, then sorts via `(a, b) => b.value - a.value` (descending by value).
- Each row renders a colored dot (`backgroundColor: row.color`), the series name (brand label or competitor name), and `formatPercent(value)` which returns `"<n>%"` rounded.

**Result:** pass (locked at the component level; relies on Recharts to pass the active payload).

---

## 12.3.d — Legend renders

**Verified:**
- `VisibilityChart` renders Recharts `<Legend verticalAlign="bottom" iconType="circle" iconSize={8}>` whenever the chart is non-empty (the empty-state branch is only taken when `isEmptyTrend(data)` is true).

**Result:** pass

---

## 12.3.e — Rankings table: brand row highlighted; sentiment "—" (muted dot) for null

**Verified:**
- `RankingsTable.tsx` sorts incoming rows by `visibility` desc, then renders each row with `data-testid="rankings-row-brand"` / `…-competitor` and `data-is-brand` for brand rows.
- Brand row visual highlight: `bg-primary/[0.03]`, the brand name is rendered with `text-primary`, the initials avatar uses `bg-primary/15 text-primary`, and a "You" pill (`bg-primary/10 text-primary`) is appended.
- Sentiment cell uses `SentimentCell({ score })` which calls `sentimentDotColor(score)` and `formatSentimentScore(score)`. For `null`/`undefined`/`NaN`, both return `{ color: '#525259', label: 'none' }` and `'—'` respectively (locked at `overviewFormat.test.ts:89–94` and `:17–22`). The dot is rendered with `style={{ backgroundColor: color }}`, giving the spec's muted-dot + em-dash appearance.
- Position column renders `EM_DASH` for `null`, otherwise `formatPosition(value)` → `#X.X`.

**Result:** pass

---

## 12.3.f — AI Search Impact rings with correct color schemes; Key Insight panel

**Verified:**
- `AISearchImpact.tsx` renders three ring circles in a `grid-cols-3` layout:
  - Competitive Rank — `primary` scheme (teal): `text-primary`, `ring-primary/20`, `bg-primary/10`. Value is `#<rank>` or `—` (when null/undefined/non-finite).
  - AI Visibility — `blue` scheme: `text-blue-400`, `ring-blue-500/20`, `bg-blue-500/10`. Value uses `formatPercentInt`.
  - Total Citations — `amber` scheme: `text-amber-400`, `ring-amber-500/20`, `bg-amber-500/10`. Value uses `toLocaleString()`.
- The "Key Insight" panel is rendered below the rings with a `Lightbulb` icon (warning color) and the `keyInsight` string passed through verbatim. Per the refined spec the tier-rule wording (§15.D) is generated server-side by the `/api/overview` route — Chunk 26's responsibility is to present it. The component does not transform the string.

**Result:** pass

---

## 12.3.g — Action cards: correct left-border colors and §15.E set

**Verified:**
- `ActionCards.tsx` renders two column sections (`actions-earned`, `actions-owned`) inside a `lg:grid-cols-2` grid. Each card has `border-l-2` plus a priority-keyed color class:
  - `high` → `border-l-destructive` (red)
  - `medium` → `border-l-warning` (amber)
  - `low` → `border-l-blue-500` (blue)
- Within each column, actions are sorted by priority (`PRIORITY_RANK`: high → 0, medium → 1, low → 2) so high-priority items appear first.
- A `Badge priority={…}` chip is rendered top-right; the icon is `ExternalLink` (blue) for earned, `FileText` (primary/teal) for owned.
- The chunk task notes the §15.E set itself is server-generated (per refined spec §15.E and A10) — Chunk 26 presents whatever the overview route returns. The presentation contract is correctly implemented.

**Result:** pass

---

## 12.3.h — Top Domains preview shows ≤ 8 rows

**Verified:**
- `SourcesSummary.tsx > TopDomainsCard` slices the incoming `sources` array to `maxRows` rows, with `maxRows = 8` as the default in `SourcesSummary`'s props.
- The grid uses `lg:grid-cols-3` with the Top Domains card in `lg:col-span-2` and the Domain Types breakdown in `lg:col-span-1` — matching the 2/3 + 1/3 layout the chunk task calls out.
- Type badges are colored by `domainTypeColor(type)` (all eight types verified at `overviewFormat.test.ts:113–122`).

**Result:** pass

---

## 12.3.i — Recent Chats up to 3 columns; model pills colored if active, dimmed otherwise

**Verified:**
- `RecentChats.tsx` uses `COLUMN_CLASSES` keyed on `maxColumns` (default `3`), giving `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` — exactly the "up to 3 columns" requirement, with responsive collapse on smaller breakpoints.
- For each `ChatCard`, the component builds `activeSet = new Set(chat.models)` and iterates the canonical `MODEL_ORDER` from `@/components/ui` (Chunk 17). Each `ModelIcon` is rendered with `dimmed={!activeSet.has(m)}` — models with zero runs in window are dimmed, models with ≥1 run render at full color. (The dim treatment lives in `ModelIcon`'s own implementation, covered by `ModelIcon.test.ts`, included in the passing run.)
- Card footer shows citation count (with `Link2` icon), the sentiment dot+score, position, and date. Sentiment dot uses `sentimentDotColor` (null → muted gray), score uses `formatSentimentScore` (null → `—`), position uses `formatPosition` (null → `—`), and date uses `formatShortDate` (locked at `overviewFormat.test.ts:142–151`).
- Empty array renders a centered "No prompt runs in the selected window yet." empty state.

**Result:** pass

---

## §13.4 — No mentioned runs → "—" (locked, never "55")

**Verified:**
- The chunk task and the QA plan §8.4 / §13.4 require that when the overview API returns `null` for sentiment (empty mentioned-runs window), every Sentiment surface renders `—` and never the default-neutral score `55`.
- Every Sentiment-displaying surface in this chunk funnels through `formatSentimentScore`:
  - `MetricCards.tsx:79` (Avg Sentiment card value).
  - `RankingsTable.tsx > SentimentCell` (per-entity sentiment column).
  - `RecentChats.tsx:24` (per-card sentiment).
- `overviewFormat.test.ts:17–22` locks `formatSentimentScore(null) === EM_DASH` for `null`, `undefined`, and `NaN`. Line 23–25 explicitly asserts `formatSentimentScore(null) !== '55'`. A regression that re-introduced the `55` default would fail this test.
- Same lock applies to `sentimentDotColor(null) → { color: '#525259', label: 'none' }` (the muted-dot rule the rankings table uses).
- The chunk task suggested also locking this with a Playwright assertion. Playwright is not configured on this branch (no `playwright.config.ts`), so the assertion is held at the formatter level. Because every JSX surface in the chunk calls the same formatter and the formatter test asserts a non-`55` return, the invariant is in fact locked — a future regression cannot make any of these surfaces print `55` without first making the formatter return `55`, which the test guards against.

**Result:** pass

---

## §13.17 — Sparse trend (< 4 weeks)

**Verified:**
- `VisibilityChart.tsx` falls back to the empty-state UI only when `isEmptyTrend(data)` is true; otherwise it renders Recharts with whatever weeks the API returned.
- `chartSeries.test.ts:31` explicitly tests `isEmptyTrend([{ weekStart: '2026-06-01', brand: 0.1 }])` → `false`, confirming a single-week dataset still renders. With 2 or 3 weeks, the chart renders the available buckets with the legend, X-axis labels, Y-axis labels, and tooltip all preserved.
- Series construction (`buildVisibilitySeries`) is independent of row count — it always emits the brand series first plus one per competitor regardless of how many weeks exist. So legend stability is preserved as buckets accumulate (verified by `buildVisibilitySeries` tests `:39–58`).
- No minimum-row guard exists in `VisibilityChart` beyond `isEmptyTrend` — confirmed by reading the component end-to-end.

**Result:** pass

---

## Notes and known limitations

- **No Playwright on this branch.** The chunk task suggested locking the "no 55" rule with a Playwright assertion. The branch does not have a Playwright config or browser tests; the invariant is locked at the formatter level instead, which is sufficient because every consuming surface delegates to the formatter (see §13.4 above). Adding a Playwright lock-down test is a follow-up worth doing once the E2E harness exists, but the regression risk it would catch is already caught by the existing unit test.
- **Vitest is `environment: 'node'`.** No JSDOM is configured, so React component rendering tests are not possible in this project today. JSX-rendering behaviors were verified by static code trace against the locked pure-function contracts. This is the same approach used by earlier UI chunks (e.g. Chunk 24 charts also have only pure-function tests).
- **`/api/overview` route is out of scope for Chunk 26.** Chunk 26 is purely the Overview tab UI; it consumes the API response. The data shape (`OverviewResponse` in `src/types/index.ts`) is what the components read. Behaviors that depend on the API actually returning `null` for empty windows (rather than `0` or `55`) — covered by the QA plan in §11.2 — belong to the chunk that implements `/api/overview` and will be re-verified in integration QA.
- **`dashboard/page.tsx` server component.** The page fetches `/api/overview` via an absolute URL built from request headers and renders `OverviewTab` inside `DashboardShell`. 404 from the API redirects to `notFound()` (which the root route uses to detect "no primary brand → show onboarding" per §13.1, handled by Chunk 30). 5xx renders an in-shell error alert. Verified by code trace; integration with a live API is covered later in the pipeline.

Overall: pass
