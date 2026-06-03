# Chunk 4 QA Report

**Pipeline:** AEO app
**Chunk:** Theme tokens and global CSS
**Files in scope:** `src/app/globals.css`
**Spec sources:** build plan Chunk 4 (lines 95–106 of `aeo-app-build-plan.md`), refined spec §16 Design System (lines 948–985 of `aeo-app-refined.md`), QA plan §12.7 (lines 573–578 of `aeo-app-qa-plan.md`).

## Method

This chunk produces only a static CSS file — there is no runtime code to exercise. QA is therefore:

1. Read the committed `globals.css` line-by-line and compare every declaration against the spec.
2. Confirm the file is syntactically valid CSS that the Tailwind v4 pipeline can consume (sanity check via the project's existing build chain).
3. Confirm scope discipline — i.e. nothing was added that the chunk says belongs in component classes instead of `globals.css`.

The QA plan calls out that §12.7's automated coverage is a Playwright screenshot regression on the Overview page at 1440×900. That cannot run yet — the Overview page does not exist until much later in the pipeline (Chunk 30) — so visual regression is deferred to whenever the dashboard ships. This is consistent with the build plan's phasing.

## Scenario results

### 12.7.a — `globals.css` defines the exact tokens in §16  → **PASS**

All fifteen color tokens listed in §16 are present in the `@theme` block with byte-exact hex values:

| Token | Spec value | Implementation | Match |
|---|---|---|---|
| `--color-background` | `#0a0a0c` | `#0a0a0c` | ✓ |
| `--color-foreground` | `#ececef` | `#ececef` | ✓ |
| `--color-card` | `#111114` | `#111114` | ✓ |
| `--color-card-foreground` | `#ececef` | `#ececef` | ✓ |
| `--color-primary` | `#2eb88a` | `#2eb88a` | ✓ |
| `--color-primary-foreground` | `#ffffff` | `#ffffff` | ✓ |
| `--color-secondary` | `#161619` | `#161619` | ✓ |
| `--color-muted` | `#161619` | `#161619` | ✓ |
| `--color-muted-foreground` | `#8b8b92` | `#8b8b92` | ✓ |
| `--color-destructive` | `#e5484d` | `#e5484d` | ✓ |
| `--color-border` | `#1e1e22` | `#1e1e22` | ✓ |
| `--color-input` | `#1e1e22` | `#1e1e22` | ✓ |
| `--color-ring` | `#2eb88a` | `#2eb88a` | ✓ |
| `--color-success` | `#30a46c` | `#30a46c` | ✓ |
| `--color-warning` | `#f5a623` | `#f5a623` | ✓ |

Tokens are declared inside a Tailwind v4 `@theme { … }` block as the build plan requires, so Tailwind's class generator will expose them as `bg-background`, `text-foreground`, `border-border`, `text-primary`, etc., and the JIT utility variants (`bg-card/60`, `border-border/40`, `bg-white/[0.04]`) referenced in §16's spacing section will all resolve cleanly.

No spurious or off-spec color tokens were added.

### 12.7.b — Inter font loaded; antialiased; tabular-nums on numbers  → **PASS**

- `--font-sans` is declared inside `@theme` as `"Inter", var(--font-inter), -apple-system, system-ui, sans-serif`. The `var(--font-inter)` slot is the conventional handoff name from Next.js's `next/font/google` Inter loader, which Chunk 1 was responsible for wiring up in `layout.tsx`. If that wiring is present, Inter loads via Next's optimized self-hosted pipeline; if not, the explicit `"Inter"` family name still picks up a system-installed Inter, and ultimately falls back to system sans. The fallback chain is correct and matches the spec wording.
- `body` sets `font-family: var(--font-sans)` so the chain applies everywhere by default.
- `body` sets `-webkit-font-smoothing: antialiased` and the macOS-Firefox equivalent `-moz-osx-font-smoothing: grayscale`. Both are present.
- A reusable `.tabular-nums` helper class is defined (`font-variant-numeric: tabular-nums;`). Spec wording is "tabular-nums on numbers"; providing the helper class is the right shape for this chunk because the spec is explicit that per-component usage lives in Tailwind class strings, not globals — Tailwind v4 already ships a `tabular-nums` utility, and the explicit `.tabular-nums { … }` rule here just makes the class work even outside Tailwind's utility set. No regression.

### 12.7.c — Cards use `rounded-lg border border-border/40 bg-card/60 p-5`  → **PASS (by design — scope deferred)**

This scenario is about how Card components are styled. The Chunk 4 build plan is explicit: *"Do not add component-level CSS — that lives in Tailwind class strings."* So Chunk 4's correct behavior is to **expose** the tokens (`bg-card`, `border-border`) such that the eventual Card component (Chunk 11) can write `bg-card/60 border-border/40 rounded-lg p-5` as classes and have them resolve to the spec colors.

I verified that the implementation supports this:
- `--color-card` and `--color-border` are present with the spec values, so Tailwind v4 will generate `bg-card`, `border-border`, and their opacity variants (`bg-card/60`, `border-border/40`).
- `rounded-lg` and `p-5` are framework-stock Tailwind utilities that don't depend on theme tokens.

Nothing in this scenario should be in `globals.css`, and nothing for it is. Pass.

### 12.7.d — Scrollbar styling matches: 5px thumb `#2a2a2f`, track transparent  → **PASS**

WebKit (Chrome, Safari, Edge):
- `::-webkit-scrollbar { width: 5px; height: 5px; }` — width matches spec; the `height` is the correct horizontal-scrollbar analogue and is consistent.
- `::-webkit-scrollbar-track { background: transparent; }` — matches.
- `::-webkit-scrollbar-thumb { background-color: #2a2a2f; border-radius: 9999px; }` — color matches; the `border-radius: 9999px` is a sensible pill shape that the spec doesn't forbid.
- `::-webkit-scrollbar-corner { background: transparent; }` — minor extra rule that cleans up the corner where horizontal and vertical scrollbars meet. Harmless and on-spec.

Firefox:
- `* { scrollbar-width: thin; scrollbar-color: #2a2a2f transparent; }` — Firefox's `scrollbar-width` doesn't accept a px value (it's `auto | thin | none`), so `thin` is the correct cross-browser approximation. Thumb color and transparent track match spec. Applying via `*` is the documented pattern for Firefox.

### Additional checks (not numbered QA scenarios, but called out in the build plan)

**Dark-mode root background** — build plan says "and the dark-mode root background."
- `html { background-color: var(--color-background); color-scheme: dark; }` — sets the page background before any React renders, and `color-scheme: dark` tells the browser to render native form controls, scrollbars, and the page chrome in dark mode (important because Chunk 1's `<html className="dark">` only affects Tailwind's dark variant, not the user agent stylesheet). Both present. Good.

**Scope discipline** — file contains only: the Tailwind import, the `@theme` token block, html/body base styles, the `.tabular-nums` helper, and the scrollbar rules. No component-level CSS leaked in. Matches the build plan's "Do not add component-level CSS" constraint.

**Tailwind v4 directive** — the file starts with `@import "tailwindcss";`. This is the correct entry point for Tailwind v4 with `@tailwindcss/postcss` (which Chunk 1 configured). The earlier Chunk 1 stub was just this single line; Chunk 4 extends it.

### CSS validity / build sanity

I confirmed there are no stray characters, unclosed braces, or unknown at-rules. The `@theme` block is valid Tailwind v4 syntax. The PostCSS pipeline that ships with this project (Chunk 1's `postcss.config.mjs` registering `@tailwindcss/postcss`) is the standard consumer of `@theme`. No further validation is possible until a page is rendered (Chunk 30), at which point the Playwright screenshot regression in §12.7's plan becomes runnable.

## Summary of findings

- Every required §16 color token is present and exact.
- Typography rules (Inter via `--font-sans`, antialiasing, `.tabular-nums` helper) are correct.
- Scrollbar rules match the spec for both WebKit and Firefox.
- Dark-mode root background and `color-scheme: dark` are in place.
- Component-level styles (Card, Table, etc.) are correctly **omitted** from globals — they belong in Tailwind class strings per the build plan and will be applied by later chunks (11+).
- No off-spec colors, animations, shadows, or noise textures were introduced — consistent with §16's restraint clause ("No noise textures, no decorative animation, no shadows except dropdown `shadow-xl`").
- File is the only file changed (`src/app/globals.css`, +60 lines, –0), matching the build plan's file scope exactly.

## Open issues, deferred work, and known limitations

- **§12.7 Playwright screenshot regression is deferred.** The QA plan calls for a visual diff against Overview at 1440×900. The Overview page lands in Chunk 30. The screenshot test must be authored against that chunk, not this one. No action for Chunk 4.
- **Inter font loading depends on Chunk 1.** The `var(--font-inter)` slot inside `--font-sans` is a no-op unless `src/app/layout.tsx` (owned by Chunk 1) declares Inter via `next/font/google` and binds the CSS variable to its `--font-inter` name. If a later QA pass on Chunk 1 finds this missing, the fallback chain still picks up `"Inter"` by family name (any system Inter) and then system sans, so this is graceful — not a Chunk 4 defect.
- No automated test was added for theme tokens. None is required by the chunk's spec; values are static and verified by inspection plus the future visual-regression test.

## Result

Overall: **pass**

Chunk 4 delivers the theme tokens and global CSS exactly as specified, with correct scope discipline (no component CSS leaked in), and is ready for downstream chunks to consume.
