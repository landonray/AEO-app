# Chunk 28 QA — Sources tab UI

**Scope:** Sources tab shell (`SourcesTab`), table (`SourcesTable`), domain-type
breakdown panel (`DomainTypesPanel`), and the route page
(`app/dashboard/sources/page.tsx`).

This QA only covers the chunk-28 scenarios — §12.6 (Sources tab UI) and §13.18
(empty state when a filtered model has no citations). Cross-chunk and full-stack
behavior (chart data wiring, `/api/sources` payload correctness, route-level
filter persistence across tabs) is the integration QA stage's job.

## Summary

| # | Scenario | Result |
|---|---|---|
| 12.6.a | Domains ↔ URLs toggle renders; pill-style; active item differentiated | pass |
| 12.6.b | Area chart shows top 5 domains over time (weekly bucketing) | pass |
| 12.6.c | Table columns: #, Domain/URL, Type, Retrieved, Citation Rate; Type badges color-coded | pass |
| 12.6.d | Empty state copy on zero-citation windows | pass |
| 13.18 | Sources tab filtered to a model with no citations — empty state, not a broken chart | pass |
| Unit tests (`sourcesTab.test.ts`) | `domainTypeColor` palette + empty-message copy locked in | pass |

## Test execution

Ran the chunk's vitest suite via `mc_run_tests`:

- **Patterns:** `src/components/dashboard/__tests__/sourcesTab.test.ts`
- **Framework:** vitest
- **Result:** 3 passed, 0 failed, 0 skipped (847 ms)
- **Run id:** `fda22f8e-243b-4f15-a652-36482689e079`

The locked-down assertions are exactly what this chunk needs to keep stable:
the §16 color for every `DomainType` is what `SourcesTable` renders the badges
in, and `SOURCES_EMPTY_MESSAGE` is the copy QA scenario 12.6.d demands. Anyone
editing those values trips a red test.

No additional tests were authored — the rest of the verification is static
review of a presentational component tree against the spec, which is the
appropriate level for chunk-28 ("UI") scope.

---

## Scenario details

### 12.6.a — Domains ↔ URLs toggle renders; pill-style; active item differentiated

**What I verified:** Read `SourcesTab.tsx` and the `Toggle` primitive it
imports from `@/components/ui`.

- `SourcesTab` defines `VIEW_OPTIONS = [{ value: 'domains', label: 'Domains' },
  { value: 'urls', label: 'URLs' }]` and renders `<Toggle ... value={view}
  onChange={setView} aria-label="Source view" />` in the header row.
- The `Toggle` primitive (Chunk 23) renders pill-style buttons in a
  `rounded-md bg-white/[0.04] p-1` group, applies `data-active` and
  `aria-pressed` to the selected option, and visually differentiates the
  active item with `bg-white/[0.08] text-foreground` against the inactive
  `text-muted-foreground` style.
- View state is read from / written to the URL search params; `setView`
  deletes `?view=` when switching back to the default "Domains" so the URL
  stays clean, and uses `router.replace(..., { scroll: false })` to avoid
  scroll jumps.

**Result:** pass.

### 12.6.b — Area chart shows top 5 domains over time (weekly bucketing)

**What I verified:** `SourcesTab` renders the Chunk-24 `SourceChart` (imported
from `@/components/charts/SourceChart`) inside a `rounded-lg border
border-border/40 bg-card/60 p-5` card titled "Source Retrieval", passing
`data={trend}` (from the `/api/sources` response) and `height={240}`.

`SourceChart` itself is the Chunk-24 component the spec assigns to this slot
— it derives the top-N domains internally via `topSourceKeys` and formats the
week labels via `formatWeekLabel`, both already covered by Chunk 24's QA.
This chunk's responsibility is mounting the chart with the right inputs in
the right card, which the file does.

**Result:** pass. (Chart data correctness, top-5 cap, and weekly bucketing
semantics belong to Chunk 24's QA and to the integration QA against the
real `/api/sources` payload.)

### 12.6.c — Table columns and color-coded Type badges

**What I verified:** Read `SourcesTable.tsx` and `DomainTypesPanel.tsx`.

- `SourcesTable` renders a `<table>` with five columns in the documented
  order: `#`, the view-dependent header (`Domain` when `view === 'domains'`,
  `URL` when `view === 'urls'`), `Type`, `Retrieved`, `Citation Rate`.
- The row number is the 1-based index (`idx + 1`), tabular-nums, muted.
- The Domain/URL label is truncated with a `title` tooltip showing the full
  string; URL view uses `row.url ?? row.domain` so URL-keyed rows fall back
  safely.
- The Type column is a pill badge: `inline-flex items-center gap-1.5
  rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider`,
  colored via `domainTypeColor(row.type)` from `DomainTypesPanel`. The badge
  uses the type's color for the dot and text and a 12% alpha tint
  (`${color}1f`) for the background. `data-testid="type-badge"` and
  `data-type={row.type}` make this targetable by e2e and the integration QA.
- `domainTypeColor` returns the §16 palette: `You #2eb88a`, `Competitor
  #e5484d`, `UGC #3b82f6`, `Editorial #6366f1`, `Reference #8b5cf6`,
  `Institutional #14b8a6`, `Corporate #f5a623`, `Other #525259`. The unit
  test locks all eight values plus a fallback to "Other" for unknown inputs.
- The Retrieved column is a progress bar (`role="progressbar"`,
  `aria-valuemin/max/now`) with the percentage label beside it.
- The Citation Rate column is right-aligned, tabular-nums, formatted by
  `formatPercent`.

The 2/3 + 1/3 grid is implemented with `grid grid-cols-1 gap-4 lg:grid-cols-3`
and `lg:col-span-2` on the table column — `DomainTypesPanel` occupies the
right 1/3 with a matching card and the same §16 color palette.

**Result:** pass.

### 12.6.d — Empty state copy

**What I verified:** `SourcesTable` exports the constant
`SOURCES_EMPTY_MESSAGE = "No sources retrieved for this model in the selected
window."` and returns the empty-state block (a dashed-border `role="status"`
div with `data-testid="sources-table-empty"`) whenever `rows.length === 0`,
using that constant as the default `emptyMessage`. `SourcesTab` passes
`SOURCES_EMPTY_MESSAGE` explicitly so the copy is unambiguously the spec
string. The vitest assertion in `sourcesTab.test.ts` locks the exact string
character-for-character against §15 / QA 12.6.d.

**Result:** pass.

### 13.18 — Sources tab filtered to a model with no citations

**What I verified:** Traced the data path for the "filter to a model with no
citations" scenario through `SourcesTab`.

- The filter hook (`useFilters`) feeds the `model` query param into the
  `/api/sources` fetch. When the API returns empty arrays (the documented
  behavior on a zero-citation window), `data?.sources ?? []` is empty and
  `data?.trend ?? []` is empty.
- `SourcesTable` renders the §15 empty-state block (verified in 12.6.d) —
  not a broken or blank table.
- `SourceChart` handles its own empty-data case internally (Chunk 24); it
  does not crash on an empty `data` array — the chart card stays rendered
  with the section heading, so the page layout is preserved rather than
  collapsing.
- The `DomainTypesPanel` shows its own muted empty message ("No domain types
  to show.") rather than a broken bar list.
- The toggle, header, and error banner regions remain in place, so the
  filter is recoverable (the user can switch the model dropdown back without
  reloading).

**Result:** pass. The empty-state experience matches the spec — neither the
table nor the chart blow up.

---

## Notes and non-findings

- `SourcesTable` is exported from this chunk and consumed by Chunk 26's
  `SourcesSummary` (Overview "Top Domains" preview) via the optional
  `maxRows` prop. That prop is `Math.max(0, Math.min(100, ...))`-guarded
  for the progress bar width and respects `maxRows > 0` only — safe.
- All numeric formatting goes through `cn` / `formatPercent` from
  `@/lib/utils`; no ad-hoc `toFixed` or `Math.round` drift in the
  components.
- No `console.log` / `console.error` left behind. No `dangerouslySetInnerHTML`.
- No client-side reads of any environment-variable secret in the new
  components (`SourcesTab.tsx` is `'use client'`; the page wrapper is server).

Overall: pass
