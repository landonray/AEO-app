# Luminaire — Integration QA Report (Stage 5, iteration 2)

This is the second pass of integration-layer QA, after fix cycle 1 addressed the issues called out in iteration 1.

Scope is the same as iteration 1 per the pipeline instructions: cross-chunk behavior, end-to-end UI flows, cross-cutting concerns, and any QA-plan items not assigned to a specific chunk. Chunk-scoped scenarios are trusted unless there's reason to suspect a regression.

## TL;DR

Fix cycle 1 successfully resolved the DB-layer integration bug that blocked everything in iteration 1. The product now builds, the migration applies idempotently against a real Neon database, the full vitest suite still passes, and 6 of the 7 Playwright onboarding scenarios in §9.7 pass end-to-end against the dev server.

However, one e2e scenario — §9.7.f "Launch Tracking redirects to / showing dashboard" — fails. The root cause is a real product regression introduced by chunk 30 that the chunk-level QA explicitly deferred to this stage and that iteration 1 could not surface because the DB bug fired first.

## Summary

| # | Scenario | Result |
|---|---|---|
| 1 | TypeScript build (`next build`) succeeds | **pass** |
| 2 | DB layer wiring — `sql()` works on `@neondatabase/serverless` v0.10.4 at runtime | **pass** |
| 3 | `npm run db:migrate` runs to completion against the real Neon DB | **pass** |
| 4 | Schema applies idempotently (re-run is a no-op) | **pass** |
| 5 | Vitest unit + route-handler suite passes | **pass** (485 / 485) |
| 6 | `.gitignore` excludes `.env`, `.env.*`, `.env.local`; `.env.example` is committed | **pass** |
| 7 | No client component reads `process.env.*` (no server-side secrets reach the browser) | **pass** |
| 8 | Cron auth uses `crypto.timingSafeEqual` over equal-length hashed buffers | **pass** |
| 9 | Playwright §9.7.a — Step indicator shows Website → Analyzing → Review & Launch | **pass** |
| 10 | Playwright §9.7.b — Submit on Enter and arrow click both work | **pass** |
| 11 | Playwright §9.7.c — Loading spinner shows during analyze; UI does not freeze | **pass** |
| 12 | Playwright §9.7.d — Step 3 fields inline-editable; X removes; order preserved | **pass** |
| 13 | Playwright §9.7.e — "Start Over" returns to Step 1 and discards crawl data | **pass** |
| 14 | Playwright §9.7.f — "Launch Tracking" → redirect to `/` showing dashboard | **fail** |
| 15 | Playwright §9.7.g — No "+ Add" button on Step 3 prompts | **pass** |
| 16 | README + cron docs + chunk QA reports internally consistent with shipped files | **pass** |

Final result: **fail.** Scenario #14 is a real product regression. Single-issue scope this iteration — once it is fixed, the pipeline can advance.

## How this iteration differs from iteration 1

Iteration 1 found that every DB-touching route threw at runtime because the central `run()` helper called a non-existent `sql.query(...)` method on the function returned by `@neondatabase/serverless` v0.10.4. That single root cause cascaded into nine of the eleven `fail` results in that report. Two unrelated TypeScript errors (`Tabs.tsx`, `google-aio.test.ts`) also blocked `next build`.

Fix cycle 1 (commit `04d7a8e`) addressed all of these:

- Replaced `sql.query(stringSql, params)` with `sql(stringSql, params)` everywhere it was called — `src/lib/queries.ts` (the `run()` helper and `runMigration()`), `src/app/api/onboarding/complete/route.ts` (three call sites), and `scripts/migrate.ts`.
- Reworked `runMigration()` and the standalone migration script to split the multi-statement schema into individual statements and run them as a single `sql.transaction([...])` so the migration is atomic.
- Updated the onboarding/complete route test mock to make the mocked `sql` itself a callable with a `.transaction` property, matching the new production API surface.
- Fixed `Tabs.tsx`: `TabsProps<T>` now `Omit`s `onChange` from `HTMLAttributes` so the custom `(value: T) => void` signature does not conflict with the DOM `FormEventHandler`.
- Fixed `google-aio.test.ts:164`: extended the runtime-pushed `references` fixture entry with the required `type`, `title`, and `source` fields.

I re-verified each of these fixes (scenarios 1–5 above). They all hold.

## Scenario detail

### 1. `next build` succeeds

**What I verified.** Ran `npx next build` with a placeholder `DATABASE_URL` and all other env vars set to placeholder values. Turbopack compiles in ~27s, the TypeScript check completes ("Finished TypeScript in 22.6s") with no errors, static page generation succeeds (4/4), and the build emits a complete route manifest covering all 18 app routes. Exit code 0.

**Result.** Pass.

### 2. DB layer wiring at runtime

**What I verified.** Two pieces of evidence:

- Static: read the `@neondatabase/serverless` v0.10.4 type declarations. `NeonQueryFunction` exposes a callable `(string, params?)` signature and a `transaction` property. The code now calls `sql(built.sql, built.params)` and `sql.transaction([...])` — both match the documented API.
- Dynamic: ran the standalone migration script (scenario #3 below) against the real Neon DB. It connected successfully, applied the schema, and exited 0. Then I ran a tiny one-off Node program against the same `DATABASE_URL` that queried `information_schema.tables` and `pg_indexes`. All five tables and all expected indexes are present.

**Result.** Pass.

### 3. `npm run db:migrate` runs to completion

**What I verified.** Loaded the real `DATABASE_URL` from `.env`, ran `npm run db:migrate`. The script printed `Applied schema from .../src/sql/schema.sql` and exited 0. Confirmed via a separate query that the five expected tables (`brands`, `competitors`, `prompts`, `runs`, `citations`) and seven indexes (`idx_runs_created_at`, `idx_runs_prompt_id`, `idx_runs_model`, `idx_citations_run_id`, `idx_citations_domain`, `idx_competitors_brand_id`, `idx_prompts_brand_id`) all exist after the run.

**Result.** Pass.

### 4. Schema applies idempotently

**What I verified.** Ran `npm run db:migrate` a second time against the same DB. It printed the same "Applied schema" message and exited 0 — no SQL error from re-creating already-existing tables/indexes. The schema uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` throughout, and the runtime confirms that this works when wrapped in `sql.transaction([...])`. Matches QA-plan §2.1.

**Result.** Pass.

### 5. Vitest unit + route-handler suite

**What I verified.** Ran `mc_run_tests` over the full Vitest suite (run id `095eda15-3332-4d6c-8c50-2ac1f2d9ebc9`). 485 / 485 passed in 2.22s, 0 failures, 0 skipped. Same caveat as iteration 1 — the DB-touching modules are unit-tested with their dependencies mocked, so the suite cannot catch a wrong neon method name on its own. But it does catch every change inside each module, and the fix-cycle changes did not regress any of the existing assertions.

**Result.** Pass.

### 6. `.gitignore` and env hygiene

**What I verified.** `.gitignore` includes `.env`, `.env.*`, `.env.local`, `.env.production`, and the explicit negation `!.env.example` so the example template stays tracked. `git ls-tree HEAD -- .env` returns nothing — the real environment file is not committed. `.env.example` is committed with placeholder values only.

**Result.** Pass.

### 7. No client component reads `process.env.*`

**What I verified.** All `process.env` reads in the `src/app` tree live inside server components (no `'use client'` directive) and route handlers. No file that contains both `'use client'` and `process.env` exists. Matches QA-plan §14.1.a / §14.1.b.

**Result.** Pass.

### 8. Cron bearer uses constant-time comparison over hashed buffers

**What I verified.** `src/app/api/cron/run/route.ts:28-35` SHA-256 hashes both `provided` and `expected` to 32-byte digests before passing them to `crypto.timingSafeEqual`. The function returns `false` on mismatch without early-exit on any character index. No bearer string is logged. Matches QA-plan §14.2 / §16.4.

**Result.** Pass.

### 9–15. Playwright onboarding suite (§9.7)

**Set up.** Ran the entire `e2e/onboarding.spec.ts` file with `E2E_PORT=6812 npx playwright test --reporter=line` against the real Neon DB (schema applied per #3, no primary brand at the start of the run). Playwright's `webServer` config booted a fresh Next dev server on port 6812 with the real `DATABASE_URL`. Total wall clock: 1.4 minutes. Result: **6 passed, 1 failed.**

The six passing scenarios (§9.7.a–e and §9.7.g) demonstrate that:

- The root entry router (`src/app/page.tsx`) correctly server-side fetches `/api/setup-db` against the live DB (schema present), then `/api/brand` (no brand), and renders `OnboardingFlow`. This implicitly verifies that the chunk-30 routing decisions still work against a real database, not just the mocked-fetch Vitest tests in `src/app/__tests__/page.test.tsx` that chunk 30 added.
- The browser-mocked `/api/onboarding/*` endpoints carry the user through the three-step wizard with correct state transitions, inline editing, and ordering — all chunk-29 behavior preserved post-fix.
- The DB-layer fix does not break the API routes that the e2e indirectly exercises (`/api/setup-db`, `/api/brand`).

**Result.** Six pass, one fail. Details on the failing case below.

### 14. §9.7.f — "Launch Tracking" redirects to `/` showing dashboard

**Result.** **Fail.**

**What the test does.** Walks the user through onboarding into Step 3, clicks the "Launch Tracking" button, then asserts that `getByTestId('dashboard-placeholder')` becomes visible (the test's stand-in for "the dashboard is now rendering").

**What happens at runtime.** Playwright captures the final page state at failure time. The DOM is back at Step 1 of onboarding — the URL input is visible again, the "Analyze website" button is rendered, and there is no dashboard element on screen. Specifically:

```
- banner:
  - group "Onboarding progress": Website Analyzing Review & Launch
- main:
  - heading "Track your AI search visibility" [level=1]
  - paragraph: Enter your website and we'll set up tracking automatically.
  - textbox "Website URL"
  - button "Analyze website"
```

**Why this fails — root cause.** Two compounding issues, both architectural rather than bugs in the fix cycle:

1. The `dashboard-placeholder` testid no longer exists anywhere in `src/`. A grep across the whole tree finds it only in `e2e/onboarding.spec.ts`. In chunk 29, `src/app/page.tsx` was a `'use client'` component that included a `<main data-testid="dashboard-placeholder">` branch when `/api/brand` returned a brand. Chunk 30 replaced `page.tsx` with a server component that instead calls `redirect('/dashboard')` when a brand exists. The dashboard route itself (`src/app/dashboard/page.tsx`) renders `DashboardShell` + `OverviewTab` — it has no placeholder testid. So the assertion has no element to find regardless of what else happens.

2. The mock for `/api/onboarding/complete` records the call and sets `state.brand` in the test fixture, but it does not actually insert a brand into the real Neon DB. After Launch, Next reloads `/`, page.tsx server-side fetches `/api/brand` — and `page.route('**/api/brand', ...)` only intercepts browser-side fetches, so the server-side fetch hits the real route handler against the live DB, which still has no brand. page.tsx therefore renders `OnboardingFlow` again, dropping the user back at Step 1.

So even if the test were updated to look for a real `/dashboard` testid, the test fixture would still fail because the mocked `complete` route doesn't persist any state the server-rendered page can read.

**Why this was not caught earlier.**

- Chunk 29's QA verified §9.7.f against chunk 29's own client-component `page.tsx`, which did read from `page.route()`-mocked `/api/brand` and did render `dashboard-placeholder`. At that time the test was correct against the architecture in tree.
- Chunk 30 replaced `page.tsx` with a server component but did not touch `e2e/onboarding.spec.ts`. The chunk 30 QA report explicitly deferred end-to-end verification: *"This is a code-read, not an end-to-end Playwright pass; the integration QA stage at the pipeline's end is the right place for the full click-through."*
- Iteration 1 of this integration QA could not surface this because the `sql.query` DB bug fired first — every server-side `/api/setup-db` call returned 500, every `/` request redirected to `/setup`, and Playwright timed out on Step 1 ever appearing. The §9.7.f-specific failure was hidden behind that earlier crash.

**Recommended fix scope (for fix cycle 2).** Two paths; either is acceptable.

- *Update the e2e to match the post-chunk-30 architecture (preferred).* Change §9.7.f to (a) make the `/api/onboarding/complete` mock actually call the real endpoint so a real brand row is inserted, and (b) assert that the URL becomes `/dashboard` and that a dashboard element (e.g. `DashboardShell`-rendered heading or one of the existing tab testids) becomes visible. The test cleanup will need to delete the inserted brand row in an `afterEach` so subsequent runs start clean.
- *Update the dashboard route to render a `dashboard-placeholder` element.* Add `data-testid="dashboard-placeholder"` to a wrapper inside `src/app/dashboard/page.tsx` (or `DashboardShell`) so the existing e2e passes. This is the smaller code change but leaves the test fixture's "mock complete doesn't insert" problem unresolved — it would still fail because page.tsx's server-side `/api/brand` call returns null.

Path 1 is the right answer. Path 2 alone is insufficient.

### 16. Documentation consistency

**What I verified.** Already covered by chunk 31's QA report. Re-skimmed the README, `.env.example`, `scripts/cron.mjs`, and the cron snippets — nothing in the docs references the broken DB code path, and the setup walkthrough's step 3 (`npm run db:migrate`) now actually succeeds.

**Result.** Pass.

## Out of scope / not re-verified

Per the Stage 5 instructions, chunk-scoped scenarios are trusted unless there's reason to suspect a regression. None of the fix-cycle-1 changes crossed into the following areas, so they were not re-run here:

- Parser unit tests (§3.1–§3.5) — chunk 8 QA verified.
- Metrics tests (§8.1–§8.9) — chunk 15 QA verified.
- Orchestrator tests (§7.1–§7.8) — chunk 16 QA verified at the unit level.
- Per-chunk UI component tests (§12.1–§12.7) — chunks 23–28 QA verified at the component level.
- Cron auth tests (§10.1–§10.7) — chunk 22 QA verified; the cron route code itself is also spot-checked in scenario #8 here.
- Setup page UI flow on `/setup` — chunk 30 QA code-reviewed; with the DB layer now working, a real round-trip click through `/setup` → "Run migration" → "Re-check" → "Continue" would now work end-to-end against the real DB. Not formally exercised here because no chunk-scoped scenario remains in doubt; flagging it as the natural next acceptance check once §9.7.f is fixed.

Overall: fail
