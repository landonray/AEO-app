# Chunk 12 QA Report — Web scraper

**Pipeline:** AEO app
**Chunk:** 12 — Web scraper (`crawlSite`)

## Result

**Overall: fail.** The chunk's implementation is still absent from the worktree. None of the in-scope files exist on disk, so there is no behavior for QA to exercise.

## Files in scope (per build plan §"Chunk 12: Web scraper")

| Path | Expected role | Present on disk? |
|---|---|---|
| `src/lib/scraper.ts` | Exports `crawlSite(url): Promise<CrawlPages>` and the typed `HomepageCrawlError` | **No** |
| `src/lib/__tests__/scraper.test.ts` | Unit suite for crawl + cheerio extraction using HTML fixtures and a fetch mock | **No** |
| `src/lib/__fixtures__/homepage.html` | Captured HTML fixture for the homepage parse test | **No** |
| `src/lib/__fixtures__/pricing.html` | Captured HTML fixture for the secondary-page parse test | **No** |

## What I checked

- Listed `src/lib/` directly: only `db.ts`, `llm/`, `utils.ts`, and the existing `__tests__/utils.test.ts` are present. There is no `scraper.ts`, no `__fixtures__/` directory, and no scraper test file.
- Searched the entire `src/` tree (`find src -name "scraper*"`) — zero matches.
- Reviewed the worktree git history: the only commit on this branch tagged for chunk 12 is `faf59ab pipeline: chunk 12 pre-flight (no implementation produced)`. That commit added nothing but this QA file's prior pre-flight placeholder. The working tree is clean — no untracked scraper sources, no staged changes, no in-flight implementation that simply wasn't committed.
- Re-read the build plan's chunk 12 section to confirm the expected file list and behavior contract (fetch homepage with typed `HomepageCrawlError` on non-2xx, parallel fetch of `/pricing`, `/features`, `/about`, `/integrations`, `/use-cases`, `/product` with a 10s `AbortController` timeout each, `User-Agent: LuminaireBot/1.0 (+https://luminaire.local)`, silent skip on non-2xx for secondaries, cheerio parse with `script`/`style`/`noscript`/`nav`/`footer`/`header` stripped, whitespace-collapsed text, 5000-char per-page truncation, return shape `{ url, pages: { path, text }[] }`).

## Scenario verdicts

Every QA-plan scenario for this chunk is marked **not testable — implementation missing**. The scenarios from §9.1 (homepage fetch + `HomepageCrawlError` on non-2xx), §9.2.a–f (the six secondary pages, each with timeout + silent skip on failure), and §14.5 (cheerio strips the listed selectors before extracting text) cannot be exercised because the module they cover does not exist. No test file exists to execute, so a vitest run on the chunk would discover zero tests rather than report failures.

| Scenario | Expected check | Result |
|---|---|---|
| §9.1 — Homepage fetch path | `crawlSite` POST/GETs the homepage, throws `HomepageCrawlError` on non-2xx | **not testable** — module absent |
| §9.2.a — `/pricing` fetched in parallel, silent skip on non-2xx | Parallel fetch with 10s `AbortController`, error swallowed | **not testable** — module absent |
| §9.2.b — `/features` | Same as §9.2.a | **not testable** — module absent |
| §9.2.c — `/about` | Same as §9.2.a | **not testable** — module absent |
| §9.2.d — `/integrations` | Same as §9.2.a | **not testable** — module absent |
| §9.2.e — `/use-cases` | Same as §9.2.a | **not testable** — module absent |
| §9.2.f — `/product` | Same as §9.2.a | **not testable** — module absent |
| Custom UA header | Every request sends `User-Agent: LuminaireBot/1.0 (+https://luminaire.local)` | **not testable** — module absent |
| Per-request 10s timeout | `AbortController` + `setTimeout(10_000)`, cleared on all exit paths | **not testable** — module absent |
| §14.5 — Cheerio strips `script`/`style`/`noscript`/`nav`/`footer`/`header` before `text()` | Tag removal verified against a fixture containing each | **not testable** — module absent |
| Whitespace collapse | Multiple spaces / newlines collapsed to single spaces, trimmed | **not testable** — module absent |
| 5000-char per-page truncation | Pages exceeding the cap are truncated; shorter pages untouched | **not testable** — module absent |
| Return shape | `{ url, pages: { path, text }[] }` with one entry per successfully fetched page | **not testable** — module absent |

## What the fix cycle needs to deliver

This is a fresh implementation, not a fix to existing code. The fix iteration needs to produce all four in-scope files:

1. **`src/lib/scraper.ts`** — `crawlSite(url)` with the exact contract above, plus an exported `HomepageCrawlError` class that the orchestrator chunk can `instanceof`-check.
2. **`src/lib/__tests__/scraper.test.ts`** — Vitest suite covering the scenarios above. Mock `globalThis.fetch` (or pass an injected fetcher) so the suite is fully offline. The homepage-failure test should assert the thrown error is `instanceof HomepageCrawlError`. The secondary-page test should assert non-2xx pages are silently dropped from the `pages[]` array (not represented as empty-string entries). The cheerio-stripping test should feed a fixture containing each of the six removable selectors and assert none of their text leaks into the output. The truncation test should feed a >5000-char page and assert exactly 5000 characters come back.
3. **`src/lib/__fixtures__/homepage.html`** — Captured HTML resembling a real marketing homepage with at least one `<nav>`, `<header>`, `<footer>`, and `<script>` block to exercise the stripping path.
4. **`src/lib/__fixtures__/pricing.html`** — Captured HTML for the `/pricing` secondary-page test, large enough (with padding) to exercise the 5000-char truncation case.

The test file should also assert that `clearTimeout` runs on both the success and abort paths, since a leaked timer would keep the Node event loop alive between cron runs.

Overall: fail
