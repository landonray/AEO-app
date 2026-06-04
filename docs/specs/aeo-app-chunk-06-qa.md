# Chunk 6 QA — Neon DB Client

This chunk introduces `src/lib/db.ts`, which initializes the `@neondatabase/serverless` driver once at module import and exports a single `sql` tagged-template function. The only QA scenario in scope for this chunk is **§15.6 — Single Neon client reused**.

## Summary

| # | Scenario | Result |
|---|---|---|
| §15.6 | Single Neon client reused (no per-request `new Pool()`; singleton export) | pass |

## §15.6 — Single Neon client reused

### What was verified

This scenario is a code-review item per the QA plan (§15.6: "Code review: `lib/db.ts` exports a singleton; no `new Pool()` per request"). I verified it two ways: by reading the implementation file, and by running the chunk's unit tests that lock in the same behavior.

**Implementation review of `src/lib/db.ts`:**

- The file imports `neon` from `@neondatabase/serverless` and reads `DATABASE_URL` from `process.env` at module top level (not inside a function).
- `neon(databaseUrl)` is called exactly once, at module top level, and the result is exported as `sql`.
- The export is a `const` — `sql` is the single shared instance for the lifetime of the Node process. Repeated `import "@/lib/db"` calls hit Node's module cache and reuse the same `sql` function.
- No `new Pool(...)` anywhere in the file (the Neon serverless driver is HTTP-based, so there is no pool to construct — this matches the refined spec at §5 and §15.6).
- No factory function is exported: no `getDb()`, `getClient()`, `createClient()`, or similar helper that would let a caller spin up a fresh client per call.
- A typed `MissingDatabaseUrlError` is thrown at import time when `DATABASE_URL` is unset, satisfying the spec's fail-fast requirement.
- No other file in the repo (`src/**`) imports `neon` directly or constructs its own Neon client — only `src/lib/db.ts` does, and only the test file references `@neondatabase/serverless` (via `vi.mock`).

**Unit-test verification (`src/__tests__/db.test.ts`):**

The chunk ships four targeted tests that lock the singleton contract in place. All four passed when run through `mc_run_tests`:

1. `neon()` is called exactly once at module import, with the env var's value.
2. Repeated `import "@/lib/db"` calls return the same `sql` instance, and `neon()` is still only called once (module-cache singleton confirmed).
3. Missing `DATABASE_URL` causes import to reject with `MissingDatabaseUrlError`; `neon()` is not called.
4. The module's exported names include `sql` and do NOT include `createClient`, `getClient`, or `getDb` — i.e. no per-call factory.

Test run summary: `vitest`, 4 passed / 0 failed / 0 skipped, 1.0s.

### Result

**pass** — `src/lib/db.ts` is a true module-level singleton. `neon()` is invoked once at import, the resulting `sql` function is the only export, no `new Pool()` exists, and no factory helper is exposed. Tests enforce these properties.

Overall: pass
