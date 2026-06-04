# Chunk 31 QA — README and cron documentation

## Scope

This chunk ships the final `README.md` covering: setup commands, cron snippets for
macOS/Linux and Windows, the `MODEL_GEMINI` preview-id fallback, the generic-brand
false-positive caveat, the "machine must be running" cron caveat, and the
re-onboarding procedure (delete the primary brand row in Neon).

The file in scope is `README.md` (replacing the Chunk 1 placeholder). Verification
is documentation-only: read the README, then cross-check every claim it makes
against the refined spec (`docs/specs/aeo-app-refined.md`) and against the
actually-committed supporting files on the branch (`.env.example`, `package.json`,
`scripts/cron.mjs`, `src/sql/schema.sql`).

No code is exercised in this chunk, so there are no unit/integration tests to run.

## Summary

| # | Scenario | Result |
|---|---|---|
| 1 | Setup steps (npm install → .env → db:migrate → dev) and the `4810` port match the actual package scripts and `.env.example` | pass |
| 2 | `/setup` + onboarding wizard first-run flow described correctly | pass |
| 3 | macOS/Linux cron snippet matches refined spec §12 verbatim | pass |
| 4 | Windows Task Scheduler snippet matches refined spec §12 verbatim | pass |
| 5 | "Machine on + server running" cron caveat documented (§12 / §17 / 13.13) | pass |
| 6 | `MODEL_GEMINI` preview-id fallback to `gemini-2.5-pro` documented (A9 / §17 / 13.16) | pass |
| 7 | Generic-brand false-positive documented (§17 / 3.1.j / 13.7) | pass |
| 8 | Re-onboarding procedure documented — delete primary brand row in Neon (Q14 / A2) | pass |
| 9 | README does not leak any secret values and does not contradict server-side-only secret rule | pass |
| 10 | Referenced supporting files (`.env.example`, `scripts/cron.mjs`, `src/sql/schema.sql`, `docs/specs/*`) all exist on the branch | pass |

## Scenario detail

### 1. Setup steps match repo reality

**What I verified.** The README's setup walkthrough lists, in order:

1. `npm install`
2. `cp .env.example .env`, then fill in `DATABASE_URL`, `LLM_GATEWAY_API_KEY`,
   `PERPLEXITY_API_KEY`, `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`, and `CRON_SECRET`.
3. `npm run db:migrate`
4. `npm run dev`
5. App listens on `http://localhost:4810`; `Ctrl+C` to stop.

I cross-checked each claim against the actually-committed branch state:

- `package.json` on `HEAD` defines `"dev": "next dev -p 4810"`,
  `"start": "next start -p 4810"`, `"db:migrate": "tsx scripts/migrate.ts"`,
  and `"cron": "node scripts/cron.mjs"`. The README's `npm run db:migrate`,
  `npm run dev`, and the `4810` port number all match.
- `.env.example` is present on `HEAD` and contains exactly the env keys the
  README tells the user to fill in (`DATABASE_URL`, `LLM_GATEWAY_API_KEY`,
  `PERPLEXITY_API_KEY`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`,
  `CRON_SECRET`). The README's description of each variable matches its role.
- The README correctly says the schema is idempotent because everything uses
  `CREATE TABLE IF NOT EXISTS`. Refined spec §4 / QA-plan §2.1 confirm this is
  the schema contract.
- The README notes that the default model ids in `.env.example` are fine to
  leave alone — consistent with A7 (short ids stored in `runs.model`, env-level
  model id only used at request time).

This matches the §16 DoD line "`npm install && db:migrate && dev` brings up app
on 4810".

**Result.** Pass.

### 2. First-run flow (setup + onboarding) described correctly

**What I verified.** The README's "5. First-run flow" section says:

- An empty schema → `/` redirects to `/setup`, where a "Run migration" button
  applies the schema.
- A ready schema with no brand → `/` shows the 3-step onboarding wizard.
- After onboarding → `/` shows the dashboard, with "Run All Prompts" in the
  sidebar.

Cross-checked against refined spec §17 ("Schema not applied: `/` calls
`GET /api/setup-db`; if `allTablesExist === false`, redirect to `/setup`") and
§17 ("No primary brand yet: `/` shows the onboarding wizard"). The README's
description matches both rules. The "Run migration" button and `/setup` page
match Chunk 30's surface, which was already approved.

**Result.** Pass.

### 3. macOS/Linux cron snippet matches §12

**What I verified.** README line:

```
0 9 * * * cd /path/to/luminaire && /usr/local/bin/node ./scripts/cron.mjs >> ./cron.log 2>&1
```

Refined spec §12, line 622:

```
0 9 * * * cd /path/to/luminaire && /usr/local/bin/node ./scripts/cron.mjs >> ./cron.log 2>&1
```

Byte-identical. The README also adds the parenthetical that `npm run cron`
works as a substitute if `PATH` is set in the cron environment, which mirrors
spec §12 line 625 ("or `npm run cron` if PATH is set").

`scripts/cron.mjs` exists on `HEAD`, so the path the snippet references is real.

**Result.** Pass.

### 4. Windows Task Scheduler snippet matches §12

**What I verified.** README line:

```
cmd /c "cd /d C:\path\to\luminaire && npm run cron >> cron.log 2>&1"
```

Refined spec §12, line 627:

```
cmd /c "cd /d C:\path\to\luminaire && npm run cron >> cron.log 2>&1"
```

Byte-identical, including the `cd /d` form needed by Windows `cmd`. The README
correctly frames it as a daily 9:00 AM task — consistent with the macOS/Linux
example using the same time.

**Result.** Pass.

### 5. "Machine must be on and server must be running" caveat documented

**What I verified.** Refined spec §12 "Known limitation" (line 629–631) says
the host machine must be on and the Next.js server must be running for cron to
fire; missed days produce trend-chart gaps; there is no backfill, and the
README must call this out so the user isn't surprised. QA-plan §17 line 13.13
and the chunk task description both call this out as the "restart-required
cron" caveat.

README "Important caveat — the machine must be on and the app must be running"
section (lines 81–88) covers:

- `scripts/cron.mjs` POSTs to `http://localhost:4810/api/cron/run`, so both
  the machine and the Next.js server must be up. Matches spec.
- Missed days are silent and show up as gaps in the trend chart. Matches spec.
- There is no backfill. Matches spec.
- Practical advice for laptop suspend (schedule for a time when the laptop is
  awake, or move to an always-on host). This is value-add beyond the spec, not
  contradictory.

**Result.** Pass.

### 6. Gemini preview-id fallback to `gemini-2.5-pro` documented (A9)

**What I verified.** Spec A9 (line 1062): when `MODEL_GEMINI=gemini-3.1-pro-preview`
is rejected by the gateway, the user updates `.env` to `MODEL_GEMINI=gemini-2.5-pro`
manually; the orchestrator does not auto-fall-back. §17 line 1044 reinforces
this: "orchestrator treats it as a model failure for the day, dashboard shows
a gap for Gemini. README documents falling back to `gemini-2.5-pro`." QA-plan
13.16 is the same case.

README "Gemini preview model id may be rejected — fall back to `gemini-2.5-pro`"
section (lines 100–110) covers:

- `.env.example` ships `MODEL_GEMINI=gemini-3.1-pro-preview` — confirmed by
  reading `.env.example` on `HEAD`. Matches.
- Failure mode: orchestrator treats it as a per-call failure, batch continues,
  Gemini gaps appear in the dashboard. Matches spec.
- Fix: edit `.env`, set `MODEL_GEMINI=gemini-2.5-pro`, restart the Next.js
  server. The "restart the server" note is correct because per
  CLAUDE.md/project notes the tsx runtime does not auto-reload server env
  changes.
- "Orchestrator does not auto-fall-back; it only reads what is in env at
  boot." Matches A9 verbatim in intent.

**Result.** Pass.

### 7. Generic-brand false-positive documented (3.1.j / §17)

**What I verified.** Spec §17 line 1033: "Brand mention false positive on
generic name: known weakness for very generic brand names (e.g. 'Apple').
Acceptable for MVP; users with generic names will see inflated visibility.
Documented in README." QA-plan 3.1.j and 13.7 are the same case.

README "Generic brand names produce false-positive mentions" section
(lines 94–98) covers:

- The mechanism: case-insensitive word-boundary match against `name` or
  `domain`. Matches §11.1 / A14.
- Concrete examples beyond Apple: Notion, Stripe. Useful concretion, not a
  contradiction.
- Consequence: Visibility, Share of Voice, and the Rankings table read higher
  than reality. Correctly named — these are exactly the metrics that depend
  on `mentioned = true` per §13.1 / §13.2 and the Rankings table per §15.A.
- Mitigation: treat visibility as upper bound; skim Recent Chats / Prompt
  Detail to sanity-check. Reasonable user guidance, consistent with the
  Recent Chats and Prompt Detail surfaces in §14.
- Notes that a future iteration could add brand-disambiguation context.
  Doesn't promise it, just acknowledges.

**Result.** Pass.

### 8. Re-onboarding procedure documented (Q14 / A2)

**What I verified.** Spec A2 (line 1055): re-onboarding requires manually
deleting the brand row in Neon for the MVP. Q14 (line 1115): same — documented
in README as a known limitation. The `409` rejection from
`POST /api/onboarding/complete` when a primary brand already exists is the
trigger for needing this.

README "Re-onboarding requires deleting the brand row in Neon" section
(lines 112–129) covers:

- The constraint: only one primary brand; `POST /api/onboarding/complete`
  returns 409 if one already exists. Matches A2 and §14 onboarding routes.
- The procedure: open Neon SQL editor or any Postgres client pointed at
  `DATABASE_URL`, then run
  `DELETE FROM brands WHERE is_primary = true;`.
- Cascade explanation: `competitors`, `prompts`, `runs`, and `citations` all
  reference `brands(id)` with `ON DELETE CASCADE`, so the delete wipes
  associated rows too. This matches refined spec §4 schema (verified
  separately in chunk 02 QA — ON DELETE CASCADE is on every child table).
- Re-load `/` and the app drops back into the onboarding wizard. Matches §17
  "No primary brand yet" rule.
- Frames it as a known MVP limitation; future iteration will add a Settings
  "Reset" button. Matches A2 ("Future iteration: a 'Reset / Start Over' admin
  action.").

**Result.** Pass.

### 9. No secrets leaked; no contradiction with server-side-only secret rule

**What I verified.** I read the full README. The only credential-shaped values
mentioned are placeholders inside fenced env examples — there are no real
tokens, no `pplx-` real keys, no real DataForSEO password, no real
`CRON_SECRET`. The README correctly instructs the user to "set" these
variables locally; it does not suggest committing them or surfacing them on
the client.

QA-plan §14.1 (secrets stay server-side) is the relevant rule. The README
does not name any client-side context where these secrets would be read, and
does not contradict the rule.

`.gitignore` was not in the file-scope for this chunk; QA-plan 14.1.d covers
that separately and is not in scope here. The README does not claim `.env` is
or isn't gitignored; it only refers to it as a local file.

**Result.** Pass.

### 10. All referenced supporting files exist on the branch

**What I verified.** Via `git ls-tree HEAD -- <path>` on each path the README
references:

- `.env.example` — present.
- `scripts/cron.mjs` — present (referenced by both the macOS/Linux snippet and
  by `package.json`'s `"cron"` script).
- `src/sql/schema.sql` — present (referenced by README's `npm run db:migrate`
  description).
- `docs/specs/aeo-app-refined.md` — present (linked from README as the full
  spec).
- `docs/specs/aeo-app-qa-plan.md` — present (linked from README as the QA
  plan).
- `docs/llm-gateway-api.md` — present (linked from README as the gateway API
  contract).
- `package.json` `dev`, `start`, `db:migrate`, `cron` scripts — all present
  and match the names the README uses.

No broken links. No references to files that have not shipped.

**Result.** Pass.

## Out of scope (covered by other chunks / stages)

- Actual cron HTTP behavior, bearer auth, route handler logic — QA-plan §10
  scenarios 10.1–10.7, covered by Chunk 18's QA report and the integration
  QA stage at the end of the pipeline.
- Generic-brand parser behavior — QA-plan §3.1.j, covered by Chunk 7's QA
  (parser unit tests).
- Gemini failure-skip behavior in the orchestrator — QA-plan §13.16 / 7.3,
  covered by Chunk 12 (orchestrator) QA.
- Re-onboarding `409` rejection in `POST /api/onboarding/complete` — QA-plan
  §9.6.b, covered by Chunk 14/15 (onboarding) QA.
- `.gitignore` containing `.env*` — QA-plan §14.1.d, not in this chunk's
  file scope.

Those rows are not part of this chunk's verification responsibility. The
integration QA stage will cover any cross-chunk regression.

Overall: pass
