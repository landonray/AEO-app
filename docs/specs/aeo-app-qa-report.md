# Luminaire — Integration QA Report (Stage 5, iteration 3)

This is the third pass of integration-layer QA, after fix cycle 2 addressed the single failing scenario from iteration 2 (§9.7.f — the e2e "Launch Tracking" flow ending at `/dashboard`).

Scope is the same as previous iterations per the pipeline instructions: cross-chunk behavior, end-to-end UI flows, cross-cutting concerns, and any QA-plan items not assigned to a specific chunk. Chunk-scoped scenarios are trusted unless there's reason to suspect a regression. The fix-cycle-2 change was strictly localized to `e2e/onboarding.spec.ts`, so no production code paths verified at the chunk level changed and none of them are re-run here.

## TL;DR

Fix cycle 2 resolved §9.7.f. All seven Playwright onboarding scenarios now pass against the real Neon DB. The full vitest suite still passes (485 / 485). Every other integration-layer scenario verified clean in iteration 2 (build, DB wiring, migration idempotency, env hygiene, no-secrets-in-client, cron auth, docs consistency) remains unchanged on the branch — the only commit added since iteration 2 (`92c185b`) modifies one e2e test file and nothing else. This iteration re-verifies the previously-failing scenario directly and re-runs the test suites that exercise it; the others are trusted on the basis of "no production code changed."

## Summary

| # | Scenario | Result |
|---|---|---|
| 1 | TypeScript build (`next build`) succeeds | **pass** (trusted from iteration 2 — no source change since) |
| 2 | DB layer wiring — `sql()` works on `@neondatabase/serverless` v0.10.4 at runtime | **pass** (trusted from iteration 2 — no source change since) |
| 3 | `npm run db:migrate` runs to completion against the real Neon DB | **pass** (trusted from iteration 2; also implicitly exercised by §9.7.f run below) |
| 4 | Schema applies idempotently (re-run is a no-op) | **pass** (trusted from iteration 2) |
| 5 | Vitest unit + route-handler suite passes | **pass** (485 / 485, re-verified) |
| 6 | `.gitignore` excludes `.env`, `.env.*`, `.env.local`; `.env.example` is committed | **pass** (trusted from iteration 2) |
| 7 | No client component reads `process.env.*` (no server-side secrets reach the browser) | **pass** (trusted from iteration 2) |
| 8 | Cron auth uses `crypto.timingSafeEqual` over equal-length hashed buffers | **pass** (trusted from iteration 2) |
| 9 | Playwright §9.7.a — Step indicator shows Website → Analyzing → Review & Launch | **pass** |
| 10 | Playwright §9.7.b — Submit on Enter and arrow click both work | **pass** |
| 11 | Playwright §9.7.c — Loading spinner shows during analyze; UI does not freeze | **pass** |
| 12 | Playwright §9.7.d — Step 3 fields inline-editable; X removes; order preserved | **pass** |
| 13 | Playwright §9.7.e — "Start Over" returns to Step 1 and discards crawl data | **pass** |
| 14 | Playwright §9.7.f — "Launch Tracking" redirects through `/` to `/dashboard` | **pass** (regression fixed) |
| 15 | Playwright §9.7.g — No "+ Add" button on Step 3 prompts | **pass** |
| 16 | README + cron docs + chunk QA reports internally consistent with shipped files | **pass** (trusted from iteration 2) |

Final result: **pass.** Zero failing scenarios. Onboarding-to-dashboard flow works end-to-end against the real Neon database.

## What changed since iteration 2

One commit landed on the branch since the iteration 2 report:

- `92c185b` — *fix cycle 2: §9.7.f e2e Launch → /dashboard*. Modifies only `e2e/onboarding.spec.ts` (one file, +61 / −9). It does three things:
  1. Adds a `cleanTestBrand()` helper that deletes the test brand row (and its cascade of `competitors`, `prompts`, `runs`, `citations`) keyed on `domain = 'acme.com'`. Runs both before and after the §9.7.f test so a leaked row from a prior run cannot trip `primaryBrandExists()` inside the real onboarding/complete handler.
  2. In §9.7.f only, calls `page.unroute('**/api/onboarding/complete')` so that route hits the real Next handler — which actually inserts a brand row into Neon — instead of the lightweight in-test mock used by the other scenarios.
  3. After the user clicks "Launch Tracking," asserts the URL transitions to `**/dashboard` (via `page.waitForURL` with `waitUntil: 'domcontentloaded'`) and that `getByTestId('dashboard-header')` becomes visible. This matches the post-chunk-30 architecture: `src/app/page.tsx` is a server component that calls `redirect('/dashboard')` when `/api/brand` returns a brand, and `src/components/dashboard/Header.tsx:89` is where the `dashboard-header` testid is rendered inside `DashboardShell`.

No production code (anything under `src/`, `scripts/`, `sql/`, `next.config.*`, or any package config) changed. Iteration 2's scenarios 1–4, 6–8, and 16 therefore cannot have regressed and are trusted as-is here. Scenarios 5 and 9–15 are re-verified directly below since the affected suites (vitest + e2e) were re-run.

## Scenario detail

### 5. Vitest unit + route-handler suite

**What I verified.** Re-ran the full vitest suite via `mc_run_tests` against this worktree (run id `94b2a9ae-a972-4cc2-9044-3b49a2da9895`). 485 passed, 0 failed, 0 skipped in 2.44s. No new tests added, no existing tests regressed.

**Result.** Pass.

### 9–15. Playwright onboarding suite (§9.7) — full re-run

**Set up.** Loaded the real `DATABASE_URL` from the worktree's `.env` (Neon dev branch) and ran `E2E_PORT=6813 npx playwright test --reporter=line` against the whole `e2e/onboarding.spec.ts` file. Playwright's `webServer` config booted a dedicated Next dev server on `127.0.0.1:6813` (shifted away from the user's 4810 production server). Browser warmup (`test.beforeAll`) precompiled `/` before the per-test assertions started, so first-compile latency didn't race with any `getByTestId` poll.

**Result: 7 passed, 0 failed. Total wall clock 1.0 min.**

Per-scenario notes:

- **§9.7.a (#9), §9.7.b (#10), §9.7.c (#11), §9.7.d (#12), §9.7.e (#13), §9.7.g (#15)** — same fully-mocked flows that already passed in iteration 2; pass again. The fix-cycle-2 edit did not touch these test bodies, only added the helper and modified §9.7.f.
- **§9.7.f (#14)** — pass. The browser-mocked complete handler is unrouted just for this test, so the click on "Launch Tracking" fires a real `POST /api/onboarding/complete` against the live `DATABASE_URL`. The endpoint inserts a brand row, `window.location.assign('/')` runs, the server-rendered `page.tsx` calls `/api/brand`, sees the brand, and `redirect('/dashboard')` fires. Playwright observes the URL settle on `**/dashboard` and the `data-testid="dashboard-header"` element from `src/components/dashboard/Header.tsx` becomes visible — both assertions pass within the 30s budget. The `try/finally` calls `cleanTestBrand()` afterward; I confirmed the test port was released after the run (`lsof -i :6813` returned empty).

This means the full onboarding-to-dashboard happy path is now end-to-end clean: real DB write, server-side redirect, real dashboard render. Iteration 2's recommended "Path 1" fix landed exactly as scoped.

### What I did NOT re-verify and why

Per the Stage 5 instructions ("trust the per-chunk QA reports for chunk-scoped scenarios … do not re-run the full per-chunk test suites here"), and given that fix cycle 2 touched only one test file and zero production files, the following are inherited from iteration 2's verdicts:

- Scenario 1 (`next build` succeeds) — iteration 2 ran `npx next build` against placeholder env vars and got a clean compile in ~27s. Nothing in the source tree has changed since, so the build result cannot have changed.
- Scenario 2 (DB-layer wiring at runtime) — iteration 2 read the v0.10.4 typedefs and ran the migration against the real DB to confirm the `sql()` callable and `sql.transaction([])` APIs are correctly used. No DB-layer file changed since. Additionally, scenario 14 above implicitly re-exercises this path: the `/api/onboarding/complete` handler that ran in §9.7.f writes to Neon through the same `lib/queries.ts` helpers, and it returned 200 with a real `brandId`.
- Scenarios 3 & 4 (`npm run db:migrate` and idempotent re-apply) — iteration 2 ran these against the real DB and confirmed all five tables and seven indexes are present. The schema and migration script have not changed. The §9.7.f run further confirms the schema is intact (the insert succeeded).
- Scenario 6 (`.gitignore` env hygiene) — `.gitignore` and the env example file have not changed.
- Scenario 7 (no `process.env` in `'use client'` components) — no client-component source changed; iteration 2 grepped the tree and got zero hits.
- Scenario 8 (cron auth constant-time comparison) — `src/app/api/cron/run/route.ts` has not changed; iteration 2 read lines 28-35 and confirmed the SHA-256 + `timingSafeEqual` pattern.
- Scenario 16 (docs consistency) — README, `.env.example`, and `scripts/cron.mjs` have not changed; chunk 31's QA report covered these.
- Per-chunk scenarios (parser §3, metrics §8, orchestrator §7, per-component UI §12.1–§12.7, cron §10, setup page) — chunk-level QA still authoritative; no commits since iteration 2 cross those boundaries.

## Closing notes

This pipeline is in a working state. The onboarding wizard, the migration runner, the dashboard route, the cron auth, the docs, and the test suites are all green. The one regression iteration 2 found (the e2e expecting an old chunk-29 placeholder testid against the new chunk-30 server-component architecture) is fixed with the smaller of the two recommended approaches done correctly — the test was updated to match the shipped architecture, including DB cleanup to keep the dev branch tidy.

No outstanding integration-layer concerns. Ready for code review.

Overall: pass
