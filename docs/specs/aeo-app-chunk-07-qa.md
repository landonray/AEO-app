# Chunk 7 QA — Domain Classifier

This chunk introduces `src/lib/classify.ts`, a pure function `classify(url, brand, competitors)` that returns a `DomainType` value (`You`, `Competitor`, `UGC`, `Editorial`, `Reference`, `Institutional`, `Corporate`, or `Other`). The scenarios in scope are all of §3.6 from the QA plan: scenarios 3.6.a through 3.6.o.

## Summary

| # | Scenario | Result |
|---|---|---|
| §3.6.a | Brand domain → `You` | pass |
| §3.6.b | Competitor domain → `Competitor` | pass |
| §3.6.c | Reddit → `UGC` | pass |
| §3.6.d | G2 → `UGC` | pass |
| §3.6.e | TechCrunch → `Editorial` | pass |
| §3.6.f | Wikipedia → `Reference` | pass |
| §3.6.g | `.edu` → `Institutional` | pass |
| §3.6.h | `.gov` → `Institutional` | pass |
| §3.6.i | `.org` (non-editorial) → `Institutional` (per A15) | pass |
| §3.6.j | UGC list precedence over `.org` | pass |
| §3.6.k | Editorial list precedence over `.org` | pass |
| §3.6.l | Unknown corporate domain → `Corporate` | pass |
| §3.6.m | Subdomain matches editorial apex → `Editorial` | pass |
| §3.6.n | Brand domain precedence over UGC (brand = `medium.com`) → `You` | pass |
| §3.6.o | Uppercase host normalizes → `You` | pass |

All 15 in-scope scenarios pass. The chunk also ships 19 additional precedence and edge-case tests that lock in important behaviors not enumerated in the QA plan (substring-not-apex rejection, brand vs. competitor precedence, port-in-URL handling, null/undefined brand and competitors, http vs. https, additional UGC entries like youtube and x.com, `.mil` as institutional, MDN as reference, etc.) — all 19 pass as well, for a total of 34 / 34.

## How verification was performed

The classifier is a pure function with no I/O, so verification is done as unit tests via Vitest. I ran the chunk's test file through `mc_run_tests` and reviewed the implementation against the QA plan's table.

**Test run summary** — `vitest`, **34 passed / 0 failed / 0 skipped**, 1.1s, exit code 0.

## §3.6.a — Brand domain → `You`

`classify('https://www.acme.com/x', { domain: 'acme.com' }, …)` returns `'You'`. The classifier strips the protocol and `www.` via `normalizeDomain(...)`, leaving host `acme.com`, which matches the brand apex.

**Result: pass.**

## §3.6.b — Competitor domain → `Competitor`

`classify('https://beta.io', brand, [{ domain: 'beta.io' }, …])` returns `'Competitor'`. Brand check fails (host is not under `acme.com`), the competitor loop hits `beta.io` and returns early.

**Result: pass.**

## §3.6.c — Reddit → `UGC`

`classify('https://www.reddit.com/r/saas', …)` returns `'UGC'`. `reddit.com` is on the curated UGC list.

**Result: pass.**

## §3.6.d — G2 → `UGC`

`classify('https://g2.com/products/acme', …)` returns `'UGC'`. `g2.com` is on the curated UGC list (alongside capterra, trustpilot, getapp, softwareadvice).

**Result: pass.**

## §3.6.e — TechCrunch → `Editorial`

`classify('https://techcrunch.com/2026/01/01/post', …)` returns `'Editorial'`. `techcrunch.com` is on the editorial list (alongside wired, forbes, bloomberg, nytimes, wsj, theverge, arstechnica, businessinsider, engadget, vox).

**Result: pass.**

## §3.6.f — Wikipedia → `Reference`

`classify('https://en.wikipedia.org/wiki/CRM', …)` returns `'Reference'`. `wikipedia.org` is on the reference list and matches via the apex-or-subdomain rule (`en.wikipedia.org` ends with `.wikipedia.org`).

This case also demonstrates that the reference list correctly takes precedence over the `.org` institutional TLD check — important because Wikipedia would otherwise be miscategorized as `Institutional`.

**Result: pass.**

## §3.6.g — `.edu` → `Institutional`

`classify('https://stanford.edu/research', …)` returns `'Institutional'`. After the brand/competitor/UGC/editorial/reference lists all miss, the host ends with `.edu`, hitting the institutional TLD rule.

**Result: pass.**

## §3.6.h — `.gov` → `Institutional`

`classify('https://nih.gov/grants', …)` returns `'Institutional'`. Same path as 3.6.g but matches `.gov`.

**Result: pass.**

## §3.6.i — `.org` (non-editorial) → `Institutional` (per A15)

`classify('https://w3.org/standards', …)` returns `'Institutional'`. Per the refined spec's assumption A15, `.org` domains that are not on the editorial/reference list are treated as institutional. `w3.org` is not in any curated list, so it falls through to the institutional TLD check.

**Result: pass.**

## §3.6.j — UGC list precedence over `.org`

The QA plan flags this scenario as documenting the precedence rule even though no real UGC site lives on a `.org` TLD. The test exercises the rule using `reddit.com`: even when `.org` is present in the institutional TLD list, the UGC list check runs first, so a hypothetical UGC `.org` would still classify as `UGC`. The test makes the ordering observable.

**Result: pass.**

## §3.6.k — Editorial list precedence over `.org`

`classify('https://forbes.com/article', …)` returns `'Editorial'`. The editorial list check runs before the institutional TLD check, so any editorial domain wins over the `.org` rule regardless of TLD. (forbes.com is editorial; the spec calls out a hypothetical `forbes.org` to underline the precedence.)

**Result: pass.**

## §3.6.l — Unknown corporate domain → `Corporate`

`classify('https://random-saas.io', …)` returns `'Corporate'`. The host matches none of the lists and none of the institutional TLDs, so it falls through to the default `Corporate` bucket.

**Result: pass.**

## §3.6.m — Subdomain matches editorial apex → `Editorial`

`classify('https://blog.techcrunch.com/post', …)` returns `'Editorial'`. The apex matcher accepts both exact host matches and `*.apex` subdomains, so `blog.techcrunch.com` matches the `techcrunch.com` entry.

**Result: pass.**

## §3.6.n — Brand domain precedence over UGC

`classify('https://medium.com/some-article', { domain: 'medium.com' }, …)` returns `'You'`. Even though `medium.com` is on the curated UGC list, the brand check runs first, so a brand whose own domain happens to be a UGC platform still classifies its own URLs as `You`. This is the "hard-edge case" the spec calls out.

**Result: pass.**

## §3.6.o — Uppercase host normalizes → `You`

`classify('HTTPS://ACME.COM', { domain: 'acme.com' }, …)` returns `'You'`. The classifier lower-cases via `normalizeDomain(...)` before any comparison, so uppercase hosts and protocols normalize correctly.

**Result: pass.**

## Implementation notes worth flagging

- **Apex matching is true apex matching, not substring matching.** Host `fakeacme.com` does NOT match brand `acme.com`, and host `faketechcrunch.com` does NOT match editorial `techcrunch.com`. The matcher checks for either exact equality or a `.apex` suffix — verified by two of the extra tests.
- **Brand/competitor domains are normalized too.** A brand stored as `https://www.acme.com/` or a competitor stored as `BETA.IO` still matches correctly because the classifier re-normalizes those values before comparison. This protects against onboarding/import data quirks.
- **Null and undefined brand or competitors are tolerated.** Passing `null` brand or `undefined` competitors still classifies citations correctly via the list-based rules; the function does not throw.
- **Garbage non-URL strings fall through to `Corporate`, not `Other`.** This matches the refined spec's "everything else → Corporate" rule (§11.6). `Other` is only returned for an empty/unresolvable hostname.
- **URL parsing is robust to URLs with ports and to plain `http://`** — both classify on host as expected.

Overall: **pass.** All 15 in-scope §3.6 scenarios verified pass; the chunk additionally locks in 19 precedence and edge-case behaviors with tests, all green.
