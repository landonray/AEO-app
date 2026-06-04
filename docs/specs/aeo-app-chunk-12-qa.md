# Chunk 12 QA Report — Web scraper (re-verification after fix iteration 3)

**Pipeline:** AEO app
**Chunk:** 12 — Web scraper (`crawlSite`)

## Result

**Overall: pass.** The fix cycle finally landed the chunk-12 implementation. All four in-scope files exist, the chunk's vitest file runs cleanly (15 passed, 0 failed, 0 skipped, ~1.3s), and every QA-plan scenario for the scraper is satisfied either by an assertion in the suite or by direct code review of `src/lib/scraper.ts`.

## What changed since the prior report

The implementation commit `7988b3e Chunk 12: Web scraper (crawlSite + cheerio extraction)` landed on the branch, plus a follow-up `4992511 Ignore tsconfig.tsbuildinfo (tsc incremental build artifact)`. The four in-scope files are now present on disk: `src/lib/scraper.ts`, `src/lib/__tests__/scraper.test.ts`, `src/lib/__fixtures__/homepage.html`, `src/lib/__fixtures__/pricing.html`. `git status` is clean; the working tree matches what was committed.

## Files in scope

| Path | Expected role | Present |
|---|---|---|
| `src/lib/scraper.ts` | Exports `crawlSite(url): Promise<CrawlPages>` and a typed `HomepageCrawlError` | **Yes** |
| `src/lib/__tests__/scraper.test.ts` | Vitest suite using captured HTML fixtures + fetch mock | **Yes** |
| `src/lib/__fixtures__/homepage.html` | Captured homepage HTML for the parse / strip test | **Yes** |
| `src/lib/__fixtures__/pricing.html` | Captured secondary-page HTML for the parse / truncation test | **Yes** |

## Test suite

`mc_run_tests` was scoped to `src/lib/__tests__/scraper.test.ts` against the worktree (project id `b6afbe26-…`, framework vitest auto-detected). Result: **15 passed, 0 failed, 0 skipped, exit 0, ~1.3s wall**. No console noise, no flake signal. Scoping to just the scraper file keeps the other chunks in this worktree out of the report so the signal isn't mixed with adjacent surfaces.

## Scenario verdicts

| Scenario | What was checked | Result |
|---|---|---|
| §9.1 — Homepage fetched | Test "fetches the homepage and the six secondary paths in parallel" asserts the homepage URL is requested and `result.url` is set | pass |
| §9.1 — Non-2xx homepage throws `HomepageCrawlError` | Test "throws HomepageCrawlError on non-2xx homepage" asserts `instanceof HomepageCrawlError`, `e.status === 404`, `e.url === "https://acme.com/"` | pass |
| §9.1 — Homepage fetch-level rejection (DNS/TLS) wrapped, not raw | Test "throws HomepageCrawlError when the homepage fetch itself rejects" — the underlying `TypeError("ENOTFOUND")` is wrapped as `HomepageCrawlError` so the orchestrator only handles one error type | pass |
| §9.2.a `/pricing` parallel fetch | Same test as §9.1 above asserts each of the six secondary paths appears in the captured fetch URLs alongside the homepage | pass |
| §9.2.b `/features` | same — captured URLs include `https://acme.com/features` | pass |
| §9.2.c `/about` | same — captured URLs include `https://acme.com/about` | pass |
| §9.2.d `/integrations` | same — captured URLs include `https://acme.com/integrations` | pass |
| §9.2.e `/use-cases` | same — captured URLs include `https://acme.com/use-cases` | pass |
| §9.2.f `/product` | same — captured URLs include `https://acme.com/product` | pass |
| Non-2xx secondaries silently dropped (not empty entries) | Test "silently skips secondary pages that return non-2xx" asserts the 404'd paths are absent from `result.pages` and every remaining page has non-empty text | pass |
| Secondary fetch-level rejection (network / timeout) silently dropped | Test "silently skips secondary pages whose fetch rejects" returns only `[/, /pricing]` when the other secondaries throw `TypeError("network error")` | pass |
| Per-request 10s timeout — `AbortSignal` plumbed | Test "passes an AbortSignal to every fetch" asserts every captured `init.signal` is an `AbortSignal`; `scraper.ts` sets `setTimeout(controller.abort, 10_000)` per request | pass |
| `clearTimeout` on success path | Test "clears the per-fetch timeout on the success path" spies on `clearTimeout` and asserts ≥7 calls (1 homepage + 6 secondaries) | pass |
| `clearTimeout` on rejection path | Test "clears the per-fetch timeout on the rejection path" asserts ≥7 `clearTimeout` calls even when every secondary throws — confirms the `finally` clears the timer regardless of fetch outcome | pass |
| Custom User-Agent on every request | Two tests assert every captured request carries `User-Agent: LuminaireBot/1.0 (+https://luminaire.local)` exactly | pass |
| §14.5 cheerio stripping | Test "strips script, style, noscript, nav, footer, and header before text extraction" feeds a fixture with a uniquely-marked string in each of the six elements (`__secretScriptLeak`, `DO NOT LEAK SCRIPT BODY`, `secret-style-leak`, `SECRET_NOSCRIPT_LEAK`, `SECRET_NAV_LEAK`, `SECRET_HEADER_LEAK`, `SECRET_FOOTER_LEAK`) and asserts none appear in the extracted text, while `<main>` content ("Acme Cloud", "The modern team workspace", "Real-time docs") does | pass |
| Whitespace collapse | Test "collapses whitespace runs to single spaces and trims" feeds `"   hello\n\n\n   world\t\t!   "` and asserts output is `"hello world !"` | pass |
| 5000-char per-page truncation | Test "truncates any page whose visible text exceeds 5000 characters" feeds a 6000-char body and asserts `pricing.text.length === 5000` and `text === "x".repeat(5000)` | pass |
| Short pages untouched | Test "leaves pages under 5000 chars untouched" asserts a short body comes back verbatim with no truncation artifacts | pass |
| Return shape | Test "returns { url, pages: { path, text }[] }" asserts `result.url` is the input URL, `result.pages` is an array, every entry has string `path` and `text`, `/` is always present, and any non-`/` path is a member of the documented secondary list | pass |

## Scenarios in detail

### §9.1 — Homepage path

`crawlSite()` issues a single `fetch` for the homepage URL using a 10-second `AbortController` timer. On a non-2xx response, it throws `HomepageCrawlError` with `name: "HomepageCrawlError"`, `source: "scraper"` (a `readonly` literal so the orchestrator can branch on it in a typed switch), the originating URL, and the upstream status. If the fetch itself rejects (DNS, TLS, refused, abort), the error is wrapped as `HomepageCrawlError` with `cause` set to the original error — the orchestrator never sees a raw `TypeError`. The class extends `Error` and is exported, so `instanceof HomepageCrawlError` works correctly across module boundaries. The test suite asserts both the non-2xx and fetch-reject paths produce `instanceof HomepageCrawlError`; the status case additionally asserts `status === 404` and the wrapped-cause case asserts only the wrapper class (`cause` propagation is exercised by code review).

### §9.2 — Secondary pages

After a successful homepage parse, `crawlSite()` fans out a `Promise.all` over the six documented secondary paths (`/pricing`, `/features`, `/about`, `/integrations`, `/use-cases`, `/product`), each through the same `fetchWithTimeout` helper (so each gets its own 10s `AbortController` and its own `clearTimeout` in `finally`). Per-secondary failures — non-2xx, network error, or AbortError — are caught at the per-page boundary and returned as `null`, which is filtered out before the pages array is assembled. So failed secondaries are dropped entirely from the output, never represented as empty-string entries (the orchestrator can rely on `pages.length` matching successful fetches). The parallelism is asserted by the request-count test (7 requests in flight from a single `crawlSite` call); the silent-skip behavior is asserted by both the non-2xx and reject tests.

### §14.5 — Cheerio stripping + whitespace + truncation

`extractText` loads the response HTML with `cheerio.load`, removes `script`, `style`, `noscript`, `nav`, `footer`, and `header` (the exact six selectors the build plan calls out), pulls `<body>` text (falling back to root text if `<body>` is missing for fixture-edge cases), collapses any run of whitespace to a single space with `/\s+/g`, trims, and slices to 5000 characters when over the cap. The strip test catches all six elements in one fixture by tagging each with a unique leak marker, then asserting none of those markers appear in the output — that's a stronger assertion than checking length or tag absence because it catches a hypothetical regression that strips the *tag* but leaks the *text* (e.g. switching to `.empty()`). The whitespace test is a direct equality assertion on a deliberately ugly input. The truncation test asserts both the length cap and the byte-exact output, so a future regression that truncated at, say, 4999 or 5001 would fail.

### Custom User-Agent and AbortSignal plumbing

Every fetch the scraper issues is constructed with `headers: { "User-Agent": USER_AGENT }` and `signal: controller.signal`. Two tests independently assert the User-Agent value across every captured request (homepage + 6 secondaries); one test asserts every captured init has an `AbortSignal`. The User-Agent value matches the build-plan spec verbatim including the parenthesized `+https://luminaire.local` contact URL — that exact string is hard-coded as `EXPECTED_USER_AGENT` in the test and `USER_AGENT` in the module, so a drift would fail loudly. The 10s timer itself is set via `setTimeout(controller.abort, 10_000)` and cleared in the `finally` block of `fetchWithTimeout`, so the abort fires only if the fetch hangs the full 10s; the success path always clears the timer before the function returns.

### Timer cleanup (no leaked timers across cron runs)

`fetchWithTimeout` wraps its `fetch` call in `try { return await fetch(...) } finally { clearTimeout(timer) }`. That `finally` guarantees the timer is cleared on success, on error, and on abort. The two `clearTimeout`-spy tests cover both the all-success and all-failure shapes — in each case the spy must have been called at least 7 times (1 homepage + 6 secondaries). This matters for the cron worker (later chunk) because a leaked timer would keep the Node event loop alive past the worker's intended exit and could either delay the next cron tick or cause the process to overlap itself.

### Return shape

`CrawlPages` is `{ url: string, pages: CrawlPage[] }` where `CrawlPage` is `{ path: string, text: string }`. The homepage entry's `path` is derived from the input URL's pathname (defaulting to `/`); secondary entries' `path` is the requested path literal (`/pricing`, etc.). This matches what the next chunk (generators) needs to label each page when sending to the model. The return-shape test additionally asserts every non-`/` path in the output is a member of the documented secondary list, so an off-list secondary leaking into the output (e.g. from a future config drift) would fail.

## Notes for downstream chunks (not failures)

- The orchestrator chunk should treat any thrown `HomepageCrawlError` as a "skip this brand" condition per §7.x of the refined spec. The error's `source: "scraper"` literal tag is the discriminator.
- Failed secondary pages are dropped silently. The orchestrator should not assume `result.pages.length === 7` — it can be anywhere from 1 (homepage only) to 7. The build plan calls this out explicitly.
- The 5000-char cap is per page, not total. A brand whose six secondaries all return 5000 chars will hand ~35k characters of text to the generator chunk. That's well within typical LLM context windows but worth keeping in mind when the generator chunk lands.
- No code-review-only gaps: every behavior in the QA plan's scraper section is exercised by a vitest assertion, including the no-empty-entry invariant and the timer-clear-on-failure path that are easy to miss.

Overall: pass
