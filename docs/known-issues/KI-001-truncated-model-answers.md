---
id: KI-001
title: Claude and Gemini answers are cut off mid-sentence
status: fix-in-flight
first_seen: 2026-06-01
last_seen: 2026-10-20
tags: [tracking, llm-gateway, data-quality]
reports: ["found while updating tracked models, 2026-10-20"]
prs: ["#12"]
---
# KI-001 — Claude and Gemini answers are cut off mid-sentence

## What the reader sees
In Prompt Detail / Recent Chats, a large share of Claude and Gemini answers
stop mid-word ("usually 60–70% of tra", "(like P"). Because the brand-mention
detector only sees the text that came back, any brand the model would have
named later in the answer is missed. Visibility, position and share of voice
for Claude and Gemini read lower than what a real user of those chatbots sees.

## How to recognize it (fingerprint)
- The stored answer ends mid-word or mid-sentence, with no closing punctuation.
- Concentrated on Claude and Gemini; long "compare / recommend" prompts are
  hit hardest, short factual prompts usually finish.
- Lookalike that is NOT this issue: ChatGPT answers that end on a bulleted
  list item or table row without a full stop. In a sample of 5 ChatGPT
  answers flagged by the "no closing punctuation" check, all 5 ended cleanly
  at the end of a list item, not mid-word (only the last 70 characters were
  inspected, so whether the list itself was complete was not checked).
- Possibly related, NOT confirmed: completely empty answers (about 6% of
  Claude and 9% of ChatGPT runs since August 2026; Gemini has none). Not
  investigated — do not assume they share this cause without checking.

## Root cause — grade: measured
The tracked models "think" before they answer, and that thinking counts
against the per-answer output-token cap the app sends with each request. The
cap was 2,000 tokens. On a long comparison prompt (measured live through the
LLM gateway on 2026-10-20):

| model | thinking tokens | total tokens | result at 2,000 cap |
|---|---|---|---|
| claude-opus-5-5 | 1,238 | 2,000 | cut off (finish reason "length") |
| gemini-3.1-pro-preview | 1,543 | 1,996 | cut off (finish reason "length") |
| gpt-6.1-sol | 448 | 1,226 | complete |

With the cap raised to 8,000, the same prompt finished on all three
(Claude used about 4,000 tokens in total, so 8,000 leaves roughly 2× headroom).

Why Claude got worse over time — grade: inferred. The app's Claude setting was
`claude-opus-4-8`, but on 2026-10-20 the gateway was silently serving that
request with `claude-opus-5` (the response's model field said so). Claude's
cut-off rate went from 0% in June to 27% in July to ~63% from August on, which
fits a switch to a thinking model in July. When the redirect started has not
been checked.

## Status and what's shipped
- **Fix (PR #12, not yet merged):** the daily tracking calls now ask for up to 8,000
  output tokens instead of 2,000, and tracked models were updated to
  `gpt-6.1-sol` and `claude-opus-5-5` (Gemini stays `gemini-3.1-pro-preview`).
- **Related guard in the same PR:** full-length answers are slower. A long
  prompt took 63–67 seconds on `gpt-6.1-sol` and 47–63 seconds on
  `claude-opus-5-5`, past the gateway's 60-second per-call limit, which would
  have thrown those answers away as failures. Tracking calls now get a
  3-minute limit; onboarding calls keep 60 seconds.
- **Standing damage, not repaired:** every Claude and Gemini run stored
  before the fix ships. Historical answers cannot be re-fetched; trends that
  cross the fix date will show a step up in Claude and Gemini visibility that
  is a measurement change, not a real change.

## Examples
Share of stored answers with no closing punctuation, by month (grade: proxy —
a "does the answer end in punctuation" check; spot-checked on 2026-10-20: 10
of 10 flagged Claude/Gemini answers were genuinely cut off mid-word):

| month | Claude | Gemini | ChatGPT (mostly false positives, see above) |
|---|---|---|---|
| 2026-06 | 0% of 203 | 76% of 208 | 15% of 204 |
| 2026-07 | 27% of 288 | 74% of 287 | 12% of 286 |
| 2026-08 | 63% of 2,755 | 65% of 2,747 | 6% of 2,798 |
| 2026-09 | 64% of 2,603 | 64% of 2,600 | 6% of 2,612 |
| 2026-10 (to 20th) | 63% of 1,909 | 66% of 1,815 | 6% of 1,917 |

Spend before the fix, last 14 days (measured from stored per-run cost):
Claude $4.53/day (avg $0.048/call — about the price of a full 2,000-token
answer, i.e. hitting the cap), ChatGPT $2.95/day, Gemini $1.12/day.

After the fix, 5 real tracked prompts × 3 models (measured, 2026-10-20): 15 of
15 finished complete. Average cost per call: Claude $0.030, Gemini $0.026,
ChatGPT $0.005. Projected spend at current volume (~95 runs/day per model):
about $5.70/day total versus $8.60/day before (grade: inferred from a
5-prompt sample — cheaper GPT-6.1 Sol and Opus 5.5 pricing outweigh the longer
answers).

## Refuted fixes / what NOT to do
- Do not lower the tracking output cap back toward 2,000 to save money: it is
  the cause of this issue, and the test suite now fails if the cap drops below
  8,000.
- Do not raise the gateway's shared 60-second limit for everything: onboarding
  screens have a person waiting on them. Only the daily tracking calls get the
  longer limit.

## Where it was investigated
- Mission Control session that updated the tracked models (2026-10-20).
- Live gateway calls and read-only queries against the `runs` table, same day.

## Sightings log
| date | where | count | note |
|---|---|---|---|
| 2026-10-20 | runs table, last 14 days | 837 / 1,331 Claude; 820 / 1,246 Gemini | proxy check, spot-checked 10/10 |
