# Chunk 4 QA Report — Theme Tokens and Global CSS

**Chunk:** 4 — Theme tokens and global CSS
**File under review:** `src/app/globals.css`
**Supporting file:** `src/app/layout.tsx` (for the Inter font wiring referenced by the theme)
**QA scenarios:** §12.7 (a–d) from `docs/specs/aeo-app-qa-plan.md`
**Reference spec:** §16 Design System from `docs/specs/aeo-app-refined.md`
**Iteration:** re-verification after fix iteration 3

---

## Method

Read the implementation file in the worktree, compared it line-by-line against the §16 token list and the §12.7 scenario checklist, and confirmed the supporting Inter font wiring in `layout.tsx`. The worktree is clean and the implementation file is unchanged from the prior passing iteration — no regressions to flag.

---

## Scenario-by-scenario results

### 12.7.a — `globals.css` defines the exact tokens in §16

All fifteen color tokens from §16 are declared inside a single Tailwind v4 `@theme { … }` block, in the spec's order, with the exact hex values:

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

No extra color tokens are introduced, and none are omitted. **Result: pass.**

### 12.7.b — Inter font loaded; antialiased; tabular-nums on numbers

- `layout.tsx` imports `Inter` from `next/font/google` and binds it to the CSS variable `--font-inter` on `<body>`. This is the canonical Next.js App Router pattern, and matches the chunk 1 scaffolding already on `<html className="dark">`.
- `globals.css` registers `--font-sans: "Inter", var(--font-inter), -apple-system, system-ui, sans-serif` inside `@theme`, which:
  - Aligns with the §16 typography stack (`"Inter", -apple-system, system-ui, sans-serif`).
  - Threads the Next.js-managed Inter variable through so the optimized font is actually used, while keeping the literal `"Inter"` first for fallback if the variable is unset.
- The `body` rule applies `font-family: var(--font-sans)` plus `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale`. The macOS smoothing pair is what §16 calls for.
- A `.tabular-nums { font-variant-numeric: tabular-nums; }` utility class is defined for use on numeric content per §16 ("`tabular-nums` on all numbers"). The QA plan and build plan both treat this as a global helper, which is what landed.

**Result: pass.**

### 12.7.c — Cards use `rounded-lg border border-border/40 bg-card/60 p-5`

This scenario describes the per-component Tailwind class string for card markup, which is consumed by later chunks (the dashboard, table, modal chunks). The Chunk 4 build plan explicitly states: *"Do not add component-level CSS — that lives in Tailwind class strings."*

What Chunk 4 must — and does — provide is the *foundation* those class strings depend on:
- `border-border` resolves via `--color-border: #1e1e22` ✓
- `bg-card` resolves via `--color-card: #111114` ✓
- `rounded-lg` and `p-5` are stock Tailwind v4 utilities, available by default

No component CSS leaked into `globals.css`. The foundation for 12.7.c is correctly in place; the visual verification of card markup itself will occur in the chunks that introduce card components. **Result: pass (foundation correct; component-level visual diff deferred to relevant chunks, as the build plan instructs).**

### 12.7.d — Scrollbar styling matches: 5px thumb `#2a2a2f`, track transparent

WebKit rules:
- `::-webkit-scrollbar { width: 5px; height: 5px; }` — 5px on both axes, matching §16. ✓
- `::-webkit-scrollbar-thumb { background-color: #2a2a2f; border-radius: 9999px; }` — exact thumb color, fully rounded. ✓
- `::-webkit-scrollbar-track { background: transparent; }` — transparent track. ✓
- `::-webkit-scrollbar-corner { background: transparent; }` — keeps the bottom-right corner clean when both bars appear. Reasonable addition; doesn't conflict with the spec.

Firefox rules (cross-browser parity, not contradicted by §16):
- `* { scrollbar-width: thin; scrollbar-color: #2a2a2f transparent; }` — `thin` is the closest Firefox equivalent to a 5px bar, and the thumb/track colors match. ✓

**Result: pass.**

---

## Additional checks beyond the four listed scenarios

The chunk 4 build plan also requires "the dark-mode root background" and forbids component-level CSS. Both are honored:

- `html { background-color: var(--color-background); color-scheme: dark; }` and `body { background-color: var(--color-background); color: var(--color-foreground); … }` — the dark root background is set at both `html` and `body`, and `color-scheme: dark` tells the browser to render native form controls and scrollbars in dark mode. This eliminates the white-flash-on-load issue that would otherwise occur before React paints.
- The file contains *only*: the Tailwind import, the `@theme` block, the `html`/`body` rules, the `.tabular-nums` helper, and the scrollbar rules. No buttons, cards, tables, or other component classes — exactly as the build plan instructs.

Nothing component-shaped leaked in. The order of declarations (Tailwind import → theme tokens → root styles → utility helper → scrollbar styling) is conventional and correct.

---

## Things that could be flagged but are deliberate and acceptable

- **`-moz-osx-font-smoothing: grayscale`** alongside the `-webkit-font-smoothing` rule. §16 calls out the WebKit property only, but the macOS-Firefox companion is standard practice and harmless on other platforms.
- **`::-webkit-scrollbar-corner`** is added in addition to the rules called out in §16. It's a sensible polish on the same color story (transparent) and creates no visible difference from the spec.
- **`border-radius: 9999px` on the scrollbar thumb.** §16 doesn't specify a thumb radius. Fully rounded is the conventional default and matches the look implied by the small (5px) thumb.
- **Wildcard `* { scrollbar-width: thin; scrollbar-color: … }`.** §16 doesn't explicitly cover Firefox; this is the only practical way to get cross-browser parity. Acceptable.

None of these rise to a defect — they are all consistent with the spec's intent and the chunk's stated mandate.

---

## Summary

All four §12.7 scenarios pass. The fifteen §16 color tokens are present and exact. Inter is wired correctly through `layout.tsx` and exposed via `--font-sans` in `@theme`. Body antialiasing is on, the `tabular-nums` helper is available, scrollbar styling matches §16, and the dark root background is set at both `html` and `body` with `color-scheme: dark`. No component-level CSS leaked into globals, in line with the chunk's mandate to leave component styling to Tailwind class strings in later chunks.

Overall: pass
