# Claude Code Prompt: AI Search Visibility Platform (LLM Gateway + Neon)

You are an expert full-stack engineer. Build a complete, production-quality AI SaaS application from scratch. This is an **AI Search Visibility Platform** called **Luminaire** that tracks how brands appear inside LLM responses (ChatGPT, Claude, Gemini, Perplexity, and Google AI Overviews).

> **Adapted stack:** OpenAI, Claude, and Gemini calls go through the **LLM Gateway**; **Perplexity is called directly** (the gateway does not support it); Google AI Overview is a direct DataForSEO SERP call. The database is **Neon** (serverless Postgres) via a real Postgres driver — not Supabase REST.

---

## ⚙️ GATEWAY & STACK FACTS (read first — these are exact, not assumptions)

**LLM Gateway**

- Endpoint: `POST ${LLM_GATEWAY_BASE_URL}/chat/completions`, where `LLM_GATEWAY_BASE_URL` = `https://llm-gateway.replit.app/api/v1`.
- Auth: `Authorization: Bearer ${LLM_GATEWAY_API_KEY}` (keys are prefixed `llmgw_`).
- The underlying provider is chosen by the `model` string in the request body. Covers OpenAI, Anthropic (Claude), and Gemini only.
- **Response shape is NOT standard OpenAI.** For a non-streaming request the assistant text is a top-level string field `content` (i.e. `response.content`), NOT `choices[0].message.content`. Tool calls (when used) come back as a top-level `tool_calls` array. The response also includes `usage`, `provider`, `model`, `finish_reason`, and `estimated_cost`.
- Do **not** use streaming for this app — use plain non-streaming requests and read `response.content`.
- Request params supported: `model`, `messages`, `max_tokens`, `temperature`, `tools`, `tool_choice`, `run_id`, `stream`. There is **no `response_format` / JSON-mode param** — structured output must come from tool calling (see Generation).
- `run_id`: pass a shared `run_id` for all calls in one batch ("Run All Prompts" / cron). The response then includes `run_total_cost` (cumulative cost for that batch), which the app should surface so cost is visible.

**Perplexity (direct, not via gateway)**

- Endpoint: `POST https://api.perplexity.ai/chat/completions`, auth `Authorization: Bearer ${PERPLEXITY_API_KEY}`, model `sonar`.
- This is a **standard OpenAI-style** response: read `choices[0].message.content`, and read the top-level `citations` array for source URLs. (Different shape from the gateway — handle both.)

**Other**

- **Neon** is accessed with the `@neondatabase/serverless` driver using parameterized SQL. No ORM. No PostgREST. No Supabase.
- **Google AI Overview is NOT an LLM call** — it's a SERP scrape via DataForSEO, called directly.
- Model ids are set via env so they don't go stale.

---

## 🔐 API KEYS & ENV VARIABLES

Create a `.env.local` file with these placeholders. All API calls MUST be server-side only — never expose keys to the frontend.

```
# LLM Gateway (OpenAI, Claude, Gemini)
LLM_GATEWAY_BASE_URL=https://llm-gateway.replit.app/api/v1
LLM_GATEWAY_API_KEY=<your-llmgw_-key>

# TRACKING models — the frontier models real users get in the consumer chat apps.
# Visibility/sentiment/position are measured against THESE, so they must match
# what a real person sees in ChatGPT / Claude / Gemini, not a cheap API tier.
MODEL_OPENAI=gpt-5.5
MODEL_CLAUDE=claude-opus-4-7
MODEL_GEMINI=gemini-3.1-pro-preview

# GENERATION model — internal plumbing only (crawl analysis, prompt + competitor
# generation during onboarding). Never affects visibility numbers, so keep it cheap.
MODEL_GENERATION=gemini-2.5-flash

# Perplexity — called DIRECTLY (gateway does not support it). sonar-pro is the
# grounded search model the consumer app uses; richer citations than base sonar.
PERPLEXITY_API_KEY=<your-pplx-key>
MODEL_PERPLEXITY=sonar-pro

# SERP / AI Overview (not an LLM)
DATAFORSEO_LOGIN=<your-dataforseo-login>
DATAFORSEO_PASSWORD=<your-dataforseo-password>

# Neon Postgres
DATABASE_URL=<your-neon-connection-string>        # postgres://...neon.tech/...?sslmode=require

# Scheduler auth (protects the cron endpoint)
CRON_SECRET=<random-long-string>
```

---

## 🧱 TECH STACK (Mandatory)

- **Next.js 16+** (App Router, `src/` directory) — note: Turbopack is the default builder in 16; do not add a custom webpack config or the build will fail.
- **TypeScript** (strict mode)
- **Tailwind CSS v4** (via `@tailwindcss/postcss`)
- **Recharts** for all charts
- **Neon** (`@neondatabase/serverless`) for Postgres — parameterized SQL, no ORM
- **lucide-react** for icons
- **clsx + tailwind-merge** for class composition
- No additional UI framework — build all components from scratch

---

## 🎨 DESIGN SYSTEM — Dark Theme (Critical)

The UI must feel like a top-tier SaaS product (Linear, Vercel, Stripe quality). Dark theme with a **teal-green accent**. NOT purple. Minimal, clean, subtle.

### Color Tokens (CSS custom properties via `@theme` in globals.css):

```
--color-background: #0a0a0c
--color-foreground: #ececef
--color-card: #111114
--color-card-foreground: #ececef
--color-primary: #2eb88a          (teal-green — used for accent, active states, brand highlight)
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

### Typography:

- Font: `"Inter", -apple-system, system-ui, sans-serif`
- Enable `-webkit-font-smoothing: antialiased`
- Use text sizes: `text-[10px]` for labels, `text-[11px]` for secondary, `text-[12px]` for table data, `text-[13px]` for body, `text-xl` for headings
- Use `font-semibold` for headings, `tabular-nums` for numbers

### Spacing & Styling:

- Cards: `rounded-lg border border-border/40 bg-card/60 p-5`
- Tables: No outer padding on card, table inside with `text-[13px]`, header rows `text-[10px] uppercase tracking-wider text-muted-foreground/40`
- Row hover: `hover:bg-white/[0.015]`
- Borders: `border-border/30` for subtle, `border-border/60` for visible
- Interactive elements: use `bg-white/[0.04]` for hover, `bg-white/[0.06]` for active
- Scrollbar: 5px width, #2a2a2f thumb, transparent track
- NO noise texture overlays. NO animations except subtle transition on hover.

### Chart Colors (consistent across all charts):

```
Brand (primary): #2eb88a (teal-green, 2px stroke, full opacity)
Competitor 1: #e5484d (red, 1.5px stroke, 0.6 opacity)
Competitor 2: #3b82f6 (blue)
Competitor 3: #f5a623 (amber)
Competitor 4: #8b5cf6 (purple)
Competitor 5: #ec4899 (pink)
Competitor 6: #06b6d4 (cyan)
```

### Domain Type Colors:

```
Corporate: #f5a623 (amber)
UGC: #3b82f6 (blue)
You: #2eb88a (teal-green)
Competitor: #e5484d (red)
Reference: #8b5cf6 (purple)
Other: #525259 (gray)
Editorial: #6366f1 (indigo)
Institutional: #14b8a6 (teal)
```

### LLM Model Colors:

```
ChatGPT/OpenAI: #10a37f (green)
Claude: #d97640 (orange)
Gemini: #4285f4 (blue)
Perplexity: #20b2aa (teal)
Google AI Overview: #ea4335 (red)
```

---

## 🗄️ DATABASE SCHEMA (Neon Postgres)

Create these 5 tables. Provide a `sql/schema.sql` file written to be **idempotent** (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) and a migration runner (see "Database setup" below) that applies it directly against `DATABASE_URL`. There is no manual "paste SQL into a dashboard" step.

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
  model TEXT NOT NULL,
  response TEXT,
  mentioned BOOLEAN DEFAULT false,
  position_score REAL,
  sentiment TEXT DEFAULT 'neutral',
  competitor_mentions JSONB DEFAULT '{}',
  estimated_cost REAL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS citations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES runs(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  url TEXT,
  domain_type TEXT DEFAULT 'Other',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Add indexes on: `runs(prompt_id)`, `runs(created_at)`, `citations(run_id)`, `citations(domain)`, `prompts(brand_id)`, `competitors(brand_id)`.

> Note: `gen_random_uuid()` is built into modern Postgres (pgcrypto/`pg_catalog`) and is available on Neon, so no extension setup is required.

---

## 📐 APP ARCHITECTURE

### Directory Structure:

```
src/
├── app/
│   ├── globals.css          # Theme tokens + scrollbar + typography
│   ├── layout.tsx           # Root layout, dark class, metadata
│   ├── page.tsx             # Entry: checks DB → onboarding or dashboard
│   ├── setup/page.tsx       # DB setup status + "Run migration" button
│   └── api/
│       ├── brand/           # GET primary brand
│       ├── setup-db/        # GET checks tables; POST runs sql/schema.sql against DATABASE_URL
│       ├── overview/        # GET dashboard data (params: days, model)
│       ├── sources/         # GET citation data (params: days, model, view)
│       ├── prompts/         # CRUD prompts
│       ├── prompts/metrics/ # GET per-prompt metrics (params: days, model)
│       ├── prompts/run/     # POST execute prompts across models
│       ├── prompts/[id]/    # GET prompt detail with per-model breakdown
│       └── onboarding/
│           ├── crawl/       # POST website URL → crawl + extract
│           ├── generate-prompts/    # POST → 5 commercial-intent prompts
│           ├── generate-competitors/ # POST → 4-5 competitors
│           └── complete/    # POST → save brand + competitors + prompts
├── components/
│   ├── ui/                  # Button, Card, Input, Badge, Tabs, Spinner, MetricCard, ModelIcon
│   ├── charts/              # VisibilityChart, SourceChart
│   ├── dashboard/           # All dashboard components (see below)
│   └── onboarding/          # OnboardingFlow
├── lib/
│   ├── utils.ts             # cn(), formatPercent, extractDomain
│   ├── db.ts                # Neon serverless client init (single shared instance)
│   ├── queries.ts           # All DB CRUD operations as parameterized SQL helpers
│   ├── metrics.ts           # All analytics calculations
│   ├── scraper.ts           # Website crawler
│   ├── generators.ts        # Prompt + competitor generation (via gateway, tool-calling for structured output)
│   └── llm/
│       ├── orchestrator.ts  # Runs prompts across all 5 models
│       ├── parser.ts        # Response analysis (mentions, position, sentiment, citations)
│       ├── gateway.ts       # Gateway client (OpenAI/Claude/Gemini); reads top-level `content`
│       ├── perplexity.ts    # Direct Perplexity client; reads choices[].message.content + citations
│       └── google-aio.ts    # DataForSEO AI Overview extraction (not via gateway)
└── types/index.ts           # All TypeScript interfaces
```

> The three gateway models (OpenAI, Claude, Gemini) share **one** `gateway.ts` client — only the model-id string differs, and the assistant text is read from the top-level `content` field. Perplexity is a **separate** `perplexity.ts` client (direct API, standard OpenAI response shape, plus a native `citations` array). `google-aio.ts` stays separate because DataForSEO is not an LLM.

### Database access (`lib/db.ts` + `lib/queries.ts`):

- Initialize the Neon client once from `DATABASE_URL` using `@neondatabase/serverless` and reuse it (don't create a connection per request).
- All reads/writes are **parameterized** SQL (use `$1, $2 …` placeholders — never string-interpolate user input).
- `queries.ts` exposes typed helper functions for every operation the app needs (get primary brand, insert brand/competitors/prompts, list active prompts, insert run, insert citations, fetch runs with filters by `days`/`model`, fetch citations joined to runs, etc.).
- The `model` filter must add a `model = $n` clause when a model param is provided.
- Date filtering uses `created_at >= now() - ($n || ' days')::interval` style parameterization.

---

## 🚀 ONBOARDING FLOW

When no brand exists in the database, show a 3-step onboarding wizard:

### Step 1: URL Input

- Centered card with globe icon
- Input field: "https://yourproduct.com"
- Arrow button to submit
- Progress indicator: 3 steps (Website → Analyzing → Review & Launch)

### Step 2: Analyzing (loading state)

- Spinner + "Analyzing {domain}" message
- Auto-triggers: crawl website → generate prompts + competitors in parallel

### Step 3: Review & Launch

Three cards stacked:

1. **Product Summary** — extracted title, description, category, audience (from crawl)
2. **Generated Prompts** — 5 editable prompts, click to inline edit, X to remove
3. **Competitors** — 4-5 competitors with name + domain, editable, removable

Bottom: "Start Over" (outline) + "Launch Tracking" (primary, with Zap icon)

### Website Crawling Logic:

- Fetch: homepage, /pricing, /features, /about, /integrations, /use-cases, /product
- Strip HTML (scripts, styles, nav, footer, tags)
- Call the **LLM Gateway** with `MODEL_GENERATION` to extract structured data. This gateway has no JSON-mode param, so get structured output via **tool calling**: define one function whose `parameters` schema is the object below, send `tool_choice` forcing that function, and read the structured result from `tool_calls[0].function.arguments` (a JSON string — parse it). Extract:
  - title, description, category, targetAudience, coreUseCase, features[], integrations[], pricingInfo, competitorHints[]

### Prompt Generation (via gateway, `MODEL_GENERATION`):

- Generate 5 **commercial-intent, long-tail, buyer-focused** prompts
- Must be queries a buyer would type into ChatGPT/Claude/Perplexity
- Examples: "best influencer marketing tools for ecommerce", "top alternatives to [competitor]"

### Competitor Generation (via gateway, `MODEL_GENERATION`):

- Return 4-5 direct competitors with name + domain
- Based on category, positioning, and any hints from the website

> Generation uses the cheap `MODEL_GENERATION` and gets structured output via **tool calling** (forced single function whose parameters are the desired schema), since this gateway has no JSON-mode/`response_format` param. Parse `tool_calls[0].function.arguments`; if a model returns prose instead, retry once with a stricter instruction.

---

## 🔁 LLM ORCHESTRATOR

For each prompt, run across 5 models **sequentially** (not parallel — avoids rate limits and keeps gateway load predictable):

### Model Integrations:

Three models go through `gateway.ts` (read text from top-level `content`); Perplexity goes through `perplexity.ts` (direct); Google AI Overview is DataForSEO. All chat calls use max_tokens 2000, temp 0.3. Pass a shared `run_id` (e.g. the batch id) to all gateway calls so cumulative cost is tracked.

> **Model selection:** tracking uses frontier consumer-tier models (`gpt-5.5`, `claude-opus-4-7`, `gemini-3.1-pro-preview`, `sonar-pro`) so the numbers reflect what a real user sees in the chat apps — not cheaper API tiers. This costs meaningfully more per run than mini/flash tiers, and you're running every prompt × 5 models × daily, so watch `run_total_cost`. `gemini-3.1-pro-preview` is a preview id; if it gets deprecated, fall back to `gemini-2.5-pro` (stable).

1. **OpenAI** — gateway, `model = MODEL_OPENAI`. Read `response.content`.
2. **Claude** — gateway, `model = MODEL_CLAUDE`. Read `response.content`.
3. **Gemini** — gateway, `model = MODEL_GEMINI`. Read `response.content`.
4. **Perplexity** — direct call to `https://api.perplexity.ai/chat/completions`, `model = MODEL_PERPLEXITY` (`sonar`). Standard OpenAI response: read `choices[0].message.content`, and read the top-level `citations` array for source URLs. Perplexity is the primary source of real citations among the chat models.
5. **Google AI Overview** — DataForSEO SERP API (`/v3/serp/google/organic/live/advanced`). Extract only `ai_overview` type items. Fallback to `featured_snippet`. Extract text + reference URLs. (Direct DataForSEO call.)

**Error handling:** treat any non-2xx from the gateway, Perplexity, or DataForSEO (rate limit, quota, model unavailable, timeout) as a soft failure for that one model — log it and continue to the next model. One model failing must never crash the batch.

**Cost capture:** store the gateway's per-call `estimated_cost` on each run (see schema), and surface the batch's `run_total_cost` after a "Run All Prompts"/cron run. Perplexity and DataForSEO costs aren't reported by the gateway; leave those runs' cost null.

### Response Parsing (for each model response):

1. **Brand Mention Detection** — case-insensitive search for brand name or domain in response text
2. **Position Score** (1-5 scale) — detect position by: (a) relative text position (early = better), (b) numbered list detection (e.g., "1." → position 1 → score 1, "5." → score 3)
3. **Sentiment** — heuristic: count positive words (best, top, leading, recommended, etc.) vs negative words (worst, poor, limited, expensive, etc.) in sentences containing brand name. Return positive/neutral/negative.
4. **Competitor Mentions** — check each competitor name/domain in response text. Store as `{ "CompName": true/false }` JSONB.
5. **Citation Extraction** — combine: (a) API-provided citations (Perplexity `citations`, DataForSEO references) and (b) any URLs found in response text via regex. **Important:** plain chat completions from OpenAI, Claude, and Gemini usually contain NO source URLs, so for those models citations will normally be empty. If the gateway supports a web-search / grounding tool for those models, enabling it is the only way to get real citations from them; otherwise expect the Sources feature to be driven almost entirely by Perplexity and Google AI Overview. Build the UI to degrade gracefully when a model returns zero citations.
6. **Domain Classification** — classify each cited domain:
   - Match brand domain → "You"
   - Match competitor domain → "Competitor"
   - Known UGC domains (reddit, youtube, quora, medium, twitter, tiktok) → "UGC"
   - Known editorial (techcrunch, wired, forbes, bloomberg) → "Editorial"
   - Known reference (wikipedia, MDN) → "Reference"
   - Review sites (g2, capterra, trustpilot) → "UGC"
   - .edu/.gov/.org → "Institutional"
   - Everything else → "Corporate"

### Storage:

- Create a `run` record for each model response
- Create `citation` records for each extracted URL

---

## ⏱️ SCHEDULING / CADENCE (Required)

The product's value is trend-over-time, which only exists if prompts run on a recurring schedule — not just when someone clicks a button. Build a scheduled execution path:

- Add `POST /api/cron/run` that runs ALL active prompts across all models (same logic as "Run All Prompts").
- Protect it: require an `Authorization: Bearer ${CRON_SECRET}` header; reject anything else with 401.
- Make it resilient: a single model or prompt failure logs and continues; the run never aborts the whole batch.
- Add an `npm run cron` script that POSTs to `http://localhost:3000/api/cron/run` with the `CRON_SECRET` header, so the daily run is a single command.
- **This deploys locally**, so trigger `npm run cron` once a day with the OS scheduler:
  - macOS/Linux: a `cron` entry (e.g. `0 9 * * *`) that runs the command.
  - Windows: a Task Scheduler daily task.
  - Document both in the README.
- The manual "Run All Prompts" button stays for on-demand runs.

> **Local-deployment limitation:** the scheduled run only fires if the machine is on and the app is running at that time. If the machine is asleep/off, that day has no data and the trend chart will have a gap. There is no historical backfill — trend charts stay sparse until roughly 30–90 days of runs have accumulated.

---

## 🧮 METRICS CALCULATIONS

All metrics functions accept optional `model` filter parameter. When model is provided, filter runs to only that model.

### Visibility

```
visibility = mentionedRuns / totalRuns
```

### Share of Voice (SOV)

```
sov = brandMentions / (brandMentions + allCompetitorMentions)
```

### Position

```
avgPosition = sum(position_scores) / count(position_scores)
```

Where position_score is 1-5 scale (1 = best).

### Sentiment

Map to numeric: positive=80, neutral=55, negative=30. Average across runs.

### Visibility Change

Compare current period vs previous period of same length.

### Visibility Trend

Group runs by **week** (Sunday start). For each week, calculate visibility % for brand and each competitor.

### Domain Sources

For each domain in citations:

- `retrievalRate` = citations_for_domain / total_runs * 100
- `citationRate` = citations_for_domain / total_citations

### URL Sources

Same as domain sources but grouped by full URL instead of domain.

---

## 📊 DASHBOARD — 3 TABS

The app shell has a fixed sidebar (200px, bg `#0d0d10`) on the left and a header bar at the top. Content scrolls within the main area (max-width 1400px, centered, p-8).

### Sidebar:

- Logo: "Luminaire" with a teal Layers icon in rounded-md container
- Nav items: Overview (LayoutDashboard), Prompts (MessageSquareText), Sources (Globe)
- Active state: `bg-white/[0.06] text-foreground` with teal icon
- Inactive: `text-muted-foreground hover:bg-white/[0.03]`
- Bottom: "Run All Prompts" button (full-width, primary, Play icon)

### Header Bar:

- Left side: Brand name with pulsing green dot + **Date Range Dropdown** (7d/30d/90d/365d) + **Model Filter Dropdown** (All Models, ChatGPT, Claude, Gemini, Perplexity, AI Overview — each with color dot)
- Right side: Last updated timestamp + Model status pills (colored text on colored bg at 12% opacity)
- Dropdowns: absolute positioned, bg `#161619`, border-border/60, shadow-xl, rounded-lg

Both filter dropdowns must update ALL data across ALL tabs (Overview, Prompts, Sources). Pass `days` and `model` as query params to all API routes.

When a model is selected, the model pills on the right should dim (opacity-30) all non-selected models.

---

### TAB 1: OVERVIEW

Layout: **Metrics (280px column) + Visibility Chart (flex)** side by side at the top. This puts the chart above the fold.

#### A. Metric Cards (stacked vertically on left):

4 cards in a column:

1. **Visibility** — percentage, with change indicator (↑green or ↓red) and "vs prior" label
2. **Mentioned In** — "X / Y" format (mentioned / total runs)
3. **Avg Sentiment** — numeric score
4. **Avg Position** — "#X.X" format

Each card: `text-[11px]` uppercase tracking-widest label, `text-[28px]` bold value, muted icon top-right.

#### B. Visibility Trend Chart (right):

- Recharts `LineChart` with `monotone` lines
- X-axis: date (Mon DD format), Y-axis: percentage
- Grid: dashed, stroke `#1e1e22`
- **Custom tooltip** showing: date header, then each brand sorted by value descending, with color dot + brand name + colored percentage value
- Legend bar at bottom below chart border
- Brand line: 2px stroke, full opacity. Competitor lines: 1.5px, 0.6 opacity.

#### C. Rankings Table:

Columns: #, Brand, Visibility (with progress bar), SOV, Sentiment (color dot + number), Position

- Your brand row: `bg-primary/[0.03]`, name in teal, position in teal, initial avatar in teal bg
- Other brands: gray avatar, neutral colors
- Visibility column: thin progress bar (w-14 h-1) + percentage + optional change indicator

#### D. AI Search Impact (3 circles):

Three centered metric circles with ring borders:

1. **Competitive Rank** — `#N` in teal, `bg-primary/10 ring-1 ring-primary/20`
2. **AI Visibility** — `N%` in blue, `bg-blue-500/10 ring-1 ring-blue-500/20`
3. **Total Citations** — number in amber, `bg-amber-500/10 ring-1 ring-amber-500/20`

Below: "Key Insight" box (`bg-white/[0.02]`) with dynamic text based on visibility tier:

- 30%: "strong visibility, focus on maintaining..."
- 10-30%: "appears in N%, competitors average M%, focus on closing gap..."
- <10%: "low visibility, priority: create comparison content..."

#### E. Actions Section (2 columns):

Left: **Earned · Off-page** (blue ExternalLink icon) Right: **Owned · On-page** (teal FileText icon)

Each action card: left colored border (red=high, amber=medium, blue=low priority), icon + title + priority badge + description text.

Generate actions dynamically based on data:

- If top competitor has higher visibility → "Close visibility gap with {competitor}"
- If UGC sources exist → "Increase presence on UGC platforms"
- If visibility < 30% → "Boost AI search visibility"
- If brand domain retrieval rate < 20% → "Optimize your domain for LLM retrieval"
- Always: "Create an AI-optimized content hub"
- If multiple corporate sources → "Get listed on top-cited corporate domains"

#### F. Sources Summary (2/3 + 1/3 grid):

Left (2/3): Top Domains table (compact, 8 rows max) — same as Sources tab table Right (1/3): Domain Types breakdown — color dot + type name + thin bar + percentage

#### G. Recent Chats:

Grid of cards (up to 3 columns). Each card shows:

- MessageSquare icon + prompt text (truncated)
- Model icon group (colored pills: GPT, CL, GM, PX, AIO)
- Footer: citation count (Link2 icon), sentiment dot + score, position, date

---

### TAB 2: PROMPTS

#### Header:

- Title: "Prompts" + subtitle
- "+ Add Prompt" button (top right)

#### Prompts Table:

Columns: Prompt (clickable, max-width 400px truncated), Visibility%, Sentiment (dot + number), Position (#X.X), Models (colored icon pills), Actions (play + archive icons)

Features:

- **Topic filter buttons** at top: All, Affiliate, Core, Category, Free tool, Competitor (generated from unique topics)
- **Add Prompt**: inline form with text input + topic dropdown + Add button
- **Click prompt text** → opens **Prompt Detail Modal**

#### Prompt Detail Modal:

- Fixed overlay with backdrop blur (`bg-black/60`)
- Card with max-w-3xl, max-h-[70vh] overflow scroll
- Header: "PROMPT DETAIL" label + full prompt text + X close button
- Body: "PER-MODEL BREAKDOWN" section
- 5 model cards (one per LLM), ordered: openai, claude, gemini, perplexity, google_aio
- Each card shows: ModelIcon + model name + Mentioned/Not mentioned badge + Position + Sentiment dot + Citation count
- Cards with mentions get green border tint (`border-success/20 bg-success/[0.03]`)
- Click to expand → shows response preview (300 chars)

---

### TAB 3: SOURCES

#### Header:

- Title + subtitle on left
- **Domains | URLs toggle** on right (pill-style toggle, `bg-white/[0.04]` container, active item gets `bg-white/[0.08]`)

#### A. Source Retrieval Chart:

- Recharts `AreaChart` showing top 5 domains over time
- Area fill at 0.06 opacity, 1.5px stroke
- Same axis/tooltip styling as visibility chart

#### B. Sources Table + Domain Types (2/3 + 1/3 grid):

Left: Full domain/URL table (columns: #, Domain/URL, Type badge, Retrieved bar + %, Citation Rate) Right: Domain Types breakdown card

When "URLs" toggle is active:

- Table header changes to "URL" column
- Data shows full URLs instead of domains
- API call passes `view=urls` parameter

> Because real citations come mainly from Perplexity and Google AI Overview (see parser note), this tab may show little data when filtered to ChatGPT, Claude, or Gemini. Show a clear empty state ("No sources retrieved for this model") rather than a broken/blank chart.

---

## 🌐 API ROUTES

All routes accept query params for filtering. Return JSON.

### `GET /api/brand`

Returns `{ brand }` or `{ brand: null }`

### `GET/POST /api/setup-db`

- `GET`: checks whether all 5 tables exist by querying `information_schema.tables` over `DATABASE_URL`. Returns `{ allTablesExist, results[] }`.
- `POST`: runs `sql/schema.sql` against `DATABASE_URL` (idempotent) and returns the resulting table status. This replaces any manual paste-into-dashboard step.

### `GET /api/overview?days=90&model=claude`

Returns: `{ brand, competitors, metrics, rankings, trend, sources, domainTypes, recentChats }`

- `days` defaults to 7
- `model` is optional (omit for all models)
- `trend` uses `Math.max(days, 28)` to always show enough chart data

### `GET /api/sources?days=90&model=claude&view=urls`

Returns: `{ sources, domainTypes, trend, view }`

- `view` is "domains" (default) or "urls"

### `GET /api/prompts/metrics?days=90&model=claude`

Returns: `{ prompts: PromptWithMetrics[] }`

### `POST /api/prompts/run`

Body: `{ promptId?: string }` — runs single prompt or all prompts. Returns: `{ results: [{ prompt, results: [{model, success, run}] }] }`

### `POST /api/cron/run`

Runs ALL active prompts across all models (scheduled execution). Requires `Authorization: Bearer ${CRON_SECRET}`; returns 401 otherwise. Resilient to per-model/per-prompt failures. Intended to be hit once per day by a scheduler.

### `GET /api/prompts/[id]`

Returns: `{ prompt, runs[], citations[], modelBreakdown[] }`

### `POST /api/prompts`

Body: `{ text, topic }` — creates new prompt

### `DELETE /api/prompts`

Body: `{ id }` — archives prompt (sets is_active=false)

### `POST /api/onboarding/crawl`

Body: `{ url }` — crawls website, returns CrawlResult

### `POST /api/onboarding/generate-prompts`

Body: `{ crawlData, domain }` — returns `{ prompts: string[] }`

### `POST /api/onboarding/generate-competitors`

Body: `{ crawlData, domain }` — returns `{ competitors: {name,domain}[] }`

### `POST /api/onboarding/complete`

Body: `{ brandName, domain, category, description, prompts[], competitors[] }` — creates all DB records

---

## 🏠 PAGE ROUTING

### `/` (page.tsx)

1. GET `/api/setup-db` → if tables missing, redirect to `/setup`
2. GET `/api/brand` → if no brand, show OnboardingFlow
3. Otherwise, show Dashboard

### `/setup`

- Database setup page with table status indicators (from `GET /api/setup-db`)
- A **"Run migration"** button that calls `POST /api/setup-db` to apply `sql/schema.sql` directly to Neon
- A "Re-check tables" button that re-verifies
- No copy/paste step and no external dashboard link required

---

## 🚫 IMPORTANT RULES

- All keys server-side only (never in client components)
- No mock/fake data in the built app — only real API calls and real DB queries
- Every API route must accept `days` and `model` query params where applicable
- Build ALL components from scratch — no shadcn/ui CLI, no copy-paste from component libraries
- The `model` filter in metrics/queries must add a `model = $n` clause when a model param is provided
- All SQL is parameterized; never string-interpolate user input
- Read gateway responses from the top-level `content` field, NOT `choices[0].message.content`. Read Perplexity (direct) from `choices[0].message.content` plus its `citations` array.
- For onboarding crawl analysis and prompt/competitor generation, use `MODEL_GENERATION` (cheap) with **tool calling** for structured output (this gateway has no JSON-mode param)
- Treat any single-model failure (429/quota/timeout/unavailable, gateway or Perplexity or DataForSEO) as a soft failure — skip that model, keep the batch running
- Chart tooltips MUST show brand names with their color dots, sorted by value descending
- The visibility trend chart groups data by WEEK (Sunday start), not by day
- Position score is 1-5 scale where 1 is BEST (appears first in response)
- Sentiment maps to: positive=80, neutral=55, negative=30

---

## 📦 FINAL OUTPUT

Provide an `npm run db:migrate` script (runs `sql/schema.sql` against `DATABASE_URL`) so the schema can be applied from the CLI as well as from `/setup`.

The app must be runnable with:

```shell
npm install
npm run db:migrate     # applies schema to Neon
npm run dev
```

Open `http://localhost:3000`. If tables don't exist, it redirects to `/setup`, where one button applies the schema to Neon. After tables exist, it shows the onboarding flow. After onboarding, it shows the full dashboard.

Build this as a **complete, production-ready MVP** with every feature described above fully implemented and working.
