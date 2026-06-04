# Chunk 5 — Utility Functions — QA Report

**Files under test**
- `src/lib/utils.ts`
- `src/lib/__tests__/utils.test.ts`

**Test runner:** Vitest (run via `mc_run_tests` against the chunk worktree).
**Test run id:** `b5206a9e-3ca7-408b-be0a-cb62eb0c8899` — 36 passed / 0 failed / 0 skipped, 1.08s.

---

## Summary

| # | Scenario | Result |
|---|---|---|
| 3.1.i | Brand-name regex correctness — `escapeRegex` escapes regex metacharacters and the re-compiled regex matches the literal source | **pass** |
| 3.6.o | Domain normalization — `normalizeDomain` lowercases uppercase host (`HTTPS://ACME.COM` → `acme.com`) | **pass** |
| 11.10 | Param validation helpers used in routes (SQL-param adversarial inputs) | **blocked** |
| Utility extras (Q9 / chunk scope) | `cn`, `formatPercent`, `extractDomain`, `normalizeDomain` (full edge-case set), `escapeRegex` (full metacharacter set), `relativeTime` | **pass** |

---

## Scenario detail

### §3.1 — Brand-name regex correctness (covers 3.1.i)

**What this chunk owns:** the `escapeRegex(str)` helper that the parser in a later chunk will use to safely build the brand-mention regex. The full §3.1 matrix (a–j) is exercised against the parser itself (chunk 7); for chunk 5 we verify only that `escapeRegex` produces output safe to drop into `new RegExp(...)` and that the recompiled regex matches the literal source.

**What I verified:**
- `escapeRegex('C++ Builder')` returns `C\+\+ Builder`, and the recompiled `\b…\b` regex (case-insensitive) matches the literal substring inside a real sentence and does NOT match `Cxx Builder` — this is the end-to-end §3.1.i invariant.
- `escapeRegex('acme.com')` returns `acme\.com` — the `.` in a domain is escaped, so a domain mention regex won't accidentally match `acmexcom`.
- Full metacharacter coverage: `.`, `*`, `+`, `?`, `^`, `$`, `{`, `}`, `(`, `)`, `|`, `[`, `]`, `\` are each escaped (the comprehensive-metacharacter-set test in `utils.test.ts`).
- Empty string returns empty string; plain alphanumeric strings (`Acme`, `Acme123`) pass through unchanged.

**Result:** **pass** — `escapeRegex` is correct and safe for chunk 7's parser to consume.

---

### §3.6.o — Domain normalization, uppercase host

**Scenario:** Given an uppercase URL (`HTTPS://ACME.COM`), the normalizer must produce `acme.com` so that downstream domain comparison against the brand domain succeeds (the chunk-7 classifier will use this to label the citation as `You`).

**What I verified (against `normalizeDomain`):**
- `normalizeDomain('ACME.COM')` → `'acme.com'`.
- `normalizeDomain('HTTPS://ACME.COM')` → `'acme.com'` (the literal §3.6.o input).
- Additionally covered for the same helper:
  - protocol stripping (`http://`, `https://`, protocol-relative `//`),
  - leading `www.` stripped,
  - path / query / fragment stripped (`/pricing`, `?q=1`, `#h`),
  - port stripped (`:8080`, `:443`),
  - user-info stripped (`user:pass@`),
  - trailing whitespace and trailing dots stripped,
  - non-`www` subdomains preserved (`blog.acme.com`, `news.ycombinator.com`) — apex extraction is deliberately deferred to chunk 7's classifier, per the test fixture comments,
  - empty / whitespace-only input returns `''`.

**Result:** **pass** — §3.6.o is satisfied, and the broader Q9 edge case list called out in the chunk scope is covered.

---

### §11.10 — Param validation helpers used in routes

**Status:** **blocked**

**Why:** §11.10 is an integration-level scenario about API route handlers rejecting adversarial values for `days` and `model` query parameters (e.g. `';--`). It depends on:
1. The route handlers existing (later chunks).
2. The dedicated `days` / `model` validation helpers that the chunk-5 pre-flight pointer assumed would live in `src/lib/utils.ts`.

Neither is present yet. `src/lib/utils.ts` as shipped in this chunk exports only `cn`, `formatPercent`, `extractDomain`, `normalizeDomain`, `escapeRegex`, and `relativeTime` — no `parseDays`, `parseModel`, or equivalent param-validation helper exists in this chunk.

This is not a regression introduced by chunk 5; it is a scope mismatch between the QA-plan pointer and the actual chunk-5 build instructions (which never list param validators). Verification of §11.10 has to happen at the API-route layer in a later chunk (or in the cross-chunk integration QA stage). Marking blocked rather than fail because there is nothing in this chunk's output to test against.

**Recommended downstream action (informational, not part of this QA pass):** when the route chunks land, the fix-cycle / integration QA will need to add a `validateDays` / `validateModel` helper (either here in `utils.ts` or in a routes-local module) and a corresponding adversarial-input integration test.

---

### Utility extras — full chunk-5 unit suite

The chunk-5 spec also calls out unit coverage for `cn`, `formatPercent`, `extractDomain`, and `relativeTime`. These are not in the QA-plan scope rows listed for this chunk, but they are part of the chunk's "definition of done" and a regression here would silently distort UI rendering, so I confirmed they all pass.

- **`cn`** — joins simple class names, drops falsy values from `clsx`, accepts arrays/objects, merges conflicting Tailwind classes via `tailwind-merge` (`p-2 p-4` → `p-4`, `text-red-500 text-blue-500` → `text-blue-500`), returns `''` when given nothing usable. **pass**
- **`formatPercent`** — `0.55` → `55%`, `0` → `0%`, `1` → `100%`, rounds via `toFixed` with configurable fractionDigits, negative deltas render as `-5%` (used by `visibilityChange`), and `null` / `undefined` / `NaN` all render as `'—'` per §13.4 (the explicit empty-window invariant called out in §8.4). **pass**
- **`extractDomain`** — returns `hostname` for valid `http`/`https` URLs (with paths, ports, query strings); preserves `www.` (unlike `normalizeDomain`); returns `''` for unparseable input including bare `acme.com` and empty string. **pass**
- **`relativeTime`** — accepts an ISO string or a `Date`; produces "just now", "X minutes ago", "X hours ago", "X days ago", "X weeks ago" via `Intl.RelativeTimeFormat('en', { numeric: 'auto' })`; returns `'never'` for `null` / `undefined` / `''` / invalid ISO. The header "last updated" line described in the chunk scope can consume this directly. **pass**

---

## Notes for the next chunk / fix cycle

- The `escapeRegex` helper is ready for chunk-7 to consume. The unit-test pattern `new RegExp(\`\\b${escapeRegex(name)}\\b\`, 'i')` is the form the parser should adopt verbatim for the §3.1 brand-detection regex.
- `normalizeDomain` deliberately does NOT collapse subdomains to apex (so `blog.acme.com` stays as `blog.acme.com`). The classifier in chunk 7 is responsible for apex extraction. This is locked by an explicit unit test and should not be "fixed" downstream.
- `formatPercent(null | undefined | NaN)` already returns `'—'`. The metrics layer in chunk 8 should pass `null` (not `0`) for empty windows so the UI renders `—` per §13.4 — do not work around the helper by substituting `0`.

---

Overall: pass
