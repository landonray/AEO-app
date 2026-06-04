# Chunk 15 QA Report (pre-flight)

**Pipeline:** AEO app
**Chunk:** Metrics computation

## Result

The chunk's implementation session ended with **uncommitted changes in the worktree** (`git status --porcelain` was non-empty). Files were written but never staged or committed onto the chunk branch, so they are invisible to downstream agents and to any PR this branch produces — even though the files are still readable from disk right now via `cat`/`ls`. The orchestrator skipped the QA agent because running QA against a dirty worktree typically produces a misleading "pass" against work that will never actually ship.

## What the fix cycle should do

Open this chunk's worktree, inspect the uncommitted files below, and commit them onto the chunk branch if they are correct. If they are wrong or incomplete, fix them and then commit. Either way, end the session with `git status --porcelain` empty. The orchestrator re-runs the same pre-flight check after the fix cycle and will keep re-routing here until the worktree is clean.

### Uncommitted files at session end

```
?? src/lib/__tests__/metrics.test.ts
?? src/lib/metrics.ts
```

**Files in scope:** src/lib/metrics.ts, src/lib/__tests__/metrics.test.ts

Overall: fail
