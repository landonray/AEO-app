# Chunk 25 QA Report — Dashboard shell (Sidebar + Header + filter state)

**Pipeline:** AEO app
**Chunk:** 25 — Dashboard shell (Sidebar + Header + filter state)
**Iteration:** 2 (post fix-cycle)

## Summary

| # | Scenario | Result |
|---|---|---|
| §12.1.a | Sidebar pinned, 200px wide, background `#0d0d10` | pass |
| §12.1.b | Nav: Overview / Prompts / Sources; active state teal icon + lighter row | pass |
| §12.1.c | "Run All Prompts" — POST, spinner, refresh, cost toast | pass |
| §12.1.d | Header brand name + pulsing teal dot animates | pass |
| §12.1.e | Date/model dropdowns persist in URL search params (back/forward) | pass |
| §12.1.f | Toggling model dims non-selected pills to `opacity-30` | pass |
| §12.2 | Filters update every panel — useFilters mechanism in place | pass |
| §13.15 | Double-click "Run All Prompts" — second click ignored | pass |

**Automated tests:** existing `useFilters` unit tests pass — 14/14 green. Full project test suite re-run for regression check: 406 passed, 0 failed.

---

## Scenarios

### §12.1.a — Sidebar pinned, 200px wide, background `#0d0d10`

**What was verified:** the `Sidebar` aside element is positioned with `fixed inset-y-0 left-0`, sized at `w-[200px]`, has a border on the right (`border-r border-border/40`), and renders the exact hex `#0d0d10` inline via the `style` prop (not a Tailwind token, so the spec's exact color is locked in).

**Result:** pass

---

### §12.1.b — Nav items and active state

**What was verified:** three nav items rendered in the documented order — Overview (LayoutDashboard icon, `/dashboard`), Prompts (MessageSquareText icon, `/dashboard/prompts`), Sources (Globe icon, `/dashboard/sources`). Active state is derived from `usePathname()`; Overview also matches `/` so the root URL highlights Overview before the per-tab routes ship.

When active, the row gets `bg-white/[0.06] text-foreground` (the lighter background per spec §15) and the icon gets `text-primary` (teal). When inactive, the row uses `text-muted-foreground hover:bg-white/[0.03]`. `aria-current="page"` is also set on the active link, which is good for accessibility and downstream Playwright selectors.

**Result:** pass

---

### §12.1.c — "Run All Prompts" button + POST + spinner + refresh + toast

**What was verified:**
- The button sits in the bottom slot of the sidebar (after the nav `flex-1` block), is full-width, and uses the `Button` primary variant with a Play left-icon when idle.
- Click handler `handleRunAll` POSTs to `/api/prompts/run` with an empty body and `Content-Type: application/json` (matches §15 spec — "no body").
- While the fetch is in flight, the button's `loading` prop is `true`, which (per `Button.tsx`) renders a `Spinner` in place of the left icon, swaps the label to "Running…", and disables the button (`disabled` attribute set).
- On a successful response, the toast appears with the message `Batch complete — {totalRuns} runs · {formatCost(runTotalCost)}` (cost formatted to 4 decimals, defensive against null/non-finite). On error, an error toast renders with the API error message or "Run failed".
- On completion, `onBatchComplete?.()` fires; `DashboardShell` wires that to `router.refresh()` so all panels re-render with fresh server data.
- Toast auto-dismisses after 5 seconds via an effect cleanup.

**Result:** pass

---

### §12.1.d — Header brand name + pulsing teal dot

**What was verified:** the leftmost element of the header is a 2x2 dot composed of two stacked spans — an absolutely-positioned `animate-ping` layer at 60% opacity and a solid `bg-primary` (teal) dot on top. This is the standard Tailwind ping pattern and produces the pulsing animation the spec calls for. The brand name follows in `text-[13px] font-semibold text-foreground`.

**Result:** pass

---

### §12.1.e — Dropdowns persist in URL search params (back/forward)

**What was verified:** `useFilters` is the single source of truth.
- `parseFiltersFromParams` reads `days` and `model` off `useSearchParams()` and validates each against the allowed set (returning the default for invalid/missing values).
- Setters call `router.replace(pathname + buildFilterQuery(...), { scroll: false })`, which updates the browser URL without a scroll jump or a full nav. Because `router.replace` mutates history, browser back/forward will traverse those URL states; `useSearchParams` re-reads on each navigation and the dropdowns update accordingly.
- `buildFilterQuery` deliberately omits a param when it equals its default, which keeps URLs clean (`/dashboard` vs `/dashboard?days=7&model=all`).
- The Header binds both dropdowns to `useFilters` (`setDays(Number(v))` for the day dropdown, `setModel(v)` for model), so user changes flow through this same path.

The pure logic is covered by 14 passing unit tests: `parseDays`, `parseModel`, `parseFiltersFromParams`, `buildFilterQuery` (including a `buildFilterQuery → parseFiltersFromParams` round-trip).

**Result:** pass

---

### §12.1.f — Toggling model dims non-selected pills to `opacity-30`

**What was verified:** the header renders five `ModelStatusPill`s in the canonical `MODEL_ORDER` (openai, claude, gemini, perplexity, google_aio). The `dimmed` prop is `model !== 'all' && model !== m` — so when the filter is `all`, no pills are dimmed; when a specific model is selected, every pill except the selected one gets `opacity-30`. Each pill renders the model's two/three-letter label in its brand color with a 12% color-tinted background, satisfying §15's pill styling. `data-testid="model-pill-<id>"` and `data-dimmed` attributes are present for future Playwright assertions.

**Result:** pass

---

### §12.2 — Date and model filters update every panel

**What was verified:** this scenario asks that changing a filter cascades to every tab's data. At chunk 25's scope (shell only — no per-tab pages), I verified the *mechanism*:
- `useFilters` is the documented API every per-tab consumer will call (`const { days, model } = useFilters()`).
- Filter state lives in URL search params, which is the spec's recommended "URL search params or single client-side store" option.
- Because every per-tab page calling `useFilters()` will read from `useSearchParams()`, a Header-driven URL change re-renders all subscribers in the App Router — no manual subscription wiring is needed.
- `useFilters` exposes `days`, `model`, `setDays`, `setModel`, and a general `setFilters` for batched updates.

The full end-to-end "metric cards / charts / tables all re-fetch when the dropdown changes" check belongs to the integration QA stage (after chunks 26+ ship the per-tab pages). At this chunk's altitude, the mechanism is in place and correctly typed.

**Result:** pass

---

### §13.15 — Double-click "Run All Prompts" ignored

**What was verified:** belt-and-suspenders protection:
1. `handleRunAll` opens with `if (running) return;`, so a re-entrant invocation while a request is still in flight short-circuits immediately.
2. The `Button` component sets `disabled` when `loading` is true, so the second click never fires an event in normal DOM semantics anyway.

A user mashing the button twice in the same tick can't trigger two POSTs.

**Result:** pass

---

## Notes / non-blocking observations

- `Header` renders the dropdowns and pills only; the spec also calls for "Last updated <relative>" copy on the right, which is present (`relativeTime(lastUpdated)`), gated by an explicit `lastUpdatedLabel` override for deterministic tests.
- `DashboardShell` reserves `ml-[200px]` for the main column, matching the fixed sidebar width.
- No external imports of the new modules exist outside `src/components/dashboard/`, which is expected — the per-tab pages that will mount the shell ship in chunks 26+.
- The full vitest suite was re-run after this chunk's commits: 406 passed, 0 failed. No regression introduced by chunk 25.

---

Overall: pass
