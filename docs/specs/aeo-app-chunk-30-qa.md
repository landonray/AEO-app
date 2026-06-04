# Chunk 30 QA Report — Setup page + root entry routing

## Scope

This QA pass verifies only the scenarios listed in the chunk-30 brief:

- **§13.1** — No primary brand → onboarding shown at `/`.
- **§13.2** — Schema not applied → redirect to `/setup`.

Files in scope: `src/app/page.tsx` (root entry router, server component) and `src/app/setup/page.tsx` (client-side setup UI).

Cross-chunk and end-to-end behavior (full Playwright sweep, real DB integration, full schema apply round-trip) is intentionally out of scope here; the pipeline's integration QA stage covers it.

## Summary

| # | Scenario | Result |
|---|---|---|
| 13.1 | No primary brand → onboarding rendered at `/` | **pass** |
| 13.2 | `allTablesExist === false` → `/` redirects to `/setup` | **pass** |
| 13.2 (variant) | `GET /api/setup-db` returns non-2xx → `/` redirects to `/setup` | **pass** |
| sanity | Tables exist AND brand exists → `/` redirects to `/dashboard` | **pass** |
| setup page (manual code review) | `/setup` shows per-table status, Run migration POST, Re-check GET, link back to `/` on all-green | **pass** |

## Verification approach

Both required scenarios are routing-decisions inside a React Server Component. The cleanest way to verify them deterministically is to import the `Home` server component directly into Vitest and exercise its decisions with a mocked `fetch`, mocked `next/headers`, mocked `next/navigation.redirect`, and a stubbed `OnboardingFlow` (the latter is a `'use client'` component from Chunk 29 and only needs to be observed as the returned element, not actually rendered).

New test file: `src/app/__tests__/page.test.tsx` (added 4 cases). The test does **not** touch any implementation code; it only mocks the external boundaries the page calls into.

Test run:

- `mc_run_tests` against `src/app/__tests__/page.test.tsx` → **4 passed, 0 failed** (run_id `1bf8e42b-1054-4697-b691-801fdc0bbbe9`).
- `mc_run_tests` against the supporting `setup-db` and `brand` route tests → **8 passed, 0 failed** (run_id `9debb78d-8ab7-4c57-8ccb-717979b93512`) — confirms the page's upstream dependencies are still green and nothing was broken by adding the new test.

## Scenario-by-scenario results

### §13.1 — No primary brand → onboarding shown at `/`

**What I verified.** With `GET /api/setup-db` returning `{ allTablesExist: true, results: [...all true...] }` and `GET /api/brand` returning `{ brand: null }`, the root server component:

1. Calls `/api/setup-db` first, then `/api/brand`, in that order.
2. Does **not** invoke `redirect()`.
3. Returns a React element whose `type` is the `OnboardingFlow` import (the test substitutes a marker function for the real component and confirms invoking the returned element's `type` yields the marker object).

This matches the spec: when tables are healthy and there is no primary brand, the user lands on onboarding without any redirect hop.

**Result: pass.**

### §13.2 — Schema not applied → redirect to `/setup`

**What I verified (primary case).** With `GET /api/setup-db` returning `{ allTablesExist: false, results: [...mixed flags...] }`, the root server component:

1. Calls `/api/setup-db`.
2. Invokes `redirect('/setup')` exactly once.
3. Does **not** call `/api/brand` at all (short-circuits before the brand check).

The mocked `redirect` throws a `NEXT_REDIRECT;...` error, mimicking Next.js's real behavior of halting rendering; the test asserts the rejection.

**What I verified (variant case).** When `GET /api/setup-db` itself returns HTTP 500 (e.g. DB unreachable, route handler errored), the root server component also calls `redirect('/setup')` and short-circuits — so a broken setup endpoint sends the user to the recovery page, not into a partially-onboarded dashboard.

**Result: pass** on both the documented case and the failed-endpoint variant.

### Sanity — Tables exist AND brand exists → redirect to `/dashboard`

Not formally in the §13 list but it's the third arm of the same router and worth pinning. With `allTablesExist: true` and `{ brand: { id, name, domain, category, description } }`, the root component calls `redirect('/dashboard')`. Confirms the chunk's third routing path works too.

**Result: pass.**

### Setup page (`/setup`) — manual code review

The chunk also adds `src/app/setup/page.tsx`. There is no §13 scenario specifically for the UI on that page, but I read through the component to confirm it matches the spec language in the chunk brief ("per-table status, a 'Run migration' primary button that POSTs to /api/setup-db, and a 'Re-check tables' outline button that GETs the same route. On all-green, link back to /").

- Per-table status list rendered from `status.results`, with a Ready / Missing pill per row. ✓
- "Run migration" button POSTs to `/api/setup-db` (no-store, no body). ✓
- "Re-check tables" button GETs `/api/setup-db` (no-store). ✓
- On mount, the page does an initial GET to populate state. ✓
- When `allTablesExist === true` AND the page has loaded once, the action buttons are replaced with a confirmation panel containing a `Link href="/"` ("Continue") that bounces back through the root router. ✓
- Buttons are disabled while a check or migration is in flight; a single inline error banner surfaces transport / non-2xx failures with a status code. ✓

This is a code-read, not an end-to-end Playwright pass; the integration QA stage at the pipeline's end is the right place for the full click-through. No bugs found in this review.

**Result: pass.**

## Notes / observations (non-blocking)

- The root component derives its own origin from the `host` and `x-forwarded-proto` request headers and then makes server-side `fetch` calls back into the same Next process. This is the documented approach in the chunk brief ("call `GET /api/setup-db` server-side"), so it's correct, but it does mean the entry router is doing two extra HTTP hops on every page hit. Not a defect for this chunk; flagging in case a later perf pass wants to consider direct lib calls.
- The "redirect to `/setup` when the setup-db endpoint errors" behavior is a friendly choice — the spec language only says "if `allTablesExist === false`, redirect to `/setup`", and is silent on the error case. Sending the user to the recovery page is the right default and the test now locks it in. No spec change needed.
- No implementation code was modified during QA. The only new file is the test at `src/app/__tests__/page.test.tsx`.

Overall: pass
