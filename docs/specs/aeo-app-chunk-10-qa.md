# Chunk 10 QA Report — Perplexity Client (re-verification after fix iteration 3)

## Scope

This chunk adds the Perplexity LLM client at `src/lib/llm/perplexity.ts` plus its co-located test file at `src/lib/llm/__tests__/perplexity.test.ts`. The client is one of the five model surfaces the orchestrator (later chunk) will fan out to. It is responsible for: making the HTTPS call to `api.perplexity.ai/chat/completions`, reading assistant text from the standard OpenAI `choices[0].message.content` shape (NOT the gateway-only top-level `content`), extracting citations with a documented fallback chain, surfacing non-2xx / missing-key / timeout / network failures as a typed `PerplexityError` tagged with `source: "perplexity"` so the orchestrator can log-and-skip per the §17 single-model-failure rule, and enforcing a 60-second per-call timeout per §10.

This is the third re-verification pass. I re-read both files end to end, re-ran the full chunk test suite via Mission Control against the worktree path, and re-walked the QA-plan §5 scenarios. No source files were modified between iteration 2 and iteration 3 (working tree is clean, no new commits on the branch since the prior QA report), so the verdict is being re-issued from a re-checked rather than freshly-changed baseline.

## Summary

| Scenario | What was checked | Result |
|---|---|---|
| Test suite executes cleanly | `mc_run_tests` against `src/lib/llm/__tests__/perplexity.test.ts` — 12 passed, 0 failed, 0 skipped, ~1s | pass |
| §5.1 Request shape — endpoint | POST to `https://api.perplexity.ai/chat/completions` | pass |
| §5.1 Request shape — bearer auth | `Authorization: Bearer ${PERPLEXITY_API_KEY}` header set | pass |
| §5.1 Request shape — body fields | `model: 'sonar-pro'`, `max_tokens: 2000`, `temperature: 0.3`, `messages: [{role:'user', content:<prompt>}]` | pass |
| §5.1 Request shape — model env override | `MODEL_PERPLEXITY=sonar` overrides default | pass |
| §5.2 Response parsing — reads `choices[0].message.content` | Top-level `content` is ignored when both are present; standard OpenAI shape used | pass |
| §5.2 Response parsing — graceful empty | Missing/empty `choices` returns `content: ""` rather than throwing | pass |
| §5.3.a Citations — uses top-level `citations[]` when present | `citations` array returned verbatim; `search_results` ignored when both present | pass |
| §5.3.b Citations — falls back to `search_results[].url` | When `citations` absent, urls are mapped from `search_results` | pass |
| §5.3.c Citations — neither field → empty array | Returns `citations: []`; run still produces a content string | pass |
| §5.3 Citations — filters non-string / empty entries | `["url", "", null, 42, "url2"]` → `["url", "url2"]` | pass |
| §5.3 Citations — empty `citations[]` triggers fallback | `citations: []` falls back to `search_results[].url` rather than returning empty | pass |
| §5.5 Non-2xx error — 500 | Throws `PerplexityError` with `name: "PerplexityError"`, `source: "perplexity"`, `status: 500` | pass |
| §5.5 Non-2xx error — 401 | Throws `PerplexityError` carrying `status: 401`; `instanceof` check passes | pass |
| §5.5 Missing API key | `delete process.env.PERPLEXITY_API_KEY` causes the client to throw `PerplexityError` before any fetch | pass |
| Per-call 60s timeout (§10) | Uses `AbortController` + `setTimeout(60_000)`; `AbortError` is wrapped as `PerplexityError("Perplexity request timed out after 60000ms")`; `clearTimeout` runs on every exit path | pass (code review; no fake-timer assertion) |
| Network/fetch-level errors | Non-Abort fetch failures are wrapped as `PerplexityError` and the original error is preserved via `cause` | pass (code review) |
| No secrets in error messages | `PerplexityError` messages are built from status, upstream body, and fixed templates only — the bearer token is never interpolated into thrown messages | pass (code review) |

## Scenarios in detail

### Suite execution

Mission Control's `mc_run_tests` ran the chunk's vitest file directly against the worktree, with the project ID for AEO-app and `cwd` set to the worktree path. Result: **12 passed, 0 failed, 0 skipped**, ~1 second wall time, exit code 0. No console noise, no unhandled rejections, no flakes. I scoped the run to `src/lib/llm/__tests__/perplexity.test.ts` rather than the full suite because the other chunks in this worktree are out of scope for this report and pulling them in would only obscure signal. The same run idiom is what later orchestrator chunks will use.

### §5.1 — Request shape

The client constructs a single `fetch` call to `https://api.perplexity.ai/chat/completions` with:

- `method: "POST"`
- `Authorization: Bearer ${process.env.PERPLEXITY_API_KEY}`
- `Content-Type: application/json`
- Body containing `model`, `messages: [{ role: "user", content: <promptText> }]`, `max_tokens: 2000`, `temperature: 0.3`.

The model defaults to `sonar-pro` and is overridable via `MODEL_PERPLEXITY`. Both behaviors are individually asserted. The body matches the spec verbatim (§5.1 in the QA plan, §10 in the refined spec). The `messages` array uses the OpenAI-style chat-completion shape, not a streaming or system-message variant.

Result: **pass**.

### §5.2 — Response parsing

The client reads `parsed?.choices?.[0]?.message?.content` and coerces a non-string value to `""`. Critically, it does **not** read the top-level `content` field — the QA plan explicitly calls that out as the gateway-only shape that must not leak into the Perplexity surface. The test that proves this seeds a fixture where both `content: "this-is-wrong-gateway-shape"` and `choices[0].message.content: "Acme is widely regarded as the leader."` are present; the client returns the latter, so a future regression that flipped the read order would fail this test loudly.

The "missing choices" case returns `content: ""` rather than throwing. This is the right call for the orchestrator: an empty assistant string is a valid "no answer" state, distinct from a transport error.

Result: **pass**.

### §5.3 — Citations fallback chain

`extractCitations()` implements the three-step fallback:

1. If `body.citations` is a non-empty array, filter to non-empty strings and return.
2. Else, if `body.search_results` is an array, map to `entry.url` and filter to non-empty strings.
3. Else, return `[]`.

All three branches are tested directly (5.3.a / 5.3.b / 5.3.c). Two extra tests harden the fallback against real-world API drift: junk values inside `citations[]` (numbers, nulls, empty strings) are filtered out, and an *empty* `citations: []` is treated the same as missing for fallback purposes — so the client still surfaces `search_results` URLs when Perplexity returns the citations key but leaves it empty. The "neither field present" case still returns a result with a valid content string and an empty citations array, which is the shape the orchestrator needs to record the run with `mentioned = false` (§5.3.c / §17 case 13.11).

Result: **pass**.

### §5.5 — Non-2xx response and missing-key failure

A non-2xx response throws a `PerplexityError` with:

- `name: "PerplexityError"`
- `source: "perplexity"` (a `readonly` literal, tagged for the orchestrator's switch)
- `status: <upstream status>`
- `responseBody: <upstream body text>` when readable (the body-read is wrapped in its own try/catch so an unreadable body never masks the original status error).

Both the 500 and 401 cases are asserted; the 401 test also confirms `err instanceof PerplexityError`, which is how the orchestrator will branch in the catch handler. The missing-API-key case throws synchronously before any fetch is issued — important because it means a misconfigured environment fails fast with a clear message instead of producing a 401 round-trip and a misleading "auth failed" log.

The client also catches `AbortError` (from the 60s `AbortController` timeout) and any other `fetch`-level network error, wrapping both in `PerplexityError` so the orchestrator only ever has one error type to handle for this surface. The original error is preserved as `cause` for debug visibility without leaking it into the thrown message.

Result: **pass**.

### Per-call 60s timeout (§10)

The implementation creates an `AbortController` and a 60-second `setTimeout` that calls `controller.abort()`. On `AbortError`, it throws `PerplexityError("Perplexity request timed out after 60000ms")`. There is no fake-timer test for this in the chunk's suite, but the code path is short, deterministic, and uses the standard browser/Node fetch abort contract. I verified by code reading that the timer is always cleared in both the fetch-throws path (inside the `catch`) and the success path (immediately after the `try/catch` block), so the client cannot leak a pending timer regardless of whether fetch resolves, rejects, or times out.

Result: **pass** (code review; no failing assertion).

### No secrets in error messages

Code review only — the test suite does not specifically assert the bearer token's absence from thrown errors. However, the thrown `PerplexityError` messages are constructed from (a) the upstream status code, (b) the upstream response body, and (c) a fixed string template — none of which interpolate `apiKey`. The `Authorization` header is constructed inline at the `fetch` call and not stored, returned, or logged anywhere by this module. The orchestrator's later logging chunk will need its own redaction test, but this client does not leak the secret.

Result: **pass**.

## Notes for downstream chunks (not failures)

- The orchestrator chunk should treat any thrown `PerplexityError` as a single-model failure (log + skip), per §7.3. The error's `source: "perplexity"` literal tag is the discriminator.
- `estimated_cost` is intentionally **not** returned by this client. The Perplexity surface stores `NULL` for cost (§5.4); the orchestrator should pass `null` when persisting the row rather than expecting a number from this client.
- The `content: ""` (missing choices) case is a valid state, not an error. The orchestrator should still record a run with `mentioned = false` so the dashboard's empty-state cells render correctly (§13.11).
- Adding one more test that fakes the 60s timer and asserts the timeout-path message would close the only code-review-only gap in §5 of the QA plan. Not blocking for this chunk.

Overall: pass
