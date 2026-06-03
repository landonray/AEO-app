# Luminaire — Refined Spec (AI Search Visibility Platform)

This is the implementation-ready spec produced from `specs/AEO app spec.md`. It supersedes the raw spec where the two disagree; differences are called out explicitly under **Resolved Open Questions** and **Assumptions**.

The original raw spec is detailed and largely correct. The refinement here:

1. Corrects one factually wrong claim in the raw spec about the LLM Gateway (it DOES support `response_format` — see the LLM Gateway docs in this repo at `docs/llm-gateway-api.md`).
2. Pins down concrete values for heuristics the raw spec left vague (position scoring rules, sentiment word lists, domain classification edge cases).
3. Specifies the DataForSEO request shape and Perplexity response handling.
4. Resolves small contradictions (Perplexity model, what value goes in `runs.model`, auth, brand_id linkage).
5. Documents edge cases the implementer would otherwise have to guess at.

---

## 1. Purpose

Luminaire is a single-tenant, locally-deployed AI search visibility tracker. It runs a fixed library of buyer-intent prompts across five "AI answer" surfaces — ChatGPT, Claude, Gemini, Perplexity, and Google AI Overviews — captures the responses, and reports how often the user's brand shows up, in what position, with what sentiment, alongside which competitors, and citing which sources. Over time (weeks/months) the user sees trend lines and acts on a short list of generated recommendations.

The product replaces hand-checking ChatGPT/Claude/etc. once a week with a daily automated run, structured metrics, and a dashboard.

---

## 2. Scope

**In scope (MVP):**

- One primary brand at a time, configured via a 3-step onboarding wizard.
- 5 generated prompts at onboarding; CRUD on prompts thereafter.
- 4–5 generated competitors at onboarding; stored on the brand.
- Daily scheduled run of all active prompts × 5 model surfaces.
- Manual "Run All Prompts" button for on-demand runs.
- Dashboard with three tabs: Overview, Prompts, Sources.
- Date range and model filter that apply to every metric on every tab.
- Citations classified by domain type, with a Sources tab driven mostly by Perplexity + Google AI Overview.
- Cost tracking via the gateway's `estimated_cost` and per-batch `run_total_cost`.

**Out of scope (not built in MVP):**

- Multi-tenant / multi-user accounts. No login, no user table, no Google OAuth (see assumption A1).
- Multi-brand tracking simultaneously. The DB schema supports many brands by design, but the UI and onboarding flow only ever surface one (`is_primary = true`) at a time.
- Historical backfill of runs from before the user installed Luminaire.
- Push notifications, email summaries, Slack alerts.
- API for external consumers.
- Cloud deployment, multi-region, horizontal scaling. The cron path is documented for macOS/Linux cron and Windows Task Scheduler only.
- Editing competitors after onboarding (only created at onboarding; future iteration).
- Bulk prompt import.

---

## 3. Tech Stack & Environment

### Mandated stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16+ (App Router, `src/` directory). Turbopack is the default builder in Next 16; do NOT add a custom webpack config. |
| Language | TypeScript, `strict: true`. |
| Styling | Tailwind CSS v4 with `@tailwindcss/postcss`. Theme tokens defined via `@theme` in `globals.css`. |
| Charts | Recharts. |
| Icons | `lucide-react`. |
| Class utils | `clsx` + `tailwind-merge` (exposed as `cn()` in `lib/utils.ts`). |
| Postgres driver | `@neondatabase/serverless` — parameterized SQL only. No ORM. No PostgREST. No Supabase. |
| HTML parsing | `cheerio` (server-side, used during onboarding crawl). |
| UI components | Built from scratch. No shadcn/ui CLI, no copy-paste from component libraries. |

### Environment variables

Use the `.env` file already present at the repo root. Required keys (placeholders for documentation):

```
DATABASE_URL=postgres://...neon.tech/...?sslmode=require   # Neon
NODE_ENV=development
PORT=4810                                                  # app port

LLM_GATEWAY_BASE_URL=https://llm-gateway.replit.app/api/v1
LLM_GATEWAY_API_KEY=llmgw_...

# Tracking models — frontier consumer-tier, used for visibility/sentiment/position
MODEL_OPENAI=gpt-5.5
MODEL_CLAUDE=claude-opus-4-8
MODEL_GEMINI=gemini-3.1-pro-preview

# Internal generation model — cheap; used for crawl extraction + prompt/competitor generation
MODEL_GENERATION=gemini-2.5-flash

# Perplexity — called DIRECTLY (gateway does not support it)
PERPLEXITY_API_KEY=pplx-...
MODEL_PERPLEXITY=sonar-pro

# DataForSEO — Google AI Overview SERP scrape (not an LLM call)
DATAFORSEO_LOGIN=...
DATAFORSEO_PASSWORD=...

# Cron auth (protects /api/cron/run)
CRON_SECRET=<random-long-string>
```

All secrets MUST stay server-side. Keys must never appear in client components, in HTML, in console logs, or in any response body. Add `.env`, `.env.local`, and `.env.*` to `.gitignore` before any commit.

### Runtime ports and processes

- App binds to `PORT=4810`. The `dev` and `start` scripts must explicitly pass the port (`next dev -p 4810`, `next start -p 4810`).
- The cron entry point hits `http://localhost:4810/api/cron/run` — the host must be running for the daily run to fire.
- There is no worker or background queue. The "Run All Prompts" button and the cron endpoint both call the orchestrator synchronously inside the API handler.

---

## 4. Database Schema (Neon Postgres)

The schema below is the same as the raw spec. Provide `sql/schema.sql` as the single source of truth, written idempotently. The migration runner (`POST /api/setup-db` and `npm run db:migrate`) reads this file verbatim and executes it against `DATABASE_URL`. There is no manual paste-into-dashboard step anywhere in the product.

```sql
CREATE TABLE IF NOT EXISTS brands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  category TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS competitors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prompts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  text TEXT NOT NULL,
  topic TEXT DEFAULT 'General',
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN DEFAULT true,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_id UUID REFERENCES prompts(id) ON DELETE CASCADE,
  model TEXT NOT NULL,                  -- short id: 'openai' | 'claude' | 'gemini' | 'perplexity' | 'google_aio'
  response TEXT,                        -- raw assistant text (or AI Overview text)
  mentioned BOOLEAN DEFAULT false,
  position_score REAL,                  -- 1.0–5.0 where 1 = best; NULL if not mentioned
  sentiment TEXT DEFAULT 'neutral',     -- 'positive' | 'neutral' | 'negative'
  competitor_mentions JSONB DEFAULT '{}', -- { "<competitorName>": true|false, ... }
  estimated_cost REAL,                  -- per-call gateway cost; NULL for Perplexity / AI Overview
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS citations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES runs(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  url TEXT,
  domain_type TEXT DEFAULT 'Other',     -- see Domain Classification
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runs_prompt_id   ON runs(prompt_id);
CREATE INDEX IF NOT EXISTS idx_runs_created_at  ON runs(created_at);
CREATE INDEX IF NOT EXISTS idx_runs_model       ON runs(model);
CREATE INDEX IF NOT EXISTS idx_citations_run_id ON citations(run_id);
CREATE INDEX IF NOT EXISTS idx_citations_domain ON citations(domain);
CREATE INDEX IF NOT EXISTS idx_prompts_brand_id ON prompts(brand_id);
CREATE INDEX IF NOT EXISTS idx_competitors_brand_id ON competitors(brand_id);
```

Key decisions:

- **`runs.model` stores a short id** (`openai`, `claude`, `gemini`, `perplexity`, `google_aio`), NOT the actual model identifier like `gpt-5.5`. The dropdown filter uses these short ids; storing the real model id would invalidate filter values whenever `MODEL_OPENAI` etc. changes in env.
- **`position_score` is NULL when the brand is not mentioned**. Metrics must `AVG(...) WHERE position_score IS NOT NULL`.
- **`competitor_mentions` is a JSONB object keyed by competitor display name**, value boolean. Empty `{}` is valid (no competitors mentioned).
- **`gen_random_uuid()`** is built into Postgres on Neon; no extension installation is required.

---

## 5. Application Architecture

### Directory structure

```
src/
├── app/
│   ├── globals.css                  # Tailwind v4 @theme tokens + scrollbar + typography
│   ├── layout.tsx                   # Root: <html className="dark">, font, metadata
│   ├── page.tsx                     # Entry: setup-db check → onboarding check → dashboard
│   ├── setup/page.tsx               # Table status + "Run migration" + "Re-check tables"
│   └── api/
│       ├── brand/route.ts                              # GET primary brand
│       ├── setup-db/route.ts                           # GET checks tables, POST runs schema.sql
│       ├── overview/route.ts                           # GET dashboard data (days, model)
│       ├── sources/route.ts                            # GET citations (days, model, view)
│       ├── prompts/route.ts                            # GET list, POST create, DELETE archive
│       ├── prompts/metrics/route.ts                    # GET per-prompt metrics (days, model)
│       ├── prompts/run/route.ts                        # POST run single or all prompts
│       ├── prompts/[id]/route.ts                       # GET prompt detail + per-model breakdown
│       ├── cron/run/route.ts                           # POST scheduled batch run; requires bearer
│       └── onboarding/
│           ├── crawl/route.ts                          # POST website URL → CrawlResult
│           ├── generate-prompts/route.ts               # POST → string[5]
│           ├── generate-competitors/route.ts           # POST → {name,domain}[4..5]
│           └── complete/route.ts                       # POST → saves brand + competitors + prompts
├── components/
│   ├── ui/                          # Button, Card, Input, Badge, Tabs, Spinner, MetricCard, ModelIcon, Toggle, Dropdown
│   ├── charts/                      # VisibilityChart, SourceChart
│   ├── dashboard/                   # Sidebar, Header, Overview tab, Prompts tab, Sources tab, modals
│   └── onboarding/                  # OnboardingFlow (3 steps)
├── lib/
│   ├── utils.ts                     # cn(), formatPercent, extractDomain, normalizeDomain
│   ├── db.ts                        # Neon serverless client init (single shared instance)
│   ├── queries.ts                   # All DB CRUD as typed parameterized helpers
│   ├── metrics.ts                   # Visibility, SOV, position, sentiment, trend, sources
│   ├── scraper.ts                   # Website crawler (homepage + 6 well-known paths)
│   ├── generators.ts                # Crawl extraction + prompt + competitor generation (gateway)
│   ├── classify.ts                  # Domain type classification
│   └── llm/
│       ├── orchestrator.ts          # Runs a prompt across all 5 surfaces, persists results
│       ├── parser.ts                # Brand/competitor mention, position, sentiment, citation extract
│       ├── gateway.ts               # OpenAI / Claude / Gemini via LLM Gateway
│       ├── perplexity.ts            # Direct Perplexity client
│       └── google-aio.ts            # DataForSEO Google AI Overview extraction
├── types/index.ts                   # All TypeScript interfaces
└── sql/schema.sql                   # Idempotent schema, applied by /api/setup-db and npm run db:migrate
scripts/
└── cron.mjs                         # POSTs to /api/cron/run with the CRON_SECRET; npm run cron
```

### `lib/db.ts` + `lib/queries.ts`

- Initialize the Neon client once at module import using `DATABASE_URL`. Reuse the single instance — do NOT create a new client per request. Neon's `serverless` driver is HTTP-based and safe to share.
- Every read and write uses parameterized SQL (`$1`, `$2`, …). NEVER string-interpolate user input or request params.
- `queries.ts` exposes typed helpers; e.g. `getPrimaryBrand()`, `insertBrand()`, `listActivePrompts(brandId)`, `insertRun(run)`, `insertCitations(runId, citations)`, `getRuns({ brandId, days, model })`, `getCitations({ brandId, days, model, view })`.
- The `model` filter must add a `model = $n` clause only when the param is provided (not when it's `'all'` or undefined).
- Date filtering uses `created_at >= now() - ($n || ' days')::interval` with the day count parameterized.

---

## 6. LLM Gateway Integration

This is the area where the raw spec is most out of date. The authoritative source is `docs/llm-gateway-api.md` in this repo, which describes the production gateway behavior.

### Base URL and auth

- `LLM_GATEWAY_BASE_URL = https://llm-gateway.replit.app/api/v1`. Use the env value, never hardcode.
- Chat completions: `POST ${LLM_GATEWAY_BASE_URL}/chat/completions`.
- Auth: `Authorization: Bearer ${LLM_GATEWAY_API_KEY}`.

### Request shape

- Use **non-streaming** requests (`stream: false` or omitted). The app never reads SSE.
- Supported params we actually use: `model`, `messages`, `max_tokens`, `temperature`, `tools`, `tool_choice`, `run_id`, `response_format`.
- For tracking calls (the 3 gateway models): `max_tokens: 2000`, `temperature: 0.3`, and `run_id` set to the batch id (see Orchestrator).

### Response shape — IMPORTANT

For non-streaming chat completions, the assistant text is at top-level `response.content` (string). It is **NOT** at `choices[0].message.content` (that path is for streaming SSE chunks).

Also returned:

- `provider`, `model`, `finish_reason`, `usage`, `estimated_cost`.
- `run_total_cost` — only when `run_id` was included in the request.
- `tool_calls` — only when the model returns a tool call (top-level array, not nested under choices).

### Structured output — CORRECTION TO RAW SPEC

The raw spec stated the gateway has no JSON-mode parameter and that structured output must come from tool calling. **That is incorrect.** Per `docs/llm-gateway-api.md`, the gateway supports OpenAI's `response_format` shape and translates it natively for Anthropic and Gemini:

```json
{ "response_format": { "type": "json_object" } }
{ "response_format": { "type": "json_schema",
                       "json_schema": { "name": "...", "strict": true, "schema": { ... } } } }
```

Use `response_format` with `type: "json_schema"` (strict mode) for the onboarding generators (crawl extraction, prompt generation, competitor generation). This is simpler than forced tool calling and is the documented, supported path.

Fallback strategy if a single response fails JSON parsing: retry once with a stricter system message ("Return ONLY valid JSON matching the schema. No prose, no markdown."). If a second attempt fails, surface a clear error to the user.

The legacy tool-calling pattern described in the raw spec remains a valid fallback if `response_format` is ever rejected for a given model, but it is not the primary path.

### Tracking calls (visibility, sentiment, position, citation extraction)

For the three tracking models (`MODEL_OPENAI`, `MODEL_CLAUDE`, `MODEL_GEMINI`):

- Send the user's prompt as `messages: [{ role: 'user', content: <promptText> }]` — no system prompt.
- `max_tokens: 2000`, `temperature: 0.3`.
- Pass the shared batch `run_id` so `run_total_cost` accumulates.
- Read `response.content` (string). Store on the run as `response`.
- Store `estimated_cost` on the run.

Tracking calls do NOT use `response_format` — we want the model's natural prose, the same as a real user would see in ChatGPT/Claude/Gemini.

---

## 7. Perplexity (Direct API)

- Endpoint: `POST https://api.perplexity.ai/chat/completions`.
- Auth: `Authorization: Bearer ${PERPLEXITY_API_KEY}`.
- Model: `MODEL_PERPLEXITY` (= `sonar-pro`). See Resolved Open Question Q1.
- Request shape: standard OpenAI — `model`, `messages`, `max_tokens: 2000`, `temperature: 0.3`.

Response shape (standard OpenAI):

- Assistant text at `choices[0].message.content`.
- Citations at top-level `citations: string[]` (URL list). The implementer should also handle a possible `search_results: { title, url }[]` field that some Perplexity variants return — if `citations` is absent, fall back to mapping `search_results[*].url`. Store URLs as raw strings.
- Perplexity does NOT return cost; store `estimated_cost = NULL` on Perplexity runs.

---

## 8. Google AI Overview via DataForSEO

This is a SERP scrape, not an LLM call.

- Endpoint: `POST https://api.dataforseo.com/v3/serp/google/organic/live/advanced`.
- Auth: HTTP Basic with `DATAFORSEO_LOGIN:DATAFORSEO_PASSWORD`.
- Request body (array of tasks):

  ```json
  [{
    "language_code": "en",
    "location_code": 2840,
    "keyword": "<promptText>",
    "depth": 10
  }]
  ```

  `2840` is DataForSEO's US location code. English-only, US-only is acceptable for the MVP (Q2).

- Response handling:
  1. Look at `tasks[0].result[0].items`.
  2. Find the first item with `type == "ai_overview"`. Extract:
     - Text: concatenate `text` fields across its `items` array (or use `markdown` if present).
     - Reference URLs: extract from `references[].url` (each reference also exposes `domain`).
  3. If no `ai_overview` item exists, fall back to the first item with `type == "featured_snippet"`. Extract its text and any references/links.
  4. If neither exists, this run yields `mentioned = false`, `response = null`, no citations. Still record the run so empty-state cells show on the dashboard.
- Cost: DataForSEO returns a `cost` field on the task. Store it as `estimated_cost` on the run (in USD); if missing, leave NULL.

---

## 9. Onboarding Flow (3 Steps)

When `GET /api/brand` returns `{ brand: null }`, render the onboarding wizard at `/`.

### Step 1 — URL

- Centered card, globe icon, single input (placeholder "https://yourproduct.com"), submit on Enter or arrow click.
- Progress indicator above: 3 dots, label "Website → Analyzing → Review & Launch".
- Input validation: require an absolute URL with `http://` or `https://`. If the user types a bare domain, prepend `https://`.

### Step 2 — Analyzing (loading)

- Spinner + "Analyzing {domain}".
- Fires `POST /api/onboarding/crawl` with the URL. On success, fires `generate-prompts` and `generate-competitors` in parallel.
- If `/api/onboarding/crawl` fails (network error, 5xx, or homepage 404) show an error toast and let the user retype the URL. Step 1 remains visible behind the error.

### Step 3 — Review & Launch

Three stacked cards:

1. **Product Summary** — title, description, category, target audience. Each field is inline-editable.
2. **Generated Prompts** — 5 editable prompt rows. Click row to inline-edit; X icon removes. Order is preserved. **No "+ Add" in onboarding** (Q3). Users can add more after launch via the Prompts tab.
3. **Competitors** — 4–5 competitor rows showing name + domain, inline-editable, removable.

Buttons at bottom: "Start Over" (outline, returns to Step 1, discards crawl data), "Launch Tracking" (primary, Zap icon).

"Launch Tracking" fires `POST /api/onboarding/complete` with the final reviewed brand info, prompts, and competitors. On success, redirect to `/` which now shows the dashboard.

### Crawl logic (`lib/scraper.ts` + `/api/onboarding/crawl`)

- Fetch the homepage first. If it fails (non-2xx, network error), abort with a 4xx error.
- After the homepage, fetch in parallel: `/pricing`, `/features`, `/about`, `/integrations`, `/use-cases`, `/product`. Each fetch:
  - 10s timeout.
  - `User-Agent: LuminaireBot/1.0 (+https://luminaire.local)`.
  - Skip on any non-2xx (silent skip — the page just doesn't exist).
- HTML stripping: parse with `cheerio`, remove `script`, `style`, `noscript`, `nav`, `footer`, `header`, then return `text()`. Trim whitespace, collapse repeated spaces.
- Truncate each page to 5000 characters before sending to the model. Total prompt size bounded.
- Pass the combined text (labeled per URL) to `MODEL_GENERATION` via the gateway with `response_format: json_schema` and this schema (Q4):

  ```json
  {
    "type": "object",
    "required": ["title", "description", "category", "targetAudience", "coreUseCase", "features", "integrations", "competitorHints"],
    "properties": {
      "title":            { "type": "string" },
      "description":      { "type": "string" },
      "category":         { "type": "string" },
      "targetAudience":   { "type": "string" },
      "coreUseCase":      { "type": "string" },
      "features":         { "type": "array", "items": { "type": "string" } },
      "integrations":     { "type": "array", "items": { "type": "string" } },
      "pricingInfo":      { "type": "string" },
      "competitorHints":  { "type": "array", "items": { "type": "string" } }
    }
  }
  ```

### Prompt generation (`lib/generators.ts`)

Send the CrawlResult to `MODEL_GENERATION` and request 5 commercial-intent, long-tail, buyer-focused prompts. System message must explicitly require:

- Real-buyer phrasing (queries someone would actually type into ChatGPT/Claude/Perplexity).
- Mix of types: 1 category ("best X for Y"), 1 competitor-alternatives ("top alternatives to <competitor>"), 1 affiliate ("X vs Y vs Z"), 1 core ("how to do <use case>"), 1 free-tool ("free tool for <task>"). Topic assignment per prompt: `Category`, `Competitor`, `Affiliate`, `Core`, `Free tool`.
- No brand name leakage — the prompts must NOT mention the user's brand (the whole point is to see if it appears unprompted).

Schema:

```json
{
  "type": "object",
  "required": ["prompts"],
  "properties": {
    "prompts": {
      "type": "array",
      "minItems": 5,
      "maxItems": 5,
      "items": {
        "type": "object",
        "required": ["text", "topic"],
        "properties": {
          "text":  { "type": "string" },
          "topic": { "type": "string", "enum": ["Category","Competitor","Affiliate","Core","Free tool"] }
        }
      }
    }
  }
}
```

### Competitor generation

Send CrawlResult + the user's domain to `MODEL_GENERATION`. Return 4–5 direct competitors with name + domain. Each competitor domain should be the bare apex (no protocol, no path, no `www.`). The system prompt should require the model to use the website's `competitorHints` and category, and to skip obvious non-competitors (consulting firms, marketing agencies, generic SaaS).

Schema:

```json
{
  "type": "object",
  "required": ["competitors"],
  "properties": {
    "competitors": {
      "type": "array",
      "minItems": 4,
      "maxItems": 5,
      "items": {
        "type": "object",
        "required": ["name", "domain"],
        "properties": {
          "name":   { "type": "string" },
          "domain": { "type": "string" }
        }
      }
    }
  }
}
```

### Onboarding completion

`POST /api/onboarding/complete` body:

```ts
{
  brandName: string;
  domain: string;             // bare apex
  category: string;
  description: string;
  prompts: { text: string; topic: string }[];   // 1..5
  competitors: { name: string; domain: string }[];  // 1..5
}
```

Behavior — wrapped in a single transaction:

1. Insert into `brands` with `is_primary = true`.
2. Insert each competitor with `brand_id = <new brand id>`.
3. Insert each prompt with `brand_id`, `is_active = true`, `topic` from the input.
4. Return `{ brandId }`.

If a brand with `is_primary = true` already exists, return 409 — the user already onboarded. (For the MVP, the only path to re-onboard is manually clearing the DB.)

---

## 10. LLM Orchestrator (`lib/llm/orchestrator.ts`)

Drives a single "batch": one or more prompts × the 5 model surfaces.

### Batch run procedure

For each prompt (sequential), for each model surface (sequential):

1. Compose the request for that surface (see §6, §7, §8).
2. Pass a shared `run_id` to all gateway calls in the batch — generate it once at the start of the batch (UUIDv4 like `batch-<uuid>`).
3. Submit the request. Apply a per-call timeout of 60 seconds.
4. On success:
   - Run the response through the parser (§11).
   - Insert a `runs` row with `model = <short id>`, `response`, `mentioned`, `position_score`, `sentiment`, `competitor_mentions`, `estimated_cost`.
   - Insert `citations` rows for every extracted citation, classified by domain type.
5. On failure (any non-2xx, timeout, network error, parse failure for the AI Overview structure):
   - Log a structured error to the server console (model, prompt id, status, error).
   - **Do not** insert a runs row for that failed call.
   - **Do not** abort the batch — continue with the next model, then the next prompt.

Sequential ordering is required by the raw spec ("avoids rate limits and keeps gateway load predictable"). Across prompts is also sequential for the MVP (Q5).

After all calls complete, return `{ results: [{ prompt, results: [{ model, success: boolean, run?: Run, error?: string }] }] }`. The cron route returns the same shape (the UI doesn't read it, but it's useful for log inspection).

### Model surfaces

| Short id | Display | Real model id (env) | Client | Returns citations? |
|---|---|---|---|---|
| `openai` | ChatGPT | `MODEL_OPENAI` (default `gpt-5.5`) | `gateway.ts` | Usually no |
| `claude` | Claude | `MODEL_CLAUDE` (default `claude-opus-4-8`) | `gateway.ts` | No |
| `gemini` | Gemini | `MODEL_GEMINI` (default `gemini-3.1-pro-preview`) | `gateway.ts` | No |
| `perplexity` | Perplexity | `MODEL_PERPLEXITY` (default `sonar-pro`) | `perplexity.ts` | Yes (primary source) |
| `google_aio` | Google AI Overview | (n/a — DataForSEO SERP) | `google-aio.ts` | Yes (primary source) |

If `MODEL_GEMINI` is set to a preview id (e.g. `gemini-3.1-pro-preview`) and starts returning a "model unavailable" error, the implementer should fall back gracefully — the orchestrator already treats this as a soft failure, but the README should document changing the env var to `gemini-2.5-pro`.

---

## 11. Response Parsing (`lib/llm/parser.ts`)

All parsing functions accept the brand record and competitors list as input.

### 11.1 Brand mention detection

`mentioned = true` if EITHER:

- The brand `name` appears in the response (case-insensitive, word-boundary match — use a regex like `\b<escapedName>\b`). For multi-word names, allow internal whitespace flex.
- The brand `domain` (or its apex root, e.g. `mybrand.com` matched without protocol/`www.`) appears in the response.

### 11.2 Position score (1–5; lower = better; NULL if not mentioned)

Concrete algorithm (Q6):

1. Find the first character index where the brand is mentioned (by name or domain, whichever appears earlier).
2. If the brand is part of a numbered list item — i.e. the brand mention appears on a line whose start matches `/^\s*(\d+)[.)]\s/` — set `position_score = min(listNumber, 5)`. Cap at 5.
3. Otherwise, split the response text into 5 equal-length segments by character count. `position_score = segment index of first mention (1..5)`. Segment 1 is the first 20% of the response, segment 5 is the last 20%.
4. If brand is not mentioned, `position_score = NULL`.

`position_score` is stored as a REAL. Display rounds to one decimal (e.g. `#1.4`).

### 11.3 Sentiment (`positive` | `neutral` | `negative`)

1. Split the response into sentences (simple regex: split on `/[.!?]+\s+/`).
2. Keep only sentences containing the brand name or domain.
3. Count positive words and negative words within those sentences (case-insensitive, word-boundary).
4. If positive > negative → `positive`. If negative > positive → `negative`. Tie or both zero → `neutral`.
5. If no sentences contain the brand → `neutral`.

Word lists (Q7) — keep them small, deliberately conservative:

- **Positive:** best, top, leading, recommended, popular, trusted, excellent, powerful, robust, reliable, innovative, strong, favorite, preferred, standout, highest-rated, comprehensive, intuitive, seamless.
- **Negative:** worst, poor, limited, expensive, outdated, weak, lacking, mediocre, slow, buggy, complicated, confusing, frustrating, inferior, underwhelming.

Numeric mapping for averaging (per raw spec): `positive = 80`, `neutral = 55`, `negative = 30`.

### 11.4 Competitor mentions

For each competitor in the brand's competitor list, run the same name-or-domain test (§11.1) and produce:

```json
{ "<CompetitorName>": true|false, ... }
```

Store as `competitor_mentions` JSONB.

### 11.5 Citation extraction

Citations are the union of:

- API-provided URLs:
  - Perplexity: top-level `citations[]` (strings) — or fallback `search_results[].url` if `citations` is absent.
  - Google AI Overview: `references[].url` from the AI Overview / featured snippet.
- URLs found in the response text via regex:
  `https?:\/\/[^\s\)\]\}"'<>]+`
  Strip trailing punctuation `.,;:!?` from matches.

Deduplicate by full URL within a single run. If the same URL appears in both API and regex, take it once.

### 11.6 Domain classification (`lib/classify.ts`)

For each citation URL, derive the domain via `URL(url).hostname`, then normalize (lowercase, strip leading `www.`). Classify by:

1. Match brand domain (normalized apex) → `You`.
2. Match any competitor domain (normalized apex) → `Competitor`.
3. UGC and review sites — apex match against: `reddit.com`, `youtube.com`, `quora.com`, `medium.com`, `twitter.com`, `x.com`, `tiktok.com`, `g2.com`, `capterra.com`, `trustpilot.com`, `getapp.com`, `softwareadvice.com` → `UGC`.
4. Editorial — apex match against: `techcrunch.com`, `wired.com`, `forbes.com`, `bloomberg.com`, `nytimes.com`, `wsj.com`, `theverge.com`, `arstechnica.com`, `businessinsider.com`, `engadget.com`, `vox.com` → `Editorial`.
5. Reference — apex match against: `wikipedia.org`, `developer.mozilla.org` (MDN) → `Reference`.
6. TLD-based institutional — domain ends with `.edu`, `.gov`, `.mil`, or `.org` → `Institutional`. (Note: `.org` will catch a few non-institutional sites; acceptable for MVP since most relevant `.org`s are non-profits or standards bodies.)
7. Everything else → `Corporate`.

The `Other` value remains as a legacy default in the schema; in practice the classifier should always produce one of the seven categories above. Domain Type Colors are defined under §16 Design System.

---

## 12. Scheduling / Cron

### `POST /api/cron/run`

- Auth: header `Authorization: Bearer ${CRON_SECRET}`. Reject anything else with 401 (no body).
- Behavior: load all `prompts` where `is_active = true AND brand_id = <primary brand id>`, then run the orchestrator over them. Returns `200` with `{ ok: true, batchId, totalRuns, totalErrors }`. Errors per call do not affect the HTTP status.
- Resilience: a single model failure logs and continues; a single prompt failure logs and continues. Only an internal database or config error returns 5xx.
- Concurrency: the route is synchronous. If a manual "Run All Prompts" is already in flight and cron fires at the same time, the second one runs the same prompts a second time. Acceptable for MVP — the user is the only operator.

### `npm run cron`

`scripts/cron.mjs` does the following:

1. Reads `CRON_SECRET` from `process.env`. Fails fast if missing.
2. POSTs to `http://localhost:4810/api/cron/run` with the bearer header. No body.
3. Logs response status and counts. Exits 0 on 2xx, 1 otherwise.

### OS scheduling (README must document)

- **macOS/Linux cron:**

  ```
  0 9 * * * cd /path/to/luminaire && /usr/local/bin/node ./scripts/cron.mjs >> ./cron.log 2>&1
  ```

  (or `npm run cron` if PATH is set).

- **Windows Task Scheduler:** create a daily 9am task running `cmd /c "cd /d C:\path\to\luminaire && npm run cron >> cron.log 2>&1"`.

### Known limitation

The machine must be on and the Next.js dev/start server must be running when cron fires. Missed days produce gaps in the trend chart; there is no backfill. The README must call this out so the user isn't surprised.

---

## 13. Metrics (`lib/metrics.ts`)

All metric functions accept `{ days, model? }` (model is optional; when omitted, span all surfaces).

### 13.1 Visibility

`visibility = mentionedRuns / totalRuns`, where `totalRuns` is the count of runs within the window for the given model filter. Return as a 0–1 float; display as `Math.round(visibility * 100) + '%'`.

### 13.2 Share of Voice

```
brandMentions = COUNT(runs) WHERE mentioned = true
competitorMentions = SUM over competitors c of COUNT(runs WHERE competitor_mentions->>'<c.name>' = 'true')
sov = brandMentions / (brandMentions + competitorMentions)
```

Where the denominator is zero, `sov = 0`.

### 13.3 Position

`avgPosition = AVG(position_score) WHERE position_score IS NOT NULL`. Display as `#X.X`. If no rows, show `—`.

### 13.4 Sentiment

Map per-row sentiment to numeric (`positive=80`, `neutral=55`, `negative=30`), average across all runs in the window (including non-mentioned, which contribute `neutral=55`). Display as integer (e.g. `64`).

### 13.5 Visibility change

Compare visibility in the current `days` window against the prior `days` window of the same length (e.g. for `days=7`, compare to the 7 days before that). Result: `(current - prior)` as a percentage-point delta (e.g. `+3pp`). Color: green if positive, red if negative.

### 13.6 Visibility trend (weekly buckets)

- Group runs by week (Sunday as week start, UTC).
- Window: `max(days, 28)` so the chart always has at least 4 weeks of context.
- Per week, per entity (brand + each competitor): visibility for that entity that week. Brand visibility = `mentionedRuns / totalRuns`. Competitor visibility = `runs where competitor_mentions->>'<c.name>' = 'true' / totalRuns`.
- Chart series shape: `[{ weekStart: 'YYYY-MM-DD', brand: 0.34, '<comp1>': 0.21, ... }]`.

### 13.7 Domain sources

For each unique domain in `citations` within the window/model:

```
retrievalRate = (DISTINCT runs with citations to that domain) / totalRuns      // 0..1
citationRate  = (citations to that domain) / (total citations in window)        // 0..1
```

Sort by `retrievalRate` desc for the Sources tab and the Overview "Top Domains" preview.

### 13.8 URL sources

Same as 13.7 but grouped by full URL, fed by the `view=urls` toggle on the Sources tab.

---

## 14. API Routes — Concrete Contracts

All routes return JSON. All read routes accept `?days=<int>&model=<short>` where applicable; `model` is omitted or `'all'` to span all surfaces. `days` defaults to 7. The `model` filter must add a `model = $n` SQL clause only when provided and not `'all'`.

### `GET /api/brand`

Response: `{ brand: { id, name, domain, category, description } | null }`.

### `GET /api/setup-db`

Queries `information_schema.tables` for the 5 expected tables. Response:

```json
{
  "allTablesExist": true,
  "results": [
    { "table": "brands", "exists": true },
    { "table": "competitors", "exists": true },
    { "table": "prompts", "exists": true },
    { "table": "runs", "exists": true },
    { "table": "citations", "exists": true }
  ]
}
```

### `POST /api/setup-db`

Reads `sql/schema.sql` from disk and executes it against `DATABASE_URL`. Response: same shape as `GET`. Idempotent because schema uses `IF NOT EXISTS`.

### `GET /api/overview?days=7&model=claude`

Response:

```ts
{
  brand: { id, name, domain, category, description },
  competitors: { name, domain }[],
  metrics: {
    visibility: number,         // 0..1
    visibilityChange: number,   // percentage points
    mentioned: number,
    totalRuns: number,
    avgSentiment: number,       // 0..100
    avgPosition: number | null, // 1..5
    sov: number,                // 0..1
    competitiveRank: number,    // 1..N, rank by visibility among brand+competitors
    totalCitations: number,
  },
  rankings: { name, isYou: boolean, visibility, sov, sentiment, position, visibilityChange }[],
  trend: { weekStart: string, [entityName: string]: number }[],
  sources: { domain, type, retrievalRate, citationRate }[],  // top 8
  domainTypes: { type, count, percentage }[],
  recentChats: { promptId, text, models: ('openai'|'claude'|'gemini'|'perplexity'|'google_aio')[],
                 citationCount, sentiment: { label, score }, position: number | null, date: string }[],
  lastUpdated: string | null,    // ISO timestamp of most recent run
  keyInsight: string,            // server-generated text per the Overview "Key Insight" rules
  actions: {
    side: 'earned' | 'owned',
    priority: 'high' | 'medium' | 'low',
    title: string,
    description: string
  }[]
}
```

### `GET /api/sources?days=90&model=claude&view=urls`

Response: `{ sources, domainTypes, trend, view }`, where `sources` keys by `domain` or `url` per `view`.

### `GET /api/prompts/metrics?days=90&model=claude`

Response: `{ prompts: { id, text, topic, visibility, sentiment, position, models: short[], activeRunCount }[] }`. `models` is the set of model surfaces that have at least one run for that prompt in the window.

### `POST /api/prompts/run`

Body: `{ promptId?: string }`. If `promptId` is provided, run only that prompt; otherwise run all active prompts for the primary brand. Same response shape as the cron route.

### `GET /api/prompts/[id]`

Response:

```ts
{
  prompt: { id, text, topic, isActive },
  runs: Run[],                       // most recent N (e.g. 50)
  citations: { domain, url, type, runId }[],
  modelBreakdown: {
    model: short,
    mentioned: boolean | null,       // null if no run in window
    position: number | null,
    sentiment: string,
    citationCount: number,
    latestResponsePreview: string    // first 300 chars of most recent response
  }[]
}
```

### `POST /api/prompts`

Body: `{ text, topic }`. Creates a new prompt for the primary brand. Response: `{ id }`.

### `DELETE /api/prompts`

Body: `{ id }`. Archives: sets `is_active = false`. Response: `{ ok: true }`. Does NOT delete prior runs/citations.

### `POST /api/onboarding/crawl`

Body: `{ url }`. Response: `{ crawlData: CrawlResult, domain: string }`.

### `POST /api/onboarding/generate-prompts`

Body: `{ crawlData, domain }`. Response: `{ prompts: { text, topic }[] }`.

### `POST /api/onboarding/generate-competitors`

Body: `{ crawlData, domain }`. Response: `{ competitors: { name, domain }[] }`.

### `POST /api/onboarding/complete`

See §9 for body shape. Response: `{ brandId }` or `409` if a primary brand already exists.

### `POST /api/cron/run`

See §12. Requires bearer.

---

## 15. Dashboard UI

### App shell

- Fixed left sidebar, width 200px, background `#0d0d10`.
- Header bar across the top of the main area.
- Main content area: `max-w-[1400px]` centered, `p-8`, scrolls vertically.

### Sidebar

- Top: "Luminaire" logo — a teal Layers icon (`lucide-react`) in a rounded-md container, name in `font-semibold`.
- Nav items (`MainNav`): Overview (LayoutDashboard), Prompts (MessageSquareText), Sources (Globe). Use the App Router; nav state derived from pathname.
- Active state: `bg-white/[0.06] text-foreground`, icon tinted teal (`text-primary`).
- Inactive: `text-muted-foreground hover:bg-white/[0.03]`.
- Bottom: "Run All Prompts" full-width primary button with Play icon. Click triggers `POST /api/prompts/run` (no body) and shows a spinner; on completion, refresh all dashboard data and toast the batch cost (`run_total_cost`).

### Header

- Left: tracked brand name + a pulsing teal dot (CSS animated). Followed by:
  - **Date range dropdown** — options: 7d, 30d, 90d, 365d. Default 7d.
  - **Model filter dropdown** — options: All Models, ChatGPT, Claude, Gemini, Perplexity, AI Overview. Each option has the matching color dot.
- Right: `Last updated <relative time>` + model status pills. Each pill: model name in its brand color, background at 12% opacity. When a specific model is selected in the filter, dim all non-selected pills to `opacity-30`.
- Dropdown styling: absolute-positioned floating panel, `bg-[#161619]`, `border-border/60`, `shadow-xl`, `rounded-lg`, 8px padding.
- Both dropdowns must update ALL data on ALL tabs. Implement as URL search params or a single client-side store; pass `days` and `model` to every fetch.

### Tab 1: Overview

Two-column top row: a 280px left column of metric cards, and a flex right column with the visibility trend chart.

**A. Metric cards (vertical stack):**

1. Visibility — `text-[28px] font-semibold tabular-nums` percentage, with change indicator (↑ teal-green or ↓ red) and "vs prior" label.
2. Mentioned In — "X / Y" (mentioned / total runs).
3. Avg Sentiment — integer score 0–100.
4. Avg Position — "#X.X" or "—".

Each card: `rounded-lg border border-border/40 bg-card/60 p-5`, label `text-[10px] uppercase tracking-widest text-muted-foreground/60`, icon top-right (muted).

**B. Visibility trend chart:**

- Recharts `LineChart`, lines `type="monotone"`.
- X axis: `weekStart` formatted "MMM DD" (e.g. "Nov 17"). Y axis: percentage.
- Grid: dashed, stroke `#1e1e22`.
- Brand line: 2px stroke, full opacity, color `#2eb88a`. Competitor lines: 1.5px stroke, 0.6 opacity, colors per the Chart Colors table (§16).
- Custom tooltip: date header, then each entity sorted by value desc — color dot + name + colored percentage.
- Legend bar below the chart's bottom border.

**C. Rankings table:**

- Columns: `#`, Brand, Visibility (with progress bar + percentage + change), SOV, Sentiment (color dot + numeric), Position (`#X.X`).
- Row order: brand and competitors sorted by visibility desc.
- Brand row: `bg-primary/[0.03]`, brand name in teal, position in teal, avatar circle teal background. Competitor rows: gray avatar.
- Visibility progress bar: `w-14 h-1` rounded, filled at `visibility%`.

**D. AI Search Impact (3 ring circles):**

- Equal-size centered metric circles with ring borders.
- Competitive Rank — `#N` in teal, `bg-primary/10 ring-1 ring-primary/20`.
- AI Visibility — `N%` in blue, `bg-blue-500/10 ring-1 ring-blue-500/20`.
- Total Citations — number in amber, `bg-amber-500/10 ring-1 ring-amber-500/20`.
- Below the circles, a "Key Insight" panel (`bg-white/[0.02]`) with server-generated text per tier:
  - `visibility >= 30%`: "Strong visibility. Focus on maintaining position and expanding to adjacent topics."
  - `10% <= visibility < 30%`: "You appear in {N}% of responses; competitors average {M}%. Focus on closing the gap on {topGapTopic}."
  - `visibility < 10%`: "Low visibility. Priority: create comparison content and target high-citation domains."

**E. Actions (2 columns):**

- Left: **Earned · Off-page** (blue ExternalLink icon).
- Right: **Owned · On-page** (teal FileText icon).
- Each action card: colored left border (red=high, amber=medium, blue=low), icon + title + priority badge + description.
- Server-generated rules (the route returns the action list):
  - If top competitor visibility > brand visibility → Earned high: "Close visibility gap with {competitor}".
  - If UGC source count > 0 → Earned medium: "Increase presence on UGC platforms".
  - If brand visibility < 30% → Owned high: "Boost AI search visibility".
  - If brand domain retrieval rate < 20% → Owned high: "Optimize your domain for LLM retrieval".
  - Always: Owned low: "Create an AI-optimized content hub".
  - If corporate source count >= 3 → Earned medium: "Get listed on top-cited corporate domains".

**F. Sources Summary (2/3 + 1/3 grid):**

- Left: Top Domains table — compact, 8 rows max. Same row layout as Sources tab.
- Right: Domain Types breakdown — for each domain type, color dot + type name + thin bar + percentage.

**G. Recent Chats:**

- Grid up to 3 columns. Each card:
  - MessageSquare icon + truncated prompt text.
  - Model icon group: pills GPT, CL, GM, PX, AIO, colored if the model has at least one run for that prompt, dimmed otherwise.
  - Footer: citation count (Link2 icon + number), sentiment dot + score, position, date.

### Tab 2: Prompts

- Header: "Prompts" title and subtitle on left, "+ Add Prompt" button top right.
- Topic filter buttons (pills): All, plus every distinct topic present in `prompts.topic` (e.g. Affiliate, Core, Category, Free tool, Competitor). "All" is active by default.
- Add prompt: inline form with text input + topic dropdown (free-text or pick from existing topics) + Add button. On submit, `POST /api/prompts`, prepend the new row, clear form.
- Prompts table:
  - Columns: Prompt (clickable, max-w-[400px], truncated), Visibility%, Sentiment (dot + score), Position (`#X.X`), Models (colored ModelIcon pills indicating which models have runs in the window), Actions (Play + Archive icons).
  - Click prompt text → open Prompt Detail Modal.
  - Play icon → `POST /api/prompts/run` with `{ promptId }`; show spinner inline; on success refresh prompt row.
  - Archive icon → `DELETE /api/prompts` with `{ id }`; row fades out, table re-fetches.

**Prompt Detail Modal:**

- Backdrop: fixed, `bg-black/60`, `backdrop-blur-sm`, click closes.
- Card: `max-w-3xl max-h-[70vh] overflow-y-auto rounded-lg bg-card border border-border/60`.
- Header: "PROMPT DETAIL" label + full prompt text + X close button.
- Body: "PER-MODEL BREAKDOWN" section with 5 model cards ordered: openai, claude, gemini, perplexity, google_aio.
  - Each card: ModelIcon + model display name + Mentioned/Not mentioned badge + Position + Sentiment dot + Citation count.
  - Cards where `mentioned === true` get a green border tint: `border-success/20 bg-success/[0.03]`.
  - Click card to expand; shows the latest run's response preview, first 300 chars.

### Tab 3: Sources

- Header: title + subtitle on left, Domains ↔ URLs toggle on right. Pill-style toggle, `bg-white/[0.04]` container, active item `bg-white/[0.08]`.
- **A. Source Retrieval Chart:** Recharts `AreaChart`, top 5 domains over time (weekly bucketing same as the Visibility chart). Area fill 0.06 opacity, 1.5px stroke. Same tooltip pattern as Visibility chart.
- **B. Sources table + Domain Types breakdown (2/3 + 1/3 grid):**
  - Left: full domain or URL table — columns: `#`, Domain/URL, Type badge (color-coded per Domain Type Colors), Retrieved (progress bar + %), Citation Rate (%).
  - Right: Domain Types breakdown card — color dot + type name + bar + percentage.
- When the toggle flips to URLs:
  - Table header label changes to "URL".
  - Data rows show full URLs (truncated with full URL on hover).
  - API call passes `view=urls`.
- Empty state when filtered model rarely returns citations (e.g. Claude alone): "No sources retrieved for this model in the selected window." The note in the raw spec about ChatGPT/Claude/Gemini returning few citations stands — degrade gracefully, do not show a broken empty chart.

---

## 16. Design System

### Theme tokens (`src/app/globals.css`, Tailwind v4 `@theme`)

```
--color-background: #0a0a0c
--color-foreground: #ececef
--color-card: #111114
--color-card-foreground: #ececef
--color-primary: #2eb88a
--color-primary-foreground: #ffffff
--color-secondary: #161619
--color-muted: #161619
--color-muted-foreground: #8b8b92
--color-destructive: #e5484d
--color-border: #1e1e22
--color-input: #1e1e22
--color-ring: #2eb88a
--color-success: #30a46c
--color-warning: #f5a623
```

### Typography

- Font: `"Inter", -apple-system, system-ui, sans-serif`.
- `-webkit-font-smoothing: antialiased`.
- Sizes: `text-[10px]` labels, `text-[11px]` secondary, `text-[12px]` table data, `text-[13px]` body, `text-xl` headings.
- `font-semibold` headings, `tabular-nums` on all numbers.

### Spacing & styling

- Cards: `rounded-lg border border-border/40 bg-card/60 p-5`.
- Tables: no outer padding on the card; table inside; `text-[13px]` rows; header `text-[10px] uppercase tracking-wider text-muted-foreground/40`.
- Row hover: `hover:bg-white/[0.015]`.
- Borders: `border-border/30` subtle, `border-border/60` visible.
- Interactive: `bg-white/[0.04]` hover, `bg-white/[0.06]` active.
- Scrollbar: 5px width, thumb `#2a2a2f`, track transparent.
- No noise textures, no decorative animation, no shadows except dropdown `shadow-xl`. Transitions only on hover (≤150ms).

### Chart colors

| Series | Color | Stroke | Opacity |
|---|---|---|---|
| Brand | `#2eb88a` | 2px | 1.0 |
| Competitor 1 | `#e5484d` | 1.5px | 0.6 |
| Competitor 2 | `#3b82f6` | 1.5px | 0.6 |
| Competitor 3 | `#f5a623` | 1.5px | 0.6 |
| Competitor 4 | `#8b5cf6` | 1.5px | 0.6 |
| Competitor 5 | `#ec4899` | 1.5px | 0.6 |
| Competitor 6 | `#06b6d4` | 1.5px | 0.6 |

### Domain type colors

| Type | Color |
|---|---|
| Corporate | `#f5a623` |
| UGC | `#3b82f6` |
| You | `#2eb88a` |
| Competitor | `#e5484d` |
| Reference | `#8b5cf6` |
| Other | `#525259` |
| Editorial | `#6366f1` |
| Institutional | `#14b8a6` |

### LLM model colors

| Model | Color |
|---|---|
| ChatGPT/OpenAI | `#10a37f` |
| Claude | `#d97640` |
| Gemini | `#4285f4` |
| Perplexity | `#20b2aa` |
| Google AI Overview | `#ea4335` |

---

## 17. Edge Cases and Failure Behaviors

- **No primary brand yet (first run):** `/` shows the onboarding wizard. Dashboard routes are not reachable until a primary brand exists.
- **Schema not applied:** `/` calls `GET /api/setup-db`; if `allTablesExist === false`, redirect to `/setup`.
- **Single model failure mid-batch:** logged, skipped, batch continues. No `runs` row written for the failed call. The Prompt Detail modal shows that model's card with "No run in window" instead.
- **All five models fail for a prompt:** that prompt contributes nothing to metrics for the window. Recent Chats may show the prompt with all model pills dimmed.
- **Onboarding crawl: homepage fails:** error to user; no DB writes.
- **Onboarding crawl: secondary pages fail:** silently skipped; carry on with what we have.
- **Generation model returns unparseable JSON:** retry once with stricter instructions. If still fails, surface a clear error and offer "Try again".
- **Brand mention false positive on generic name:** known weakness for very generic brand names (e.g. "Apple"). Acceptable for MVP; users with generic names will see inflated visibility. Documented in README.
- **Position scoring on numbered lists where brand appears multiple times:** first mention wins.
- **Sentiment with brand mentioned but no qualifying words:** neutral.
- **Citation extraction from URL containing trailing parenthesis:** the regex stops at `)`; explicit trailing `.,;:!?` stripped after match.
- **DataForSEO returns no SERP at all (network or auth error):** treated as a single-model failure for `google_aio`, logged, skipped.
- **Perplexity returns text without citations:** still record the run with `mentioned`, `position`, etc.; citations are simply zero.
- **Two cron runs in the same minute:** allowed; produces duplicate runs but doesn't crash.
- **App restarted mid-batch:** the in-progress orchestrator call is lost. Inserted rows so far remain; missing ones simply don't exist. Acceptable.
- **Long responses exceeding 2000 tokens:** truncated by the API; the brand may not be mentioned because it would have come later. Documented as a tradeoff.
- **User clicks "Run All Prompts" while another batch is running:** the button shows a spinner and the second click is ignored client-side. The server has no lock; if a second batch slips through, it runs the same prompts again.
- **`MODEL_GEMINI` preview id deprecated:** orchestrator treats it as a model failure for the day, dashboard shows a gap for Gemini. README documents falling back to `gemini-2.5-pro`.
- **Trend chart with fewer than 4 weeks of data:** show only the weeks that have data; legend still renders; X-axis still labeled.
- **Sources tab filtered to a model that rarely cites (e.g. Claude only):** empty state instead of broken chart.

---

## 18. Assumptions

Each assumption below is something the raw spec didn't explicitly answer; I'm making the call here so the implementer doesn't have to.

- **A1 — No app authentication.** The product is single-user, local-only, on `localhost:4810`. No login flow, no Google OAuth, no user table. The only auth boundary is the cron endpoint, protected by `CRON_SECRET`. The project-global rule "Auth: Google OAuth via environment variables" applies *when auth is needed*; this MVP does not need it. If the user later wants to expose Luminaire on a network, OAuth can be added.
- **A2 — One primary brand.** The schema supports multiple brands, but the app workflow only ever surfaces one. `/api/onboarding/complete` rejects (409) if a primary brand already exists. Re-onboarding requires the user to manually delete the brand row in Neon for the MVP. (Future iteration: a "Reset / Start Over" admin action.)
- **A3 — Sequential across prompts.** The raw spec says "sequential across models". I extend that to "sequential across prompts" too, for the same reason (predictable gateway load, easier debugging). A future optimization could parallelize across prompts.
- **A4 — Soft skip cron lockout.** No mutex between manual "Run All Prompts" and the cron endpoint. Two batches at once produce duplicate runs but don't crash. Acceptable for a single-user local app.
- **A5 — Default location/language for AI Overview.** US English (DataForSEO `location_code=2840`, `language_code=en`). Configurable later via env if needed.
- **A6 — Cheerio for HTML parsing.** The raw spec's tech stack list is the *mandated* surface; cheerio is added as a server-only dependency for crawl extraction. It doesn't affect bundle size on the client.
- **A7 — `runs.model` is short-id, not real model id.** See §4. The filter dropdown uses short ids; storing real model ids would break the filter every time env vars change.
- **A8 — Topic enum during onboarding.** Generated prompts use a fixed five-topic enum: Category, Competitor, Affiliate, Core, Free tool. Users can free-text new topics later via the Prompts tab.
- **A9 — README-documented `gemini-3.1-pro-preview` fallback.** When the preview id is rejected by the gateway, the user updates `.env`'s `MODEL_GEMINI` to `gemini-2.5-pro`. The orchestrator does not attempt this fallback automatically.
- **A10 — Server-side action generation.** "Earned" / "Owned" action cards are produced server-side in `/api/overview` based on metrics, not by an LLM. Deterministic, cheap, easy to evolve.
- **A11 — Domain type colors stored as theme constants in TS, not in DB.** `citations.domain_type` stores the string label; the UI maps label → color at render time. Schema does not need a colors table.
- **A12 — Onboarding does not allow adding new prompts.** Only edit and remove. The raw spec only describes edit/remove. After launch, users can `POST /api/prompts` from the Prompts tab.
- **A13 — Visibility "vs prior" period.** For `days=7` we compare to the immediately preceding 7-day window. For `days=365` similarly. This matches the raw spec but spells out the boundary.
- **A14 — Brand mention is name OR domain.** Both work as triggers; the parser checks the brand `name` first (case-insensitive word boundary), then `domain` (apex match). Either match → `mentioned = true`.
- **A15 — `.org` mapped to Institutional.** Per §11.6, all `.org` domains are classified Institutional in the MVP. This will occasionally misclassify a `.org` SaaS (e.g. `mozilla.org`), but the false positive rate is low enough to accept for MVP. Editorial and UGC lists take precedence (checked first).

---

## 19. Resolved Open Questions

Each question below was an ambiguity or contradiction in the raw spec. The resolution and the source are recorded so the implementer can audit the decision later.

- **Q1 — Which Perplexity model: `sonar` or `sonar-pro`?**
  The raw spec mentions both: line 23 says `sonar`, lines 56 and 350 say `sonar-pro`, and the `.env` file pins `MODEL_PERPLEXITY=sonar-pro`. **Use `sonar-pro`.** Source: `.env` value, plus the spec narrative on frontier consumer-tier models. Resolved from project files.

- **Q2 — Does the gateway support `response_format`?**
  The raw spec says no; `docs/llm-gateway-api.md` says yes. **The docs are correct: use `response_format` with `json_schema` (strict mode) for crawl extraction and the two generation calls.** Tool-calling remains a valid fallback if a specific model misbehaves. Source: `docs/llm-gateway-api.md` in this repo (authoritative gateway docs).

- **Q3 — Can users add a new prompt during onboarding?**
  The raw spec describes edit and X-to-remove on the 5 generated prompts but doesn't mention add. **No add in onboarding; add via the Prompts tab post-launch.** Resolved by reading the spec literally to keep onboarding focused.

- **Q4 — Forced structured output format for crawl/prompt/competitor generation.**
  Raw spec used tool calling. **Switch to `response_format: { type: 'json_schema', json_schema: { strict: true, schema: ... } }`.** See Q2.

- **Q5 — Are prompts run sequentially or in parallel within a batch?**
  Raw spec says "sequential across models". **Also sequential across prompts in this MVP.** Same predictable-load reasoning the raw spec gives for models. Resolved by extending the raw spec's rationale.

- **Q6 — How is `position_score` actually computed when it's not a numbered list?**
  Raw spec hand-waves. **Concrete rule (§11.2): split into 5 equal character-length segments, first mention's segment number = score. Numbered-list mentions override with the list number, capped at 5. NULL if not mentioned.** Resolved with a concrete, deterministic algorithm.

- **Q7 — Sentiment word lists.**
  Raw spec only gives a handful of examples. **Concrete lists in §11.3.** Kept short and deliberately conservative.

- **Q8 — What is `last updated`?**
  **The timestamp of the most recent `runs.created_at` for the primary brand, formatted as a relative time ("3 hours ago").**

- **Q9 — Domain normalization for matching brand vs competitor vs UGC etc.**
  **All domain comparisons use the apex (lowercase, strip `www.`, strip protocol, strip path).** Helper: `normalizeDomain(input)` in `lib/utils.ts`.

- **Q10 — Where does the Recent Chats list come from?**
  **The most recent N distinct prompts (default N=6) that have at least one run in the current window, ordered by latest run desc.** Cards show the per-model status as of that prompt's most recent runs.

- **Q11 — Cost storage for non-gateway runs (Perplexity, DataForSEO).**
  Raw spec says "leave Perplexity null". DataForSEO returns its own `cost`. **Perplexity = NULL. DataForSEO = use the `cost` field on the task, if present.** Surfaced in cost totals.

- **Q12 — What value goes in `runs.model`?**
  Schema is `TEXT NOT NULL` but the spec doesn't say what to store. **Store the short id (`openai`, `claude`, `gemini`, `perplexity`, `google_aio`)** so the model filter dropdown works without translation and survives env changes. See A7.

- **Q13 — Brand name extraction during onboarding.**
  **Brand name defaults to the crawl-extracted `title`. Domain defaults to the input URL's apex. Both editable in Step 3.**

- **Q14 — Re-onboarding flow.**
  **For the MVP, re-onboarding requires deleting the primary brand row directly in Neon.** Documented in README as a known limitation. (Future: a Settings page with a "Reset" button.)

- **Q15 — How does the UI know a "Run All Prompts" or cron run is finished?**
  Both routes are synchronous: the HTTP response returns when all model calls finish (or fail). **The UI shows a spinner from click until the response returns, then refreshes dashboard data.** Acceptable batch wall-clock for the MVP (5 prompts × 5 surfaces × ~5–15s per call, mostly serial = ~2–6 minutes).

---

## 20. Definition of Done

A working MVP per this refined spec means:

1. `npm install && npm run db:migrate && npm run dev` brings up the app on `http://localhost:4810`.
2. Visiting `/` with an empty DB redirects to `/setup`; clicking "Run migration" applies the schema; "Re-check tables" shows all green.
3. With tables ready and no brand, `/` shows the onboarding wizard. Submitting a real product URL produces 5 plausible buyer-intent prompts and 4–5 plausible competitors. "Launch Tracking" saves them.
4. After onboarding, `/` shows the dashboard. The header date and model filters work and update all three tabs.
5. Clicking "Run All Prompts" successfully calls all 5 surfaces for all active prompts and stores runs + citations. Per-call failures are logged and skipped without aborting the batch. The batch cost (`run_total_cost`) is shown after the run.
6. `npm run cron` POSTs to `/api/cron/run` with the bearer token and produces the same result as the manual button. A 401 is returned without the bearer.
7. The Overview tab shows real metric cards, a visibility trend chart with weekly buckets, a rankings table with the brand and competitors, an AI Search Impact ring section, action cards, a top-domains preview, and recent chats. With <4 weeks of data, the trend chart is sparse but not broken.
8. The Prompts tab shows the prompts with per-window metrics and the topic filter. The Prompt Detail modal shows a per-model breakdown including response previews.
9. The Sources tab toggles between domain-grouped and URL-grouped views and shows the area chart, the table, and the domain types breakdown. Filtering to a model with no citations shows the empty state, not a broken chart.
10. All API routes return the documented shapes. All SQL is parameterized. No secrets reach the client. The dark theme matches the tokens. The cron documentation in the README covers macOS/Linux cron and Windows Task Scheduler.
