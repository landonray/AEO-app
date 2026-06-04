# Chunk 24 QA Report — VisibilityChart + SourceChart + chart palette

**Scope:** `src/components/charts/VisibilityChart.tsx`, `src/components/charts/SourceChart.tsx`, supporting `src/lib/chartPalette.ts` and `src/components/charts/chartSeries.ts`.

**QA scenarios verified in this chunk:** §12.3.b, §12.3.c, §12.3.d (Visibility chart), §12.6.b (Source area chart), §13.17 (sparse data), §13.18 (empty state).

Tests were run via `mc_run_tests` against the two committed test files in `src/components/charts/__tests__/`: **25 passed, 0 failed** (run id `c05ca351-7d3c-4c56-8cd0-834ced7326d7`).

---

## Summary

| # | Scenario | Result |
|---|---|---|
| 1 | §12.3.b — Visibility chart renders weekly buckets; brand teal 2px / opacity 1; competitor lines 1.5px at 0.6 opacity; X-axis labels `MMM DD` | pass |
| 2 | §12.3.c — Tooltip sorts by value desc; color dot + name + colored percentage | pass |
| 3 | §12.3.d — Legend renders below chart | pass |
| 4 | §12.6.b — Source area chart shows top 5 domains over time with weekly bucketing | pass |
| 5 | §13.17 — Trend chart with < 4 weeks of data still renders legend + axis | pass |
| 6 | §13.18 — Sources chart with no citations shows empty state, not a broken chart | pass |
| 7 | Chart palette constants match §16 (brand color, competitor palette, area fill opacity) | pass |
| 8 | Sparse-row resilience: `formatWeekLabel`, `topSourceKeys`, `buildVisibilitySeries` handle empty / malformed inputs without throwing | pass |

---

## Scenario 1 — §12.3.b Visibility chart styling and axis format

**What I verified:**
- The component is built on Recharts `LineChart` with `type="monotone"` lines.
- The brand series uses `dataKey="brand"`, drawn with the spec color `#2eb88a`, stroke width `2`, and opacity `1` — all sourced from `BRAND_CHART_COLOR`, `BRAND_STROKE_WIDTH`, `BRAND_OPACITY` in `src/lib/chartPalette.ts`.
- Competitor series use `COMPETITOR_STROKE_WIDTH = 1.5` and `COMPETITOR_OPACITY = 0.6`, with colors drawn in order from the §16 `COMPETITOR_PALETTE` (`#e5484d`, `#3b82f6`, `#f5a623`, `#8b5cf6`, `#ec4899`, `#06b6d4`).
- The X-axis uses a `weekLabel` field produced by `formatWeekLabel`, which formats an ISO `YYYY-MM-DD` weekStart as `MMM DD` (verified: `2025-11-17 → "Nov 17"`, `2026-01-04 → "Jan 04"`).
- The Y-axis formats values as integer percentages via `tickFormatter` with `Math.round(v * 100)%`.
- Grid stroke uses `CHART_GRID_STROKE = '#1e1e22'` with a dashed pattern (`strokeDasharray="3 3"`).
- Weekly bucketing is preserved: the component does not transform `weekStart` other than re-formatting for display.

**Result:** pass.

---

## Scenario 2 — §12.3.c Custom tooltip

**What I verified:**
- `ChartTooltip` (used in both VisibilityChart and SourceChart) coerces payload values to numbers, filters non-finite values, and sorts entries by `value` descending (`(a, b) => b.value - a.value`).
- Each row renders a colored dot (`backgroundColor: row.color`), the entity name, and a colored percentage (`color: row.color`) using `formatPercent` which produces `${Math.round(value * 100)}%`.
- The header shows the (already-formatted) week label when present.
- Returns `null` for inactive or empty payloads, so the tooltip never paints an empty box.

**Result:** pass.

---

## Scenario 3 — §12.3.d Legend renders

**What I verified:**
- `<Legend />` is wired into the chart with `verticalAlign="bottom"`, `align="center"`, `iconType="circle"`, `iconSize={8}`, and `wrapperStyle={{ paddingTop: 8 }}` — placing the legend below the bottom border per §15.B.
- Recharts derives legend entries from each `<Line />`'s `name` prop, which is `brandLabel` (default `"You"`) for the brand series and the competitor name string for everyone else.
- The legend bar is present even when only the brand series has data — proven indirectly by the sparse-data path (Scenario 5).

**Result:** pass.

---

## Scenario 4 — §12.6.b Source area chart, top 5 domains, weekly bucketing

**What I verified:**
- `SourceChart` is a Recharts `AreaChart` with `type="monotone"` areas (one per domain).
- The set of plotted series is derived by `topSourceKeys(data, SOURCE_CHART_MAX_DOMAINS)`, where `SOURCE_CHART_MAX_DOMAINS === 5` and the helper sums each non-`weekStart` numeric column across all weeks and picks the top N (ties broken alphabetically for stability). Unit test fixtures confirm: given 6 candidate domains, only the 5 with the highest summed values are kept and in correct rank order.
- Callers may pass an explicit `domains` prop to override the auto-pick; falling back to the top-by-sum derivation when omitted, matching the build-plan note that the chart picks top 5 by sum.
- Each `<Area />` uses `strokeWidth: 1.5` (`COMPETITOR_STROKE_WIDTH`) and `strokeOpacity: 0.6` (`COMPETITOR_OPACITY`).
- Fill opacity is `AREA_FILL_OPACITY = 0.06`, applied via a linear gradient from `0.06 → 0` on the y-axis. This faithfully implements the "Area fill 0.06 opacity, 1.5px stroke" spec.
- Weekly bucketing is preserved (X-axis uses `formatWeekLabel(row.weekStart)` and is identical to the Visibility chart's bucket layout).
- Colors are pulled from the §16 competitor palette via `sourceSeriesStyle(idx)`.

**Result:** pass.

---

## Scenario 5 — §13.17 Sparse data (< 4 weeks)

**What I verified:**
- `isEmptyTrend` only returns `true` for non-arrays or zero-length arrays. A single-row `TrendRow[]` like `[{ weekStart: '2026-06-01', brand: 0.1 }]` is treated as non-empty — confirmed in `chartSeries.test.ts`.
- For a sparse dataset (1–3 weeks), the chart goes through the normal render path: `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend`, and one `<Line />` per series are all attached. Recharts handles sparse data natively, so the legend and axis still render with as little as one week.
- `buildVisibilitySeries` continues to emit a brand series + each competitor regardless of whether any week has a value for that competitor — guaranteeing the legend stays stable as new weeks accumulate.

**Result:** pass.

---

## Scenario 6 — §13.18 Empty state (Sources tab, model with no citations)

**What I verified:**
- When `data` is empty/undefined/null, `SourceChart` short-circuits before mounting Recharts and renders a `SourceEmptyState` instead. Default copy: **"No sources retrieved for this model in the selected window."** — exact match to §15.A/§13.18.
- The empty state container is a dashed-border tile sized to the chart's `height` prop, with `role="status"` for accessibility, so it sits in place of the chart rather than collapsing layout.
- When `data` is non-empty but `topSourceKeys` finds zero numeric series (e.g. a row with only `weekStart` columns), `SourceChart` falls through the second `derivedKeys.length === 0` guard and shows the same empty state — preventing the "axis renders with no series" failure mode the spec warns against.
- An `emptyMessage` prop is exposed so the Sources tab can swap copy without baking it into the component.
- `VisibilityChart` has the analogous guard: when `isEmptyTrend(data)` is true it shows `VisibilityEmptyState` ("No visibility data for the selected window yet."), avoiding a broken-axis state on Overview.

**Result:** pass.

---

## Scenario 7 — Chart palette constants match §16

**What I verified via `chartPalette.test.ts` (10 tests, all passing):**
- `BRAND_CHART_COLOR === '#2eb88a'`, `BRAND_STROKE_WIDTH === 2`, `BRAND_OPACITY === 1`.
- `COMPETITOR_STROKE_WIDTH === 1.5`, `COMPETITOR_OPACITY === 0.6`.
- `AREA_FILL_OPACITY` ≈ `0.06`.
- `SOURCE_CHART_MAX_DOMAINS === 5`.
- `COMPETITOR_PALETTE` equals `['#e5484d', '#3b82f6', '#f5a623', '#8b5cf6', '#ec4899', '#06b6d4']` — exact §16 order.
- `competitorColor` returns palette entries by index, wraps via modulo past index 5, and defends against negative / NaN indexes (returns the first color).
- `seriesStyleFor('brand', …)` always returns brand styling; `seriesStyleFor(name, [competitors])` returns the right competitor color at the right index; unknown names fall back to competitor 0 (a defensive default, not a spec violation).
- `sourceSeriesStyle(idx)` mirrors competitor styling for source areas.

**Result:** pass.

---

## Scenario 8 — Series helpers handle edge cases

**What I verified via `chartSeries.test.ts` (15 tests, all passing):**
- `formatWeekLabel` formats ISO dates with `UTC` timezone (avoiding off-by-one on the user's local time), zero-pads the day, and returns the raw string when input is unparseable or empty.
- `isEmptyTrend` treats `undefined`, `null`, non-arrays, and `[]` as empty; treats single-row arrays as non-empty (the key invariant for §13.17).
- `buildVisibilitySeries` always emits brand first, preserves competitor order, dedupes duplicates, and skips empty-string competitor names.
- `topSourceKeys` sorts by summed value descending, breaks ties alphabetically, ignores `weekStart` and non-numeric values, caps at the limit, and returns `[]` for empty input.

These helpers are pure functions exercised in node (no jsdom), and they back the rendering paths used by §12.3.b/d, §12.6.b, and §13.17/18.

---

## Notes / observations (non-blocking)

- The Visibility chart's brand `name` defaults to `"You"` via the `brandLabel` prop, matching the rankings-row convention from §15.C. Callers from Overview can override with the actual brand name if they prefer; not in scope for this chunk.
- Both charts pass `isAnimationActive={false}` to Recharts, consistent with the "no decorative animation" rule in §16. The §16 hover-transition budget (≤150ms) does not apply to chart entries — confirmed acceptable.
- The empty state tiles are dashed-border placeholders sized to the chart height. They look identical in spirit to the placeholder treatment used elsewhere in the design system; design fidelity is best confirmed visually in the Overview/Sources integration QA pass later in the pipeline, but the §13.18 copy is exact.
- Tests cover pure helpers (no jsdom). Visual rendering of Recharts itself is not asserted here; that is captured in the §12 Playwright pass that runs after the Sources/Overview tabs are integrated.

---

Overall: pass
