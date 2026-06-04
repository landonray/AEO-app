# Chunk 2 QA Report — TypeScript Types

## Scope

This chunk adds a single file (`src/types/index.ts`) that declares every shared interface backing the API JSON contracts. The chunk has no runtime code, so the only meaningful verification is:

1. The file compiles cleanly under the project's `strict: true` TypeScript config.
2. The shapes match every route response documented in §14 of the refined spec (mapped to §11 of the QA plan).

I ran `tsc --noEmit` against the file with the project's tsconfig flags (strict, target ES2022, module esnext, moduleResolution bundler, isolatedModules) using TypeScript 5.7. It exited 0 with no diagnostics.

Then I walked every route in §11 of the QA plan and compared its documented response shape (§14 of the refined spec) field-by-field against the types in `src/types/index.ts`.

## Summary

| Scenario | What was checked | Result |
|---|---|---|
| TypeScript compile | `tsc --noEmit --strict` on `src/types/index.ts` | pass |
| §11 universal — response keys exact | Every documented JSON shape backed by an interface | pass |
| §11.1 `GET /api/brand` | `BrandResponse` ↔ `{ brand: {id,name,domain,category,description} \| null }` | pass |
| §11.2 `GET /api/overview` — top-level keys | `OverviewResponse` has every key in §14 | pass |
| §11.2 `metrics.avgSentiment` nullable | `OverviewMetrics.avgSentiment: number \| null` | pass |
| §11.2 `metrics.avgPosition` nullable | `OverviewMetrics.avgPosition: number \| null` | pass |
| §11.2 `rankings[].sentiment` per-entity nullable | `RankingsRow.sentiment: number \| null` | pass |
| §11.2 `lastUpdated` nullable | `OverviewResponse.lastUpdated: string \| null` | pass |
| §11.2 `actions` shape | `ActionCard { side, priority, title, description }` matches §15.E | pass |
| §11.3 `GET /api/sources` | `SourcesResponse { sources, domainTypes, trend, view }` | pass |
| §11.3 `view=urls` keying | `SourceRow.url?: string` supports URL-mode rows | pass |
| §11.4 `GET /api/prompts/metrics` — per-prompt sentiment nullable | `PromptMetricsRow.sentiment: number \| null` | pass |
| §11.4 `prompts[].models` is short-id set | `PromptMetricsRow.models: ModelShortId[]` | pass |
| §11.4 `prompts[].activeRunCount` present | `PromptMetricsRow.activeRunCount: number` | pass |
| §11.5 `POST /api/prompts/run` — body | `RunPromptBody { promptId?: string }` | pass |
| §11.5 `POST /api/prompts/run` — response | `BatchResult` (rich) + `CronRunResponse` (slim, per §10.3) both modeled | pass |
| §11.6 `GET /api/prompts/[id]` — top-level | `PromptDetailResponse { prompt, runs, citations, modelBreakdown }` | pass |
| §11.6 `modelBreakdown[].mentioned` nullable | `ModelBreakdownRow.mentioned: boolean \| null` | pass |
| §11.6 `latestResponsePreview` field present | `ModelBreakdownRow.latestResponsePreview: string` | pass |
| §11.7 `POST /api/prompts` | `CreatePromptBody { text, topic }` + `CreatePromptResponse { id }` | pass |
| §11.8 `DELETE /api/prompts` | `DeletePromptBody { id }` + `OkResponse { ok: true }` | pass |
| §11.9 `POST /api/onboarding/crawl` | Body + response interfaces present | pass |
| §11.9 `POST /api/onboarding/generate-prompts` | Body + response interfaces present | pass |
| §11.9 `POST /api/onboarding/generate-competitors` | Body + response interfaces present | pass |
| §11.9 `POST /api/onboarding/complete` | Body shape matches §9 verbatim; response `{ brandId }` | pass |
| Cron route shape (§12) | `CronRunResponse { ok: true, batchId, totalRuns, totalErrors }` | pass |
| `ModelShortId` union (§4 in spec) | 5 short ids: openai, claude, gemini, perplexity, google_aio | pass |
| `DomainType` union (§11.4 in spec) | 7 categories + legacy `'Other'` | pass |
| `Sentiment` union (§11.3 in spec) | positive \| neutral \| negative | pass |
| Sentiment/position nullability invariant (§13.4) | All Avg Sentiment surfaces typed `number \| null`; never coerces to 55 | pass |
| Strict-mode TS compile | `tsc --noEmit --strict` exit 0 | pass |

## Scenarios in detail

### Compile check

I ran a TypeScript 5.7 compile against `src/types/index.ts` with the project's strict-mode flags (no `node_modules` is installed in this worktree, so I used `npx --yes -p typescript@5.7 tsc --noEmit --strict --skipLibCheck --target ES2022 --module esnext --moduleResolution bundler --jsx react-jsx --isolatedModules src/types/index.ts`). Exit code 0, no diagnostics. The file is internally consistent and compiles in the same shape Next.js will use.

### §11.1 `GET /api/brand`

Spec §14: `{ brand: { id, name, domain, category, description } | null }`.

Types: `BrandResponse` is exactly `{ brand: Pick<Brand, 'id' | 'name' | 'domain' | 'category' | 'description'> | null }`. The `Pick` keeps `Brand.category: string | null` and `Brand.description: string | null`, which is consistent with the database schema (those columns are nullable). The "no primary brand" case (`{ brand: null }`) is modeled by the union with `null`.

Result: pass.

### §11.2 `GET /api/overview`

Spec §14 documents 11 top-level keys: `brand`, `competitors`, `metrics`, `rankings`, `trend`, `sources`, `domainTypes`, `recentChats`, `lastUpdated`, `keyInsight`, `actions`. All 11 are present on `OverviewResponse`.

Sub-shape checks:

- `brand` uses the same `Pick<Brand, ...>` — same five fields.
- `competitors: { name: string; domain: string }[]` — matches spec.
- `metrics: OverviewMetrics` — has all 9 sub-fields documented in §14: `visibility, visibilityChange, mentioned, totalRuns, avgSentiment, avgPosition, sov, competitiveRank, totalCitations`. The spec types `visibilityChange` as `number` ("percentage points"); the implementation widens to `number | null`. This is a deliberate, spec-consistent defensive choice: §8.5 of the QA plan and §18.1 of the refined spec both flag that the prior-window-empty case should render `—`, which requires `null`. Not a contract violation.
- `metrics.avgSentiment: number | null` — matches the §13.4 invariant verbatim (null when zero mentioned runs).
- `metrics.avgPosition: number | null` — matches.
- `rankings: RankingsRow[]` — `RankingsRow` has `name, isYou, visibility, sov, sentiment: number | null, position: number | null, visibilityChange: number | null`. Per-entity sentiment nullability is exactly what §13.4 / §11.4 mandate.
- `trend: TrendRow[]` — `TrendRow` is `{ weekStart: string; brand: number; [entityName: string]: number | string }`. The `number | string` in the index signature is a TypeScript-mechanical necessity (the signature has to cover `weekStart: string`); the user-facing per-entity values are still numbers as the spec requires.
- `sources: SourceRow[]` — matches.
- `domainTypes: DomainTypeBreakdownRow[]` with `{ type, count, percentage }` — matches.
- `recentChats: RecentChatRow[]` — `RecentChatRow { promptId, text, models: ModelShortId[], citationCount, sentiment: { label: Sentiment; score: number | null }, position: number | null, date: string }`. The `score: number | null` is a defensive widening, again consistent with §13.4.
- `lastUpdated: string | null` — matches "ISO timestamp or null when no runs".
- `keyInsight: string` — matches.
- `actions: ActionCard[]` where `ActionCard { side: 'earned' | 'owned'; priority: 'high' | 'medium' | 'low'; title: string; description: string }` — matches §15.E verbatim.

Result: pass.

### §11.3 `GET /api/sources`

Spec §14: `{ sources, domainTypes, trend, view }`.

Types: `SourcesResponse { sources: SourceRow[]; domainTypes: DomainTypeBreakdownRow[]; trend: TrendRow[]; view: SourcesView }` where `SourcesView = 'domains' | 'urls'`. `SourceRow { domain: string; url?: string; type: DomainType; retrievalRate: number; citationRate: number }` — optional `url` is what lets the same shape carry both domain-mode and URL-mode rows.

Result: pass.

### §11.4 `GET /api/prompts/metrics`

Spec §14: `prompts[]` of `{ id, text, topic, visibility, sentiment: number | null, position, models: short[], activeRunCount }`.

Types: `PromptsMetricsResponse { prompts: PromptMetricsRow[] }` where `PromptMetricsRow { id, text, topic, visibility: number, sentiment: number | null, position: number | null, models: ModelShortId[], activeRunCount: number }`. The `sentiment: number | null` enforces the §13.4 / §18.7 "never defaults to 55" invariant at the type level — code that returns the literal `55` on empty would still pass typecheck, but the type forces callers to treat null as a real case.

Result: pass.

### §11.5 `POST /api/prompts/run`

Body: spec says `{ promptId?: string }`. Types: `RunPromptBody { promptId?: string }`. Matches.

Response: spec says "same response shape as cron route" but §10.3 / §12 says cron returns `{ ok: true, batchId, totalRuns, totalErrors }`, while §7.6 of the QA plan says each run's id should also be returned for log inspection. The types file models both:

- `CronRunResponse { ok: true; batchId: string; totalRuns: number; totalErrors: number }` — the slim shape for `/api/cron/run`.
- `BatchResult { batchId, results: RunBatchPromptResult[], totalRuns, totalErrors, runTotalCost }` plus `RunBatchPromptResult` and `RunBatchModelResult` — the rich shape needed by the manual "Run All Prompts" UI (which toasts the batch cost per §15.1.c and surfaces per-model errors).

Both shapes are valid spec-compatible interpretations of the route. This will need to be pinned down by the route-handler chunk; the type surface gives that chunk both options without forcing a choice.

Result: pass.

### §11.6 `GET /api/prompts/[id]`

Spec §14: `{ prompt: { id, text, topic, isActive }, runs: Run[], citations: { domain, url, type, runId }[], modelBreakdown: { model, mentioned: boolean | null, position, sentiment, citationCount, latestResponsePreview }[] }`.

Types: `PromptDetailResponse { prompt: Pick<Prompt, 'id' | 'text' | 'topic' | 'isActive'>; runs: Run[]; citations: PromptDetailCitation[]; modelBreakdown: ModelBreakdownRow[] }`. `PromptDetailCitation { domain: string; url: string | null; type: DomainType; runId: string }`. `ModelBreakdownRow { model: ModelShortId; mentioned: boolean | null; position: number | null; sentiment: Sentiment | null; citationCount: number; latestResponsePreview: string }`.

The spec types `sentiment` on the model-breakdown row as `string`. The implementation narrows it to the `Sentiment` union (`positive | neutral | negative`) and widens for the empty case to `Sentiment | null`. Narrowing `string → Sentiment` is a strict-mode safety improvement, and the null option mirrors the §13.4 invariant.

`citations[].url` is typed `string | null`. The spec shape shows `url` but does not explicitly say it cannot be null. Leaving it nullable handles the §17 edge case where a DataForSEO featured-snippet reference can have a domain without a clean URL.

Result: pass.

### §11.7 `POST /api/prompts`

Spec §14: body `{ text, topic }`, response `{ id }`.

Types: `CreatePromptBody { text: string; topic: string }`, `CreatePromptResponse { id: string }`.

Result: pass.

### §11.8 `DELETE /api/prompts`

Spec §14: body `{ id }`, response `{ ok: true }`.

Types: `DeletePromptBody { id: string }`, `OkResponse { ok: true }` (literal `true`, not `boolean` — matches the spec exactly).

Result: pass.

### §11.9 Onboarding routes

Spec §14 + §9 give four routes:

- `POST /api/onboarding/crawl`: body `{ url }`, response `{ crawlData: CrawlResult, domain }`. Types: `OnboardingCrawlBody { url: string }`, `OnboardingCrawlResponse { crawlData: CrawlResult; domain: string }`. Matches.
- `POST /api/onboarding/generate-prompts`: body `{ crawlData, domain }`, response `{ prompts: { text, topic }[] }`. Types match.
- `POST /api/onboarding/generate-competitors`: body `{ crawlData, domain }`, response `{ competitors: { name, domain }[] }`. Types match.
- `POST /api/onboarding/complete`: body per §9 — `{ brandName, domain, category, description, prompts: { text, topic }[], competitors: { name, domain }[] }`. Response `{ brandId }`. Types: `OnboardingCompleteBody` and `OnboardingCompleteResponse { brandId: string }` match verbatim.

`CrawlResult` itself has all keys the §9 LLM extraction schema requires: `title, description, category, targetAudience, coreUseCase, features, integrations, competitorHints`, plus an optional `pricingInfo` carried as a defensive add.

Result: pass.

### Cron route shape (§12)

Spec §12: `{ ok: true, batchId, totalRuns, totalErrors }`.

Types: `CronRunResponse { ok: true; batchId: string; totalRuns: number; totalErrors: number }`. Note the literal-`true` on `ok` — this prevents a handler from accidentally returning `{ ok: false, ... }` under this type.

Result: pass.

### Union-type sanity (cross-cutting)

- `ModelShortId = 'openai' | 'claude' | 'gemini' | 'perplexity' | 'google_aio'` — exactly the five short ids §4 / §14 of the refined spec name. The separate `ModelFilter = ModelShortId | 'all'` cleanly captures the dropdown semantic.
- `DomainType = 'You' | 'Competitor' | 'UGC' | 'Editorial' | 'Reference' | 'Institutional' | 'Corporate' | 'Other'` — the seven §11.4 categories plus the legacy `'Other'` schema default the spec preserves.
- `Sentiment = 'positive' | 'neutral' | 'negative'` — the three labels §11.3 defines.

Result: pass.

### Cross-cutting sentiment/position invariant (§13.4)

Every place the spec says "render `—` when zero mentioned runs" — `metrics.avgSentiment`, `metrics.avgPosition`, `rankings[].sentiment`, `rankings[].position`, `prompts[].sentiment`, `prompts[].position`, `modelBreakdown[].sentiment`, `modelBreakdown[].position`, `recentChats[].sentiment.score`, `recentChats[].position` — is typed as `T | null`. None of these surfaces would compile if a route handler returned the literal `55` (number) into a `number | null` slot, but more importantly the null option is *present*, so the UI layer can never claim "the type said number, so I rendered 55." This is the highest-leverage thing the type file does for the rest of the build, and it is done consistently.

Result: pass.

## Notes for downstream chunks (not failures)

- `RankingsRow` doesn't include `id` — only `name` and `isYou`. The spec doesn't require an id field for rankings, but if any UI row needs a stable key (React) it will have to fall back to `name`. Worth flagging when the dashboard chunk lands.
- `BatchResult` vs `CronRunResponse` — the manual run route handler will need to choose one; both are spec-defensible. Documented above.
- All TypeScript exports are pure types; no runtime emit risk. This matches the "no runtime code" instruction for this chunk verbatim.

Overall: pass
