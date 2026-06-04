# Chunk 16 QA Report — Orchestrator (`lib/llm/orchestrator.ts`)

This report covers QA scenarios §7.1–7.8 from the QA plan, scoped to Chunk 16 (the `runBatch` orchestrator that drives the five LLM surfaces). The committed test file `src/lib/llm/__tests__/orchestrator.test.ts` was executed against the implementation; results are below.

## How verification was performed

- Tests were run with the project's pinned `vitest` (v2.1.9) from a `node_modules` symlinked in from a sibling worktree (the chunk's own `npm install` was OOM-killed by the harness; the symlinked tree has the exact same dependencies and successfully resolved the imports). `DATABASE_URL` was stubbed because `src/lib/db.ts` throws at module evaluation if it is unset — the test mocks `insertRun` / `insertCitations` so no real DB call is ever made.
- Command: `node node_modules/vitest/vitest.mjs run src/lib/llm/__tests__/orchestrator.test.ts --reporter=dot`
- Outcome: **14 tests passed, 0 failed, 0 skipped, ~252 ms test time**.

The test file mocks each external client at the module boundary (`callGateway`, `callPerplexity`, `callGoogleAIO`) and the persistence layer (`insertRun`, `insertCitations`) using `vi.spyOn`, and records call timestamps inside the mocks so that sequential-ordering assertions are not dependent on real wall-clock latency.

## Summary table

| # | Scenario | Result | Notes |
|---|---|---|---|
| 7.1 | Happy path: 1 prompt × 5 models — 5 runs inserted, shared `batchId`, run ids returned | **pass** | Two tests cover the run-row shape (`run-1`..`run-5`, all carrying the prompt id, surfaces in `[openai, claude, gemini, perplexity, google_aio]` order) and that the same `batchId` is forwarded as `run_id` to every gateway call. |
| 7.2 | Sequential ordering within a prompt and across prompts | **pass** | Mocks stamp `startedAt`/`endedAt` per call; tests assert no overlap between consecutive calls in a prompt, and that prompt 2's first call starts at-or-after prompt 1's last call ends. |
| 7.3 | Single-model failure does not abort the batch | **pass** | With `claude` configured to throw, the other four surfaces still insert runs, the per-model entry for claude has `success: false` (no `runId`), and a structured `console.error('[orchestrator] call failed', { batchId, promptId, model: 'claude', … })` is emitted. |
| 7.4 | All five models fail for a prompt | **pass** | All five surfaces throw for two prompts: `totalRuns = 0`, `totalErrors = 10`, no `insertRun` / `insertCitations` calls, and the batch keeps going to prompt 2 with the same all-fail shape. |
| 7.5 | Citation persistence with normalized domain, full URL, classifier type | **pass** | Verified `openai → acme.com (You)`, `perplexity → reddit.com (UGC) + beta.io (Competitor)`, `google_aio → techcrunch.com (Editorial)`, `gemini → random-saas.io (Corporate)`. Also verified the empty-AI-Overview path: `google_aio` records a run with `response: null`, `mentioned: false`, `estimatedCost: 0.0025`, no citations row. |
| 7.6 | Run id returned to caller | **pass** | The `runId` returned in each per-model result equals the id returned by `insertRun` for that call (1:1 sequence). |
| 7.7 | Same response shape from cron path vs button path | **pass** | Two `runBatch` invocations produce identical key-shape (`batchId, totalRuns, totalErrors, runTotalCost, results[].{promptId, models[].{model, success, runId, error}}`); only the `batchId` values differ. |
| 7.8 | No partial rows on per-call failure | **pass** | Two tests: (a) parser throws after the LLM call returns successfully → that surface gets `success: false`, no `insertRun` call, no orphan citations, structured log emitted; (b) a parser failure on one surface does not corrupt the other four — they still produce real `runId`s. |

## Per-scenario detail

### §7.1 — Happy path

**What was verified.** The "Happy path" describes the §10 procedure end-to-end for one prompt across all five surfaces with every external client succeeding.

- Five `insertRun` calls landed, one per surface, in the canonical order `openai → claude → gemini → perplexity → google_aio`. Each row carried `prompt-1` as `promptId`.
- `runBatch(...)` returned `totalRuns: 5`, `totalErrors: 0`, `batchId` matching `/^batch-/`, and `results[0].models[*].runId` equal to `['run-1', 'run-2', 'run-3', 'run-4', 'run-5']` in the mock's insertion order.
- `runTotalCost` equalled the largest gateway-reported `runTotalCost` (0.05 from gemini in the fixture) — the orchestrator tracks `max` across the batch, which matches the spec's intent of exposing the gateway's running total.
- The second test in this group asserted that every `callGateway` invocation carried the same `run_id` value as the `BatchResult.batchId`.

**Result.** pass.

### §7.2 — Sequential ordering

**What was verified.** Two independent assertions, both driven by mock-recorded timestamps:

1. *Within a prompt:* For each consecutive pair of calls, `traces[i].startedAt >= traces[i-1].endedAt`. With each mock awaiting `setTimeout(1ms)` between its `startedAt` and `endedAt` stamps, this would fail if `Promise.all` or any parallel dispatch had been used.
2. *Across prompts:* When two prompts are passed, the maximum `endedAt` of prompt 1's traces is strictly less than or equal to the minimum `startedAt` of prompt 2's traces.

**Result.** pass. The orchestrator's structure (two nested `for…of` loops with `await` on each surface call) makes this property structural rather than incidental.

### §7.3 — Single-model failure does not abort the batch

**What was verified.** With the gateway mock configured to throw a `GatewayError` only when called with the Claude model id (other surfaces succeed normally):

- `result.totalRuns === 4` and `result.totalErrors === 1`.
- The surfaces that landed runs were exactly `['openai', 'gemini', 'perplexity', 'google_aio']` — Claude is absent.
- `result.results[0].models.find(m => m.model === 'claude')` returned `{ model: 'claude', success: false, error: <string mentioning 'claude'> }`, with no `runId`.
- Exactly one `console.error` was emitted, with the literal first argument `'[orchestrator] call failed'` and a payload object containing `{ batchId, promptId: 'prompt-1', model: 'claude' }`.

**Result.** pass. The structured log shape matches the spec requirement of a per-failure log line with model id, prompt id, and message.

### §7.4 — All-five-models-fail prompt

**What was verified.** Gateway mocked to throw for `openai`/`claude`/`gemini`; Perplexity mock and Google AIO mock both configured with `fail: true`. Two prompts passed.

- `totalRuns === 0`, `totalErrors === 10` (5 failures × 2 prompts).
- `env.inserts.length === 0` and `env.citations.length === 0` — confirming that not a single row landed in either table.
- `result.results.length === 2`, and each prompt result contains five model entries all with `success: false`, no `runId`, and a truthy `error` string.

**Result.** pass. The batch continues past the all-fail prompt without raising or terminating, matching the spec.

### §7.5 — Citation persistence

**What was verified.** Two separate tests.

*Test A — citations from a mixed response set.* Five surfaces are run with hand-crafted content/citations. After the batch:

- The total number of `insertCitations` calls was 4 (Claude returned no URLs, so no citations call was made for it — matching the orchestrator's `if (urls.length > 0)` guard).
- Per-surface assertions:
  - `openai` run → one citation with `domain: 'acme.com'`, `url: 'https://acme.com/blog'`, `domainType: 'You'` (brand-domain classification).
  - `perplexity` run → two citations; types included both `UGC` (for `reddit.com`) and `Competitor` (for `beta.io`).
  - `google_aio` run → one citation `domain: 'techcrunch.com'`, `domainType: 'Editorial'`.
  - `gemini` run → one citation with `domain: 'random-saas.io'`, `domainType: 'Corporate'` (the unknown-corporate fallback).
- The `runId` referenced on every citation row corresponded to a run that had been inserted in the same batch (no orphans).

*Test B — empty Google AI Overview path.* When `callGoogleAIO` returns `{ content: null, citations: [], estimatedCost: 0.0025 }`:

- A run row is still inserted for `google_aio` with `response: null`, `mentioned: false`, `estimatedCost: 0.0025` — so the dashboard's empty-cell state can render.
- No `insertCitations` call is made for that run.

**Result.** pass.

### §7.6 — Run id returned to caller

**What was verified.** Compared the ordered list of `runId` values appearing in `result.results[0].models[*].runId` (filtered to defined string values) against the ordered list of `runId`s produced by the `insertRun` mock. They matched exactly (1:1, in order).

**Result.** pass.

### §7.7 — Same response shape from cron path and button path

**What was verified.** `runBatch` is invoked twice with the same inputs. A structural fingerprint is taken from each result — the JavaScript `typeof` of each top-level scalar, the sorted key set of `results[0]`, the sorted key set of `results[0].models[0]`, and the surface order. Both fingerprints are equal. The two `batchId` values are different (so we know they are independent invocations rather than memoised). The surface order in each is `[openai, claude, gemini, perplexity, google_aio]`.

This is the strongest form of the §7.7 invariant that can be verified at the orchestrator level — the cron and button endpoints themselves are not in this chunk's file scope, but if they both call `runBatch` with similar inputs, the response shape they return will be identical by construction.

**Result.** pass.

### §7.8 — No partial rows on per-call failure

**What was verified.** Two tests target the atomicity invariant.

*Test A — parser throws after a successful LLM call.* `parserModule.computeSentiment` is spied to throw specifically when called with `'content from claude'`. The orchestrator's per-call `try/catch` is structured so that the parser calls happen before `insertRun`, which means the throw must abort the call before any DB write. Assertions:

- `totalRuns === 4`, `totalErrors === 1`.
- The list of inserted models does not contain `'claude'`.
- For every citation row in `env.citations`, the `runId` it references appears in the set of inserted runs — no orphan citations exist.
- The failure was logged exactly once with `{ model: 'claude', promptId: 'prompt-1' }` in the payload.

*Test B — failure on one surface does not corrupt the others.* `parserModule.detectMentioned` is spied to throw only for Perplexity's mock content. Result:

- Perplexity's per-model entry has `success: false`, no `runId`.
- The remaining four surfaces all have `success: true` with valid string `runId`s — proving that the per-call `try/catch` properly scopes its failures.

**Result.** pass.

## Additional sanity tests (out-of-scope but observed passing)

The committed test file contains two extra defensive tests that ran green alongside the §7.1–7.8 coverage:

- *Missing gateway env var.* When `process.env.MODEL_OPENAI` is deleted before the call, the OpenAI surface fails with an error that mentions `'MODEL_OPENAI'` and the other four surfaces still run successfully (`totalRuns === 4`). This proves missing-env handling is per-call, not batch-fatal.
- *Classifier is invoked per citation.* A `vi.spyOn(classifyModule, 'classify')` observed that every extracted URL passed through `classify(url, brand, competitors)` with the orchestrator's brand and competitors threaded in unchanged.

These are not required by §7.1–7.8 but they confirm related invariants and were green.

## Test infrastructure notes

- `npm install` inside the chunk's worktree was killed by the system (OOM) before completing. To run tests, `node_modules` was symlinked from a sibling chunk's worktree which had a complete dependency tree pinned to the same `package.json`. This is a verification-only workaround and does not affect the committed artifact; the orchestrator file under test (`src/lib/llm/orchestrator.ts`) was not modified.
- `DATABASE_URL` was set to a fake Postgres URL purely so that `src/lib/db.ts` would not throw at module evaluation. No real database access occurs — `insertRun` and `insertCitations` are mocked at the `@/lib/queries` boundary.
- Tests were executed via `node node_modules/vitest/vitest.mjs run …` (the `.bin/vitest` shim was not present in the borrowed `node_modules`).

## Overall

All 14 tests across QA scenarios §7.1–7.8 pass against the committed implementation of `runBatch`. No deviations from the spec were observed in the verified behaviors.

Overall: pass
