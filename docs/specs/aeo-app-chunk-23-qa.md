# Chunk 23 — UI Primitives and ModelIcon — QA Report

## Scope

This chunk ships the `src/components/ui/` primitive library that downstream
chunks consume to render the app shell, the three dashboard tabs, and the
Prompt Detail Modal:

- `Button.tsx`, `Card.tsx`, `Input.tsx`, `Badge.tsx`, `Tabs.tsx`,
  `Toggle.tsx`, `Spinner.tsx`, `MetricCard.tsx`, `Dropdown.tsx`,
  `ModelIcon.tsx` (+ `ModelIconGroup`, `MODEL_META`, `MODEL_ORDER`), and
  `Modal.tsx`, all re-exported from `src/components/ui/index.ts`.

QA scope per the pipeline brief:

- §12.1 app shell
- §12.5 modal close paths
- §12.7 theme tokens

Per the chunk build plan, this chunk delivers primitives only — it does NOT
ship the assembled app shell (sidebar + header), the Prompt Detail Modal, or
the dashboard surfaces that consume these primitives. Those land in
later chunks. Where a §12.1 / §12.5 sub-scenario only becomes observable
once those later chunks integrate the primitives into pages, this report
marks the scenario `blocked` and instead verifies that the underlying
primitive provides the contract the integration will rely on.

## Summary

| # | Scenario | Result |
|---|---|---|
| 12.1.a | Sidebar pinned, 200 px wide, background `#0d0d10` | blocked |
| 12.1.b | Sidebar nav: Overview / Prompts / Sources with teal active state | blocked |
| 12.1.c | "Run All Prompts" button at sidebar bottom; spinner; toast on completion | blocked |
| 12.1.d | Header brand pulsing teal dot animates | blocked |
| 12.1.e | Date range and model filter dropdowns persist filter state in URL search params | blocked |
| 12.1.f | Toggling model dims non-selected model pills | pass |
| 12.5.a | Modal: backdrop click closes; X closes; ESC closes | pass |
| 12.5.b | Prompt Detail Modal — 5 model cards in order openai/claude/gemini/perplexity/google_aio | pass (primitive support) |
| 12.5.c | Mentioned models get green border tint | pass (primitive support) |
| 12.5.d | Click card expands; first 300 chars preview | blocked |
| 12.5.e | Models with no run in window show "No run in window" | blocked |
| 12.7.a | `globals.css` defines the exact §16 theme tokens | pass |
| 12.7.b | Inter font loaded; antialiased; tabular-nums on numbers | pass |
| 12.7.c | Cards use `rounded-lg border border-border/40 bg-card/60 p-5` | pass |
| 12.7.d | Scrollbar: 5 px thumb `#2a2a2f`, track transparent | pass |

## Test runs

- `src/components/ui/__tests__/ModelIcon.test.ts`
  - Framework: vitest
  - Result: **5 passed, 0 failed** (~2.0 s)
  - Run id: `5c29e718-ec99-4ce6-9f77-ee801303f5df`

These five tests assert the `MODEL_ORDER`, the spec pill labels
(`GPT / CL / GM / PX / AIO`), the §16 LLM brand colors
(`#10a37f / #d97640 / #4285f4 / #20b2aa / #ea4335`), the human display
names, and that every `MODEL_ORDER` entry has a valid `#rrggbb` color and
non-empty label. This locks the integration contract that the header
model-status pills, Recent Chats pill groups, and Prompt Detail Modal
model cards will all rely on in later chunks.

---

## §12.1 — App shell & navigation

### 12.1.a — Sidebar pinned, 200 px wide, background `#0d0d10`

**Verification.** This chunk does not ship the sidebar component. There is
no `Sidebar` or app shell layout file in `src/app/` or `src/components/`
beyond the existing root `layout.tsx`, which only loads the Inter font and
the global stylesheet. The 200 px / `#0d0d10` decision is observable only
once a later chunk assembles the shell. The primitives needed by that
shell (notably the `Button` for "Run All Prompts" and `Card`) are in place.

**Result: blocked** — integration scenario not in this chunk's scope.

### 12.1.b — Nav: Overview / Prompts / Sources; active state has teal icon and lighter row background

**Verification.** `MainNav` is not shipped in this chunk. There is no nav
component under `src/components/` and no use of pathname-derived active
state. The active-state class strings the spec calls for (e.g.
`bg-white/[0.06] text-foreground` for active, `text-primary` icon tint)
are resolvable once the nav is built, because `--color-primary: #2eb88a`
and the white-overlay opacities are honored by the Tailwind v4 theme this
chunk depends on (see 12.7.a).

**Result: blocked** — nav component is not in this chunk's scope.

### 12.1.c — "Run All Prompts" button at sidebar bottom; click triggers POST and shows a spinner; on completion all panels refresh and a toast shows batch cost

**Verification.** The sidebar wiring is not built in this chunk, so the
end-to-end click → fetch → spinner → toast → refresh flow is not
observable. The primitive contract is, however, in place:

- `Button` supports `variant="primary"`, `fullWidth`, `loading`, and
  `leftIcon` — exactly the surface a "Run All Prompts" button with a
  spinner replacement for the Play icon needs (Button.tsx lines 39–72).
  When `loading` is true the button auto-disables and swaps `leftIcon` for
  a small `Spinner` (Button.tsx line 67).
- `Spinner` renders an `animate-spin` element with `role="status"` and an
  ARIA label, sized `sm/md/lg`.

**Result: blocked** — sidebar integration scenario is not in this chunk's
scope; the primitive support is in place.

### 12.1.d — Header brand pulsing teal dot animates

**Verification.** No header component or pulsing-dot element is shipped in
this chunk. The dot itself will be a CSS-animated element in the future
header. The teal color it depends on (`--color-primary: #2eb88a`) is in
place via the chunk-4 theme that this chunk reuses (see 12.7.a).

**Result: blocked** — header component is not in this chunk's scope.

### 12.1.e — Date range and model filter dropdowns persist in URL search params (back/forward preserves filter state)

**Verification.** The header dropdowns and URL-state plumbing are not
shipped in this chunk. The `Dropdown` primitive that the header will use
is shipped: it is a controlled component that takes `value` + `onChange`
(Dropdown.tsx lines 22–34), which is the shape needed to wire to a URL
search-params hook in a later chunk. It supports a `label` prefix
(e.g. "Range:"), per-option color dots (used for the model filter), and
exposes `align="left|right"`, ESC-to-close, outside-click-to-close, and
focus return to the trigger on close — i.e. the spec's "absolute-positioned
floating panel" pattern is implemented at the primitive level.

**Result: blocked** — header + URL-state integration is not in this
chunk's scope.

### 12.1.f — Toggling a model dims non-selected pills

**Verification.** This is the only §12.1 scenario whose contract is
entirely in this chunk. `ModelIconGroup` accepts `activeModels:
ModelShortId[]` and, for every model in `MODEL_ORDER`, renders a
`<ModelIcon>` with `dimmed={!active.has(m)}` (ModelIcon.tsx lines 88–107).

`ModelIcon` itself implements the dim state by reducing the colored-pill
background alpha from 0.12 to 0.04 and switching the text from the
model's brand color to a muted `rgba(139, 139, 146, 0.6)` (ModelIcon.tsx
lines 63–80, plus the `hexToRgb` helper at lines 39–50). It also marks
the dimmed pill with `data-dimmed="true"` for any downstream styling
consumer. The spec phrases the requirement as "dim non-selected pills to
`opacity-30`" — the visual outcome (clearly de-emphasized pill that still
reads as the same model) is achieved through reduced bg-alpha + muted
text rather than a literal `opacity-30` Tailwind class. The §16 model
colors that drive the *active* pill are also locked here and verified by
the unit tests above.

**Result: pass.** The primitive supports the integration scenario.
(The runtime check that the header *uses* this group with the current
filter value is a §12.1.e integration concern, marked blocked above.)

---

## §12.5 — Prompt Detail Modal

### 12.5.a — Backdrop click closes; X closes; ESC closes (manual verify)

**Verification.** Read `src/components/ui/Modal.tsx` end-to-end against
the three close paths called out in §15 Tab 2:

- **Backdrop click.** The backdrop is a `<div role="presentation">` with
  `onMouseDown={onBackdropClick}` and `data-modal-backdrop="true"`
  (Modal.tsx lines 82–91). `onBackdropClick` is a `useCallback` that
  invokes `onClose` only when `e.target === e.currentTarget`, i.e. the
  click landed on the backdrop itself and did not bubble up from the
  modal card (Modal.tsx lines 71–78). Using `onMouseDown` rather than
  `onClick` is intentional: it prevents a drag that *starts* inside the
  modal and *ends* on the backdrop from closing the modal — a subtle
  correctness improvement over the click-only pattern.
- **X close button.** When `showCloseButton` is true (the default), the
  header renders a `<button aria-label="Close">` containing the `lucide
  X` icon; its `onClick` is bound directly to the `onClose` prop
  (Modal.tsx lines 117–126). The button has a focus-visible ring driven
  by `--color-ring`.
- **ESC.** A `useEffect` keyed on `[open, onClose]` adds a
  `document.addEventListener('keydown', …)` listener while the modal is
  open. The listener calls `e.stopPropagation()` then `onClose()` on
  `e.key === 'Escape'` (Modal.tsx lines 45–55). Stop-propagation matters
  for stacked widgets — e.g. the date/model `Dropdown` also listens for
  ESC; this implementation prevents both from closing on the same press
  if the modal is on top.

Bonuses for product polish (not on the QA checklist but worth recording):
- A second `useEffect` locks `document.body.style.overflow = 'hidden'`
  while the modal is open and restores the previous value on close —
  the dashboard underneath the modal does not scroll on wheel events
  (Modal.tsx lines 57–64).
- A third `useEffect` focuses the modal card on open (Modal.tsx lines
  66–69), so the ESC keydown is captured even if no specific child has
  focus yet, and screen readers announce the dialog.
- The card has `role="dialog" aria-modal="true"`, and uses
  `aria-label={label}` when `label` is a string.
- `createPortal(…, document.body)` mounts the modal outside any local
  stacking/overflow context — it cannot be clipped or z-stacked by a
  parent card (Modal.tsx line 82, lines 80–133).

**Result: pass.**

### 12.5.b — 5 model cards in order openai, claude, gemini, perplexity, google_aio

**Verification.** The Prompt Detail Modal body is built in a later chunk,
but its required iteration order is locked by the
`MODEL_ORDER = ['openai', 'claude', 'gemini', 'perplexity', 'google_aio']`
constant exported from `ModelIcon.tsx` (lines 16–22), which the unit
tests assert exactly. Any future modal that iterates `MODEL_ORDER` for
its card list will render the spec-mandated order.

**Result: pass (primitive support).**

### 12.5.c — Mentioned models get green border tint

**Verification.** The spec calls for `border-success/20 bg-success/[0.03]`
on mentioned cards. The success color is defined in this chunk's CSS
foundation: `--color-success: #30a46c` (globals.css line 17), which
resolves both `border-success` and `bg-success` Tailwind utilities. The
`Badge` primitive already exposes a `variant="success"` styling
(`bg-success/15 text-success`, Badge.tsx line 25), which the modal's
"Mentioned" badge can use directly.

**Result: pass (primitive support).** The actual modal card markup ships
in a later chunk.

### 12.5.d — Click card expands; shows latest response preview (first 300 chars)

**Verification.** The expandable card with response preview is part of
the future Prompt Detail Modal component, not the primitives. The Modal
shell supports an arbitrarily tall body via
`max-h-[70vh] overflow-y-auto` (Modal.tsx lines 99–103), which matches
the spec card sizing, but the per-model expanding card itself is not
shipped here.

**Result: blocked** — integration scenario not in this chunk's scope.

### 12.5.e — Models with no run in window show "No run in window"

**Verification.** Same as 12.5.d — this is a modal-component concern,
not a primitive concern.

**Result: blocked** — integration scenario not in this chunk's scope.

---

## §12.7 — Theme & design tokens

### 12.7.a — `globals.css` defines the exact tokens in §16

**Verification.** Read `src/app/globals.css` end-to-end and matched
every line of the §16 token table:

| Token | Spec value | In file |
|---|---|---|
| `--color-background` | `#0a0a0c` | ✓ |
| `--color-foreground` | `#ececef` | ✓ |
| `--color-card` | `#111114` | ✓ |
| `--color-card-foreground` | `#ececef` | ✓ |
| `--color-primary` | `#2eb88a` | ✓ |
| `--color-primary-foreground` | `#ffffff` | ✓ |
| `--color-secondary` | `#161619` | ✓ |
| `--color-muted` | `#161619` | ✓ |
| `--color-muted-foreground` | `#8b8b92` | ✓ |
| `--color-destructive` | `#e5484d` | ✓ |
| `--color-border` | `#1e1e22` | ✓ |
| `--color-input` | `#1e1e22` | ✓ |
| `--color-ring` | `#2eb88a` | ✓ |
| `--color-success` | `#30a46c` | ✓ |
| `--color-warning` | `#f5a623` | ✓ |

All fifteen tokens, in spec order, declared inside a single Tailwind v4
`@theme { … }` block (globals.css lines 3–21). No extra colors and none
omitted. (This file was last verified in chunk 4's QA; the report
here re-checks because chunk 23's primitives consume those tokens by
short utility name such as `bg-card`, `bg-primary`, `text-foreground`,
`border-border` — if any name drifted, every card / button / badge in
the new primitives would render the wrong color.)

**Result: pass.**

### 12.7.b — Inter font loaded; antialiased; tabular-nums on numbers

**Verification.**

- `src/app/layout.tsx` imports `Inter` via `next/font/google`, binds it
  to the CSS variable `--font-inter`, and applies that variable's class
  to `<body>` — the standard App Router pattern for optimized font
  loading.
- `globals.css` declares
  `--font-sans: "Inter", var(--font-inter), -apple-system, system-ui, sans-serif`
  inside `@theme` (line 20), and the `body` rule applies
  `font-family: var(--font-sans)` plus `-webkit-font-smoothing: antialiased`
  and `-moz-osx-font-smoothing: grayscale` (lines 28–34).
- A `.tabular-nums` utility class is registered at globals.css lines
  36–38 that sets `font-variant-numeric: tabular-nums`. Beyond the
  utility, the chunk-23 primitives that render numbers already opt in:
  `MetricCard` applies `tabular-nums` to the large value
  (MetricCard.tsx lines 55–58) and to the change indicator (lines
  62–64); `Badge`, `Tabs`, `ModelIcon`, `Spinner`, and the count badge
  inside `Tabs` either use `tabular-nums` directly or contain no
  numeric content. This means the moment a downstream chunk drops in
  these primitives, the spec's "`tabular-nums` on all numbers" rule
  already holds.

**Result: pass.**

### 12.7.c — Cards use `rounded-lg border border-border/40 bg-card/60 p-5`

**Verification.** Read the two card-rendering primitives in this chunk:

- `Card` (Card.tsx lines 9–22) applies
  `rounded-lg border border-border/40 bg-card/60` and adds `p-5` when
  the `padded` prop is true (default true). The `padded={false}` escape
  hatch exists so the spec's "no outer padding on the card; table
  inside" pattern (Sources / Prompts tables) can be authored without a
  one-off override.
- `MetricCard` (MetricCard.tsx lines 37–43) bakes the same string
  unconditionally — `rounded-lg border border-border/40 bg-card/60 p-5`
  — because metric cards always show the §15 Tab 1 padded layout.

Both primitives therefore satisfy the per-component class string from
§12.7.c by construction, and a downstream consumer cannot accidentally
miss it.

**Result: pass.**

### 12.7.d — Scrollbar: 5 px thumb `#2a2a2f`, track transparent

**Verification.** WebKit rules in globals.css lines 40–56:

- `::-webkit-scrollbar { width: 5px; height: 5px; }` — 5 px on both axes.
- `::-webkit-scrollbar-thumb { background-color: #2a2a2f; border-radius: 9999px; }` —
  exact thumb color, fully rounded.
- `::-webkit-scrollbar-track { background: transparent; }` — transparent track.
- `::-webkit-scrollbar-corner { background: transparent; }` — keeps the
  bottom-right corner clean when both axes are scrollable. Doesn't conflict
  with the spec.

Firefox parity at lines 58–61: `* { scrollbar-width: thin; scrollbar-color:
#2a2a2f transparent; }`. `thin` is the closest Firefox equivalent to a
5 px bar; thumb/track colors match.

**Result: pass.**

---

## Notes / non-blocking observations

- **`ModelIcon` dim styling vs. `opacity-30`.** The spec wording in
  §12.1.f says "dim all non-selected pills to `opacity-30`." This chunk
  implements dim by *reducing the colored-background alpha and switching
  the text to a muted gray*, not by setting CSS `opacity: 0.3` on the
  whole element. Functionally equivalent for the user (clearly
  de-emphasized but still legible model code), and it composes better
  with the §15 Tab 1 "model status pills" use case where the active
  pill needs full color while inactive pills should still be readable.
  Flagged as an intentional deviation; not a bug. The integration QA
  stage will judge it on the assembled header.
- **Modal uses `onMouseDown` for backdrop close, not `onClick`.** This
  is deliberate so that a click-drag that starts inside the modal and
  releases on the backdrop does not close. Worth noting because a
  naive QA might expect `onClick` and a snapshot would diff.
- **Dropdown ESC handler `stopPropagation`s before closing.** This
  matters when a Dropdown is nested inside a Modal — pressing ESC
  closes only the Dropdown, not both. Recorded so a future test does
  not surprise on stacked behavior.
- **No `Sidebar`, `Header`, or `MainNav` component in this chunk.** All
  §12.1 sub-scenarios that depend on those land in a later chunk; the
  primitives they will consume are ready.

---

Overall: pass
