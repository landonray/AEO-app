# Chunk 29 QA — Onboarding Flow UI (after fix iteration 3)

## Scope

Chunk 29 ships the three-step onboarding wizard:

- `src/components/onboarding/OnboardingFlow.tsx` — top-level state machine + toast.
- `src/components/onboarding/Step1Url.tsx` — centered URL card with inline validation.
- `src/components/onboarding/Step2Analyzing.tsx` — spinner + "Analyzing {domain}".
- `src/components/onboarding/Step3Review.tsx` — three editable cards + Start Over + Launch Tracking.
- `src/components/onboarding/ProgressDots.tsx` — header progress chip.

This QA stage verifies the QA-plan scenarios in §9.7 (a–g) ONLY.

The branch now carries three fix-cycle commits on top of the original chunk 29 implementation:

- iteration 1 (`9973353`) — `src/app/page.tsx` renders the wizard eagerly while `/api/brand` is in flight, eliminating the loading-spinner blocker the iteration-1 QA report flagged; Playwright/expect timeouts raised; `e2e/onboarding.spec.ts` warmup added.
- iteration 2 (`ea658d1`) — per-test waits inside `e2e/onboarding.spec.ts` bumped from 10s to 30s; the §9.7.c crawl delay raised from 900 ms → 3000 ms.
- iteration 3 (`03b2a75`) — `next.config.ts` adds `allowedDevOrigins: ['127.0.0.1','localhost']` to silence Next 16's cross-origin HMR guard; `playwright.config.ts` pins the dev server's bind address to `127.0.0.1` via `--hostname` and bumps `webServer.timeout` to 300 s.

There is no new code commit beyond `03b2a75` at the time of this report — the "iteration 4" the orchestrator referenced is being verified against the iteration-3 tree.

## Verification approach

1. **Unit tests** — `src/components/onboarding/__tests__/Step1Url.test.ts` via `mc_run_tests`.
2. **Playwright end-to-end** — `e2e/onboarding.spec.ts` via `npx playwright test --reporter=line` from the worktree, output captured to a file to keep the session memory budget safe.

## Summary table

| Scenario | Verified by | Result |
|---|---|---|
| §9.7.a Step indicator shows Website → Analyzing → Review & Launch | Playwright | pass |
| §9.7.b Submit on Enter and arrow click both work | Playwright | pass |
| §9.7.c Loading spinner shows during analyze; UI does not freeze | Playwright | pass |
| §9.7.d Step 3 fields are inline-editable; X removes prompt/competitor; order preserved | Playwright | pass |
| §9.7.e "Start Over" returns to Step 1 and discards crawl data | Playwright | **fail** |
| §9.7.f "Launch Tracking" → redirect to `/` showing dashboard | Playwright | pass |
| §9.7.g No "+ Add" button on Step 3 prompts | Playwright | pass |
| (supporting) URL normalization helper unit tests | Vitest `Step1Url.test.ts` | pass |

## Run details

### Vitest — `src/components/onboarding/__tests__/Step1Url.test.ts`

`mc_run_tests` reported earlier in this QA session: **status: passed**, 10/10 (run_id `1eeb9a50-23fb-49a6-88a0-7f7c40227175`). The pure URL-normalization helper covers bare-domain `https://` prepend, http/https pass-through, subdomain handling, whitespace trim, rejection of non-http(s) protocols (`ftp:`, `javascript:`, `file:`), rejection of bare text without a TLD, and rejection of `https://` with no host. All as the spec calls out.

### Playwright — `e2e/onboarding.spec.ts`

Run with the iteration-3 configuration (`playwright.config.ts` bind to `127.0.0.1`, 300 s webServer timeout; `next.config.ts` with `allowedDevOrigins`). Total wall clock: **~1.1 min**, **6 passed, 1 failed**.

Passing scenarios (verified end-to-end against a real Next.js dev server with `/api/*` mocked at the fetch boundary):

- `9.7.a Step indicator shows Website → Analyzing → Review & Launch`
- `9.7.b Submit on Enter and arrow click both work`
- `9.7.c Loading spinner shows during analyze and the UI does not freeze`
- `9.7.d Step 3 fields are inline-editable; X removes a prompt/competitor; order preserved`
- `9.7.f "Launch Tracking" redirects to / showing dashboard`
- `9.7.g No "+ Add" button exists on the prompts card (Q3/A12)`

Failing scenario:

- `9.7.e "Start Over" returns to Step 1 and discards crawl data` — fails on the assertion `await expect(page.getByTestId('onboarding-url-input')).toHaveValue('')` (line 258 of `e2e/onboarding.spec.ts`). The test reaches Step 3, mutates the brand name, clicks "Start Over", confirms Step 1 is visible, and then expects the URL input to be empty — but the URL field still carries the value the user typed before analyzing (`https://acme.com`).

## Per-scenario findings

### §9.7.a — Step indicator shows "Website → Analyzing → Review & Launch"

- **Verified:** Playwright navigated to `/` with `/api/brand` mocked to `{ brand: null }`, asserted `getByTestId('onboarding-progress')` is visible and contains the three step labels.
- **Result:** **pass.**

### §9.7.b — Submit on Enter and arrow click both work

- **Verified:** Filled the URL input, pressed Enter (first pass) and clicked the arrow submit button on a fresh page (second pass); both reach Step 3.
- **Result:** **pass.**

### §9.7.c — Loading spinner shows during analyze; UI does not freeze

- **Verified:** With the crawl response delayed 3000 ms, Step 2 with the `role="status"` spinner and the "Analyzing" copy appears, the progress indicator stays mounted (UI not frozen), and Step 3 follows.
- **Result:** **pass.**

### §9.7.d — Step 3 fields are inline-editable; X removes a prompt/competitor; order preserved

- **Verified:** Edited the brand name inline and saw the new value persisted; removed the 2nd prompt and confirmed the surrounding prompts kept their relative order; removed the 1st competitor and confirmed the remaining competitors kept their order.
- **Result:** **pass.**

### §9.7.e — "Start Over" returns to Step 1 and discards crawl data

- **Verified:** Reached Step 3, mutated the brand name to "Mutated Name", clicked Start Over, confirmed Step 1 is visible. The test then asserts the URL input is empty as part of the "discards data" contract.
- **Result:** **fail.**
- **Details:** After Start Over, the URL input still contains `https://acme.com`. `OnboardingFlow.tsx`'s `resetAll()` resets `step`, `analyzingDomain`, `brand`, `prompts`, `competitors`, and `finalDomain`, and bumps `activeRunRef` to cancel any in-flight crawl — but it does **not** clear `urlValue`. When `Step1Url` re-mounts on the way back to step 1, its `useState(initialUrl)` re-initializes from the still-populated `urlValue`, so the input shows the stale URL. This is a real implementation gap relative to §9.7.e ("returns to Step 1 and discards crawl data" — the suite encodes the wider expectation that all wizard state, including the URL the user typed, is cleared).
- **What needs to change in the next fix iteration:** add `setUrlValue('')` to `resetAll()` in `src/components/onboarding/OnboardingFlow.tsx`. No new tests are needed — the existing 9.7.e Playwright test will go green as soon as the bug is fixed.

### §9.7.f — "Launch Tracking" → redirect to `/` showing dashboard

- **Verified:** Reached Step 3, clicked "Launch Tracking", saw `POST /api/onboarding/complete` fire exactly once, the mocked `/api/brand` flip to a populated brand, and `data-testid="dashboard-placeholder"` appear after the redirect.
- **Result:** **pass.**

### §9.7.g — No "+ Add" button exists on the prompts card

- **Verified:** Reached Step 3 and confirmed zero buttons match the `/add prompt/i` or `/\+ add/i` accessible name regexes, and zero elements with `data-testid="onboarding-prompt-add"`.
- **Result:** **pass.**

## Decision

§9.7 a, b, c, d, f, and g are all verified end-to-end against the running app and pass. §9.7.e is a real, single, narrowly-scoped bug in `OnboardingFlow.tsx`'s `resetAll()`. Per the QA contract for this chunk, any failing scenario flips the verdict.

Overall: fail
