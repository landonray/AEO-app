# Chunk 22 QA — Cron route and cron script

## Scope
This QA covers only Chunk 22 — the `POST /api/cron/run` route handler and the `scripts/cron.mjs` runner. The scenarios verified come from §10 (Cron / Scheduling) and §14.2 (Cron bearer constant-time comparison) of the refined QA plan.

Files in scope:
- `src/app/api/cron/run/route.ts`
- `scripts/cron.mjs`

Test files used for verification:
- `src/app/api/cron/run/__tests__/route.test.ts`
- `scripts/__tests__/cron.test.ts`

These tests were already in place on the chunk branch (they shipped with the implementation). I did not write new tests — I executed them against the implementation under test, plus did a manual code-review pass on each scenario.

## Summary

| # | Scenario | Result |
|---|---|---|
| §10.1.a | Correct bearer returns 200 | pass |
| §10.1.b | Missing Authorization header returns 401 with empty body | pass |
| §10.1.c | Wrong bearer returns 401 with empty body (same-length and different-length cases) | pass |
| §10.1 (extra) | Non-Bearer scheme (e.g. `Basic …`) rejected with 401 | pass |
| §10.2 | Loads only active prompts of the primary brand (and its competitors) | pass |
| §10.3 | Returns `{ ok, batchId, totalRuns, totalErrors }` | pass |
| §10.4 | Per-call failures inside the batch still return 200 with non-zero `totalErrors` | pass |
| §10.5 | Internal failures (DB unreachable / missing config / missing primary brand) return 500 | pass |
| §10.6.a | `cron.mjs` exits 1 with a clear error when `CRON_SECRET` is missing | pass |
| §10.6.b | `cron.mjs` exits 0 on 2xx and logs `batchId` / `totalRuns` / `totalErrors` | pass |
| §10.6.c | `cron.mjs` exits 1 on non-2xx (500 and 401 both covered) | pass |
| §10.6.d | `cron.mjs` hits the env-configured port and posts to `/api/cron/run` | pass |
| §10.6 (extra) | `cron.mjs` exits 1 cleanly when the server is unreachable | pass |
| §14.2 / §10.1.d | Bearer comparison uses `crypto.timingSafeEqual` (constant-time, no `===` short-circuit on the secret) | pass |

Overall result of the automated test run: **19 passed / 0 failed / 0 skipped** (vitest, run via `mc_run_tests`, duration ~1.2s, run id `c4d0f63d-cac6-49f1-936e-106552f4c3f3`).

---

## Per-scenario detail

### §10.1 — Bearer auth

**What was verified:** Three branches of the auth logic in the route handler.

- The correct bearer (`Authorization: Bearer <CRON_SECRET>`) lets the request through and returns 200.
- A missing `Authorization` header returns 401 with an empty body, and the orchestrator (`runBatch`) is never invoked.
- A wrong bearer of the same length returns 401 with empty body and does not invoke `runBatch`.
- A wrong bearer of a *different* length still returns 401 with empty body and does not crash (this is the case a naive `timingSafeEqual` over raw buffers would throw on — see §14.2 below).
- An `Authorization` header that uses a non-Bearer scheme (e.g. `Basic …`) is rejected with 401 before it ever reaches the constant-time compare.

**Result:** pass.

**Notes:** The empty-body invariant on 401 is honored — the handler returns `new NextResponse(null, { status: 401 })`, so the body is genuinely empty (not a JSON `{}`).

---

### §10.1.d / §14.2 — Constant-time comparison

**What was verified:** The cron route's secret comparison uses `crypto.timingSafeEqual` rather than a plain `===` or `Buffer.equals`. A structural test reads the route source and asserts:
- `timingSafeEqual` appears in the source.
- No `secret === provided` or `provided === secret` short-circuit exists for the secret comparison.

The implementation SHA-256 hashes both sides before comparing, which means `timingSafeEqual` always sees two 32-byte buffers. This avoids both the length leak you would get from a raw `Buffer.from(a).equals(Buffer.from(b))` and the runtime crash you get from `timingSafeEqual` on unequal-length buffers. That is exactly the constant-time pattern §14.2 calls for.

**Result:** pass.

---

### §10.2 — Loads only active prompts of the primary brand

**What was verified:** With the queries layer mocked, the route was called with the correct bearer and the mock interactions inspected:
- `getPrimaryBrand` is called once (no brand id parameter, since the route picks the primary).
- `listActivePrompts` is called once with the primary brand's id.
- `listCompetitors` is called once with the primary brand's id.
- The arguments passed to `runBatch` are exactly the active prompts of the primary brand (id + text), the primary brand's name/domain, and that brand's competitors' name/domain — no archived prompts, no second-brand prompts.

The route relies on `listActivePrompts(brandId)` to enforce active-only and brand scoping; we trust that query (it was QA'd in an earlier chunk). What this chunk's QA proves is that the route uses that query correctly and does not bypass it.

**Result:** pass.

---

### §10.3 — Returns batch summary

**What was verified:** With a successful `runBatch` returning `{ batchId, totalRuns: 15, totalErrors: 0, ... }`, the route's JSON response body is exactly `{ ok: true, batchId: 'batch-abc-123', totalRuns: 15, totalErrors: 0 }`. No `runTotalCost` is included in the cron payload (the spec for chunk 22 says the cron response is just those four keys; cost surfaces through other endpoints).

**Result:** pass.

---

### §10.4 — Per-call failures stay 200

**What was verified:** `runBatch` is allowed to resolve with `totalErrors > 0` (per-call failures are caught inside the orchestrator and reported in the batch summary). The route surfaces that count in the response body and **still returns HTTP 200**, not 5xx. Tested with `totalRuns: 12, totalErrors: 3` — response was 200 and the body matched `{ ok: true, batchId, totalRuns: 12, totalErrors: 3 }`.

**Result:** pass.

---

### §10.5 — Internal failures return 5xx

**What was verified:** Four distinct internal-failure paths all return 500:

1. `getPrimaryBrand` rejects (simulated `connect ECONNREFUSED`, modeling a DB outage) → 500.
2. `listActivePrompts` rejects (simulated `relation does not exist`, modeling a schema problem) → 500.
3. `CRON_SECRET` is not set in the environment → 500 (the route logs the misconfiguration before responding). Note: this differs from a wrong bearer (which is 401); a missing server-side secret is a server config error, not an auth error.
4. No primary brand exists in the DB (`getPrimaryBrand` resolves to `null`) → 500, and `runBatch` is never called.

All four log via `console.error` (a spy confirmed at least the first case).

**Result:** pass.

**Note for the reviewer:** The QA plan describes §10.5 as "DB connection failure → 5xx". The route generalizes that to "any internal failure after auth → 500". I treat the broader behavior as a superset of the requirement, which is correct.

---

### §10.6 — `scripts/cron.mjs`

**What was verified:** The cron script is spawned as a real child process against a stub HTTP server bound to a random port; the script's exit code, stdout, stderr, and the request the stub received are inspected. Subscenarios:

- **10.6.a** — With `CRON_SECRET` absent from the env, the script exits with code 1 and stderr contains the string `CRON_SECRET`. (Fail-fast on missing secret.)
- **10.6.b** — With `CRON_SECRET` set and the stub returning `{ ok: true, batchId: 'batch-XYZ', totalRuns: 9, totalErrors: 2 }`, the script exits 0 and stdout contains `batchId=batch-XYZ`, `totalRuns=9`, `totalErrors=2`. The stub received exactly one request: `POST /api/cron/run` with `Authorization: Bearer secret-value`.
- **10.6.c** — Two cases. With the stub returning HTTP 500, the script exits 1 and stderr contains `500`. With the stub returning HTTP 401 (empty body), the script exits 1 and stderr contains `401`.
- **10.6.d** — The script targets the `PORT` env var. Verified by running the stub on a random port, setting `PORT` to that, and confirming the request landed on `/api/cron/run` on that port.
- **Extra** — When the server is unreachable (we bind a port and then close it before invoking the script), the script exits 1 with a non-empty stderr message rather than crashing or hanging.

**Result:** pass.

**Note:** The script does fail closed in several ways the spec did not explicitly enumerate (e.g. connection refused → exit 1; JSON parse failure on the response → exit 1). I treat that as additional defensive behavior consistent with the §10.6 spirit.

---

## Test run details

Framework: vitest
Run via: `mc_run_tests` against `b6afbe26-ca55-4af8-ad59-bc6f027e3027` / cwd `/Users/landonray/Coding Projects/AEO-app/.claude/worktrees/pipeline-aeo-app-2245556e/chunks/22-cronro`
Patterns: `src/app/api/cron/run/__tests__/route.test.ts`, `scripts/__tests__/cron.test.ts`
Outcome: 19 passed / 0 failed / 0 skipped, exit 0, ~1.2s

---

## Risks / things explicitly out of scope for this chunk

- **§10.7 concurrency** ("two cron runs at once") is in the §10 area but is not listed in Chunk 22's scope. Not verified here; the integration-QA stage at the end of the pipeline owns it.
- **Real orchestrator behavior.** The route tests mock `runBatch`. The orchestrator's own per-call failure isolation, sequential ordering, and citation persistence are owned by Chunk 16's QA — this chunk only verifies that the route calls `runBatch` correctly and surfaces its summary.
- **Real `listActivePrompts` / `getPrimaryBrand` queries.** These are mocked in the route tests; the queries themselves were QA'd in an earlier chunk. This chunk only verifies the route uses them with the right arguments and respects their return values.

No implementation bugs were found. The chunk is in a green state.

Overall: pass
