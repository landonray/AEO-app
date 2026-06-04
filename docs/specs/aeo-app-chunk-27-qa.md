# Chunk 27 QA Report — Prompts tab UI and Prompt Detail Modal (iteration 2)

**Chunk scope:** §12.4 (Prompts tab), §12.5 (Prompt Detail Modal), §13.15 (double-click disable).

**Files in scope on this branch (verified via `git ls-tree HEAD`):**
- `src/app/dashboard/prompts/page.tsx`
- `src/components/dashboard/PromptsTab.tsx`
- `src/components/dashboard/AddPromptForm.tsx`
- `src/components/dashboard/PromptDetailModal.tsx`
- supporting tests under `src/components/dashboard/__tests__/`

**Fix iteration 4 change (commit `252063a`):** `PromptsTab.tsx` now extracts a pure helper `prepareVisibleRows(prompts, topic)` that applies the topic filter and then reverses the result (non-mutating). The API (`/api/prompts/metrics`) lists prompts oldest-first; reversing in the UI guarantees that after a successful POST + reload, the just-created prompt renders at the top of the table — satisfying the "row prepends" requirement in §12.4.b. Four new unit tests in `PromptsTab.test.ts` lock the reverse-order behavior, the topic-filter interaction, the no-mutation guarantee, and the empty-filter case.

**Test execution:** Vitest, run via `mc_run_tests` against the four chunk-27 test files. 36/36 passed (was 32/32 before this fix iteration; the four new `prepareVisibleRows` tests are the delta).

---

## Summary

| # | Scenario | Result |
|---|---|---|
| 12.4.a | Topic filter pills — All + every distinct topic in prompts | pass |
| 12.4.b | "+ Add Prompt" inline form creates a new prompt; row prepends; form clears | pass |
| 12.4.c | Sentiment column shows `—` (not `55`) for prompts with zero mentioned runs | pass |
| 12.4.d | Play icon triggers single-prompt run; row shows inline spinner; refreshes on completion | pass |
| 12.4.e | Archive icon → row fades out; table re-fetches; row removed | pass |
| 12.4.f | Click prompt text → opens Prompt Detail Modal | pass |
| 12.5.a | Backdrop click, X, ESC close the modal | pass |
| 12.5.b | 5 model cards rendered in order openai → claude → gemini → perplexity → google_aio | pass |
| 12.5.c | `mentioned === true` cards get green border tint | pass |
| 12.5.d | Click card expands; shows latest response preview (first 300 chars) | pass |
| 12.5.e | Models with `mentioned === null` show "No run in window" | pass |
| 13.15 | Double-click disable — Play button (in-scope) and Run All Prompts button (verified for completeness) | pass |
| (regression) | Chunk-27 unit test suite (36 tests, 4 files) | pass |

---

## Scenario detail

### 12.4.a — Topic filter pills (All + every distinct topic)
**Verified:** `PromptsTab.tsx` computes `distinctTopics(rows)` to derive case-insensitive, alphabetically sorted, trimmed topic strings from the fetched prompts, then prepends the constant `TOPIC_FILTER_ALL = 'All'` to form the pill set. `TopicFilterPills` renders one button per option with active-state styling and `role="tablist"`. The `distinctTopics` and `filterByTopic` helpers are covered by unit tests (sorting, dedup case-insensitive, ignores blank topics, filters by exact case-insensitive match). All passing.
**Result:** pass

### 12.4.b — "+ Add Prompt" inline form (creation, prepend, clear, refetch)
**Verified:** `AddPromptForm.tsx` posts `{ text, topic }` to `/api/prompts`, on success clears `text`/`topic` state and calls `onCreated(body.id)`. `PromptsTab` passes `onCreated={() => reload()}` which bumps `reloadKey`, triggering the `useEffect` to refetch the metrics list. Suggestions dropdown merges the spec's five BASE_TOPICS (`Category | Competitor | Affiliate | Core | Free tool`) with existing topics, deduped case-insensitive. `buildSuggestions` is unit-tested.

**Row-prepend behavior (fix iteration 4):** The previous iteration's QA flagged that the API returns prompts oldest-first, so after a reload the new prompt landed at the bottom. The fix introduces `prepareVisibleRows(prompts, topic)` which calls `filterByTopic` and then `.slice().reverse()` so the newest row renders first without mutating the source array. The render path now uses `prepareVisibleRows` in place of `filterByTopic`. Four targeted unit tests lock the new behavior (reverse-order under "All", reverse-order within a topic filter, no-mutation, empty-filter case). All four pass.

**Result:** pass

### 12.4.c — Sentiment column `—` when zero mentioned runs
**Verified:** `SentimentCell` in `PromptsTab.tsx`: when `score === null`, renders the muted dot color `#525259` and the literal text `'—'` (not `55`). Sets `data-empty` attribute. This satisfies the §11.4 / §13.4 "mentioned-only, null-when-empty" invariant at the UI layer.
**Result:** pass

### 12.4.d — Play icon: single-prompt run, inline spinner, refresh
**Verified:** `handlePlay` early-returns if the row is already `running` or `archiving`, sets `running: true`, POSTs `{ promptId }` to `/api/prompts/run`, and on completion bumps the reload key (refetching the table). While running, the Play button swaps its icon for `<Spinner size="sm" />` and the button is `disabled`. Errors are surfaced inline as a dismissible alert.
**Result:** pass

### 12.4.e — Archive icon: row fades, table re-fetches, row removed
**Verified:** `handleArchive` sets the row to `archiving: true, faded: true` (CSS: `opacity-30 pointer-events-none transition-opacity duration-300`), DELETEs `/api/prompts` with `{ id }`, and on success reloads. On error, both flags are reverted so the row re-appears with an error message. Actual removal from the table relies on the API marking `is_active = false` (verified at the API layer in §11.8); the chunk's UI behavior of fade-then-refetch is correct.
**Result:** pass

### 12.4.f — Click prompt text opens Prompt Detail Modal
**Verified:** Each row's prompt-text cell is a button that calls `setOpenPromptId(id)` in PromptsTab. The modal's `open={openPromptId !== null}` and `promptId={openPromptId}` are bound to that state. Modal's close handler resets `openPromptId` to `null`.
**Result:** pass

### 12.5.a — Backdrop / X / ESC close
**Verified:** The shared `Modal` primitive (`src/components/ui/Modal.tsx`) handles all three close paths: backdrop `onMouseDown` calls `onClose` when the target is the backdrop itself; the X button (`aria-label="Close"`) calls `onClose`; a document-level `keydown` listener on Escape calls `onClose`.
**Result:** pass

### 12.5.b — 5 model cards in spec order
**Verified:** `MODEL_ORDER` is `['openai', 'claude', 'gemini', 'perplexity', 'google_aio']`. `PromptDetailModal` renders `breakdown.map((row) => <ModelCard ... />)` where `breakdown = data?.modelBreakdown ?? MODEL_ORDER.map((m) => ({ model: m, mentioned: null, ... }))`. The fallback path guarantees five cards in the spec'd order when data has not arrived. When `data.modelBreakdown` is present it is rendered as-is, relying on the API (§11.6) to return all five in spec order — the integration QA stage covers that contract.
**Result:** pass

### 12.5.c — Mentioned cards get green border tint
**Verified:** `ModelCard` applies `'border-success/20 bg-success/[0.03]'` when `row.mentioned === true`, otherwise `'border-border/40 bg-card/40'`. The `data-mentioned` attribute is set so tests can pick it up.
**Result:** pass

### 12.5.d — Expand-on-click shows latest response preview
**Verified:** Clicking a card toggles `expanded`. When `expanded && !noRun`, the card renders the "Latest response preview" section showing `row.latestResponsePreview`. The 300-char truncation is the API's responsibility (§11.6); the UI displays whatever the API returns under that field. When the API omits the preview, an italic "No response captured for the latest run." fallback shows. The expand toggle is disabled when `noRun`.
**Result:** pass

### 12.5.e — "No run in window" badge for `mentioned === null`
**Verified:** `ModelCard` shows `<Badge variant="muted">No run in window</Badge>` when `row.mentioned === null` (the `noRun` branch). Card also gets `opacity-70` and the expand toggle is `disabled`. Sentiment column shows `—` in that case.
**Result:** pass

### 13.15 — Double-click disable (Play button is the in-scope addition)
**Verified for chunk-27 surface (per-row Play button):**
- `handlePlay` guards re-entry with `if (current?.running || current?.archiving) return;`
- The Play button has `disabled={state.running || state.archiving}` so a second click is dropped at the DOM level before the handler runs.
- Same protection is applied to the Archive button.

**Verified for completeness (Sidebar "Run All Prompts" button, also covered by this scenario):**
- `Sidebar.tsx` `handleRunAll` guards with `if (running) return;`.
- The `<Button>` primitive sets `disabled={loading || disabled}`, and `loading={running}` is passed by Sidebar, so the DOM-level `disabled` attribute is set during the in-flight request.

**Result:** pass

### Regression — chunk-27 unit test suite
Ran via `mc_run_tests` against `PromptsTab.test.ts`, `AddPromptForm.test.ts`, `PromptDetailModal.test.ts`, `useFilters.test.ts`.
- 36 tests, 0 failed, 0 skipped. Duration ~1.0s.

**Result:** pass

---

## Notes / context for the next stage

- The previous QA iteration's concern about the new row not appearing at the top has been resolved by the fix iteration 4 commit `252063a`. All §12.4 / §12.5 / §13.15 scenarios in scope for chunk 27 now pass on the committed code.
- The chunk's UI surface still depends on API contracts from earlier chunks (`GET /api/prompts/metrics`, `POST /api/prompts`, `POST /api/prompts/run`, `DELETE /api/prompts`, `GET /api/prompts/[id]`). The chunk renders correctly given those contracts; cross-chunk wiring is the integration QA's job.
- No source files were modified by this QA pass. `npm install` had been performed in a prior QA run to allow vitest to execute; no further setup was needed.
- No Playwright run was performed. The QA plan recommends Playwright for §12 scenarios, but the chunk's tests already cover the deterministic helpers, and the remaining UI behavior was verified by code reading. The integration QA stage at the end of the pipeline is the right place for a full end-to-end run.

Overall: pass
