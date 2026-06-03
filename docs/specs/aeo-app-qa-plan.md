# Luminaire — QA Plan

This QA plan maps the refined Luminaire spec (`docs/specs/aeo-app-refined.md`) onto a concrete test strategy. It is organized by area, with each scenario including a name, preconditions/inputs, expected behavior, and a recommended testing approach.

The plan is sized for a single-tenant, local-only MVP. We optimize coverage on the deterministic/parsing/SQL pieces (where bugs are most likely to silently distort metrics) and rely on a smaller set of manual + end-to-end checks for the UI and external integrations.

---

## 1. Test Strategy Summary

### Test layers

| Layer | Used for | Suggested framework |
|---|---|---|
| **Unit tests** | Pure functions in `lib/`: `parser.ts`, `classify.ts`, `metrics.ts`, `utils.ts`. Edge cases that are tedious to reproduce manually. | Vitest (lightweight, native ESM/TS, fits Next 16). |
| **Integration tests** | API route handlers against a real Neon branch DB (per CLAUDE.md: "Database: Neon Postgres via DATABASE_URL — never create a local or alternative database"). Asserts SQL parameterization, JSON shape, and error codes. | Vitest + `fetch` against the Next handler exported from `app/api/.../route.ts`, with `mc_run_tests` to execute. |
| **Mocked external-API tests** | LLM Gateway, Perplexity, and DataForSEO clients. Verify request shape and response parsing without spending real credits. | Vitest with `fetch` mocks; canned fixture responses captured from real calls and stored under `__fixtures__/`. |
| **End-to-end / browser** | Onboarding flow, dashboard filters, modals, toggles, “Run All Prompts” spinner. | Playwright (allowed from worktree per CLAUDE.md). Uses a shifted port (e.g. 6173/4811) so the user's running services are not touched. |
| **Manual verification** | Visual design fidelity (theme tokens, chart colors, spacing), real-world LLM behavior smoke test (one real batch run with throwaway credits). | Run-through checklist; capture screenshots. |
| **Eval (optional, post-MVP)** | Generator quality — does prompt generation return five buyer-intent prompts with the right topic mix? — and parser quality on a curated corpus. | Mission Control evals (`mc_run_evals`). |

### Test data & isolation rules

- Integration tests use a Neon branch (created via `mcp__plugin_neon_neon__create_branch`) so the dev DB is not polluted. Test fixtures are inserted in a `beforeEach`; tables are truncated in `afterEach`.
- Per CLAUDE.md: never run destructive operations against the primary DB. Every test that writes runs against a branch.
- All external API calls (Gateway, Perplexity, DataForSEO) are mocked at the `fetch` boundary in CI. A single weekly smoke run hits the real APIs with `dry-run`-style fixtures.
- Run tests via `mc_run_tests` (per CLAUDE.md) rather than `npm test` to avoid OOM in long suites.

### What we are NOT testing

- The Next.js framework itself (App Router routing, file conventions).
- The Neon driver behavior.
- Recharts internals (we test that we pass the correct series shape).
- Cron scheduling on the OS (we test that `scripts/cron.mjs` exits 0/1 correctly and that the endpoint rejects bad bearers).

---

## 2. Database & Migrations

### 2.1 Schema applies idempotently
- **Preconditions:** A Neon test branch with no tables.
- **Steps:** `POST /api/setup-db` once, then a second time.
- **Expected:** Both calls return `allTablesExist: true`. No SQL error on the second run (every `CREATE` uses `IF NOT EXISTS`).
- **Approach:** Integration test. Verify counts in `pg_indexes` for the six indexes.

### 2.2 Table existence check shows partial state
- **Preconditions:** Create only `brands` and `prompts`, drop the others.
- **Steps:** `GET /api/setup-db`.
- **Expected:** `allTablesExist: false`; per-table `exists` flags match reality.
- **Approach:** Integration test.

### 2.3 `gen_random_uuid()` works without an extension
- **Preconditions:** Fresh Neon branch.
- **Steps:** Apply schema, insert a brand without specifying `id`.
- **Expected:** `id` is a populated UUID.
- **Approach:** Integration test.

### 2.4 `ON DELETE CASCADE` removes children
- **Preconditions:** Brand with competitors + prompts + runs + citations populated.
- **Steps:** Delete the brand row.
- **Expected:** All dependent rows are removed.
- **Approach:** Integration test. Confirms downstream cleanup is on the schema (no orphaned rows that would skew metrics).

### 2.5 All write queries use parameterized SQL
- **Approach:** Static code review + grep for backtick-interpolation patterns in `lib/queries.ts`. **Acceptance criterion (§5):** zero string-interpolated values into SQL. Flag any `${var}` inside a SQL template.

### 2.6 Date filter clause uses parameterized interval
- **Preconditions:** Runs span 90 days.
- **Steps:** Call `getRuns({ days: 7 })`.
- **Expected:** Only runs from the last 7 days returned; SQL must use `now() - ($n || ' days')::interval` with `$n` bound, not concatenated.
- **Approach:** Unit on the SQL builder + integration on the route.

### 2.7 Model filter is omitted when value is `'all'` or undefined
- **Steps:** Call `getRuns({ days: 7 })` and `getRuns({ days: 7, model: 'all' })`.
- **Expected:** Neither query adds a `model = $n` clause; both return runs from all surfaces.
- **Approach:** Inspect the generated SQL via a unit test on the builder.

---

## 3. Response Parser (`lib/llm/parser.ts`)

This is the highest-leverage area to unit test — bugs here silently distort every dashboard metric.

### 3.1 Brand mention detection

| # | Scenario | Input | Expected |
|---|---|---|---|
| 3.1.a | Plain brand name | "Best CRM is **Acme** for SMBs" | `mentioned = true` |
| 3.1.b | Brand name case-insensitive | "acme works well" | `mentioned = true` |
| 3.1.c | Word-boundary respected | "Pancakes are good" (brand="Cake") | `mentioned = false` |
| 3.1.d | Multi-word brand with internal whitespace flex | "Use Acme  CRM" (brand="Acme CRM") | `mentioned = true` |
| 3.1.e | Domain apex match | "See acme.com for details" (brand domain="acme.com") | `mentioned = true` |
| 3.1.f | Domain with `www.` and protocol | "https://www.acme.com" | `mentioned = true` |
| 3.1.g | Domain on a subdomain | "blog.acme.com" | `mentioned = true` (apex match) |
| 3.1.h | Empty response | "" | `mentioned = false` |
| 3.1.i | Brand name with regex metacharacters | brand name `"C++ Builder"` appears in text | `mentioned = true`; name is regex-escaped |
| 3.1.j | False positive on generic name (documented) | brand="Apple", text mentions the fruit | Test asserts `mentioned = true`; documents the known false positive (§17). |

**Approach:** Pure unit tests (Vitest).

### 3.2 Position score (§11.2)

| # | Scenario | Input | Expected |
|---|---|---|---|
| 3.2.a | Numbered list, brand at #1 | "1. Acme\n2. Beta" | `position_score = 1` |
| 3.2.b | Numbered list, brand at #3 | "1. Beta\n2. Charlie\n3. Acme" | `position_score = 3` |
| 3.2.c | Numbered list with parenthesis | "1) Beta\n2) Acme" | `position_score = 2` |
| 3.2.d | Numbered list, brand at #7 | "…7. Acme…" | `position_score = 5` (capped) |
| 3.2.e | Prose, brand in first 20% | "Acme is great; many alternatives exist…" (200 chars) | `position_score = 1` |
| 3.2.f | Prose, brand in last 20% | Long paragraph ending in "Acme" | `position_score = 5` |
| 3.2.g | Brand in middle (segment 3) | Brand at ~50% offset | `position_score = 3` |
| 3.2.h | Brand mentioned multiple times | "Acme … Acme … Acme" in first 20% | `position_score = 1` (first mention wins; §17 known case) |
| 3.2.i | Not mentioned | text without brand | `position_score = NULL` |
| 3.2.j | Numbered-list line where brand mention precedes the number elsewhere | Numbered list at the end and a non-list mention earlier | Numbered-list rule applies only if first mention’s line starts with the number pattern; otherwise segment rule. Document the chosen tie-breaker in the test fixture. |
| 3.2.k | Returned value is REAL | Numeric type | Test asserts `typeof === 'number'` and DB column `REAL`. |

**Approach:** Pure unit tests. Use the deterministic algorithm spec'd in §11.2 as ground truth.

### 3.3 Sentiment (§11.3)

| # | Scenario | Input | Expected |
|---|---|---|---|
| 3.3.a | Single positive word in brand sentence | "Acme is excellent." | `positive` |
| 3.3.b | Single negative word in brand sentence | "Acme is poor." | `negative` |
| 3.3.c | Mixed pos+neg in same sentence | "Acme is reliable but expensive." | `neutral` (tie) |
| 3.3.d | Positive word in a non-brand sentence | "Acme exists. Beta is excellent." | `neutral` (brand sentence has no qualifying word) |
| 3.3.e | Multiple brand sentences, pos>neg | "Acme is robust. Acme is also slow." | `neutral` (1 vs 1) — verify tie behavior |
| 3.3.f | Brand mentioned without any qualifying words | "Acme exists." | `neutral` (default) |
| 3.3.g | Brand not mentioned | text without brand | `neutral` |
| 3.3.h | Case-insensitive word match | "Acme is EXCELLENT" | `positive` |
| 3.3.i | Word boundary respected | "Acme is the bestseller" should NOT match `best` if word-boundary rule applies (matches: `\bbest\b`). Document the chosen behavior. |
| 3.3.j | Sentence split by `.!?` | "Acme is great! It costs much. Acme is bad." | Two brand sentences detected. |

**Approach:** Pure unit tests. Lock the word lists from §11.3 into the test fixtures so word-list drift causes visible test failures (and a deliberate update).

### 3.4 Competitor mentions
- **Scenario:** Brand has 4 competitors. Response mentions 2 of them by name, 1 by domain, omits 1.
- **Expected:** `competitor_mentions = { "Comp1": true, "Comp2": true, "Comp3": true, "Comp4": false }` — exactly four keys.
- **Approach:** Unit test. Also assert keys are the competitor `name` (display name), not domain or id.

### 3.5 Citation extraction (§11.5)

| # | Scenario | Input | Expected |
|---|---|---|---|
| 3.5.a | Perplexity returns `citations: []` | `citations: ['https://a.com', 'https://b.com']` | Both URLs extracted from API. |
| 3.5.b | Perplexity `citations` missing, `search_results` present | `search_results: [{url: '...'}]` | Fallback to `search_results[].url`. |
| 3.5.c | URL inline in prose | "see https://acme.com/blog for more" | URL extracted via regex. |
| 3.5.d | URL with trailing punctuation | "(see https://acme.com.)" | Trailing `.` stripped; `)` stops the regex. |
| 3.5.e | Same URL in both API list and prose | Dedupe to one citation. |
| 3.5.f | URL with query string and fragment | `https://a.com/path?q=1#x` | Preserved as full URL; domain normalized to `a.com`. |
| 3.5.g | Non-HTTP scheme | `ftp://x.com` | NOT extracted (regex is `https?://`). |
| 3.5.h | Malformed URL | `http:/badurl` | NOT extracted; gracefully skipped. |
| 3.5.i | DataForSEO `references[].url` | extracted as citations. |
| 3.5.j | DataForSEO featured snippet fallback | `ai_overview` absent, `featured_snippet` present | Citations from featured snippet references. |
| 3.5.k | DataForSEO neither AI Overview nor featured snippet | No citations; run still recorded; `mentioned = false`. |

**Approach:** Unit tests for the regex + dedup; integration tests with canned DataForSEO/Perplexity fixtures.

### 3.6 Domain classification (`lib/classify.ts`)

| # | Scenario | Input URL | Expected `domain_type` |
|---|---|---|---|
| 3.6.a | Brand domain | `https://www.acme.com/x` | `You` |
| 3.6.b | Competitor domain | `https://beta.io` (Beta is a competitor) | `Competitor` |
| 3.6.c | Reddit | `https://www.reddit.com/r/saas` | `UGC` |
| 3.6.d | G2 | `https://g2.com/products/acme` | `UGC` |
| 3.6.e | TechCrunch | `https://techcrunch.com/...` | `Editorial` |
| 3.6.f | Wikipedia | `https://en.wikipedia.org/wiki/CRM` | `Reference` |
| 3.6.g | `.edu` | `https://stanford.edu/...` | `Institutional` |
| 3.6.h | `.gov` | `https://nih.gov/...` | `Institutional` |
| 3.6.i | `.org` (non-editorial) | `https://w3.org/...` | `Institutional` (per A15) |
| 3.6.j | UGC list precedence over `.org` | n/a (no UGC in `.org`) | (Documents precedence rule.) |
| 3.6.k | Editorial list precedence over `.org` | e.g. hypothetical `forbes.org` | `Editorial` wins. |
| 3.6.l | Unknown corporate domain | `https://random-saas.io` | `Corporate` |
| 3.6.m | Subdomain matches apex | `https://blog.techcrunch.com` | `Editorial` |
| 3.6.n | Brand domain takes precedence over UGC | brand domain is `medium.com` (unlikely but a hard-edge case) | `You` |
| 3.6.o | Normalization: uppercase host | `HTTPS://ACME.COM` | matches brand → `You` |

**Approach:** Pure unit tests on `classify(url, brand, competitors)`.

---

## 4. LLM Gateway Client (`lib/llm/gateway.ts`)

### 4.1 Request shape matches gateway docs
- **Expected:** POST to `${LLM_GATEWAY_BASE_URL}/chat/completions`; `Authorization: Bearer ${LLM_GATEWAY_API_KEY}`; body includes `model`, `messages`, `max_tokens: 2000`, `temperature: 0.3`, `run_id` (when supplied); no `stream` or `stream: false`.
- **Approach:** Unit test with `fetch` mock; assert the captured request.

### 4.2 Response parsing — top-level `content`
- **Preconditions:** Mock returns `{ content: "hello", estimated_cost: 0.012, run_total_cost: 0.05, ... }`.
- **Expected:** Client returns `{ content: 'hello', estimatedCost: 0.012, runTotalCost: 0.05 }`. Specifically does NOT look at `choices[0].message.content` — that's the streaming SSE path the spec explicitly calls out as wrong.
- **Approach:** Unit test. Bake a fixture where `choices` is absent to prove the client doesn't depend on it.

### 4.3 `response_format` json_schema is passed through
- **Preconditions:** Caller passes `{ response_format: { type: 'json_schema', json_schema: {...} } }`.
- **Expected:** Forwarded verbatim to the gateway request body.
- **Approach:** Unit test on gateway invocation in `generators.ts`.

### 4.4 JSON-mode parse failure → retry once with stricter system message
- **Preconditions:** First call returns content that is not valid JSON for the requested schema.
- **Expected:** Second call is made with system message prepended: "Return ONLY valid JSON matching the schema. No prose, no markdown." If second call still fails, throws a tagged error.
- **Approach:** Unit test with two-step fetch mock.

### 4.5 Gateway HTTP 5xx → error surfaces to orchestrator (not silently swallowed)
- **Expected:** Client throws a typed error including model id, status, and the gateway's error body if any.
- **Approach:** Unit test.

### 4.6 Per-call 60s timeout (§10)
- **Preconditions:** Mock that never resolves.
- **Expected:** Client rejects after 60s with a timeout error tagged with the model.
- **Approach:** Unit test with fake timers.

### 4.7 No secrets in error messages or logs
- **Expected:** Bearer token never appears in thrown errors or console output.
- **Approach:** Unit test that intercepts the thrown error message and asserts the token substring is absent.

---

## 5. Perplexity Client (`lib/llm/perplexity.ts`)

### 5.1 Request shape
- **Expected:** POST `https://api.perplexity.ai/chat/completions`; `Authorization: Bearer ${PERPLEXITY_API_KEY}`; body includes `model: 'sonar-pro'` (or env value), `max_tokens: 2000`, `temperature: 0.3`.
- **Approach:** Unit test with `fetch` mock.

### 5.2 Response parsing — `choices[0].message.content`
- **Expected:** Reads from `choices[0].message.content` (standard OpenAI shape), NOT from `content` (gateway-only).
- **Approach:** Unit test with canned fixture.

### 5.3 Citations handling
- 5.3.a `citations` array present → use it.
- 5.3.b `citations` absent, `search_results` present → map `search_results[].url`.
- 5.3.c Both absent → no citations; run still recorded.
- **Approach:** Unit tests with three canned fixtures.

### 5.4 Cost stored as NULL
- **Expected:** `estimated_cost` is `NULL` on persisted run regardless of response shape.
- **Approach:** Integration test by inspecting DB row after a mocked Perplexity success.

### 5.5 Non-2xx response
- **Expected:** Throws typed error tagged with `perplexity`; orchestrator logs and skips this model for this prompt.
- **Approach:** Unit test + orchestrator integration test.

---

## 6. Google AI Overview Client (`lib/llm/google-aio.ts`)

### 6.1 Request shape
- **Expected:** POST `https://api.dataforseo.com/v3/serp/google/organic/live/advanced`; HTTP Basic auth from `DATAFORSEO_LOGIN:DATAFORSEO_PASSWORD`; body is `[{ language_code: 'en', location_code: 2840, keyword: <promptText>, depth: 10 }]`.
- **Approach:** Unit test.

### 6.2 AI Overview present
- **Preconditions:** Fixture where `tasks[0].result[0].items` contains an `ai_overview` item with `items[].text` and `references[].url`.
- **Expected:** Response text is the concatenated `text` (or `markdown`); citations include each `references[].url`.
- **Approach:** Unit test on a captured DataForSEO fixture.

### 6.3 AI Overview absent → fallback to featured snippet
- **Preconditions:** Fixture without `ai_overview` but with `featured_snippet`.
- **Expected:** Response text and references pulled from the featured snippet item.
- **Approach:** Unit test.

### 6.4 Neither AI Overview nor featured snippet
- **Expected:** Returns null response; orchestrator records a run with `mentioned = false`, `response = null`, no citations, but DOES record the run (so empty-state cells render on the dashboard).
- **Approach:** Unit + integration test.

### 6.5 DataForSEO `cost` stored when present
- **Expected:** `estimated_cost` on the run equals the `cost` field returned by DataForSEO, in USD; NULL if absent.
- **Approach:** Integration test.

### 6.6 DataForSEO auth failure or 5xx
- **Expected:** Single-model failure path: logged, skipped, no run row.
- **Approach:** Unit + orchestrator test.

---

## 7. Orchestrator (`lib/llm/orchestrator.ts`)

### 7.1 Happy path: 1 prompt × 5 models
- **Preconditions:** All five clients mocked to return canned successes.
- **Expected:**
  - Five `runs` rows inserted, one per model, all with the same `prompt_id`.
  - Each row's `model` is the correct short id (`openai`, `claude`, `gemini`, `perplexity`, `google_aio`).
  - All gateway calls share one `run_id` (UUIDv4 of the batch).
  - `run_total_cost` is exposed in the response payload.
- **Approach:** Integration test with mocked external clients against a Neon branch DB.

### 7.2 Sequential ordering
- **Expected:** Within a prompt, model calls are sequential (one fetch in flight at a time). Across prompts, also sequential (per A3/Q5).
- **Approach:** Unit test with a fetch mock that records call timestamps and asserts no overlap.

### 7.3 Single-model failure does not abort batch
- **Preconditions:** Claude mock throws; other four succeed.
- **Expected:** Four `runs` rows inserted (one per surviving model). No row for Claude. Error logged with model id, prompt id, and message. Batch returns success with per-model `{ success: false, error }` for Claude.
- **Approach:** Integration test.

### 7.4 All-five-models-fail prompt
- **Expected:** No rows inserted for that prompt. Batch continues to next prompt.
- **Approach:** Integration test.

### 7.5 Citation persistence
- **Expected:** For each run, `citations` rows inserted with `run_id`, `domain` (normalized apex), `url` (full), and `domain_type` from the classifier.
- **Approach:** Integration test inspecting both tables.

### 7.6 Run `id` returned to caller
- **Expected:** Each `runs.id` is included in the result payload (for inspecting logs).
- **Approach:** Integration test.

### 7.7 Cron and manual-button entry points produce identical row shape
- **Expected:** Same response payload structure from `POST /api/cron/run` and `POST /api/prompts/run`.
- **Approach:** Integration test.

### 7.8 No partial rows on per-call failure
- **Expected:** If parsing throws after a successful LLM call, that single run is NOT inserted (atomicity at the per-call level).
- **Approach:** Integration test by mocking the parser to throw.

---

## 8. Metrics (`lib/metrics.ts`)

### 8.1 Visibility
- **Inputs:** 10 runs, 4 mentioned → `0.4`. Display string `40%`.
- **Edge: zero runs** → `0` (display `0%`); never `NaN`.
- **Edge: model filter narrows to zero** → `0` (display `0%`).
- **Approach:** Unit + integration.

### 8.2 Share of Voice
- **Inputs:** brand mentions = 5, sum of competitor mentions across 4 competitors = 15 → `5/(5+15) = 0.25`.
- **Edge: zero denominator** → `0` (not `NaN`).
- **Approach:** Unit test on a SQL fixture.

### 8.3 Average position
- **Inputs:** position scores `[1, 2, 4, NULL, NULL]` → `(1+2+4)/3 = 2.33`.
- **Edge: all NULL** → returns `null`; UI displays `—`.
- **Approach:** Unit test with a stub query result + integration.

### 8.4 Average sentiment — mentioned-only, null-when-empty
- **Inputs A:** 10 runs, 3 mentioned (`positive`, `neutral`, `negative`) → `(80+55+30)/3 = 55` (integer per UI).
- **Inputs B:** 10 runs, 0 mentioned → `null`. UI renders `—`. Specifically NOT `55`.
- **Inputs C:** 10 runs, all mentioned + all positive → `80`.
- **Approach:** Unit + integration on `GET /api/overview`. **Lock the empty-window-renders-as-`—` invariant in a test** — this is the area where a regression would look correct in dev and quietly mislead users (§13.4 / Q15a).
- **Apply same rule to:** Rankings table per-entity sentiment, per-prompt sentiment in `GET /api/prompts/metrics`, Prompt Detail Modal per-model sentiment.

### 8.5 Visibility change (delta vs prior window)
- **Inputs:** current 7-day visibility = `40%`, prior 7-day visibility = `30%` → `+10pp`.
- **Edge: prior window empty** → consider returning `null` and rendering "—" (validate with spec/PM if not specified). For test purposes: if prior is `0/0`, change should be `null`, not `+40pp` (avoid divide-by-no-data inflation).
- **Approach:** Integration test against seeded data spanning ≥ 2 windows.

### 8.6 Trend bucketing
- **Inputs:** runs spanning 5 weeks, brand + 4 competitors.
- **Expected:** Series rows like `{ weekStart: 'YYYY-MM-DD', brand: 0.34, Comp1: 0.21, ... }`.
- **Edge: < 4 weeks of data** → only the available weeks are returned (per §17). Chart should still render.
- **Edge: Sunday boundary, UTC.** A run on Sunday 00:00 UTC belongs to that week's bucket.
- **Approach:** Integration test with date-stamped fixtures.

### 8.7 Domain sources
- **Inputs:** 20 runs, 100 citations across 10 unique domains.
- **Expected:** `retrievalRate` and `citationRate` per §13.7; sorted by `retrievalRate` desc.
- **Edge: domain appears in two runs, three citations total** → `retrievalRate = 2/20`, `citationRate = 3/100`.
- **Approach:** Integration test.

### 8.8 URL sources (view=urls)
- **Expected:** Same metric formulas keyed by full URL.
- **Approach:** Integration test on `/api/sources?view=urls`.

### 8.9 Competitive rank
- **Expected:** Brand + N competitors sorted by visibility desc; rank is brand's 1-based position.
- **Edge: tie** → document the tie-breaker; lock it in a test (e.g. brand wins ties).
- **Approach:** Unit test.

---

## 9. Onboarding Flow

### 9.1 Crawl — homepage
- 9.1.a Valid homepage `https://acme.com/` → crawl proceeds.
- 9.1.b Homepage 404 → `crawl` returns 4xx; UI shows error toast; Step 1 visible.
- 9.1.c Homepage TLS error / DNS failure → 4xx error.
- 9.1.d User enters bare `acme.com` → input is normalized to `https://acme.com/` before submit (Step 1 validation).
- **Approach:** Integration test (mock the page fetch with a stub server) + Playwright for UI.

### 9.2 Crawl — secondary pages
- 9.2.a All six well-known paths return 200 → all extracted.
- 9.2.b 4/6 return 404 → silently skipped; crawl completes.
- 9.2.c One path hangs > 10s → that fetch times out; crawl completes without it.
- 9.2.d Each page truncated to 5000 chars before sending to model.
- 9.2.e User-Agent header is `LuminaireBot/1.0 (+https://luminaire.local)`.
- 9.2.f `cheerio` strips `script`, `style`, `noscript`, `nav`, `footer`, `header` before text extraction; collapses whitespace.
- **Approach:** Unit tests for `lib/scraper.ts` with HTML fixtures; integration test for the route.

### 9.3 Crawl extraction (LLM)
- **Expected:** Output matches the json_schema in §9 — all required keys present (`title`, `description`, `category`, `targetAudience`, `coreUseCase`, `features`, `integrations`, `competitorHints`).
- **Approach:** Unit test with mocked gateway returning a schema-conformant JSON, then a non-conformant JSON to verify the retry path.

### 9.4 Prompt generation
- 9.4.a Returns exactly 5 prompts.
- 9.4.b Each prompt has a topic from the enum: `Category | Competitor | Affiliate | Core | Free tool`.
- 9.4.c Topic mix covers all 5 categories (one each).
- 9.4.d No prompt mentions the brand name (case-insensitive substring check).
- **Approach:** Unit test with mocked gateway returning a conformant fixture; schema enforcement via `response_format: strict`; an eval (post-MVP) on real generations.

### 9.5 Competitor generation
- 9.5.a Returns 4–5 competitors.
- 9.5.b Each `domain` is bare apex (no protocol, no path, no `www.`). Regex test.
- 9.5.c No competitor equals the user's own domain.
- **Approach:** Unit test on the parser; eval on real generations.

### 9.6 Onboarding completion (`POST /api/onboarding/complete`)
- 9.6.a Happy path → 1 brand + N competitors + 5 prompts inserted in one transaction.
- 9.6.b Brand already primary → returns 409, no rows inserted.
- 9.6.c Partial failure (e.g. one prompt insert fails) → all rows rolled back.
- 9.6.d `brand_id` correctly linked on every child row.
- **Approach:** Integration test against Neon branch.

### 9.7 Onboarding UI (Playwright)
- 9.7.a Step indicator shows "Website → Analyzing → Review & Launch".
- 9.7.b Submit on Enter works; arrow click works.
- 9.7.c Loading spinner shows during analyze; UI does not freeze.
- 9.7.d Step 3 fields are inline-editable; X removes a prompt/competitor; order preserved.
- 9.7.e "Start Over" returns to Step 1 and discards crawl data.
- 9.7.f "Launch Tracking" → redirect to `/` showing dashboard.
- 9.7.g **No "+ Add" button on Step 3 prompts** (Q3/A12).
- **Approach:** Playwright e2e on a shifted port with mocked APIs at the fetch boundary.

---

## 10. Cron / Scheduling

### 10.1 Bearer auth
- 10.1.a `POST /api/cron/run` with correct `Authorization: Bearer ${CRON_SECRET}` → 200.
- 10.1.b Missing header → 401, empty body.
- 10.1.c Wrong bearer → 401, empty body.
- 10.1.d Constant-time comparison used (security; see §16.4).
- **Approach:** Integration test.

### 10.2 Loads only active prompts of primary brand
- **Preconditions:** 3 active, 2 archived prompts on the primary brand. A second brand with 1 active prompt.
- **Expected:** 3 prompts run; 2 archived skipped; the second brand's prompt skipped.
- **Approach:** Integration test.

### 10.3 Returns batch summary
- **Expected:** Response `{ ok: true, batchId, totalRuns, totalErrors }` with correct counts.
- **Approach:** Integration test.

### 10.4 Per-call failures do not 5xx
- **Expected:** If 3 of 15 calls fail, response is still 200 with `totalErrors = 3`.
- **Approach:** Integration test.

### 10.5 DB connection failure → 5xx
- **Expected:** Internal failures (DB unreachable, config missing) → 500, logged.
- **Approach:** Integration test by pointing at an invalid `DATABASE_URL`.

### 10.6 `scripts/cron.mjs`
- 10.6.a Missing `CRON_SECRET` → exits 1, clear error.
- 10.6.b On 2xx → exits 0, logs counts.
- 10.6.c On non-2xx → exits 1.
- 10.6.d Hits the env-configured port (4810 by default).
- **Approach:** Unit test on the script (run it as a subprocess against a stub HTTP server).

### 10.7 Concurrency
- **Scenario:** Manual "Run All Prompts" already in flight; cron fires.
- **Expected:** Both proceed; duplicate runs result. Documented behavior, no crash (per A4).
- **Approach:** Integration test launching two simultaneous POSTs and asserting both 200.

---

## 11. API Routes — Contracts

For every read route below, the integration test should assert:
- Default `days = 7` when omitted.
- `model = 'all'` or omitted → no model filter.
- `model = 'claude'` → only claude rows considered.
- Response JSON keys match the documented shape exactly (use a JSON schema validator).
- No secrets present in any response body or error message.

### 11.1 `GET /api/brand`
- Returns `{ brand: null }` when no primary brand exists.
- Returns shape `{ id, name, domain, category, description }` once onboarded.

### 11.2 `GET /api/overview`
- All documented keys present in the shape: `brand`, `competitors`, `metrics`, `rankings`, `trend`, `sources`, `domainTypes`, `recentChats`, `lastUpdated`, `keyInsight`, `actions`.
- `metrics.avgSentiment` is `null` when zero mentioned runs.
- `metrics.avgPosition` is `null` when no positions.
- `rankings[].sentiment` is `null` per-entity when that entity has zero mentioned runs.
- `lastUpdated` is the most recent `runs.created_at` (ISO).
- `keyInsight` matches the tier rules (§15.D).
- `actions` reflect the deterministic rules in §15.E.

### 11.3 `GET /api/sources`
- Returns `{ sources, domainTypes, trend, view }`.
- `view=urls` returns URL-keyed rows; default returns domain-keyed.
- Empty windows return empty arrays, not nulls.

### 11.4 `GET /api/prompts/metrics`
- `prompts[].sentiment` is `null` when that prompt has zero mentioned runs in the window/model. NEVER defaults to `55`.
- `prompts[].models` is the set of short ids with ≥ 1 run in the window.
- `prompts[].activeRunCount` reflects the count.

### 11.5 `POST /api/prompts/run`
- 11.5.a Body `{ promptId }` → runs only that prompt.
- 11.5.b Empty body → runs all active prompts for the primary brand.
- 11.5.c Non-existent `promptId` → 404 (validate desired behavior; spec is silent).
- 11.5.d Returns same response shape as cron.

### 11.6 `GET /api/prompts/[id]`
- Returns `prompt`, `runs` (most recent N=50), `citations`, `modelBreakdown`.
- `modelBreakdown` includes all 5 models; missing-data models have `mentioned = null`.
- `latestResponsePreview` is the first 300 chars.

### 11.7 `POST /api/prompts`
- Body `{ text, topic }` → creates prompt; returns `{ id }`.
- Empty body or missing fields → 400.
- New prompt's `brand_id` is the primary brand.

### 11.8 `DELETE /api/prompts`
- Body `{ id }` → sets `is_active = false`.
- Prior runs and citations are NOT deleted.
- Returns `{ ok: true }`.

### 11.9 Onboarding routes (covered in §9.1–9.6)

### 11.10 SQL parameterization & SQL injection
- For every read route, inject `';--` in `days` and `model` params and assert: query fails safely or value is rejected by type validation, and no SQL is executed beyond the parameter binding. No exception leaks bare SQL.
- **Approach:** Integration test with adversarial inputs.

---

## 12. UI / Dashboard (Playwright + Manual)

### 12.1 App shell & navigation
- 12.1.a Sidebar pinned, 200px wide, background `#0d0d10`.
- 12.1.b Nav: Overview / Prompts / Sources; active state has teal icon and lighter row background.
- 12.1.c "Run All Prompts" button at sidebar bottom; click triggers POST and shows a spinner; on completion, all panels refresh and a toast shows the batch cost.
- 12.1.d Header brand pulsing teal dot animates.
- 12.1.e Date range and model filter dropdowns persist in URL search params (so back/forward preserves filter state).
- 12.1.f Toggling model dims non-selected pills to `opacity-30`.

### 12.2 Date & model filters update every panel
- **Steps:** Open Overview. Change days from 7 → 30. Change model to Claude.
- **Expected:** Metric cards, chart, rankings, sources, actions, recent chats — all re-fetch and update. Same on Prompts and Sources tabs.
- **Approach:** Playwright e2e against seeded data.

### 12.3 Overview tab
- 12.3.a Metric cards render. Avg Sentiment shows `—` when there are zero mentioned runs in window. Avg Position shows `—` when no positions.
- 12.3.b Visibility chart renders weekly buckets; brand line is teal 2px; competitor lines 1.5px at 0.6 opacity; X-axis labels `MMM DD`.
- 12.3.c Tooltip sorts by value desc; shows color dot + name + percentage.
- 12.3.d Legend renders.
- 12.3.e Rankings table — brand row is highlighted; entity sentiment column shows `—` (muted dot) when entity has zero mentioned runs.
- 12.3.f AI Search Impact circles render with correct ring colors; "Key Insight" text matches the tier rules.
- 12.3.g Action cards render with the correct left-border colors (red/amber/blue) and the documented set per §15.E.
- 12.3.h Top Domains preview shows ≤ 8 rows.
- 12.3.i Recent Chats — up to 3 columns; each card shows model pills colored if model has ≥ 1 run, dimmed otherwise.

### 12.4 Prompts tab
- 12.4.a Topic filter pills appear: All + every distinct topic in prompts.
- 12.4.b "+ Add Prompt" inline form creates a new prompt; row prepends; form clears.
- 12.4.c Sentiment column shows `—` (not `55`) for prompts with zero mentioned runs.
- 12.4.d Play icon triggers single-prompt run; row shows inline spinner; refreshes on completion.
- 12.4.e Archive icon → row fades out; table re-fetches; the row is gone.
- 12.4.f Click prompt text → opens Prompt Detail Modal.

### 12.5 Prompt Detail Modal
- 12.5.a Backdrop click closes; X closes; ESC closes (manual verify).
- 12.5.b 5 model cards in order: openai, claude, gemini, perplexity, google_aio.
- 12.5.c Mentioned models get green border tint.
- 12.5.d Click card expands; shows latest response preview (first 300 chars).
- 12.5.e Models with no run in window show "No run in window".

### 12.6 Sources tab
- 12.6.a Domains ↔ URLs toggle renders; pill-style; active item differentiated.
- 12.6.b Area chart shows top 5 domains over time (weekly bucketing).
- 12.6.c Table columns: `#`, Domain/URL, Type, Retrieved, Citation Rate. Type badges color-coded.
- 12.6.d Empty state ("No sources retrieved for this model in the selected window.") shows when model has zero citations in window.

### 12.7 Theme & design tokens
- 12.7.a `globals.css` defines the exact tokens in §16.
- 12.7.b Inter font loaded; antialiased; tabular-nums on numbers.
- 12.7.c Cards use `rounded-lg border border-border/40 bg-card/60 p-5`.
- 12.7.d Scrollbar styling matches: 5px thumb `#2a2a2f` track transparent.
- **Approach:** Visual diff (manual) + a Playwright screenshot regression on Overview at 1440x900.

---

## 13. Edge Cases & Failure Behaviors (§17)

Each item below should have at least one targeted test.

| # | Edge case | Test |
|---|---|---|
| 13.1 | No primary brand → onboarding shown | Integration: `/` returns onboarding when `GET /api/brand` is `{ brand: null }`. |
| 13.2 | Schema not applied → redirect to `/setup` | Integration. |
| 13.3 | Single model fails mid-batch | Already covered (7.3). |
| 13.4 | All 5 models fail for a prompt | Already covered (7.4). |
| 13.5 | Crawl homepage failure | Already covered (9.1.b). |
| 13.6 | Generator returns unparseable JSON, retry, then fail | Already covered (4.4 / 9.3). |
| 13.7 | Brand mention false positive on "Apple"-style names | Documented (3.1.j); also document expected `Generic-brand` behavior in README. |
| 13.8 | Position scoring — brand appears twice in numbered list | First mention wins (3.2.h). |
| 13.9 | Sentiment — brand mentioned, no qualifying words | Per-run `neutral`, but Avg Sentiment averages mentioned runs only (8.4 / 3.3.f). |
| 13.10 | DataForSEO error → google_aio single-model failure | Already covered (6.6). |
| 13.11 | Perplexity returns no citations | Already covered (5.3.c). |
| 13.12 | Two cron runs same minute | Allowed (10.7). |
| 13.13 | App restarted mid-batch | Manual verify: kill the dev server during a batch; restart; ensure DB is in a consistent state (existing rows fine, partial run not orphaned). |
| 13.14 | Response truncated at 2000 tokens, brand appeared later | Documented tradeoff; no automated test. |
| 13.15 | Double-click "Run All Prompts" | Client disables button while in flight; second click ignored. Playwright test. |
| 13.16 | `MODEL_GEMINI` preview id deprecated | Orchestrator logs and skips gemini; dashboard shows a gap. Integration test by injecting a 4xx for that model. |
| 13.17 | Trend chart with < 4 weeks of data | Integration: seed 2 weeks; assert legend + axis still render. |
| 13.18 | Sources tab filtered to a model with no citations | Empty state UI; not broken chart (12.6.d). |
| 13.19 | URL with trailing `)` in prose | Regex stops at `)` (3.5.d). |

---

## 14. Security

### 14.1 Secrets stay server-side
- 14.1.a `LLM_GATEWAY_API_KEY`, `PERPLEXITY_API_KEY`, `DATAFORSEO_PASSWORD`, `CRON_SECRET` are read only in `lib/` server modules and route handlers — never in `'use client'` components.
- 14.1.b No secret appears in `next dev` HTML output. Approach: render the dashboard, grep the HTML response for env values.
- 14.1.c No secret appears in error responses. Approach: trigger a Gateway error and inspect the body.
- 14.1.d `.gitignore` includes `.env`, `.env.local`, `.env.*`. Approach: assert via `grep`.

### 14.2 Cron bearer is the only auth for `/api/cron/run`
- Constant-time comparison used (no early-exit string compare leaking timing). Approach: code review + a `timingSafeEqual` reference.

### 14.3 SQL injection
- All input params (`days`, `model`, body fields) validated and bound. Approach: covered in 11.10.

### 14.4 No internal IP/network exposure
- No `localhost` URLs printed in user-facing error UI (would be silly here, but worth a smoke check).

### 14.5 Cheerio HTML parsing
- HTML from untrusted sites parsed in `cheerio` server-side and never injected into the DOM. Approach: code review — no `dangerouslySetInnerHTML` in onboarding components.

### 14.6 Onboarding crawl uses well-formed User-Agent
- Approach: integration test; spec at §9 mandates `LuminaireBot/1.0 (+https://luminaire.local)`.

---

## 15. Performance

### 15.1 Single-batch wall clock
- **Expected:** 5 prompts × 5 surfaces, mostly serial, completes in ~2–6 minutes (per Q15). Test target: ≤ 10 minutes ceiling.
- **Approach:** Manual smoke test with real APIs. Log the batch duration to console.

### 15.2 Single API request latency
- **Expected:** `GET /api/overview?days=7` returns in < 500ms on the dev DB. Test against Neon branch with 90 days × 5 models × 5 prompts seeded.
- **Approach:** Integration timing assertion.

### 15.3 Dashboard initial render
- **Expected:** Time-to-interactive < 2s on a warm load.
- **Approach:** Playwright performance trace, manual smoke.

### 15.4 SQL indexes used
- **Approach:** `EXPLAIN ANALYZE` on the metrics queries; assert index usage on `idx_runs_created_at`, `idx_runs_prompt_id`, `idx_runs_model`, `idx_citations_run_id`, `idx_citations_domain`.

### 15.5 No N+1 queries on dashboard load
- **Approach:** Code review + assertion on the number of DB round trips per `GET /api/overview` (target: < 10).

### 15.6 Single Neon client reused
- **Approach:** Code review: `lib/db.ts` exports a singleton; no `new Pool()` per request.

---

## 16. Acceptance Criteria — Mapping to Definition of Done (§20)

| DoD item | Scenarios that prove it |
|---|---|
| 1. `npm install && db:migrate && dev` brings up app on 4810 | 2.1, 2.2, 12.1 |
| 2. Empty DB → `/setup`; "Run migration" applies schema | 13.2, 2.1 |
| 3. Onboarding produces 5 prompts + 4–5 competitors; Launch saves | 9.1–9.7 |
| 4. Dashboard filters update all three tabs | 12.2 |
| 5. "Run All Prompts" completes; failures skipped; batch cost shown | 7.1, 7.3, 12.1.c |
| 6. `npm run cron` matches button behavior; 401 without bearer | 10.1–10.6 |
| 7. Overview tab renders all sections, sparse trend handled | 12.3, 13.17 |
| 8. Prompts tab + Prompt Detail modal | 12.4, 12.5 |
| 9. Sources tab toggle + empty state | 12.6, 13.18 |
| 10. All APIs match docs; parameterized SQL; no secrets to client; theme matches; cron docs in README | 11.x, 14.x, 12.7 |

---

## 17. Eval Targets (Post-MVP, Mission Control)

These are quality measurements, not pass/fail tests. Recommended to author as evals against `mc_run_evals` once data exists:

- **Prompt generation quality** — given 10 real product crawls, do the generated prompts cover the 5 topics, avoid brand-name leakage, and read like real buyer queries? Scored by a judge model.
- **Competitor generation quality** — are the 4–5 competitors actual competitors (not consultancies, not generic SaaS)? Scored by a judge model.
- **Brand mention recall** — given a hand-labeled corpus of 50 LLM responses with known brand mentions, what's the parser's recall/precision?
- **Sentiment accuracy** — same corpus, hand-labeled sentiment; what's parser accuracy vs. ground truth? Tune word lists.
- **Domain classification accuracy** — given 200 real cited domains, what's the classifier's agreement with a hand label?

---

## 18. Spec Ambiguities — Worth Flagging Before Test Authoring

The refined spec is unusually thorough, but these items are not fully pinned down and a test author will have to choose:

- **18.1 Visibility change when prior window has zero runs.** Spec gives the formula (current − prior in pp) but does not say what to render when the prior window is empty. Suggested: `null` → render `—`. Confirm with PM if the dashboard should distinguish "no prior data" from "0% prior".
- **18.2 Ties in Competitive Rank.** Spec does not specify the tie-breaker if brand and a competitor have equal visibility. Suggested: brand wins.
- **18.3 Tie behavior in sentiment word counts.** Spec says "tie → neutral" but does not specify whether equal *zero* counts (no qualifying words at all) should be `neutral` (yes — covered by spec) vs. `null`. We use `neutral` per §11.3, but in aggregation a per-run `neutral` from "brand mentioned but no qualifying words" is treated the same as a per-run `neutral` from "brand not mentioned". This is fine for §13.4 since aggregation filters to mentioned runs first — but worth confirming with PM that "mentioned-but-no-tone" runs SHOULD contribute `55` to the average. (If not, they should be excluded too, leading to `null` when no qualifying words exist anywhere.)
- **18.4 Numbered-list position rule precedence.** §11.2 step 2 says numbered list overrides segment math. If the *first* mention is in prose but a *later* mention is in a numbered list, which wins? Spec implies "first mention wins" (so prose segment math applies). Lock this in a test; document the choice.
- **18.5 `POST /api/prompts/run` with non-existent `promptId`.** Spec does not say. Suggested: 404 with `{ error: 'prompt not found' }`.
- **18.6 Single-prompt run cron-style result shape.** When a single-prompt run is fired, the spec says "same shape as cron." Does it still include `batchId`, even if the batch is one prompt × five models? Suggested: yes.
- **18.7 Recent Chats sentiment value.** §14 lists `sentiment: { label, score }`. The label is per-run text (`positive | neutral | negative`) and the score is the numeric mapping (80/55/30). When a prompt has multiple recent runs across models, which run's sentiment goes here? Suggested: the most recent run for that prompt. Confirm in tests.
- **18.8 Onboarding crawl when the homepage redirects 301 → 302 → final.** Spec is silent. Suggested: follow redirects up to 3 hops, then surface the final URL.

These do not block the QA plan itself — the listed scenarios still apply — but they need an answer (from the PM or from a default we lock in tests) before the corresponding test fixtures can be authored.

---

## 19. Test Authoring Order (Recommendation)

To deliver value fast and catch the most likely regressions early:

1. **Parser unit tests** (§3) — highest density of silent-distortion bugs.
2. **Metrics unit + integration tests** (§8) — particularly §8.4 (avg sentiment empty → `—`), which is the only product-judgment metric in the spec.
3. **Orchestrator integration tests** (§7) — proves the per-call failure isolation rule.
4. **API contract tests** (§11) — pins down the shape that the UI depends on.
5. **Cron auth + behavior** (§10) — small surface, security-critical.
6. **Onboarding flow** (§9) — multi-step; expensive bug to find by hand.
7. **Playwright e2e** (§12) — last, after the API surface is locked.

---

End of QA plan.
