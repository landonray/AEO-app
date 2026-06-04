#!/usr/bin/env node
// Daily cron entry point. POSTs to /api/cron/run with the bearer secret.
// Usage: npm run cron
//
// Required env: CRON_SECRET
// Optional env: PORT (defaults to 4810)

const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error(
    'CRON_SECRET is not set. Add it to your environment before running this script.',
  );
  process.exit(1);
}

const port = process.env.PORT ?? '4810';
const url = `http://localhost:${port}/api/cron/run`;

let res;
try {
  res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
  });
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`cron: request to ${url} failed: ${message}`);
  process.exit(1);
}

if (!res.ok) {
  console.error(`cron: ${url} returned ${res.status} ${res.statusText}`);
  let body = '';
  try {
    body = await res.text();
  } catch {
    // ignore body read failures
  }
  if (body) {
    console.error(`cron: response body: ${body}`);
  }
  process.exit(1);
}

let payload;
try {
  payload = await res.json();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`cron: failed to parse JSON response: ${message}`);
  process.exit(1);
}

const { batchId, totalRuns, totalErrors } = payload ?? {};
console.log(
  `cron: ok=true batchId=${batchId ?? 'unknown'} totalRuns=${totalRuns ?? 0} totalErrors=${totalErrors ?? 0}`,
);
process.exit(0);
