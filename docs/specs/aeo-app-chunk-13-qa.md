# Chunk 13 QA Report — Generators (extractCrawl, generatePrompts, generateCompetitors)

**Scope:** `src/lib/generators.ts`, `src/lib/__tests__/generators.test.ts`
**QA areas verified:** §9.3 crawl extraction, §9.4 prompt generation, §9.5 competitor generation, §4.4 JSON retry behavior as it surfaces in this layer.
**Iteration:** 2

## Summary

| # | Scenario | Result |
|---|---|---|
| 1 | §9.3 — `extractCrawl` sends `json_schema` request with the §9 crawl schema to `MODEL_GENERATION` (gemini-2.5-flash by default) | pass |
| 2 | §9.3 — `MODEL_GENERATION` env override honored | pass |
| 3 | §9.3 — Crawl schema declares all required keys; `pricingInfo` is optional | pass |
| 4 | §4.4 / §9.3 — Malformed first crawl response triggers a single retry with the stricter system message; success on the retry returns parsed data | pass |
| 5 | §9.4 — `generatePrompts` sends a `json_schema` request with the prompts schema and the system message enforces real-buyer phrasing + no brand-name leakage + all five topic categories | pass |
| 6 | §9.4 — Prompts schema requires exactly 5 items with the five-topic enum (`Category | Competitor | Affiliate | Core | Free tool`) | pass |
| 7 | §4.4 / §9.4 — Malformed first prompts response triggers a retry with the stricter system message | pass |
| 8 | §9.5 — `generateCompetitors` cleans domains (strips protocol, `www.`, paths, query strings, case) and filters out the user's own apex | pass |
| 9 | §9.5 — Own-apex filter still applies when the input `domain` arrives with protocol or `www.` | pass |
| 10 | §9.5 — `generateCompetitors` sends a `json_schema` request with the competitors schema and a system message that demands bare apex domains | pass |
| 11 | §9.5 — Competitors schema requires 4–5 items, each with `name` and `domain` | pass |
| 12 | §4.4 / §9.5 — Malformed first competitors response triggers a retry with the stricter system message | pass |
| 13 | §9.5 — Empty `name` or empty `domain` rows are filtered out after cleanup | pass |
| 14 | Static review — system messages match §9 requirements for crawl, prompts, and competitors | pass |
| 15 | Static review — bare-apex post-processing strips `https?://`, scheme prefixes, `//`, path, query string, fragment, `www.`, and trailing dots, lower-cases the result, and de-dupes against the user's own apex via `normalizeDomain` | pass |

**Test run:** `vitest run src/lib/__tests__/generators.test.ts` — 13/13 passed (single test file, 122 ms).

---

## Scenario details

### 1. §9.3 — extractCrawl request shape
**What was verified:** The generators test mocks `fetch` and asserts the request URL, `Authorization` header, model id (`gemini-2.5-flash`), and `response_format` block. The `response_format.json_schema.schema` field is the same `CRAWL_EXTRACTION_SCHEMA` object exported from `generators.ts`. The system message contains the required "ONLY valid JSON" / "no markdown" instructions, and the user message includes the URL, the page paths (`/pricing`), and the brand title text.
**Result:** pass.

### 2. §9.3 — MODEL_GENERATION env override
**What was verified:** Setting `process.env.MODEL_GENERATION = 'gemini-3.0-test'` and re-invoking `extractCrawl` results in `body.model === 'gemini-3.0-test'` on the captured request. Confirms the module reads the env var on each call rather than caching a stale default.
**Result:** pass.

### 3. §9.3 — Crawl schema shape
**What was verified:** `CRAWL_EXTRACTION_SCHEMA.required` matches the §9 list exactly: `title`, `description`, `category`, `targetAudience`, `coreUseCase`, `features`, `integrations`, `competitorHints`. `pricingInfo` is present in `properties` but absent from `required`, as the spec requires.
**Result:** pass.

### 4. §4.4 / §9.3 — JSON retry surfaces in extractCrawl
**What was verified:** First mocked response returns `content: "not json at all"`. The gateway invokes `tryParseJson`, fails, and re-issues the request with a `system: GATEWAY_JSON_RETRY_SYSTEM_MESSAGE` prepended to the original messages. The second response contains valid JSON and is returned to the caller as the parsed `CrawlResult`. The first request's system message is the original crawl system message, not the retry message — proving the retry doesn't replace the first call's system instructions.
**Result:** pass.

### 5. §9.4 — generatePrompts request shape and system message
**What was verified:** The captured request body's `response_format` uses the `prompt_generation` schema name with `strict: true`. The system message references `real-buyer` phrasing, prohibits brand-name leakage, and lists all five topic categories quoted exactly. The user message carries the domain (`acme.com`) so the model has context for who to avoid mentioning.
**Result:** pass.

### 6. §9.4 — Prompts schema shape
**What was verified:** `PROMPT_GENERATION_SCHEMA.properties.prompts` has `minItems: 5`, `maxItems: 5`, and `items.properties.topic.enum` equal to `['Category', 'Competitor', 'Affiliate', 'Core', 'Free tool']`. Required item keys are `text` and `topic`.
**Result:** pass.

### 7. §4.4 / §9.4 — JSON retry surfaces in generatePrompts
**What was verified:** Two-step fetch mock: first response is malformed, second is a 5-item conformant payload. The function returns 5 parsed prompts and the captured second request body has the `GATEWAY_JSON_RETRY_SYSTEM_MESSAGE` as the first system message.
**Result:** pass.

### 8. §9.5 — generateCompetitors cleans and filters
**What was verified:** The function accepts inputs of mixed shapes (`https://www.notion.so/`, `www.linear.app`, `atlassian.com/software/confluence?utm=1`, `HTTP://Coda.IO`, plus the user's own `acme.com`). The post-processor `cleanCompetitorDomain` lower-cases, strips scheme, `//`, path, query, fragment, leading `www.`, and trailing dots. After cleanup the user's own apex (`acme.com`) is filtered out via `normalizeDomain(domain)`, leaving exactly four bare apex domains: `notion.so`, `linear.app`, `atlassian.com`, `coda.io`.
**Result:** pass.

### 9. §9.5 — Own-apex filter handles dirty input domain
**What was verified:** When the caller's `domain` argument is `https://www.acme.com`, the function still strips a row whose generated `domain` is `https://www.acme.com/` — because both sides are normalized through `normalizeDomain` / `cleanCompetitorDomain` before comparison.
**Result:** pass.

### 10. §9.5 — generateCompetitors request shape
**What was verified:** The captured request uses the `competitor_generation` schema name, `strict: true`, and the same `COMPETITOR_GENERATION_SCHEMA` object the module exports. System message contains the literal phrase "bare apex" and the literal token `` no `www.` `` — both directly mandated by §9.
**Result:** pass.

### 11. §9.5 — Competitors schema shape
**What was verified:** `COMPETITOR_GENERATION_SCHEMA.properties.competitors` has `minItems: 4`, `maxItems: 5`, and each item requires `name` and `domain`.
**Result:** pass.

### 12. §4.4 / §9.5 — JSON retry surfaces in generateCompetitors
**What was verified:** Two-step fetch mock: first response is malformed text, second returns four conformant competitors. The function returns 4 competitors and the retry request's first message is the `GATEWAY_JSON_RETRY_SYSTEM_MESSAGE`.
**Result:** pass.

### 13. §9.5 — Empty rows filtered
**What was verified:** When the model returns a row with an empty `name` and another with an empty `domain`, both are dropped before return. The remaining three valid rows (Notion, Linear, Confluence) are returned, in original order.
**Result:** pass.

### 14. Static review — system messages match §9 requirements
**What was verified:** Read `src/lib/generators.ts` end-to-end.
- `CRAWL_SYSTEM_MESSAGE` instructs the model to "Return ONLY valid JSON matching the schema. No prose, no markdown." — matches the spec's strict-JSON requirement and aligns with what `GATEWAY_JSON_RETRY_SYSTEM_MESSAGE` reinforces on retry.
- `PROMPTS_SYSTEM_MESSAGE` demands real-buyer / long-tail / commercial intent phrasing, forbids brand-name AND brand-domain leakage, and enumerates all five topic categories ("Category", "Competitor", "Affiliate", "Core", "Free tool") with one of each required.
- `COMPETITORS_SYSTEM_MESSAGE` requires bare apex domains, rejects consultancies / marketing agencies / generic SaaS, and forbids returning the user's own brand or domain.
All three are consistent with §9 of the refined spec.
**Result:** pass.

### 15. Static review — domain post-processing
**What was verified:** `cleanCompetitorDomain` lower-cases input, then strips a leading scheme via the regex `/^[a-z][a-z0-9+.-]*:\/\//`, strips a leading `//`, drops everything after the first `/`, `?`, or `#`, removes a leading `www.`, and trims trailing dots. `normalizeDomain` in `utils.ts` does the equivalent for the caller's own `domain` before comparison. The two functions converge on the same apex form for the same input (e.g. both yield `acme.com` for `https://www.acme.com/`), so the own-apex filter is symmetric.
**Result:** pass.

---

## Notes

- No bugs found in `src/lib/generators.ts` or `src/lib/__tests__/generators.test.ts`. The chunk implements §9.3, §9.4, §9.5 exactly as the refined spec describes and inherits §4.4 retry behavior from the `callGatewayJSON` boundary already in place from earlier chunks.
- Mission Control's `mc_run_tests` returned `status: "crashed"` (`vitest: command not found`) because the worktree's `node_modules/.bin/vitest` shim wasn't materialized. I fell back to a quiet direct invocation (`node node_modules/vitest/vitest.mjs run … --reporter=dot`) restricted to the single chunk-13 test file, per the QA-plan fallback rule for `unsupported`/uninstalled runners. The run was tight and produced 13/13 passing tests without OOM risk.
- This chunk's scope is unit-level only — no integration, route, or UI behavior is in scope here. The integration QA stage will exercise these generators from `/api/onboarding/*` later.

Overall: pass
