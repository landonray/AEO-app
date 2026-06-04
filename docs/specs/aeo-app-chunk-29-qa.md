# Chunk 29 QA — Onboarding Flow UI (iteration 2)

## Scope

Chunk 29 ships the three-step onboarding wizard:

- `src/components/onboarding/OnboardingFlow.tsx` — top-level state machine + toast.
- `src/components/onboarding/Step1Url.tsx` — centered URL card with inline validation.
- `src/components/onboarding/Step2Analyzing.tsx` — spinner + "Analyzing {domain}".
- `src/components/onboarding/Step3Review.tsx` — three editable cards + Start Over + Launch Tracking.
- `src/components/onboarding/ProgressDots.tsx` — header progress chip.

This QA stage verifies the QA-plan scenarios in §9.7 (a–g) ONLY. All other scenarios in the QA plan are out of scope for this chunk and will be covered by other chunks or the final integration QA stage.

## Verification approach

Two layers of verification were run against the committed code on this branch:

1. **Unit tests** — `src/components/onboarding/__tests__/Step1Url.test.ts` (covers the `normalizeOnboardingUrl` helper used by §9.7.b inputs). Run via `mc_run_tests`.
2. **Playwright end-to-end** — `e2e/onboarding.spec.ts` (covers §9.7 a–g end-to-end against a Next.js dev server on shifted port 6810, with `/api/*` routes mocked at the fetch boundary). Run via `npx playwright test --reporter=list` from the worktree, per CLAUDE.md ("Playwright is NOT blocked from worktrees and IS your end-to-end verification path").

The Playwright suite is the suite that the implementation chunk itself authored to prove §9.7 a–g, so its pass/fail is the directly authoritative signal for this chunk's QA scenarios.

## Summary table

| Scenario | Verified by | Result |
|---|---|---|
| §9.7.a Step indicator shows Website → Analyzing → Review & Launch | Playwright test 9.7.a | **fail** |
| §9.7.b Submit on Enter and arrow click both work | Playwright test 9.7.b | **fail** |
| §9.7.c Loading spinner shows during analyze; UI does not freeze | Playwright test 9.7.c | **fail** |
| §9.7.d Step 3 fields are inline-editable; X removes prompt/competitor; order preserved | Playwright test 9.7.d | **fail** |
| §9.7.e "Start Over" returns to Step 1 and discards crawl data | Playwright test 9.7.e | **fail** |
| §9.7.f "Launch Tracking" → redirect to `/` showing dashboard | Playwright test 9.7.f | **fail** |
| §9.7.g No "+ Add" button on Step 3 prompts | Playwright test 9.7.g | **fail** |
| (supporting) URL normalization helper unit tests | Vitest `Step1Url.test.ts` | pass |

## Run details

### Vitest — `src/components/onboarding/__tests__/Step1Url.test.ts`

`mc_run_tests` reported: **status: passed**, 10 passed / 0 failed / 0 skipped (run_id `1eeb9a50-23fb-49a6-88a0-7f7c40227175`). The pure URL-normalization helper is solid: bare-domain `https://` prepend, http/https pass-through, subdomain handling, whitespace trim, rejection of non-http(s) protocols (`ftp:`, `javascript:`, `file:`), rejection of bare text without a TLD, and rejection of `https://` with no host all behave as the spec calls out for §9.7.b's URL input contract.

This is encouraging signal that the Step 1 URL field's validation contract is correct, but it is NOT itself §9.7.b — it is the pure-function building block that §9.7.b depends on.

### Playwright — `e2e/onboarding.spec.ts`

All **7/7** tests in the suite (one per scenario §9.7 a–g) failed in the same way. From the trace files in `test-results/` and from the live console output:

- Each test calls `page.goto('/')` after setting up `**/api/*` route mocks (including `**/api/brand` → `{ brand: null }`).
- The browser receives the page HTML and JS bundles successfully — the screenshot snapshot shows the page mounted to the `loading` Spinner rendered by `src/app/page.tsx` (`<main><status="Loading"></main>`).
- The page never advances out of the `loading` state, so `onboarding-progress` / `onboarding-step-1` never appear, and the test times out at the first `toBeVisible()` assertion (~5 seconds).
- Inspecting the trace's network log shows **no outgoing `/api/brand` request is ever made by the page** during the entire test window — meaning the `useEffect` in `src/app/page.tsx` either never fires or its fetch is silently swallowed inside the browser before reaching Playwright's route handler. The trace's console log shows repeated `WebSocket connection to 'ws://127.0.0.1:6810/_next/webpack-hmr?id=...' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE` errors (from the Turbopack HMR client) but no React render error and no application-level exception.

The seven failing tests, from the suite's own output:

```
7 failed
  e2e/onboarding.spec.ts:114:7 — 9.7.a Step indicator shows Website → Analyzing → Review & Launch
  e2e/onboarding.spec.ts:125:7 — 9.7.b Submit on Enter and arrow click both work
  e2e/onboarding.spec.ts:145:7 — 9.7.c Loading spinner shows during analyze and the UI does not freeze
  e2e/onboarding.spec.ts:186:7 — 9.7.d Step 3 fields are inline-editable; X removes a prompt/competitor; order preserved
  e2e/onboarding.spec.ts:225:7 — 9.7.e "Start Over" returns to Step 1 and discards crawl data
  e2e/onboarding.spec.ts:247:7 — 9.7.f "Launch Tracking" redirects to / showing dashboard
  e2e/onboarding.spec.ts:259:7 — 9.7.g No "+ Add" button exists on the prompts card (Q3/A12)
```

Every failure's root cause is the same: the page is stuck on the loading spinner and never renders `OnboardingFlow`, so none of the per-scenario assertions can ever be reached.

## Per-scenario findings

### §9.7.a — Step indicator shows "Website → Analyzing → Review & Launch"

- **What was verified:** Playwright navigated to `/` with `/api/brand` mocked to return `{ brand: null }`, then asserted `getByTestId('onboarding-progress')` is visible and contains the three step labels.
- **Result:** **fail.**
- **Details:** The page never advances past the loading spinner inside `src/app/page.tsx`, so the `OnboardingFlow` (and therefore `ProgressDots` inside it) is never rendered. The progress chip is unreachable, even though the `ProgressDots` component itself is implemented correctly when read statically (it does render the three labels Website / Analyzing / Review & Launch with the right active/complete state styling).

### §9.7.b — Submit on Enter and arrow click both work

- **What was verified:** Playwright filled the URL input and (a) pressed Enter and (b) on a fresh page, clicked the submit arrow button; expected to land on Step 3.
- **Result:** **fail.**
- **Details:** Step 1 itself never appears (same root cause as §9.7.a), so neither the Enter-key path nor the arrow-click path can be exercised. Source review of `Step1Url.tsx` shows the form correctly uses `<form onSubmit>` with `e.preventDefault()` (so Enter inside the input submits the form), and the submit button is `type="submit"` (so arrow click also submits the form) — but this end-to-end behavior cannot be verified by the suite because Step 1 never mounts.

### §9.7.c — Loading spinner shows during analyze; UI does not freeze

- **What was verified:** Playwright delayed the `/api/onboarding/crawl` response by 900ms, submitted Step 1, then asserted Step 2 with `role="status"` spinner is visible AND the progress indicator stays mounted (UI not frozen), and finally Step 3 appears.
- **Result:** **fail.**
- **Details:** Step 1 never mounts so the URL submit can't happen and Step 2 can't appear. Source review of `Step2Analyzing.tsx` shows it does render `<Spinner size="lg" label="Analyzing website">` with the "Analyzing {domain}" headline, but again this can't be verified against the running app.

### §9.7.d — Step 3 fields are inline-editable; X removes a prompt/competitor; order preserved

- **What was verified:** Playwright walked through to Step 3 (via `reachStep3` helper), edited the brand name, removed the 2nd prompt and 1st competitor, and asserted order preservation around the removals.
- **Result:** **fail.**
- **Details:** `reachStep3` fails immediately on its first `expect(getByTestId('onboarding-step-1')).toBeVisible()`. The implementation in `Step3Review.tsx` does encode all the required behavior (`EditableText` with click-to-edit, Enter/blur commit, Escape cancel; per-row X buttons that filter the array by id, preserving the relative order of the remaining items), but the end-to-end assertion of all of this is blocked.

### §9.7.e — "Start Over" returns to Step 1 and discards crawl data

- **What was verified:** Reach Step 3, edit the brand name to "Mutated Name", click "Start Over", assert Step 1 is visible with empty input, re-onboard, assert brand name is the API-returned "Acme Analytics" and NOT the stale "Mutated Name".
- **Result:** **fail.**
- **Details:** Same blocked-at-step-1 root cause. Source review of `OnboardingFlow.tsx`'s `resetAll()` confirms it clears `brand`, `prompts`, `competitors`, `finalDomain`, and `analyzingDomain`, and bumps `activeRunRef` to cancel any in-flight crawl — the implementation matches the spec, but the test can't reach the assertion.

### §9.7.f — "Launch Tracking" → redirect to `/` showing dashboard

- **What was verified:** Reach Step 3, click "Launch Tracking", expect that after `POST /api/onboarding/complete` (mocked to flip `state.brand` to a populated brand), the dashboard placeholder (`data-testid="dashboard-placeholder"`) is visible.
- **Result:** **fail.**
- **Details:** Same blocked-at-step-1 root cause. Source review of `OnboardingFlow.tsx` shows `handleLaunch` POSTs the trimmed body to `/api/onboarding/complete` and on success calls `onComplete()` if provided, otherwise `window.location.assign('/')`. The complete-then-redirect contract is in the code; what the running app does, this suite cannot say.

### §9.7.g — No "+ Add" button exists on the prompts card (Q3 / A12)

- **What was verified:** Reach Step 3, then assert zero buttons with accessible name matching `/add prompt/i` or `/\+ add/i`, and zero elements with `data-testid="onboarding-prompt-add"`.
- **Result:** **fail.**
- **Details:** Same blocked-at-step-1 root cause. A static read of `Step3Review.tsx` confirms there is no "+ Add" affordance on the Generated Prompts card (only inline editing of existing rows and per-row X removal); the empty-state copy is "All prompts removed. Add some after launch from the Prompts tab." So the spec's no-add-button intent matches the source. But the actual no-add-button assertion against the live UI never runs.

## Root cause analysis (for the fix cycle, not part of QA verdict)

Across all 7 e2e tests, the failure is **not** in the onboarding components — `ProgressDots`, `Step1Url`, `Step2Analyzing`, `Step3Review`, and `OnboardingFlow.tsx` all look right when read statically and the unit tests on the URL helper pass.

The failure is upstream of those components: `src/app/page.tsx` (committed earlier and edited here to wire in `OnboardingFlow`) renders only the `Spinner` while its `useEffect` fetches `/api/brand`. The trace shows the page mounts, the JS bundle loads, no application-level error fires — and yet the `useEffect` never reaches the network for `/api/brand` within the 5-second `expect.toBeVisible()` window, so the page never resolves to the onboarding state and the Playwright suite cannot exercise any §9.7 a–g scenario.

A few hypotheses worth investigating in the fix cycle:

1. **Initial Next.js / Turbopack on-demand compile is too slow.** First `page.goto('/')` triggers the first compile of `/` and `/api/brand`; if the dev server hasn't finished compiling `/api/brand` before the page's `useEffect` fetch fires, the request may not be observable in the trace window. Repeated WebSocket-HMR handshake failures in the trace's console hint that the dev-server / browser link is unhealthy at the moment of the first navigation. Increasing the per-scenario `expect` timeout from 5s to something like 30s, or having a single `beforeAll` warmup that pre-fetches `/api/brand` before the parallel-but-serial test suite runs, would either fix or disprove this.
2. **Mocked-route ordering vs. `useEffect` race.** Worth confirming that the `page.route('**/api/brand', ...)` mock is registered before the page's `useEffect` actually issues the request; in Playwright that ordering is normally guaranteed because route mocks are installed before `goto`, but it's the next thing to verify in a debug run.
3. **Real Next.js compile / hydration error suppressed by Turbopack dev overlay.** The trace doesn't show one, but the dev overlay can sometimes swallow runtime errors; running the suite once with `NEXT_TELEMETRY_DISABLED=1` plus `--debug` would surface anything hiding.

None of those hypotheses are themselves spec-level bugs — they are environment / wiring problems — but the §9.7 scenarios are still not verified, and per the QA-plan contract for this chunk, "not verified" = fail.

I considered whether to mark these as `blocked` rather than `fail`, but `blocked` is reserved by the QA contract for scenarios that are genuinely unverifiable in this session (e.g. a test runner that crashed and can't be coaxed back up). Here the suite ran successfully, browsers launched, the dev server came up — the assertions simply did not pass. That is a fail, not a block.

## Other notes

- Unit-test coverage on the URL normalizer (`Step1Url.test.ts`) is good and passes; this is the only logic in the chunk that is unit-testable in isolation, and it is correct.
- No changes were made to implementation code during QA. No `docs/specs/*` files other than this report were modified.

Overall: fail
