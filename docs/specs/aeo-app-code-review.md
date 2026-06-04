# Luminaire — Code Review (Stage 6)

This review covers the full diff on the `pipeline-aeo-app-2245556e` branch against `main`. The QA report (iteration 3) confirms the build, the migration, the cron auth, the env hygiene, the vitest suite (485/485), and the Playwright onboarding suite (7/7) are all green end-to-end, so this pass focuses on what QA doesn't catch: spec-vs-intent gaps, structural concerns, maintainability, defense-in-depth, and a few correctness wrinkles around aggregated metrics.

## Summary

| Severity | Count |
|---|---|
| Blocker | 0 |
| Concern | 7 |
| Suggestion | 7 |

No blockers. The implementation cleanly matches the refined spec on the load-bearing items: gateway response shape (top-level `content`), `runs.model` as short id, mentioned-only Avg Sentiment with `null` empty-state, mention-or-domain brand detection with word-boundary regex, the §11.2 position-scoring algorithm (numbered-list override → 5-segment fallback → null), parameterized SQL throughout, cron auth via SHA-256 + `timingSafeEqual` on equal-length buffers, idempotent `CREATE … IF NOT EXISTS` schema, single-transaction onboarding insert, no client-side `process.env` reads. The concerns below are real but none rise to ship-blocking.

---

## Concerns

### C1 — Per-competitor "Sentiment" column in Rankings is a brand-sentiment proxy, not a competitor metric

**Where:** `src/lib/metrics.ts:355-378` (`computeRankings`, competitor branch).

**What's wrong.** For each competitor row, the implementation filters the window's runs to those where that competitor was mentioned and then averages `runs.sentiment` over them. But `runs.sentiment` is computed by `parser.ts:computeSentiment` from **brand-only** sentences — when the brand is not mentioned in a run, the parser returns `'neutral'` by default (`src/lib/llm/parser.ts:173`). So competitor sentiment in the Rankings table is effectively "brand sentiment in runs where this competitor happened to appear," and runs that mention the competitor without the brand contribute `'neutral'` (= 55) regardless of how the response actually talks about the competitor. In production this biases every competitor's Sentiment column toward 55 unless the brand was mentioned alongside.

The metrics test at `src/lib/__tests__/metrics.test.ts:581-597` passes because it injects the `sentiment` field directly, but real runs go through the parser, which won't set `'positive'` from competitor-only language.

**What to do.** Two reasonable paths: (a) acknowledge this limitation and render the per-competitor Sentiment cell as `—` (treat it as "no per-competitor sentiment is parsed") to avoid misleading users, or (b) extend the parser to compute and store per-competitor sentiment (would require a schema change). Either way, document the trade-off in the refined spec under §13.4 / Q15a so the literal-spec reading doesn't ship as a "competitor sentiment" metric it isn't. The current behavior matches the spec text mechanically but is not what a reader of the dashboard will infer the number means.

### C2 — Recent Chats sentiment label and score can disagree

**Where:** `src/app/api/overview/route.ts:160-184` (inside `computeRecentChats`).

**What's wrong.** `sentiment.label` is taken from the **latest** run's `sentiment` field (line 173), while `sentiment.score` is averaged over all **mentioned** runs in that prompt's window (lines 160-167). These can disagree: the score can be `null` (no mentioned runs) while the label is `'positive'` (latest run's parser default for unmentioned text would be `'neutral'`, but a single mentioned run later flips the label without rerunning the average). Conversely, the score can be `80` while the label is `'neutral'` (latest unmentioned run, but two prior mentioned-positive runs averaged 80).

The UI consumer (`RecentChats.tsx`) uses both — and there's no contract that they describe the same thing.

**What to do.** Pick one source of truth. Either derive the label from the score (`>=70 → positive`, `<=40 → negative`, else `neutral`), or compute both from the same set of runs. The score-derived label is the simpler fix and matches what the dot color in `PromptsTab.tsx:sentimentColor` already does.

### C3 — Avg Position metric card mixes mentioned and unmentioned runs

**Where:** `src/app/api/overview/route.ts:261` (`computeAvgPosition(currentRuns)`).

**What's wrong.** The route passes the entire `currentRuns` array — not just the mentioned ones — to `computeAvgPosition`. The function defends against this by filtering on `Number.isFinite(positionScore)` (so `NULL`/non-mentioned rows are skipped), so the math happens to come out correct *for the brand* because `position_score` is `NULL` exactly when `mentioned = false`. It works today, but it's a load-bearing implicit invariant: any future drift where `position_score` is set for an unmentioned run (or unset for a mentioned one) silently corrupts the metric. The Rankings code path is explicit about it (`runs.filter((r) => r.mentioned)` at line 351); this one isn't.

**What to do.** Pass `currentRuns.filter((r) => r.mentioned)` to `computeAvgPosition` so the intent matches the spec text ("Mentioned-only") and doesn't rely on parser-storage coupling.

### C4 — `splitSqlStatements` doesn't handle SQL comments or escaped quotes

**Where:** `src/lib/queries.ts:810-832`.

**What's wrong.** The naive splitter only tracks single-quote state. Any future addition to `src/sql/schema.sql` of `--` line comments, `/* … */` block comments, or `''`-escaped quotes inside string literals will mis-split. The current schema (`src/sql/schema.sql`) has none of these, so it works today. The risk is that a future contributor adds a `COMMENT ON TABLE …` or a column default like `'don''t'` and the migration starts silently failing or worse — splitting mid-statement.

**What to do.** Either (a) lean on `pg-query-parser` or similar to split safely, or (b) restrict the splitter's scope by adding a comment in `schema.sql` saying "no `--` / `/* */` comments and no escaped quotes — see queries.ts:810." Option (b) is fine for MVP; the spec called the schema "the single source of truth" and it's hand-maintained.

### C5 — `/api/onboarding/complete` duplicates INSERT logic instead of using `lib/queries.ts` helpers

**Where:** `src/app/api/onboarding/complete/route.ts:81-123` vs `src/lib/queries.ts:213-336`.

**What's wrong.** The route hand-builds parameterized `INSERT … VALUES (…)` SQL for `brands`, `competitors`, and `prompts` inside `buildBrandQuery` / `buildCompetitorsQuery` / `buildPromptsQuery`, paralleling — but not reusing — the typed helpers `buildInsertBrand` / `buildInsertCompetitors` / `buildInsertPrompts` from `queries.ts`. Two reasons for the divergence: the route needs to specify the brand id up front (so it can pass the same id to the competitor and prompt inserts inside a single `sql.transaction([])`), and `buildInsertBrand` doesn't expose that. The net result is two copies of the same VALUES construction; a future schema change has to be made in two places or the migration will silently drop columns.

**What to do.** Add an `id?: string` field to `InsertBrandInput` (or expose a transaction-friendly variant) and have the route call the typed helpers. Keeps a single source of truth for each table's insert shape.

### C6 — TOCTOU between `primaryBrandExists()` and brand insert

**Where:** `src/app/api/onboarding/complete/route.ts:140-159`.

**What's wrong.** The check (`primaryBrandExists()` at line 140) and the insert (transaction at line 149) are not atomic. Two simultaneous "Launch Tracking" submissions could both observe `false` and both proceed to insert, producing two `is_primary = true` rows. The schema has no uniqueness constraint to catch this. Single-user local-only context (§A1) makes the practical risk near zero, but the spec at §9 said this should be "wrapped in a single transaction" — the check is outside the transaction.

**What to do.** Move the check inside the transaction with `SELECT … FOR UPDATE` semantics, or add a partial unique index `CREATE UNIQUE INDEX … ON brands (is_primary) WHERE is_primary = true` to the schema. The partial index is cheap and serves as a backstop.

### C7 — Batch cost toast undercounts: DataForSEO `estimated_cost` is stored on the run but not summed into `runTotalCost`

**Where:** `src/lib/llm/orchestrator.ts:174-180`, `src/components/dashboard/Sidebar.tsx:87`.

**What's wrong.** The orchestrator's returned `runTotalCost` is the max of gateway `run_total_cost` values across the batch's OpenAI/Claude/Gemini calls. Perplexity and Google AI Overview surfaces both pass `null` for `runTotalCost` (lines 90, 100), so the toast that the Sidebar surfaces after "Run All Prompts" excludes the DataForSEO per-task `cost` that the spec at §8/§Q11 explicitly tracks (and that the implementation does store on the run row). For a 5-prompt × 5-surface batch this typically understates the true batch cost by 5 × DataForSEO-per-task.

**What to do.** Accumulate `estimatedCost` from non-gateway surfaces into the batch total. Either sum `call.estimatedCost` for `perplexity` (currently `null` per spec) and `google_aio` (DataForSEO cost) into the returned `runTotalCost`, or rename the toast field to "Gateway batch cost" so it's not read as the true total. Summing is more useful.

---

## Suggestions

### S1 — Sources trend rows always include a meaningless `brand: 0`

`src/app/api/sources/route.ts:150`. `computeSourcesTrend` populates `brand: 0` on every `TrendRow` because the shared `TrendRow` type (`src/types/index.ts:124-128`) requires it. The sources tab's consumer doesn't read `brand`. Either narrow the type for sources trend (e.g. `Omit<TrendRow, 'brand'>` plus a dedicated `SourcesTrendRow`), or `delete row.brand` after building. Minor cleanup.

### S2 — `RankingsTable.tsx:90` re-sorts and drops the server-side tiebreak

The server-side `computeRankings` (metrics.ts:381-386) sorts by visibility desc, brand-first on tie. The client re-sorts by visibility only (no tiebreak), so for a true tie the brand may not render first. The simpler fix is to drop the client-side sort entirely — the API already returns sorted rows.

### S3 — `POST /api/setup-db` has no auth

`src/app/api/setup-db/route.ts:21-27`. Anyone with access to `localhost:4810` can trigger a migration. The schema is idempotent so the blast radius is "spurious load," but on a multi-tab dev session a stray POST is possible. Either gate it behind `NODE_ENV !== 'production'` or accept and document the local-only stance. Same trade-off as the spec already takes on `/api/prompts` DELETE.

### S4 — `DELETE /api/prompts` doesn't verify the prompt belongs to the primary brand

`src/app/api/prompts/route.ts:73-83`. Any caller can archive any prompt by id. Single-user local-only context makes this academic, but a one-line `getPrompt(id)` + `brandId !== brand.id` guard (mirroring `POST /api/prompts/run` at line 46) would close the gap consistently.

### S5 — No SSRF protection in the onboarding crawler

`src/lib/scraper.ts:107-143`. `crawlSite` follows any `http(s)://…` URL the user submits, including loopback (`http://127.0.0.1`), link-local (`169.254.169.254`), and private RFC1918 ranges. The user is the only operator on the local box, so the practical risk is "the user shoots themselves in the foot," but a small allowlist/blocklist on `parsed.hostname` in `/api/onboarding/crawl/route.ts:48` is cheap insurance for the day this is exposed beyond `localhost`.

### S6 — `src/app/api/setup-db/route.ts:22` reads the schema via `process.cwd()` at runtime

If `npm start` is invoked from a directory other than the project root, the `readFile` lookup fails. Either resolve relative to the route file's location (with `import.meta.url`) or bundle the schema text with `import schemaSql from '../../sql/schema.sql?raw'` (Next 16 supports this with `?raw`). Minor robustness improvement.

### S7 — Brand domain regex can over-match cross-TLD

`src/lib/llm/parser.ts:60-65` (`buildDomainRegex`). `\bmybrand\.com\b` matches `mybrand.com` inside `mybrand.com.cn` (the trailing `\b` is satisfied by `m` → `.`). For most brands this is rare, but if the brand domain is a short common-TLD apex and the response cites a multi-TLD variant, false-positive mentions can sneak through. A negative lookahead (`(?![\w.-])`) on the trailing side would tighten it. Same family of issue as the generic-brand-name false positives already documented in §17 of the spec and the README.

---

## Spec-vs-implementation checks (no findings)

I worked through the load-bearing requirements one more time; all are in order:

- LLM Gateway response shape: `parseGatewayResponse` reads top-level `content` (gateway.ts:129-141), per §6 correction over the raw spec.
- `runs.model` stores short ids (`openai`, `claude`, `gemini`, `perplexity`, `google_aio`); enforced via `MODEL_SURFACES` in orchestrator.ts:26 and validated in every API route's `parseModel`.
- §11.2 position scoring: numbered-list override (capped at 5) → 5-segment fallback → `null` when unmentioned (parser.ts:108-136).
- §13.4 Avg Sentiment over mentioned-only with `null` empty-state: `computeAvgSentiment` filters `r.mentioned === true` and returns `null` on zero (metrics.ts:141-145). API surfaces all return `number | null` and UIs render `—` for `null` (`overviewFormat.ts:formatSentimentScore`, `PromptsTab.tsx:SentimentCell`, `RankingsTable.tsx:SentimentCell`).
- Cron auth: SHA-256 + `timingSafeEqual` over equal-length buffers (cron/run/route.ts:28-35); 401 with no body for any bad/missing bearer.
- Idempotent migration: `CREATE … IF NOT EXISTS` for all 5 tables + 7 indexes; safe re-apply confirmed by QA.
- All SQL is parameterized; no string interpolation of user input found in any route or helper.
- No `process.env` reads in `'use client'` components — verified with grep over `src/components/`.
- §9.7 onboarding e2e passes against the real Neon DB, including the §9.7.f redirect to `/dashboard` post-fix-cycle-2.

---

## What I did not review in depth

- Per-chunk component QA scenarios that the per-chunk QA reports already verified (chart palettes, individual UI components, modal a11y). Per Stage 6 instructions, trust the chunk reports.
- Playwright test internals beyond confirming the iteration-3 verdict held.
- Cosmetic Tailwind class composition or token usage — the design system is its own chunk's responsibility.

---

Blockers: 0
