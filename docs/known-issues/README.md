# Known Issues Register

The standing list of defects this project keeps re-finding, plus the findings
already investigated and ruled NOT defects. One file per issue, indexed in
`INDEX.md`. Owner-facing: plain English, no code.

**Purpose.** Reports and sightings keep surfacing the same defect classes. Each
time, a session re-diagnoses from scratch and often re-proposes a fix that was
already measured and refused. This register is the shortcut: match a sighting
against it before spending an investigation, and record every refuted fix so it
is not proposed again.

## Covenant (every session, every PR)

1. **Before diagnosing a defect cluster, check the index.** If the cluster
   matches an entry, cite its ID and current status instead of re-deriving
   the mechanism. Investigation budget goes to NEW clusters only.
2. **Detection stays fresh-eyes.** The register is consulted at the clustering
   and diagnosis step, never handed to whatever is doing the looking. A
   reviewer told what to look for stops seeing what else is there.
3. **A PR that fixes, partially fixes, arms, or refuses a fix for an entry
   updates that entry's `status` and "Status and what's shipped" section in
   the same PR.**
4. **A refuted fix is recorded, not deleted.** The "Refuted fixes" section is
   the most valuable part of an entry; it only grows.
5. **Automated jobs do NOT write here.** They propose deltas (new sightings,
   candidate entries). An interactive session files them. Nothing becomes
   "known" without a verified mechanism or an owner ruling.
6. **Every number carries its grade** (measured / proxy / inferred) and where
   it came from. A number nobody can re-derive is a guess.
7. **New entries take the next free ID.** IDs are never reused or renumbered.

## Status vocabulary

| status | meaning |
|---|---|
| `open` | confirmed defect, no fix shipped |
| `fix-in-flight` | a PR exists (open or unmerged) |
| `fixed-standing-damage` | mechanism closed, historical rows not repaired |
| `fixed` | mechanism closed AND standing damage repaired or measured nil |
| `built-not-armed` | detection or fix exists behind a gate that is off |
| `refuted` | investigated; NOT a defect (record why so it is not re-raised) |
| `owner-ruling` | the owner ruled how this must be handled; not up for re-litigation |
| `wont-fix` | confirmed but deliberately left (with the reason) |

## Entry template

Copy this into `KI-NNN-short-slug.md`.

```markdown
---
id: KI-NNN
title: Plain-English title a reader would recognize
status: open
first_seen: YYYY-MM-DD
last_seen: YYYY-MM-DD
tags: [area, area]
reports: ["report #N"]
prs: ["#123"]
---
# KI-NNN — Title

## What the reader sees
The symptom as a user sees it, in one short paragraph.

## How to recognize it (fingerprint)
What a new sighting looks like, so a session can match it without
re-diagnosing. Include the tell-tale signs AND the lookalikes that are NOT
this issue.

## Root cause — grade: measured | proxy | inferred
The mechanism, in plain English. Say what evidence established it. If two
mechanisms produce the same symptom, list both.

## Status and what's shipped
What is fixed, what is armed, what is still open, and what standing damage
remains. Name the PRs.

## Examples
Concrete cases with identifiers and URLs: what we showed vs what was true.

## Refuted fixes / what NOT to do
Every fix that was proposed and then measured wrong, with the number that
killed it. This section only grows.

## Where it was investigated
Reports, PRs, working sessions, decision records, docs.

## Sightings log
| date | where | count | note |
|---|---|---|---|
```
