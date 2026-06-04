# Luminaire — Integration QA Report (Stage 5)

This is the integration-layer QA pass that runs after all 31 chunk-level QA reports passed. Scope per the pipeline instructions:

- Cross-chunk behavior that needs the whole feature working together.
- End-to-end UI flows the chunk QAs could not verify in isolation.
- Cross-cutting concerns (auth, error paths, data flow across chunks).
- Anything in the QA plan that was not assigned to a specific chunk.

Trust-but-verify on chunk-scoped scenarios — they are not re-run here unless I found a specific reason to suspect a regression.

## TL;DR

The product does not run end-to-end. There is a single root-cause integration bug that breaks the entire database layer — every API route that touches the DB will throw at runtime, `npm run db:migrate` will fail, `next build` will fail TypeScript checking, and the dashboard cannot load. Two additional TypeScript errors block the production build entirely.

Details below. The 31 chunk-level QA reports did not catch this because every chunk that touched the DB mocked the database boundary in its unit tests — no test in the suite exercises the real `@neondatabase/serverless` API surface, so the wrong method name (`sql.query(...)` instead of `sql(...)`) was never executed against the real library.

## Summary

| # | Scenario | Result |
|---|---|---|
| 1 | TypeScript build (`next build`) succeeds | **fail** |
| 2 | Database layer wiring — `sql.query()` works on `@neondatabase/serverless` v0.10.4 | **fail** |
| 3 | `npm run db:migrate` script runs to completion against a Postgres URL | **fail** (same root cause as #2) |
| 4 | `GET /api/setup-db` returns table status from a real DB | **fail** (same root cause) |
| 5 | `POST /api/setup-db` applies the schema | **fail** (same root cause) |
| 6 | `GET /api/brand` returns primary brand or `null` | **fail** (same root cause) |
| 7 | `POST /api/onboarding/complete` inserts brand + competitors + prompts | **fail** (3 additional broken call sites) |
| 8 | `POST /api/cron/run` runs the daily batch | **fail** (same root cause) |
| 9 | Dashboard server components (`/dashboard`, `/dashboard/prompts`, `/dashboard/sources`) load | **fail** (same root cause) |
| 10 | Root entry router (`/`) routes user to setup / onboarding / dashboard correctly | **fail** (server-side fetch of `/api/setup-db` throws → all paths land on `/setup`) |
| 11 | Onboarding e2e flow (Playwright §9.7) passes | **fail** (server-side fetch from `/` redirects to `/setup`, onboarding never renders) |
| 12 | Vitest unit + route-handler suite passes | pass (485 / 485) |
| 13 | `.gitignore` excludes `.env`, `.env.*`, `.env.local`; `.env.example` tracked | pass |
| 14 | No client component reads `process.env.*` (no server-side secrets reach the browser) | pass |
| 15 | Cron auth uses `crypto.timingSafeEqual` over equal-length buffers | pass |
| 16 | README + cron docs + chunk QA reports internally consistent with shipped files | pass |

Final result: **fail.** Scenarios 1–11 share a single root cause (#2) plus two unrelated type errors (Tabs.tsx, google-aio.test.ts). Fixing #2 unblocks #3 through #11 with no further code changes.

## Scenario detail

### 1. `next build` succeeds

**What I verified.** Ran `npx next build` with a placeholder `DATABASE_URL`. The Turbopack build itself compiles successfully ("Compiled successfully in 27.5s"), but the post-compile TypeScript check fails with eight TS2339 / TS2345 / TS2430 errors:

- `scripts/migrate.ts:23` — `Property 'query' does not exist on type 'NeonQueryFunction<false, false>'`.
- `src/lib/queries.ts:102` — same error in the central `run()` helper used by every read/write query.
- `src/lib/queries.ts:805` — same error in `runMigration()` used by `POST /api/setup-db`.
- `src/app/api/onboarding/complete/route.ts:88, 107, 122` — three separate `sql.query(...)` calls inside the onboarding transaction.
- `src/components/ui/Tabs.tsx:12` — interface `TabsProps<T>` incorrectly extends `HTMLAttributes<HTMLDivElement>` (unrelated type bug introduced in the UI primitives chunk).
- `src/lib/llm/__tests__/google-aio.test.ts:164` — fixture object missing required `type`, `title`, `source` fields (test file only — does not block production).

`next build` exits 1 at the TypeScript step. The user cannot ship a production build of this app as-is.

**Result.** Fail.

### 2. DB layer wiring — `sql.query()` works on `@neondatabase/serverless` v0.10.4

**What I verified.** `src/lib/db.ts` initializes the client correctly:

```
const sql: NeonQueryFunction<false, false> = neon(databaseUrl);
```

This part matches the library's API. The problem is what every caller does with that handle. `src/lib/queries.ts:102` (the central `run()` helper) calls:

```
await sql.query(built.sql, built.params)
```

`@neondatabase/serverless` v0.10.4 (the version pinned in `package.json` and installed in `node_modules`) does **not** have a `.query` method on the function returned by `neon(...)`. I confirmed by:

- Reading the type declaration file (`node_modules/@neondatabase/serverless/index.d.ts`): `NeonQueryFunction` exposes only a tagged-template callable signature, an ordinary `(string, params)` callable signature, and a `transaction` method. No `query` property.
- Running a one-off Node script: `const sql = neon('postgres://...'); typeof sql.query` → `undefined`.
- Running Playwright against the dev server (see #11), which surfaced the runtime error in stderr: `TypeError: {imported module ./src/lib/db.ts}.sql.query is not a function at run (src/lib/queries.ts:102:28) at checkTables (src/lib/queries.ts:796:22) at buildStatus (src/app/api/setup-db/route.ts:11:36)`.

The correct API for ordinary-function use is `await sql(stringSql, params)` (the function itself, called directly). The chunks shipped `.query(...)` everywhere instead.

This is the single root-cause integration bug. All other DB-related fails in this report (scenarios #3–#11) are downstream effects.

`grep` found six usage sites that all need to change:

- `src/lib/queries.ts:102` — the central `run()` executor used by every read query helper.
- `src/lib/queries.ts:805` — the `runMigration()` executor used by `POST /api/setup-db`.
- `src/app/api/onboarding/complete/route.ts:88, 107, 122` — three direct calls inside the onboarding transaction.
- `scripts/migrate.ts:23` — the standalone migration script invoked by `npm run db:migrate`.

**Result.** Fail.

### 3. `npm run db:migrate` runs to completion

**What I verified.** `scripts/migrate.ts:23` calls `await sql.query(sqlText);` after reading `src/sql/schema.sql`. Per #2, this throws `TypeError: sql.query is not a function` at runtime. The README's setup walkthrough (step 3) tells the user to run this command — the user's very first setup action would fail.

Did not need to run the command against a real `DATABASE_URL` to confirm — the runtime behavior is dictated by the library shape, and the static analysis already shows the type error.

**Result.** Fail. (Downstream of #2.)

### 4. `GET /api/setup-db` returns table status from a real DB

**What I verified.** The handler calls `checkTables()` which calls the central `run()` helper which calls `sql.query(...)`. I confirmed this throws at runtime by booting the Next.js dev server via Playwright's `webServer` config and watching the request fail (stderr quoted in #2). The handler does not catch the error, so it surfaces to Next.js's error boundary and the response is 500.

**Result.** Fail. (Downstream of #2.)

### 5. `POST /api/setup-db` applies the schema

**What I verified.** The POST handler calls `runMigration(schemaText)` in queries.ts. Same root cause. The "Run migration" button on the `/setup` page would always fail to apply the schema.

**Result.** Fail. (Downstream of #2.)

### 6. `GET /api/brand` returns primary brand or `null`

**What I verified.** `getPrimaryBrand()` → `run(buildGetPrimaryBrand())` → `sql.query(...)`. Same root cause. Every dashboard server component starts by calling `getPrimaryBrand()`, so the entire dashboard depends on this route working.

**Result.** Fail. (Downstream of #2.)

### 7. `POST /api/onboarding/complete` inserts brand + competitors + prompts

**What I verified.** The onboarding completion route has three sites of its own that call `sql.query(...)` directly (lines 88, 107, 122 in `src/app/api/onboarding/complete/route.ts`) — not via the central `run()` helper. So even if scenario #2 only fixed `queries.ts`, this route would still fail until those three call sites are also updated. Per the QA plan §9.6, this is the route that finalizes onboarding into a usable brand record — without it, no user can finish onboarding.

**Result.** Fail. (Same root-cause family as #2 — three additional call sites with the same wrong method name.)

### 8. `POST /api/cron/run` runs the daily batch

**What I verified.** The cron route is structurally correct: it reads `CRON_SECRET` from env, validates the bearer with `crypto.timingSafeEqual` over SHA-256-hashed buffers (constant-time, equal-length — see #15), and on success calls `runBatch(prompts, brand, competitors)`. The batch then needs to read prompts/competitors from the DB and write runs/citations — both go through the broken `run()` helper. So a real cron call will return 500 ("Internal error") once it tries to load active prompts.

**Result.** Fail. (Downstream of #2.)

### 9. Dashboard server components load

**What I verified.** Both `/dashboard/prompts/page.tsx` and `/dashboard/sources/page.tsx` are server components that call `getPrimaryBrand()` and `getLastRunTimestamp(brand.id)` directly. Both calls go through the central `run()` helper. Same root cause — these pages will throw on first render. `/dashboard/page.tsx` (Overview) fetches `/api/overview` server-side, which in turn calls multiple queries.ts helpers — same outcome.

**Result.** Fail. (Downstream of #2.)

### 10. Root entry router (`/`) routes correctly

**What I verified.** `src/app/page.tsx` is a server component that:

1. Calls `fetch(${origin}/api/setup-db)` server-side. Per #4 that returns 500.
2. The router's error path is `if (!setupRes.ok) { redirect('/setup'); }`. So every visit to `/` redirects to `/setup` regardless of actual database state.
3. The `/setup` page is a client component that, on mount, calls `fetch('/api/setup-db')` again. Per #4 that returns 500. The page surfaces "Could not check tables (500)" in its error banner — the user sees a permanent broken state.

So the routing intent (no schema → `/setup`, no brand → onboarding, brand present → dashboard) collapses into a single "always go to `/setup` and show an error" path. None of the three intended states is reachable.

**Result.** Fail.

### 11. Onboarding Playwright e2e (§9.7)

**What I verified.** Ran `E2E_PORT=6810 npx playwright test e2e/onboarding.spec.ts --grep "9.7.a"`. The Next dev server boot succeeds, but the first request fails as described in #10: `/` server-component fetches `/api/setup-db`, gets a 500 (because of the `sql.query` bug), redirects the user to `/setup`. The onboarding test asserts that `getByTestId('onboarding-progress')` becomes visible at `/` — that testid lives in `OnboardingFlow`, which never gets rendered, so the assertion times out at 20s.

Playwright `page.route('**/api/brand', ...)` and friends only intercept browser-side fetches; the server-side fetch in `page.tsx` is **not** intercepted by Playwright, which is why the chunk-level QA's mocked tests passed but the integration-level reality fails. This is a real-environment issue, not a Playwright-config issue.

I ran one test as proof of the failure mode. I did not run the remaining six tests in the file because they all start with the same `page.goto('/')` and would all fail for the same reason. Once the DB bug is fixed, the orchestrator/QA stage can re-run the onboarding suite.

**Result.** Fail.

### 12. Vitest unit + route-handler suite

**What I verified.** Ran `mc_run_tests` over the full Vitest suite (run id `d69c4c3b-7347-400c-979c-485ad113f2f4`). 485 / 485 passed in 2.07s, 0 failures, 0 skipped.

Important caveat — this **does not** falsify the bug above. The DB-touching modules are tested with their dependencies mocked:

- `src/__tests__/db.test.ts` uses `vi.mock("@neondatabase/serverless", () => ({ neon: neonMock }))`, where `neonMock` returns a stub function. The test only asserts singleton behavior; it never calls `sql.query(...)`.
- `src/lib/__tests__/queries.test.ts` only exercises the `buildXxx` SQL builders — it asserts the generated SQL strings + parameter arrays, never executes `run()`.
- The API route tests (`src/app/api/*/__tests__/route.test.ts`) mock `@/lib/queries` entirely (`vi.mock('@/lib/queries', ...)`), so the broken `run()` function is never called.

Net: the suite is internally consistent and catches changes inside each module, but no test in the codebase actually exercises the real `@neondatabase/serverless` API. That gap is exactly what this stage exists to surface.

**Result.** Pass (the tests pass), but recorded for context — the suite would still pass even with the runtime DB bug present, which is why chunk QA missed it.

### 13. `.gitignore` and `.env*` hygiene

**What I verified.** `.gitignore` includes `.env`, `.env.*`, `.env.local`, `.env.production`, and the negation `!.env.example` so the template file is committed. `git ls-tree HEAD -- .env` returns nothing (the real file is not committed); `.env.example` is committed with placeholder values only (`REPLACE_ME` for the secrets, no real tokens). Matches QA plan §14.1.d.

**Result.** Pass.

### 14. No client component reads `process.env.*`

**What I verified.** `grep -rn "process.env" src/` returns 11 hits across `src/app/api/...`, `src/lib/...`, `src/app/page.tsx`, and `src/app/dashboard/page.tsx`. The only `process.env` reads in `src/app/*` are inside server components (no `'use client'` directive) and route handlers. `grep` for "use client" components that also reference `process.env` returned zero results. Matches QA plan §14.1.a / §14.1.b.

I did not run the additional dashboard-HTML grep for env values (§14.1.b inner check) because the dashboard cannot render due to the DB bug. Once #2 is fixed, that check should be re-run, but the structural argument (no client component imports the env-reading modules) is already strong.

**Result.** Pass.

### 15. Cron bearer uses `crypto.timingSafeEqual` over equal-length buffers

**What I verified.** `src/app/api/cron/run/route.ts:28-35` SHA-256 hashes both `provided` and `expected` to 32-byte digests before passing them to `crypto.timingSafeEqual`. This avoids the length-leak that a raw `Buffer.from(string)` comparison would have. The function returns `false` on mismatch without short-circuiting on character index. Matches QA plan §14.2 / §16.4.

**Result.** Pass.

### 16. README + cron docs + chunk QA internal consistency

**What I verified.** Already covered by Chunk 31's QA report. Re-skimmed the README, `.env.example`, `scripts/cron.mjs`, and the cron snippets — none of them depend on the broken DB layer, and all of them are internally consistent. The README's setup walkthrough is correct in shape (the steps are the right steps) but will fail in execution because step 3 (`npm run db:migrate`) hits the bug in #3.

**Result.** Pass (documentation is internally consistent; the bug is in the code paths the documentation tells the user to invoke).

## Out of scope / not re-verified

Per the Stage 5 instructions, chunk-scoped scenarios are trusted unless there's reason to suspect a regression. Chunk-scoped scenarios I did **not** re-run here:

- Parser unit tests (§3.1–§3.5) — chunk 8 QA verified.
- Metrics tests (§8.1–§8.9) — chunk 15 QA verified.
- Orchestrator tests (§7.1–§7.8) — chunk 16 QA verified at the unit level. Note that at runtime the orchestrator will fail when it tries to persist runs/citations through the broken `run()` helper — that's a downstream effect of #2, not a separate bug.
- Per-chunk UI tests (§12.1–§12.7) — chunks 23–28 QA verified at the component level.
- Cron auth tests (§10.1–§10.7) — chunk 22 QA verified.

If the fix-cycle stage modifies code in any of these areas while fixing #2, the affected chunk's QA scenarios should be re-run.

## Recommended fix scope (for the fix cycle)

Single root cause for nine of the eleven fails:

- Replace every `sql.query(stringSql, params)` call with `sql(stringSql, params)`. Six call sites:
  - `src/lib/queries.ts:102` (the central `run()` helper — fixes all queries.ts consumers).
  - `src/lib/queries.ts:805` (the `runMigration()` helper).
  - `src/app/api/onboarding/complete/route.ts:88, 107, 122`.
  - `scripts/migrate.ts:23`.

Two additional independent TypeScript errors that block the production build:

- `src/components/ui/Tabs.tsx:12` — fix the `TabsProps<T>` generic so it extends `HTMLAttributes<HTMLDivElement>` correctly.
- `src/lib/llm/__tests__/google-aio.test.ts:164` — extend the fixture object with the missing `type`, `title`, `source` fields. Test-file only, does not affect runtime, but `next build`'s type check still flags it.

Once all eight TypeScript errors are resolved, the fix cycle should re-run:

- `next build` — to confirm the type check passes.
- `npm run db:migrate` against a Neon branch — to confirm the schema applies.
- The Playwright onboarding suite — to confirm the full flow renders end-to-end.

Overall: fail
