# Chunk 8 QA — Response parser

Scope: QA plan §3.1 (brand mention), §3.2 (position score), §3.3 (sentiment), §3.4 (competitor mentions), §3.5 (citation extraction), and §3.6 (classifier integration only). All five parser functions are implemented in `src/lib/llm/parser.ts` with a Vitest suite at `src/lib/llm/__tests__/parser.test.ts` (65 specs).

Test execution: `mc_run_tests` against the chunk worktree, narrowed to the parser suite.
Result: 65 passed, 0 failed, 0 skipped (vitest exit 0, ~980ms).

## Summary

| Scenario | Result | Notes |
|---|---|---|
| §3.1.a Plain brand name | pass | `detectMentioned("Best CRM is Acme for SMBs", acme)` → true |
| §3.1.b Case-insensitive | pass | Regex built with `i` flag |
| §3.1.c Word boundary respected (Pancakes vs Cake) | pass | `\bCake\b` does not match inside "Pancakes" |
| §3.1.d Multi-word internal whitespace flex | pass | Implementation replaces internal `\s+` with `\\s+` in escaped name |
| §3.1.e Domain apex match | pass | `acme.com` matched via apex regex |
| §3.1.f Domain with `www.` and protocol | pass | `normalizeDomain` strips protocol/`www.` from brand domain; apex still matches the in-text URL |
| §3.1.g Domain on subdomain (`blog.acme.com`) | pass | `\bacme\.com\b` matches at the apex inside the subdomain string |
| §3.1.h Empty response | pass | Guard returns false |
| §3.1.i Brand name with regex metacharacters (`C++ Builder`) | pass | `escapeRegex` escapes `+` etc.; non-matching `Cxx Builder` correctly returns false |
| §3.1.j Documented false positive on generic name (Apple) | pass | Test asserts `true`; documents the known §17 weakness |
| §3.2.a Numbered list, #1 | pass | First-mention line matches `/^\s*(\d+)[.)]\s/` → 1 |
| §3.2.b Numbered list, #3 | pass | 3 returned |
| §3.2.c Numbered list with `)` | pass | `1) Beta\n2) Acme` → 2 |
| §3.2.d Numbered list, #7 → capped at 5 | pass | `Math.min(parsed, 5)` |
| §3.2.e Prose, brand in first 20% | pass | Segment math → 1 |
| §3.2.f Prose, brand in last 20% | pass | Segment math → 5 |
| §3.2.g Prose, brand in middle (~50%) | pass | Segment math → 3 |
| §3.2.h Multiple mentions → first wins | pass | Implementation only consults `firstMentionIndex` |
| §3.2.i Not mentioned → null | pass | Guard returns null |
| §3.2.j First-mention-wins between prose and later numbered list | pass | Test fixture confirms prose segment-math wins; `firstMentionIndex` chooses the earliest match and inspects only that line for the list pattern |
| §3.2.k Returned value is a number | pass | `typeof === 'number'` asserted; spec stores as REAL |
| §3.3.a Single positive in brand sentence | pass | `excellent` → positive |
| §3.3.b Single negative in brand sentence | pass | `poor` → negative |
| §3.3.c Mixed pos+neg same sentence → neutral (tie) | pass | `reliable`+`expensive` → 1-1 tie → neutral |
| §3.3.d Positive in non-brand sentence | pass | Brand sentence filter discards the qualifying word |
| §3.3.e Multiple brand sentences, 1-1 tie → neutral | pass | `robust` vs `slow` |
| §3.3.f Brand mentioned with no qualifying words | pass | Returns neutral (default) per §17 |
| §3.3.g Brand not mentioned | pass | Neutral |
| §3.3.h Case-insensitive word match | pass | "EXCELLENT" → positive |
| §3.3.i Word boundary (`best` vs `bestseller`) | pass | `\bbest\b` does NOT match inside "bestseller" → neutral |
| §3.3.j Sentence split on `.!?` | pass | "powerful!" and "buggy." sentences both detected; 1 pos + 1 neg → neutral; verifies splitter handles `!` and `.` as terminators |
| §3.3 Word lists locked to §11.3 exactly | pass | Two dedicated equality assertions on `POSITIVE_SENTIMENT_WORDS` and `NEGATIVE_SENTIMENT_WORDS` will fail on any deliberate edit |
| §3.4 Competitor mentions — 4 keys, mixed name/domain | pass | Returns one entry per input competitor, keyed by display name |
| §3.4 Keys are display name | pass | `Object.keys(result)` equality assertion |
| §3.4 Empty list / null / empty text | pass | Edge cases covered with explicit specs |
| §3.5.a API `citations[]` extracted | pass | Both URLs returned in order |
| §3.5.b `search_results` fallback URLs accepted via `apiCitations` | pass | Parser receives a pre-mapped URL list; spec mapping lives in the Perplexity client (out of scope for this chunk) |
| §3.5.c URL inline in prose | pass | Regex extraction works |
| §3.5.d Trailing `.` stripped, `)` stops the regex | pass | `(see https://acme.com.)` → `https://acme.com` |
| §3.5.e Dedup across API and prose | pass | Set-based dedup, regex matches preserved first |
| §3.5.f URL with query and fragment | pass | Preserved as full URL |
| §3.5.g Non-HTTP scheme | pass | `ftp://` ignored |
| §3.5.h Malformed URL (`http:/badurl`) | pass | Single-slash regex miss |
| §3.5.i DataForSEO `references[].url` extraction (parser side) | pass | Same code path as §3.5.a — parser accepts a flat URL list regardless of source. DataForSEO-specific mapping is the Google AIO client's responsibility (out of scope for this chunk). |
| §3.5.j DataForSEO featured snippet fallback (parser side) | pass | Same as above — parser is source-agnostic |
| §3.5.k DataForSEO empty result (no citations) | pass | `extractCitations("", undefined)` and `extractCitations("", [])` both return `[]`; verified by the empty-text and null specs |
| §3.6 Classifier integration: parser produces full URL strings consumable by `classify(url, brand, competitors)` | pass | `extractCitations` returns `string[]` of full URLs; matches the input shape `classify` expects in `src/lib/classify.ts`. End-to-end classification scenarios (`3.6.a`–`3.6.o`) are the classifier chunk's responsibility and already passed in Chunk 7 QA. |

## Per-scenario detail

### §3.1 Brand mention detection
The implementation builds a name regex `\b<escaped>\b` with `i` flag and a domain regex `\b<escapedApex>\b` on the brand's normalized domain. `firstMentionIndex` returns whichever match comes earliest. Multi-word names have their internal whitespace replaced by `\s+` after escaping, so `"Acme  CRM"` and `"Acme\tCRM"` both match a brand named `"Acme CRM"`. The known §17 generic-name false positive (Apple) is asserted as `true` with an explicit test note. The implementation also gracefully handles brand records missing one of name/domain (still matches on the other). Verified by the 13 tests in this describe block.

### §3.2 Position score
First-mention index drives both branches. The function isolates the line containing that index using `lastIndexOf("\n")` / `indexOf("\n")` and checks `^\s*(\d+)[.)]\s/`. If the line matches, the parsed number is capped via `Math.min(parsed, 5)`. Otherwise it computes `Math.floor(mentionIndex / (textLength / 5)) + 1`, clamped to 1..5. The §17 "first mention wins" rule is enforced because only `firstMentionIndex` is consulted — a later numbered-list mention is ignored if a prior prose mention exists (§3.2.j fixture confirms this). Returns `null` when not mentioned or when text is empty. Verified by all 13 specs.

### §3.3 Sentiment
Sentences are split on `/[.!?]+\s+/`, then filtered to those matching the brand name regex OR brand domain regex. Positive/negative word counts use word-boundary, case-insensitive regexes assembled from the locked constant arrays. Tie or zero-zero → `neutral`; pos > neg → `positive`; neg > pos → `negative`. The word lists are also asserted to equal §11.3 exactly so any drift triggers a deliberate failure. The `bestseller` test confirms `\bbest\b` does not match substrings. Sentence-terminal punctuation `!` and `.` are both honored by the splitter (§3.3.j). Verified by all 16 specs.

### §3.4 Competitor mentions
Returns an object with one boolean per competitor in the input list, keyed by `competitor.name` (display name). Uses `detectMentioned` per competitor, so it inherits the §3.1 semantics including domain apex match. Empty / null competitor lists return `{}`. Empty text returns every competitor `false`. Key order matches input array order. Verified by 5 specs.

### §3.5 Citation extraction
Regex `https?:\/\/[^\s)\]\}"'<>]+` runs over the prose, then trailing `.,;:!?` is stripped via a separate regex. API URLs are unioned in after the regex extracts (so prose URLs come first, then any new API URLs). Dedup uses a `Set` on the full URL. Non-string and empty API entries are skipped; API entries are trimmed before dedup. `ftp://` and single-slash URLs are not matched. Brackets / quotes / angle brackets stop the regex. DataForSEO source mappings (§3.5.i–k) are the responsibility of the Google AIO client; the parser is source-agnostic and simply accepts whatever URL list the caller passes. Verified by all 14 specs.

### §3.6 Classifier integration (parser-side only)
`extractCitations` returns `string[]` of full URLs, which is exactly the shape `classify(url, brand, competitors)` consumes in `src/lib/classify.ts`. No domain normalization or classification happens inside `parser.ts` — that division of responsibility matches the spec (§11.5 = parser; §11.6 = classifier). End-to-end domain-type classification is covered by the chunk 7 QA report; this chunk's responsibility is producing classifier-ready inputs, which it does.

## §17 edge-case lock-in (parser-relevant)

- **Brand mentioned with no qualifying words → per-run `neutral`.** Asserted at §3.3.f.
- **Position scoring with multiple mentions → first wins.** Asserted at §3.2.h and §3.2.j.
- **Citation regex stops at `)`; trailing `.,;:!?` stripped.** Asserted at §3.5.d and a dedicated punctuation spec.
- **Generic-brand false positive (Apple) acknowledged.** Asserted at §3.1.j.
- **Empty/zero inputs return safe defaults**: `detectMentioned("", _) === false`, `computePositionScore("", _) === null`, `computeSentiment("", _) === "neutral"`, `computeCompetitorMentions("", [...]) === { all false }`, `extractCitations("") === []`. Each is locked in a dedicated spec.

## Notes for downstream chunks

- The §11.3 word lists are exported as `POSITIVE_SENTIMENT_WORDS` / `NEGATIVE_SENTIMENT_WORDS` so the metrics layer and any future evals can reuse them.
- `ParserBrand` and `ParserCompetitor` types are exported so orchestrator/integration callers can pass minimal records without leaking the full DB row shape.
- The §11.5 "union with API URLs, dedupe by full URL" rule means the Perplexity / DataForSEO clients should pass the already-mapped URL list (`citations[]` or `search_results[].url` for Perplexity; `references[].url` for DataForSEO) into `extractCitations` — the parser does not know about those upstream JSON shapes.

Overall: pass
