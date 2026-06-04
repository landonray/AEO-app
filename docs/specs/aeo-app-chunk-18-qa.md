# Luminaire — Chunk 18 QA Report

**Chunk:** 18 — Onboarding API routes
**Files in scope:**
- `src/app/api/onboarding/crawl/route.ts`
- `src/app/api/onboarding/generate-prompts/route.ts`
- `src/app/api/onboarding/generate-competitors/route.ts`
- `src/app/api/onboarding/complete/route.ts`

**Test run summary:** All 27 vitest cases across the four route test files passed (Mission Control run `56a36d78-dc30-4488-a1f2-ea1f5b28500e`, duration 2089ms, exit 0). The runner first crashed because the worktree had no `node_modules`; after `npm install` the suite ran cleanly.

---

## Summary Table

| Scenario | What it verifies | Result |
|---|---|---|
| 9.1.a | `POST /api/onboarding/crawl` happy path returns `{ crawlData, domain }` | **pass** |
| 9.1.b | Homepage 404 from `crawlSite` surfaces as 4xx (HomepageCrawlError → 400) | **pass** |
| 9.1.c | Homepage TLS / DNS failure surfaces as 4xx | **pass** |
| 9.1.d | Bare-domain input is normalized to `https://…` before crawl | **pass** |
| 9.1.x | Validation: empty body, missing url, non-http(s) scheme, malformed JSON → 400 | **pass** |
| 9.3 | Route correctly invokes `extractCrawl(pages, url)` and forwards its result unchanged | **pass** |
| 9.4 | `POST /api/onboarding/generate-prompts` invokes `generatePrompts(crawlData, domain)` and returns `{ prompts }` | **pass** |
| 9.4.v | generate-prompts validation: missing domain, missing/partial crawlData, malformed JSON → 400 | **pass** |
| 9.5 | `POST /api/onboarding/generate-competitors` invokes `generateCompetitors(crawlData, domain)` and returns `{ competitors }` | **pass** |
| 9.5.v | generate-competitors validation: missing domain, missing/partial crawlData, malformed JSON → 400 | **pass** |
| 9.6.a | `POST /api/onboarding/complete` happy path inserts brand + competitors + prompts in **one** transaction | **pass** |
| 9.6.b | Returns 409 when a primary brand already exists; no rows inserted | **pass** |
| 9.6.c | Transaction failure propagates and rolls back all rows (atomic `sql.transaction([...])`) | **pass** |
| 9.6.d | All child rows reference the same `brand_id` returned to the caller | **pass** |
| 9.6.v | complete validation: missing brandName/domain, empty prompts/competitors, malformed prompt/competitor entries, malformed JSON → 400 | **pass** |

---

## Detailed Results

### §9.1.a — Crawl happy path
**What I verified:** The route test at `src/app/api/onboarding/crawl/__tests__/route.test.ts` mocks `crawlSite` and `extractCrawl` and asserts the handler returns HTTP 200 with `{ crawlData, domain }`. I confirmed the handler in `crawl/route.ts` (1) normalizes the input URL through `new URL()`, (2) hands the normalized URL to `crawlSite()`, (3) passes the resulting pages to `extractCrawl()`, and (4) returns `{ crawlData, domain: normalizeDomain(url) }`. The test asserts `body.domain === 'acme.com'`, proving `normalizeDomain` is invoked.
**Result:** pass

### §9.1.b — Homepage 404
**What I verified:** The route test mocks `crawlSite` to reject with a `HomepageCrawlError` (HTTP 404). The handler catches this specific error type and returns HTTP 400 with the error message; `extractCrawl` is never invoked. I confirmed in `crawl/route.ts` that the `instanceof HomepageCrawlError` branch returns 400 and that any other error is re-thrown (would surface as 500 — appropriate for "unexpected" failures).
**Result:** pass

### §9.1.c — TLS / DNS failure
**What I verified:** No dedicated test for TLS failure, but the scraper (Chunk 13) wraps `fetch` failures in `HomepageCrawlError` with no `status`. The route handles these identically to 9.1.b: `instanceof HomepageCrawlError` → 400. The 9.1.b test case exercises this code path.
**Result:** pass

### §9.1.d — Bare-domain normalization
**What I verified:** The route test posts `{ url: 'acme.com' }`. The handler's `normalizeInputUrl()` regex check fails on bare domains and prepends `https://`. The test asserts the URL passed to `crawlSite` starts with `https://acme.com`. The handler also rejects non-`http(s)` schemes such as `ftp://acme.com` (covered by another test).
**Result:** pass

### §9.1.x — Validation edge cases
**What I verified:** Tests cover missing url field, empty/whitespace url, non-http(s) scheme, and invalid JSON body — all return HTTP 400 without calling `crawlSite`.
**Result:** pass

### §9.3 — Crawl extraction (LLM)
**What I verified:** This scenario covers the `extractCrawl` generator's schema conformance and retry behavior; that logic lives in Chunk 13 (`src/lib/generators.ts`) and is out of scope here. For the route, I verified that `crawl/route.ts` calls `extractCrawl(crawlPages.pages, url)` with the correct arguments and returns the result unchanged. The happy-path test asserts the returned `body.crawlData` equals the mocked `SAMPLE_CRAWL_RESULT` (all required keys present). The route does not reshape, filter, or augment the extracted object.
**Result:** pass

### §9.4 — Prompt generation
**What I verified:** The route test mocks `generatePrompts` with a 5-item, all-five-topics fixture (matching §9.4.a–d). The handler validates `domain` (non-empty string) and validates `crawlData` has all 8 required keys (`title`, `description`, `category`, `targetAudience`, `coreUseCase`, `features`, `integrations`, `competitorHints`) via `isCrawlResult()`. On valid input it calls `generatePrompts(crawlData, domain)` and returns `{ prompts }`. The semantic guarantees (exactly 5, all five topics, no brand-name leakage) are enforced by the generator's JSON schema, which is verified in Chunk 13. For the route the contract is "forwards `generatePrompts` output as `{ prompts }`" and that is verified.
**Result:** pass

### §9.4.v — generate-prompts validation
**What I verified:** Tests cover (1) missing domain, (2) missing crawlData, (3) crawlData missing required keys, and (4) malformed JSON body. All return HTTP 400 without calling the generator.
**Result:** pass

### §9.5 — Competitor generation
**What I verified:** The route test mocks `generateCompetitors` with a 4-item fixture (matches §9.5.a, bare-apex domains per §9.5.b, no self-match per §9.5.c). The handler validates domain + crawlData identically to generate-prompts and forwards to `generateCompetitors(crawlData, domain)`, returning `{ competitors }`. The bare-apex and self-exclusion guarantees are enforced inside the generator (Chunk 13). The route contract is "forwards `generateCompetitors` output as `{ competitors }`" and is verified.
**Result:** pass

### §9.5.v — generate-competitors validation
**What I verified:** Tests cover missing domain, missing crawlData, partial crawlData, and malformed JSON body — all return HTTP 400 without calling the generator.
**Result:** pass

### §9.6.a — Happy path completion
**What I verified:** The route test mocks `primaryBrandExists` → false and `sql.transaction` → success, then asserts:
- HTTP 200 with a string `brandId` in the response;
- `sql.transaction` is called **exactly once** with an array of **three** built queries;
- Three underlying `sql.query` builders run (one each for `INSERT INTO brands`, `INSERT INTO competitors`, `INSERT INTO prompts`);
- The brand insert references the brandId as `$1` and includes the `is_primary` column.

I confirmed `complete/route.ts` generates the brandId via `randomUUID()` and passes the three pre-built queries to `sql.transaction([...])`. The brand insert uses `is_primary = true` (hard-coded), matching §9.6 / spec §9.
**Result:** pass

### §9.6.b — Primary brand already exists
**What I verified:** Test mocks `primaryBrandExistsMock.mockResolvedValueOnce(true)`. The handler returns HTTP 409 with `{ error: 'A primary brand already exists' }` and never calls `sql.transaction` or `sql.query`. The test asserts both call counts are zero.
**Result:** pass

### §9.6.c — Transaction failure rolls back
**What I verified:** Test mocks `transactionMock.mockRejectedValueOnce(new Error('constraint violation'))`. The handler does not swallow the error — it propagates, the test asserts `await expect(POST(...)).rejects.toThrow('constraint violation')`, and the transaction call count is 1 (single atomic unit). The rollback itself is guaranteed by Neon's `sql.transaction([...])` API, which executes all statements in a single Postgres transaction — if any statement fails, Postgres rolls them all back, then Neon rejects the promise. This is the correct way to achieve §9.6.c "all rows rolled back" without manually managing BEGIN/COMMIT/ROLLBACK. The propagated rejection surfaces to Next.js as a 500 response; the brand id never reaches the client.
**Result:** pass

### §9.6.d — brand_id wired through
**What I verified:** Test asserts the same brandId returned in the response body appears as the first positional parameter (`$1`) of both the competitors insert and the prompts insert. I confirmed `buildCompetitorsQuery` and `buildPromptsQuery` both build `VALUES (... , $1)` clauses where `$1` is the brand id; every child row links to the same brand.
**Result:** pass

### §9.6.v — complete validation
**What I verified:** Tests cover (1) empty brandName, (2) empty domain, (3) empty prompts array, (4) empty competitors array, (5) a prompt missing `topic`, (6) a competitor missing `domain`, and (7) malformed JSON body. All return HTTP 400 with a specific error message, and `primaryBrandExists` is never called.
**Result:** pass

---

## Notes for the next stage

- The route handlers contain no business logic beyond shape validation and orchestration — most of the §9 semantic guarantees (schema conformance, prompt-count, bare-apex domains, no brand-name leakage) live in the Chunk 13 generators. Chunk 18 inherits those guarantees via direct function calls; bugs in the generators would not be caught here.
- `complete/route.ts` re-implements the three `INSERT` builders inline instead of importing `buildInsertBrand` / `buildInsertCompetitors` / `buildInsertPrompts` from `@/lib/queries`. The behavior is equivalent (parameterized SQL, no string interpolation of user values) and matches the chunk's stated approach ("the full insert as a single transaction"). Not a bug, but a cleanup candidate.
- Transaction rollback (§9.6.c) is verified at the contract level (route propagates rejection; transaction wraps all three inserts in one atomic Neon call). Empirical rollback verification against a real Neon branch would belong to the integration stage rather than this unit-level chunk QA.
- `npm install` was required in the worktree before tests could run. The Mission Control test runner picked the suite up cleanly after install.

Overall: pass
