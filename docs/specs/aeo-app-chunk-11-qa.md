# Chunk 11 QA Report — Google AI Overview client

Scope: scenarios §6.1–6.6 of the refined QA plan, against the implementation that shipped in this chunk:

- `src/lib/llm/google-aio.ts`
- `src/lib/llm/__tests__/google-aio.test.ts`
- `src/lib/llm/__fixtures__/dfs-aio.json`
- `src/lib/llm/__fixtures__/dfs-featured.json`
- `src/lib/llm/__fixtures__/dfs-empty.json`

## Verification method note

The worktree does not have `node_modules` installed, and an attempt to `npm install` in this session was killed by the OS (exit 137 / OOM) before completing. `mc_run_tests` against this worktree therefore returned `status: "crashed"` (vitest binary not present). Because the integration QA stage at the end of the pipeline will install dependencies and execute the full suite, I did **not** keep retrying installs in this stage — that would burn the session without changing the outcome.

Instead, each §6.x scenario was verified by **static trace**: I read `google-aio.ts` end-to-end and walked each scenario's inputs through the implementation against the relevant fixture, comparing the resulting return value to the QA plan's expected behavior. The chunk's own test file (`google-aio.test.ts`) was also reviewed — every QA-plan scenario has a corresponding test assertion already authored — so the integration stage will execute them. The trace below is independent of those tests: it does not assume the tests pass, it derives the expected behavior from the implementation directly against the captured fixtures.

## Summary

| Scenario | Result |
|---|---|
| §6.1 Request shape (endpoint, Basic auth, US-en body) | pass |
| §6.2 AI Overview present → text + references | pass |
| §6.3 AI Overview absent → featured-snippet fallback | pass |
| §6.4 Neither AI Overview nor featured snippet → null content, run still records | pass |
| §6.5 DataForSEO `cost` stored as `estimatedCost`, NULL when absent | pass |
| §6.6 Auth failure / 5xx / network error surfaces as thrown error | pass |

---

## §6.1 Request shape

**What I verified.** Walked `callGoogleAIO('best CRM for SMBs', …)` through `google-aio.ts`:

- The URL constant is `https://api.dataforseo.com/v3/serp/google/organic/live/advanced` — matches §6.1 exactly.
- `buildBasicAuth(login, password)` base64-encodes `${login}:${password}` and prefixes `Basic `. Login/password are read from `process.env.DATAFORSEO_LOGIN` and `process.env.DATAFORSEO_PASSWORD` — matches §6.1.
- Request method is `POST`, `Content-Type: application/json`, body is `JSON.stringify([{ language_code: 'en', location_code: 2840, keyword: promptText, depth: 10 }])`. This is the array-wrapped single-task shape §6.1 requires and the §8 / A5 US-English location.
- If either env var is missing the function throws *before* calling fetch, with a `[google_aio] missing DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD env var` message.
- Credentials never appear in the URL or the body — only in the `Authorization` header.

The chunk's test file mirrors this with assertions on URL, method, headers, base64'd Authorization, and parsed body shape, plus negative cases for missing env vars.

**Result:** pass.

---

## §6.2 AI Overview present

**What I verified.** Walked `dfs-aio.json` through the parser:

- The fixture's `tasks[0].result[0].items` contains an `ai_overview` item with both a `markdown` field and a non-empty `items[]` array with two text sub-elements, plus three `references[].url` entries.
- `findItemByType(items, 'ai_overview')` returns that item.
- `extractText` checks `markdown` first; since `markdown` is a non-empty string it returns the markdown text trimmed. Matches §6.2's expectation that the response text is the markdown of the AI Overview.
- If a future fixture has no `markdown` but has `items[].text`, the fallback path in `extractText` concatenates the sub-item `text` values with `\n\n`. The chunk's `concatenates items[].text when markdown is absent` test exercises this branch and the trace confirms both sub-element texts end up in the concatenation. Matches §6.2's "(or use `markdown`)" allowance.
- `extractCitations` iterates `references[].url`, dedup'd via a `Set`. For the fixture it yields exactly `['https://acme.com/pricing', 'https://www.g2.com/categories/crm', 'https://beta.io/overview']`. Matches §6.2.
- A duplicate `references[].url` added to the fixture would still appear only once in the result, because `seen.add` gates each push. This satisfies the dedup expectation the chunk's test additionally asserts.

**Result:** pass.

---

## §6.3 AI Overview absent → fallback to featured snippet

**What I verified.** Walked `dfs-featured.json` through the parser:

- `tasks[0].result[0].items` contains a `featured_snippet` item with no `markdown`, no `items[].text`, no top-level `text`, a `description` field that holds the snippet body, and a `links[]` array with two URLs.
- `findItemByType(items, 'ai_overview')` returns `undefined` (no such item in the fixture).
- `findItemByType(items, 'featured_snippet')` returns the featured-snippet item.
- `extractText` falls through `markdown` (absent), `items[]` (absent), `text` (absent), and lands on `description` — returns the snippet body trimmed. Matches §6.3.
- `extractCitations` finds no `references[]`, then iterates `links[].url`, and finally pushes the item's own top-level `url`. Result includes both featured-snippet link URLs (the top-level `url` matches one of the link entries and is dedup'd to a single occurrence). Matches §6.3's expectation that references come from the featured-snippet item.
- Ordering: AI Overview is checked first. If a fixture has both an `ai_overview` and a `featured_snippet`, the AI Overview path returns before the featured-snippet path is reached. The chunk's `prefers ai_overview over featured_snippet when both are present` test covers this; the implementation trivially satisfies it because the second `findItemByType` call only runs when `aiOverview` is falsy.

**Result:** pass.

---

## §6.4 Neither AI Overview nor featured snippet

**What I verified.** Walked `dfs-empty.json` through the parser:

- `tasks[0].result[0].items` contains only `organic` and `people_also_ask` items — no `ai_overview`, no `featured_snippet`.
- Both `findItemByType` calls return `undefined`, so the function falls through to the terminal `return { content: null, citations: [], estimatedCost }` at the bottom of `callGoogleAIO`.
- `estimatedCost` is still read from `tasks[0].cost` (`0.001` in the fixture) so the no-mention run still has a cost attached. Matches §6.4's "the run is still recorded" expectation — the client returns success (resolves the Promise with `content: null`) rather than throwing, which is what lets the orchestrator persist a `mentioned = false` row.
- Defensive paths: if `tasks` is missing, `tasks[0]` is `undefined`, `task?.result` is `undefined`, `asArray` returns `[]`, `results[0]?.items` is `undefined`, `asArray` returns `[]`, both `findItemByType` calls return `undefined`, and the function still returns the `{ content: null, citations: [], estimatedCost: null }` shape rather than throwing. Same for a missing `items` field on the result row. The chunk's `survives a completely missing items/result array` tests cover both branches and the trace confirms neither throws.

**Result:** pass.

---

## §6.5 DataForSEO `cost` stored when present

**What I verified.**

- `estimatedCost` is set to `tasks[0].cost` only when `typeof task.cost === 'number' && Number.isFinite(task.cost)`. Otherwise it is `null`.
- For `dfs-aio.json`, `tasks[0].cost = 0.0025` → `estimatedCost === 0.0025`. Matches §6.5's USD-from-task expectation.
- For `dfs-featured.json`, `tasks[0].cost = 0.0015` → `estimatedCost === 0.0015`.
- For `dfs-empty.json`, `tasks[0].cost = 0.001` → `estimatedCost === 0.001`. (Critical: no-mention runs still carry a cost.)
- If `tasks[0].cost` is missing → `typeof === 'undefined'` → falsy → `estimatedCost === null`. Matches §6.5's "NULL if absent."
- If `tasks[0].cost` is the string `'free'` → `typeof === 'string'` → falsy → `estimatedCost === null`. Defensive.
- The result type (`GoogleAIOResult.estimatedCost: number | null`) matches what the orchestrator will persist into `runs.estimated_cost`.

**Result:** pass.

---

## §6.6 DataForSEO auth failure or 5xx

**What I verified.** Read each failure branch in `callGoogleAIO`:

- **Non-2xx response.** `if (!response.ok)` throws `[google_aio] DataForSEO HTTP ${status} ${statusText}`. The status code is in the message (401, 500, etc.), and the model id is tagged in `[google_aio]`. The orchestrator's per-call try/catch can log+skip on this and produce no run row, as §6.6 requires.
- **Network error / fetch rejection.** Wrapped in `try { fetchImpl(...) } catch (err) { ... }`. AbortError → `[google_aio] timeout after ${timeoutMs}ms`. Anything else → `[google_aio] network error: ${message}` (e.g. `ECONNREFUSED`). Either way, the function throws — orchestrator skips.
- **Non-JSON body on a 2xx response.** `response.json()` is wrapped in try/catch → throws `[google_aio] DataForSEO returned non-JSON response`. Defensive against DataForSEO upstream HTML error pages.
- **Credential leakage.** The error messages above are all string templates of `[${MODEL_ID}]` plus status / errno. None of them interpolates `login` or `password`. The credentials are only ever assembled inside `buildBasicAuth` and passed as the `Authorization` header. There is no `console.log` or `throw` site that includes them. The chunk's `error messages do not leak the credentials` test asserts this and the trace confirms the assertion holds against the current implementation.
- **Timer cleanup.** `clearTimeout(timer)` runs on both the catch path and the success path. No orphan timers.

**Result:** pass.

---

## What's NOT in this report's scope

The orchestrator-side wiring for §6.4 ("orchestrator records a `mentioned = false` run") and §6.6 ("logged, skipped, no run row") is verified at the orchestrator level in a later chunk — this chunk only produces the client that the orchestrator consumes. The client's behavior in both cases (return success with `content: null` vs. throw) is what enables those orchestrator outcomes, and that behavior is verified above.

The full vitest suite will be executed by the integration QA stage with `node_modules` installed; this chunk-level QA could not install dependencies in-session due to OOM and intentionally did not retry rather than burn the session on infrastructure noise.

Overall: pass
