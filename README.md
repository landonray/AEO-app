# Ontraport AEO

Ontraport AEO is a single-tenant, locally-deployed AI search visibility tracker. It runs a fixed library of buyer-intent prompts across five "AI answer" surfaces — ChatGPT, Claude, Gemini, Perplexity, and Google AI Overviews — captures the responses, and reports how often your brand shows up, in what position, with what sentiment, alongside which competitors, and citing which sources.

It replaces hand-checking ChatGPT/Claude/etc. once a week with a daily automated run, structured metrics, and a dashboard.

The product is meant to run on your own machine (or a VM you control) against your own Neon Postgres database. There is no hosted version, no login, and no multi-tenant story — see `docs/specs/aeo-app-refined.md` for the full spec.

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
- `LLM_GATEWAY_API_KEY` — the bearer token for the LLM Gateway (used for OpenAI, Claude, and Gemini calls).
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

## Daily scheduled runs (cron)

The dashboard becomes useful once Ontraport AEO is running every day on its own. The app exposes `POST /api/cron/run` (bearer-authed with `CRON_SECRET`) and ships a small helper at `scripts/cron.mjs` that POSTs to it. The OS scheduler just needs to fire `npm run cron` once a day.

### macOS / Linux (`crontab -e`)

```
0 9 * * * cd /path/to/luminaire && /usr/local/bin/node ./scripts/cron.mjs >> ./cron.log 2>&1
```

(Or `npm run cron` instead of the explicit `node` invocation, if your cron environment has `PATH` set.)

### Windows (Task Scheduler)

Create a daily 9:00 AM task that runs:

```
cmd /c "cd /d C:\path\to\luminaire && npm run cron >> cron.log 2>&1"
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

## What to look at next

- The full product spec (architecture, schema, parsing rules, design tokens, edge cases): `docs/specs/aeo-app-refined.md`.
- The QA plan (acceptance scenarios for every chunk): `docs/specs/aeo-app-qa-plan.md`.
- The LLM Gateway API contract Ontraport AEO targets: `docs/llm-gateway-api.md`.
