# Chunk 9 QA Report

**Pipeline:** AEO app
**Chunk:** LLM Gateway client (`src/lib/llm/gateway.ts`)
**QA plan section:** §4 (LLM Gateway Client)

## Summary

The chunk delivers the LLM Gateway client that the orchestrator and per-model wrappers will sit on top of. Implementation lives at `src/lib/llm/gateway.ts` and the test suite at `src/lib/llm/__tests__/gateway.test.ts`. All 20 unit tests pass under Vitest using `fetch` mocks and fake timers — no real network or gateway credentials are touched. Each scenario called out in §4 of the QA plan has direct coverage; nothing in §4 is missing.

The previous pre-flight failure (implementation written but uncommitted) has been resolved: commit `503b9e8` ("Chunk 9: LLM gateway client") contains both the source file and the test file, and `git status --porcelain` is empty.

**Overall: pass**

## Scenario-by-scenario verification

### §4.1 — Request shape matches gateway docs
**Status: pass.** The client POSTs to `${LLM_GATEWAY_BASE_URL}/chat/completions` with `Authorization: Bearer ${LLM_GATEWAY_API_KEY}` and `Content-Type: application/json`. The request body forwards `model`, `messages`, and (when supplied) `max_tokens`, `temperature`, `run_id`, `response_format`, `tools`, and `tool_choice`. Trailing slashes on the base URL are stripped before the path is appended, so a base URL like `.../api/v1/` and `.../api/v1` produce the same final URL. The body never contains a `stream` key — the test explicitly asserts `body.stream` is `undefined`, which matches the spec's requirement that the client does not use SSE. A second test confirms optional fields are omitted (not sent as `undefined`) when the caller does not supply them, and a third test confirms `tools` and `tool_choice` are forwarded verbatim when supplied. Three tests, all green.

### §4.2 — Response parsing reads top-level `content` (not `choices[0].message.content`)
**Status: pass.** The parser reads `content`, `estimated_cost`, `run_total_cost`, `finish_reason`, and `tool_calls` directly off the top-level response object and converts the cost fields to the camelCase shape (`estimatedCost`, `runTotalCost`). It does **not** look at `choices[]` at all. The test that proves this bakes a response that has an SSE-shaped `choices[0].message.content = "WRONG_PATH"` and **no** top-level `content`; the client correctly returns `content: null`, never reading from the streaming path. A third test confirms `tool_calls` is surfaced when present and the `finishReason` is `"tool_calls"`. Three tests, all green. This was the specific bug the spec flagged as "the streaming SSE path the spec explicitly calls out as wrong" — the client avoids it cleanly.

### §4.3 — `response_format` json_schema is passed through
**Status: pass.** Two tests cover this. The first calls `callGateway` directly with a full `response_format: { type: 'json_schema', json_schema: { name, strict, schema } }` and asserts the request body contains the structure verbatim. The second calls the higher-level `callGatewayJSON` helper with just a schema and a name, and asserts the helper wraps it correctly into the gateway's required shape (`type: 'json_schema'`, `strict: true`, `name` propagated). Both green.

### §4.4 — JSON-mode parse failure retries once with stricter system message
**Status: pass.** `callGatewayJSON` parses the first response's `content` with `JSON.parse`. On parse failure, it makes a **second** call with a `{ role: 'system', content: 'Return ONLY valid JSON matching the schema. No prose, no markdown.' }` message prepended to the original messages. The retry's system-message text is exported as a constant (`GATEWAY_JSON_RETRY_SYSTEM_MESSAGE`) and the test imports that same constant to verify the exact wording — so if the spec wording is ever changed in one place but not the other, the test will catch it. If the second call also returns unparseable content, a `GatewayJSONParseError` tagged with the model id is thrown. Three tests cover the happy retry, the double-failure path, and the no-retry-needed path. All green.

### §4.5 — Gateway HTTP 5xx surfaces typed error to orchestrator
**Status: pass.** Non-2xx responses throw a `GatewayError` with `status`, `model`, and the response body attached. The message contains the status code, the model id, and the response body (truncated to 1000 chars to avoid logging huge upstream dumps). Two tests cover this: a 500 with a text body and a 502 with an empty body — both throw and both carry the right status. Green.

### §4.6 — Per-call 60s timeout
**Status: pass.** The client wires an `AbortController` to the `fetch` call and sets a `setTimeout(() => controller.abort(), 60_000)`. On abort, it throws a `GatewayTimeoutError` tagged with the model id and the timeout value. The test uses Vitest fake timers, mocks `fetch` to return a promise that only rejects when the abort signal fires, then advances the clock 60 seconds and asserts the resulting rejection is a `GatewayTimeoutError` with the right model and `timeoutMs`. A second test confirms a prompt response does NOT trigger the timeout. Both green. The timeout constant (`GATEWAY_TIMEOUT_MS = 60_000`) is also exported for orchestrator-side consumption.

### §4.7 — No secrets in error messages or logs
**Status: pass.** All paths that include external text in a thrown error message route the text through a `scrubSecret` helper that replaces both bare occurrences of the API key and `Bearer <key>` substrings with `***`/`Bearer ***`. Three tests verify this: (1) an HTTP error body containing the literal API key — the thrown `GatewayError.message` and `responseBody` are asserted **not** to contain the key; (2) a network-level `fetch` failure whose message contains `Authorization: Bearer <key>` — the thrown error also does not contain the key; (3) a direct unit test of `scrubSecret` confirming both bare and Bearer-prefixed variants are scrubbed. All green. The helper's regex is properly escaped against regex metacharacters in the secret value, so an API key containing characters like `.` or `+` would still scrub correctly.

### Bonus coverage — environment validation
Not a §4 scenario, but the implementation throws clear errors at call time if `LLM_GATEWAY_BASE_URL` or `LLM_GATEWAY_API_KEY` is missing from the environment. Two extra tests cover this; both green. This is the right behavior for a server-side `lib/` module — failing fast at the first gateway call rather than at module load.

## Test execution

Ran `npx vitest run src/lib/llm/__tests__/gateway.test.ts` inside the worktree.

```
Test Files  1 passed (1)
     Tests  20 passed (20)
```

No test was skipped; no flaky behavior; total wall time well under a second. The suite mocks `fetch` and uses Vitest fake timers — nothing in the suite needs network, environment secrets, or a database.

## Code-quality observations

- **Clean exports.** Types (`GatewayMessage`, `CallGatewayOptions`, `CallGatewayResult`, `CallGatewayJSONOptions`, `CallGatewayJSONResult`), error classes (`GatewayError`, `GatewayTimeoutError`, `GatewayJSONParseError`), constants (`GATEWAY_TIMEOUT_MS`, `GATEWAY_JSON_RETRY_SYSTEM_MESSAGE`), the secret scrubber, and the two main entry points (`callGateway`, `callGatewayJSON`) are all exported. The orchestrator and per-model wrappers downstream will be able to discriminate on error type cleanly with `instanceof`.
- **Typed errors carry the right context.** `GatewayError` carries `model`, `status`, and `responseBody`; `GatewayTimeoutError` carries `model` and `timeoutMs`; `GatewayJSONParseError` carries `model` and the offending `content`. The orchestrator can log all of these without having to regex the message.
- **`scrubSecret` is correct.** It handles empty inputs, escapes regex metacharacters in the secret, and replaces both bare and `Bearer`-prefixed occurrences case-insensitively.
- **Timer cleanup.** The abort timer is cleared both on success and on fetch-throw paths, so we don't leak `setTimeout` handles into the event loop.
- **No backwards-compat cruft.** Code is tight; no dead branches, no commented-out blocks, no unnecessary defensive validation past the env-var requirement at the boundary.

## Things that are intentionally out of scope here (verified, not gaps)

- **Per-model wrappers** (OpenAI, Claude, Gemini, Perplexity, Google AIO) live in later chunks and are not in this chunk's diff. §4 only covers the underlying gateway client.
- **Orchestrator-level concerns** (run_id generation, sequential ordering across prompts, run-row persistence, cost rollup) are §7 and not §4. The gateway exposes the building blocks the orchestrator will need (`runTotalCost`, `estimatedCost`, `finishReason`, `toolCalls`) but does not own the orchestration loop.
- **Real fixtures captured from a live gateway call** are mentioned in §1 of the QA plan as a general principle but aren't a §4-specific test requirement. The unit tests here use hand-authored response shapes that match the gateway contract; once a real fixture is captured during integration testing of a later chunk, it can be added as a regression test without touching the client's surface.

## Risks / follow-ups for later chunks

- **Timeout granularity.** The 60s timeout is a single deadline covering connect + send + wait + receive. That matches the spec (§10). If a future requirement wants a separate connect timeout vs. read timeout, the abort wiring will need to grow.
- **JSON-retry strategy is fixed at "retry once."** §4.4 calls for exactly one retry; this is what's implemented. If we ever want a backoff or a second-strategy retry (e.g., model-swap on persistent JSON failure), that lives at the orchestrator layer, not here. Leaving it pure at this layer is the right call.
- **`scrubSecret` only scrubs the API key.** If other secrets (e.g., a future `LLM_GATEWAY_SIGNING_SECRET`) get added, the scrub list will need to be extended. Not a current bug — flagging in case the env surface widens.

## Verdict

All §4 scenarios are implemented, tested, and pass. The worktree is committed and clean. The chunk is ready for downstream chunks (per-model wrappers, orchestrator) to depend on this client.

**Overall: pass**
