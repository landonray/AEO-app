# Chunk 9 — LLM Gateway client — QA Report (after fix iteration 4)

**Branch:** `pipeline-aeo-app-2245556e-chunk-9-llmgat`
**Files under test:** `src/lib/llm/gateway.ts`, `src/lib/llm/__tests__/gateway.test.ts`
**Test runner:** vitest (via `mc_run_tests`)
**Result:** 20 passed / 0 failed / 0 skipped (1.137s)

## Method

The QA plan's §4 lists seven acceptance scenarios for the gateway client. Each
scenario was verified by reading the implementation in `src/lib/llm/gateway.ts`,
confirming the matching test cases in
`src/lib/llm/__tests__/gateway.test.ts`, and running the full test file. All
20 cases passed cleanly with no warnings.

## Scenario-by-scenario verification

### §4.1 — Request shape matches gateway docs (PASS)

- `callGateway` POSTs to `${LLM_GATEWAY_BASE_URL}/chat/completions` with the
  `Authorization: Bearer …` header and `Content-Type: application/json`.
- The body forwards `model`, `messages`, and the optional fields `max_tokens`,
  `temperature`, `run_id`, `response_format`, `tools`, and `tool_choice` only
  when supplied; no `stream` field is ever set.
- Tests confirm: the full-body case (all optionals present), the
  minimal-body case (only `model` + `messages`), and tool-call passthrough
  (`tools` + `tool_choice`).

### §4.2 — Response parsing reads top-level `content`, not `choices[…]` (PASS)

- `parseGatewayResponse` reads `content`, `estimated_cost`, `run_total_cost`,
  `finish_reason`, and `tool_calls` directly from the top-level response.
- A fixture shaped like an OpenAI streaming SSE payload (`choices[0].message.
  content = "WRONG_PATH"`) returns `content: null` from the client — the
  WRONG_PATH value is never surfaced.
- A `tool_calls` payload with `finish_reason: "tool_calls"` is surfaced
  verbatim on the result's `toolCalls` field.

### §4.3 — `response_format` json_schema passthrough (PASS)

- `callGateway` forwards a caller-supplied `response_format` object verbatim
  in the request body.
- `callGatewayJSON` wraps the caller's `schema` (and optional `schemaName`)
  in the documented `{ type: "json_schema", json_schema: { name, strict: true,
  schema } }` shape and sends it through `callGateway`.

### §4.4 — JSON parse failure retries once with stricter system message (PASS)

- When the first response's `content` is not valid JSON, `callGatewayJSON`
  retries exactly one more time, prepending the system message
  `GATEWAY_JSON_RETRY_SYSTEM_MESSAGE` ("Return ONLY valid JSON matching the
  schema. No prose, no markdown.") to the original message list and reusing
  the same `response_format`.
- A successful first parse does not trigger a retry (one fetch call).
- A second failure throws `GatewayJSONParseError` tagged with the model and
  the offending content, after exactly two fetch calls.

### §4.5 — HTTP 5xx surfaces typed error (PASS)

- A non-2xx response throws `GatewayError` carrying `status`, `model`, and the
  truncated, scrubbed response body. The error message includes the status
  code, the model name, and the body text — enough for the orchestrator to
  triage without silently swallowing the failure.
- Verified for both 500 (with body) and 502 (empty body).

### §4.6 — Per-call 60s timeout (PASS)

- `callGateway` wires an `AbortController` to a `setTimeout` of
  `GATEWAY_TIMEOUT_MS = 60_000`. When the timer fires, the controller aborts
  the in-flight fetch and the function throws `GatewayTimeoutError` carrying
  the model name and the timeout value.
- Verified via fake timers: a fetch that never resolves rejects with
  `GatewayTimeoutError` after exactly 60s of simulated time, and a prompt
  response does not trip the timer.

### §4.7 / §14.1.c — No secrets in error messages or logs (PASS)

- `scrubSecret` replaces both bare and `Bearer …`-prefixed occurrences of the
  API key with `***`.
- Bearer token is removed from: (a) the body text included in HTTP-error
  messages and the error's `responseBody` field; (b) the message of a fetch
  rejection (e.g. a thrown `network error while sending Authorization:
  Bearer <key>`).
- A direct unit test on `scrubSecret` confirms both replacement modes work
  in the same input.

## Environment validation (bonus, beyond §4)

- Missing `LLM_GATEWAY_BASE_URL` or `LLM_GATEWAY_API_KEY` causes
  `callGateway` to throw with an error naming the missing variable. Both
  cases are covered by tests.

## Test run

`mc_run_tests` against `src/lib/llm/__tests__/gateway.test.ts`:

- framework: vitest
- status: passed
- exitCode: 0
- totalPassed: 20
- totalFailed: 0
- totalSkipped: 0
- durationMs: 1137

## Notes for the orchestrator

- No regressions detected versus the prior iteration; all seven §4 scenarios
  remain green and the test suite continues to cover them with explicit,
  scenario-aligned cases.
- The worktree is clean; no untracked changes were introduced by this QA
  pass.

Overall: pass
