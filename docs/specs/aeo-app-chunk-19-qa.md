# Chunk 19 QA — Prompts API routes (iteration 2)

This report verifies QA-plan scenarios §11.4, §11.5, §11.6, §11.7, §11.8, and §13.16
against the four route handlers shipped in chunk 19:

- `src/app/api/prompts/route.ts` (GET list, POST create, DELETE archive)
- `src/app/api/prompts/metrics/route.ts` (GET per-prompt metrics)
- `src/app/api/prompts/run/route.ts` (POST single or batch run)
- `src/app/api/prompts/[id]/route.ts` (GET prompt detail)

Each scenario was verified with the route-level vitest suite shipped alongside the
implementation (`__tests__/route.test.ts` next to each route), with mocks at the
query and orchestrator boundaries so the route logic itself is exercised. The
focused chunk-19 run is 30/30 passing; the broader `src/lib` suite that the
routes depend on is 270/270 passing.

---

## Summary

| # | Scenario | Result |
|---|---|---|
| 11.4.a | `GET /api/prompts/metrics` — `sentiment` is `null` (never `55`) for prompts with zero mentioned runs in window | pass |
| 11.4.b | `prompts[].models` is the set of short ids with ≥ 1 run in window | pass |
| 11.4.c | `prompts[].activeRunCount` reflects the per-prompt run count | pass |
| 11.4.d | `days` and `model` filters are wired through correctly; `model=all` ⇒ no filter; bad `days` ⇒ default 7 | pass |
| 11.5.a | `POST /api/prompts/run` with `{ promptId }` runs only that prompt | pass |
| 11.5.b | `POST /api/prompts/run` with empty body runs all active prompts for the primary brand | pass |
| 11.5.c | Non-existent `promptId` (or prompt belonging to a different brand) returns 404 | pass |
| 11.5.d | Single-prompt run returns the same `BatchResult` shape as cron (includes `batchId`) | pass |
| 11.6.a | `GET /api/prompts/[id]` returns 404 for unknown id | pass |
| 11.6.b | Returns `{ prompt, runs (top 50), citations, modelBreakdown }`; `modelBreakdown` always has the 5 model rows | pass |
| 11.6.c | Models with no run in window get `mentioned = null` (not `false`) | pass |
| 11.6.d | `modelBreakdown[].latestResponsePreview` is the first 300 chars of the latest in-window run | pass |
| 11.6.e | `modelBreakdown[].citationCount` matches the citation count of that model's latest in-window run | pass |
| 11.6.f | `days` and `model` query params honored; defaults `days = 7`, `model = all` ⇒ undefined filter | pass |
| 11.7.a | `POST /api/prompts` with `{ text, topic }` creates the prompt and returns `{ id }` (201) | pass |
| 11.7.b | Missing/empty/whitespace `text` or `topic` returns 400 | pass |
| 11.7.c | New prompt is created against the primary brand (correct `brand_id`) | pass |
| 11.7.d | No primary brand ⇒ 409 (insert not attempted) | pass |
| 11.8.a | `DELETE /api/prompts` with `{ id }` archives (sets `is_active = false`) — does NOT hard-delete | pass |
| 11.8.b | Prior runs and citations are NOT removed (archive-only semantics) | pass |
| 11.8.c | Returns `{ ok: true }`; missing `id` ⇒ 400 | pass |
| 13.16 | `MODEL_GEMINI` deprecated/4xx — orchestrator logs and skips, batch continues with a per-model failure result | pass |

---

## Verified scenarios

### 11.4 GET /api/prompts/metrics

**What I verified.** Read `src/app/api/prompts/metrics/route.ts` and the route
test file. The route is implemented as: read primary brand → fetch the brand's
active prompts and the runs in the (days, model) window in parallel → group runs
by `promptId` → for each prompt compute `visibility`, `sentiment` (via
`computeAvgSentiment`, which is the §13.4 mentioned-only-or-null function),
`position` (`computeAvgPosition` over mentioned runs only), the set of models
seen, and `activeRunCount`.

**Result: pass.** The route tests cover the §13.4 invariant directly with two
cases — a prompt whose runs are all `mentioned: false` and a prompt with zero
runs in the window — both yield `sentiment: null`. A third case mixes mentioned
positive + mentioned negative + non-mentioned neutral and confirms the average
is `(80 + 30) / 2 = 55`, proving the non-mentioned run is excluded from the
mean. `models` is built from the union of `r.model` values and ordered against
the canonical short-id list; the test asserts the sorted list matches. The
`days`/`model` query parsing whitelists against the five canonical short ids
and falls back to 7 days on bad input — exercised by a test that sends
`?days=';--` and confirms the call still uses `days: 7`. SQL injection at the
parameter layer is impossible: the route never interpolates user strings into
SQL; it calls the typed `getRuns(...)` builder, which binds `days` and `model`
as parameters.

### 11.5 POST /api/prompts/run

**What I verified.** Read `src/app/api/prompts/run/route.ts` and the route
test file. The route reads `{ promptId? }` from the JSON body; on
no/empty/non-object body it falls through to "run all". If `promptId` is
supplied, it loads that prompt via `getPrompt(id)` and confirms
`prompt.brandId === primaryBrand.id`, returning 404 otherwise. Otherwise it
loads `listActivePrompts(brand.id)`. Competitors are fetched via
`listCompetitors(brand.id)`, then `runBatch(...)` from the chunk-16
orchestrator is invoked with the prompts, brand, and competitors. The
orchestrator's `BatchResult` shape — which always includes `batchId`,
`results`, `totalRuns`, `totalErrors`, `runTotalCost` — is forwarded verbatim
to the caller.

**Result: pass.** 11.5.a (single-prompt body), 11.5.b (empty body runs all
active), 11.5.c (non-existent id AND a "right id, wrong brand" id), and 11.5.d
(shape includes `batchId` even for single-prompt runs) are each pinned by a
dedicated test. The 404 for the wrong-brand case is the right call — without
it a caller could trigger arbitrary cross-brand runs. A "409 no primary brand"
path is also verified. The §18.5 default ("404 on non-existent promptId") and
§18.6 default ("single-prompt run still includes batchId") are both
implemented as proposed in the QA plan.

### 11.6 GET /api/prompts/[id]

**What I verified.** Read `src/app/api/prompts/[id]/route.ts` and the route
test file. The route resolves the prompt (404 if missing) and concurrently
fetches the 50 most recent runs (`getRunsForPrompt(id, 50)`) and the in-window
runs (`getRunsForPromptInWindow(id, days, model)`). Citations are loaded for
the top-50 runs via `getCitationsForRunIds`. For each of the five canonical
short ids the route picks the latest in-window run for that model (relying on
the DB query's `ORDER BY created_at DESC` to keep the first hit), produces the
`mentioned/position/sentiment/citationCount/latestResponsePreview` row, and
falls back to
`mentioned: null, position: null, sentiment: null, citationCount: 0, latestResponsePreview: ''`
when no in-window run exists. Citations for the response are shaped to
`{ domain, url, type, runId }`.

**Result: pass.** Tests cover the empty-model branch (`mentioned: null` for
the 4 untouched models), the "latest wins" tiebreaker (newer of two claude
rows is the one whose `position` surfaces), the 300-character truncation of
`latestResponsePreview` against a 500-character input, the top-50 runs +
citations shape, and the `citationCount` per-model arithmetic. The `days` and
`model` query params are forwarded to `getRunsForPromptInWindow` with the
correct defaults (`days = 7`, `model=all` ⇒ undefined). `modelBreakdown`
ordering matches the canonical short-id order (`openai`, `claude`, `gemini`,
`perplexity`, `google_aio`) — the test asserts the array length is 5 and
verifies the model identifiers in order.

### 11.7 POST /api/prompts

**What I verified.** Read `src/app/api/prompts/route.ts`. The POST handler
parses JSON, normalizes `text` and `topic` with `trimmedString`, and rejects
with 400 when either is missing, non-string, empty, or whitespace-only. When
both are present it loads the primary brand (409 if none) and calls
`insertPrompt(brand.id, { text, topic })`, returning `{ id }` with HTTP 201.

**Result: pass.** Tests cover all four 400 branches (no body, missing text,
missing topic, whitespace text), the 201 happy path (and assert that the
trimmed values are what got passed into `insertPrompt`), and the 409 when no
primary brand exists. Inserts are scoped to the primary brand by construction.

### 11.8 DELETE /api/prompts

**What I verified.** Read `src/app/api/prompts/route.ts` and
`src/lib/queries.ts`. DELETE parses `{ id }` and calls `archivePrompt(id)`,
returning `{ ok: true }`. `archivePrompt` issues
`UPDATE prompts SET is_active = false WHERE id = $1` — strictly an archive,
not a hard delete, so prior `runs` and `citations` rows are untouched.

**Result: pass.** Tests cover the 400 when `id` is missing and the success
path. The test name "archives (does NOT delete) and returns { ok: true }"
together with the SQL builder (read directly) confirms the §11.8 contract:
runs and citations are not removed.

### 13.16 MODEL_GEMINI preview id deprecated

**What I verified.** Read `src/lib/llm/orchestrator.ts`. The `runBatch`
function iterates the five model surfaces inside a per-call `try/catch`. A
failure increments `totalErrors`, emits a structured `console.error` with
`{ batchId, promptId, model, error }`, and pushes
`{ model, success: false, error }` onto the prompt's `models` array. No row
is inserted for the failed call. The next surface (and the next prompt)
continue. `POST /api/prompts/run` returns the orchestrator's `BatchResult`
verbatim, so a gemini 4xx surfaces to the caller as a per-model failure
without aborting the batch and without dropping the other four models' rows.

**Result: pass.** The orchestrator's per-call isolation is what §13.16
requires from the API surface in this chunk — a deprecated/4xx
`MODEL_GEMINI` becomes a logged, skipped, per-model error rather than a 5xx
for the whole request. Behaviorally identical for the cron path (chunk 18)
and the manual button path (this chunk). End-to-end DB-level confirmation
that the gemini row is absent while the other four are present is an
orchestrator-level scenario (chunk 16 QA covered the per-call failure-
isolation invariant via `runBatch` integration tests).

---

## Tests

I ran the focused route suite via `mc_run_tests`:

- `src/app/api/prompts/__tests__/route.test.ts`
- `src/app/api/prompts/metrics/__tests__/route.test.ts`
- `src/app/api/prompts/run/__tests__/route.test.ts`
- `src/app/api/prompts/[id]/__tests__/route.test.ts`

Result: **30 passed, 0 failed, 0 skipped** (855 ms).

I also re-ran the full `src/lib` suite (the route handlers' direct
dependencies — `queries`, `metrics`, `classify`, `parser`, `generators`,
`scraper`, `utils`): **270 passed, 0 failed** (1131 ms). No regressions in the
underlying libraries from the new chunk-19 query builders (`getPrompt`,
`getRunsForPrompt`, `getRunsForPromptInWindow`, `getCitationsForRunIds`,
`archivePrompt`, `insertPrompt`).

No scenarios were blocked. No fixes are required.

---

Overall: pass
