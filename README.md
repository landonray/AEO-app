# Ontraport AEO

Ontraport AEO is a single-tenant, locally-deployed AI search visibility tracker. It runs a fixed library of buyer-intent prompts across five "AI answer" surfaces — ChatGPT, Claude, Gemini, Perplexity, and Google AI Overviews — captures the responses, and reports how often your brand shows up, in what position, with what sentiment, alongside which competitors, and citing which sources.

It replaces hand-checking ChatGPT/Claude/etc. once a week with a daily automated run, structured metrics, and a dashboard.

The product is meant to run on your own machine (or a VM you control) against your own Neon Postgres database. There is no hosted version, no login, and no multi-tenant story — see `docs/specs/aeo-app-refined.md` for the full spec.

> **Security: the app has no login.** Anyone who can reach its port can see the dashboard and use every control on it: start prompt runs (which spend your API credits), add or archive prompts, re-run the database setup, and run onboarding, whose crawler fetches any address it is given, including ones on your internal network. Keep it on `localhost` or a private network you trust. If you want to reach it from elsewhere, put an access layer in front of it, such as a VPN (e.g. Tailscale) or a login proxy (e.g. Cloudflare Access) — never expose the port directly to the internet. The daily cron endpoint is the only route with its own protection (`CRON_SECRET`).

---

## Setup

### 1. Install dependencies

```
npm install
```

### 2. Configure `.env`

Copy the template and fill in your credentials:

```
cp .env.example .env
```

Then edit `.env` and set:

- `DATABASE_URL` — your Neon Postgres connection string (`sslmode=require`).
- `LLM_GATEWAY_BASE_URL` / `LLM_GATEWAY_API_KEY` — the address of, and your key for, the LLM Gateway used for OpenAI, Claude, and Gemini calls. Read [About the LLM Gateway](#about-the-llm-gateway) first: it is not a public service.
- `PERPLEXITY_API_KEY` — a Perplexity API key (called directly, not via the gateway).
- `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` — your DataForSEO credentials (used to scrape Google AI Overviews).
- `CRON_SECRET` — any long random string. Used as the bearer for the daily cron endpoint so nothing else on `localhost` can trigger a run.

The default model ids in `.env.example` are fine to leave as-is unless you have a reason to change them. They are short ids that the app stores against each run; changing them mid-flight does not break historical filtering.

### 3. Apply the database schema

```
npm run db:migrate
```

This reads `src/sql/schema.sql` and runs it against `DATABASE_URL`. It is idempotent (everything is `CREATE TABLE IF NOT EXISTS`), so re-running it is safe.

### 4. Start the app

```
npm run dev
```

The app listens on `http://localhost:4810`. To stop it, press `Ctrl+C` in the terminal where it is running.

### 5. First-run flow

- If the schema has not been applied yet, `/` redirects you to `/setup`, where a "Run migration" button applies it from the browser.
- If the schema is ready but no brand exists, `/` shows the 3-step onboarding wizard: enter your product URL, let it crawl and generate prompts + competitors, review, then click "Launch Tracking".
- After onboarding, `/` shows the dashboard. Click "Run All Prompts" in the sidebar to fire a manual batch and confirm everything is wired up end-to-end.

---

## About the LLM Gateway

OpenAI, Claude, and Gemini are not called directly. Every call goes through an LLM Gateway: a separate service that holds the provider keys, picks the provider from the model name, and tracks cost. Its API is documented in `docs/llm-gateway-api.md`.

The gateway this app was built against is private, so you cannot get a key for it. To run your own copy, either:

- **Run a compatible gateway** that implements the contract in `docs/llm-gateway-api.md` (note that its chat response is *not* the standard OpenAI shape: the answer text is a top-level `content` field), and point `LLM_GATEWAY_BASE_URL` at it; or
- **Call the providers directly** by replacing the HTTP request in `performGatewayCall` (`src/lib/llm/gateway.ts`) with calls to the OpenAI, Anthropic, and Google APIs, returning the same result shape. Every model call — the daily runs (`src/lib/llm/orchestrator.ts`) and the onboarding generators (`src/lib/generators.ts`, which also need JSON-schema output) — goes through that one function.

Perplexity (called directly with your own key) and Google AI Overviews (via DataForSEO) do not use the gateway.

---

## Daily scheduled runs (cron)

The dashboard becomes useful once Ontraport AEO is running every day on its own. The app exposes `POST /api/cron/run` (bearer-authed with `CRON_SECRET`) and ships a small helper at `scripts/cron.mjs` that POSTs to it. The OS scheduler just needs to fire `npm run cron` once a day.

### macOS / Linux (`crontab -e`)

```
0 9 * * * cd /path/to/AEO-app && /usr/local/bin/node ./scripts/cron.mjs >> ./cron.log 2>&1
```

(Or `npm run cron` instead of the explicit `node` invocation, if your cron environment has `PATH` set.)

### Windows (Task Scheduler)

Create a daily 9:00 AM task that runs:

```
cmd /c "cd /d C:\path\to\AEO-app && npm run cron >> cron.log 2>&1"
```

### Important caveat — the machine must be on and the app must be running

`scripts/cron.mjs` POSTs to `http://localhost:4810/api/cron/run`, so for the daily run to fire successfully you need **both**:

1. The host machine must be on and not asleep at the scheduled time.
2. The Next.js server must be running (`npm run dev` or `npm run start`) so it can accept the request.

If either is not true, that day's run is silently missed and shows up as a gap in the trend chart. There is no backfill — Ontraport AEO only knows about runs it actually executed. If you laptop-suspend a lot, schedule the run for a time when the laptop is reliably awake, or move Ontraport AEO to a machine that stays up.

---

## Known issues and gotchas

### Generic brand names produce false-positive mentions

Brand-mention detection is a case-insensitive word-boundary match against the brand `name` or `domain`. For very generic brand names (e.g. "Apple", "Notion", "Stripe") this will match in any response where the model talks about the unrelated meaning — fruit, note-taking, payments — and Ontraport AEO will count it as a mention. Visibility, share of voice, and the Rankings table will all read higher than reality.

There is no MVP fix for this. If your brand name is generic, treat the visibility number as an upper bound and skim the Recent Chats / Prompt Detail responses to sanity-check. A future iteration could add brand-disambiguation context to the parser.

### Gemini preview model id may be rejected — fall back to `gemini-2.5-pro`

`.env.example` ships `MODEL_GEMINI=gemini-3.1-pro-preview`. Preview model ids are deprecated and replaced over time. If the gateway starts returning "model unavailable" errors for Gemini, the orchestrator treats them as a per-call failure (logged, skipped, batch continues) — but you will see Gemini gaps in the dashboard until you fix the env.

When that happens, edit `.env` and change:

```
MODEL_GEMINI=gemini-2.5-pro
```

then restart the Next.js server. The orchestrator does not auto-fall-back; it only reads what is in env at boot.

### Re-onboarding requires deleting the brand row in Neon

The MVP only supports one primary brand. `POST /api/onboarding/complete` returns `409` if a brand with `is_primary = true` already exists, and there is no in-app "Reset" or "Start Over" admin action.

To re-onboard from scratch:

1. Open the Neon SQL editor (or any Postgres client pointed at `DATABASE_URL`).
2. Delete the primary brand row:

   ```sql
   DELETE FROM brands WHERE is_primary = true;
   ```

   Because `competitors`, `prompts`, `runs`, and `citations` all reference `brands(id)` with `ON DELETE CASCADE`, this also wipes the associated prompts, competitors, runs, and citations.

3. Reload `/` in the browser. With no primary brand, the app drops back into the onboarding wizard.

This is a known limitation and is the intended path for the MVP. A future iteration will add a Settings page with a "Reset" button.

---

## Tests

- `npm test` runs the unit tests. They mock the database and every external API, so they need no keys and never touch your database.
- `npm run test:e2e` runs the Playwright end-to-end tests, which start their own dev server on port 6810. They read `DATABASE_URL` from your shell environment, not from `.env`. They assume a database that already has a brand onboarded, and the onboarding test deletes the brand with the domain `acme.com` (its test brand) and all of that brand's data, so point them at a separate test database or Neon branch, not your live one.

---

## What to look at next

- The full product spec (architecture, schema, parsing rules, design tokens, edge cases): `docs/specs/aeo-app-refined.md`.
- The LLM Gateway API contract the app targets: `docs/llm-gateway-api.md`.
- Known issues, with what has already been investigated and ruled out: `docs/known-issues/INDEX.md`.
