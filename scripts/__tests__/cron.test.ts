import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT_PATH = path.resolve(process.cwd(), 'scripts/cron.mjs');

interface StubServer {
  server: Server;
  port: number;
  requests: { method: string; url: string; authorization: string | null }[];
}

interface StubOptions {
  status?: number;
  body?: string;
  contentType?: string;
}

async function startStubServer(options: StubOptions = {}): Promise<StubServer> {
  const requests: StubServer['requests'] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    requests.push({
      method: req.method ?? '',
      url: req.url ?? '',
      authorization: req.headers.authorization ?? null,
    });
    // Drain the request body before responding (POST may have one).
    req.on('data', () => {});
    req.on('end', () => {
      res.statusCode = options.status ?? 200;
      res.setHeader('Content-Type', options.contentType ?? 'application/json');
      res.end(
        options.body ??
          JSON.stringify({
            ok: true,
            batchId: 'batch-stub',
            totalRuns: 7,
            totalErrors: 1,
          }),
      );
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const addr = server.address() as AddressInfo;
  return { server, port: addr.port, requests };
}

function stopServer(stub: StubServer): Promise<void> {
  return new Promise((resolve) => stub.server.close(() => resolve()));
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

type EnvBag = Record<string, string | undefined>;

function runCron(env: EnvBag): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT_PATH], {
      env: { ...process.env, ...env } as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

// Keep one fresh env per test — strip the parent process's CRON_SECRET/PORT
// so they cannot leak in by accident.
function cleanEnv(extra: EnvBag = {}): EnvBag {
  const env: EnvBag = { ...process.env, ...extra };
  if (!('CRON_SECRET' in extra)) {
    delete env.CRON_SECRET;
  }
  if (!('PORT' in extra)) {
    delete env.PORT;
  }
  return env;
}

let stub: StubServer | null = null;

afterEach(async () => {
  if (stub) {
    await stopServer(stub);
    stub = null;
  }
});

describe('scripts/cron.mjs (§10.6)', () => {
  it('10.6.a exits 1 with a clear error when CRON_SECRET is missing', async () => {
    const result = await runCron(cleanEnv());
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/CRON_SECRET/);
  });

  it('10.6.b exits 0 on a 2xx response and logs the batch counts', async () => {
    stub = await startStubServer({
      status: 200,
      body: JSON.stringify({
        ok: true,
        batchId: 'batch-XYZ',
        totalRuns: 9,
        totalErrors: 2,
      }),
    });

    const result = await runCron(
      cleanEnv({
        CRON_SECRET: 'secret-value',
        PORT: String(stub.port),
      }),
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/batchId=batch-XYZ/);
    expect(result.stdout).toMatch(/totalRuns=9/);
    expect(result.stdout).toMatch(/totalErrors=2/);

    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0].method).toBe('POST');
    expect(stub.requests[0].url).toBe('/api/cron/run');
    expect(stub.requests[0].authorization).toBe('Bearer secret-value');
  });

  it('10.6.c exits 1 on a non-2xx response', async () => {
    stub = await startStubServer({
      status: 500,
      body: JSON.stringify({ error: 'boom' }),
    });

    const result = await runCron(
      cleanEnv({
        CRON_SECRET: 'secret-value',
        PORT: String(stub.port),
      }),
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/500/);
  });

  it('10.6.c also exits 1 on a 401', async () => {
    stub = await startStubServer({
      status: 401,
      body: '',
    });

    const result = await runCron(
      cleanEnv({
        CRON_SECRET: 'wrong-secret',
        PORT: String(stub.port),
      }),
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/401/);
  });

  it('10.6.d hits the env-configured port', async () => {
    stub = await startStubServer();
    const result = await runCron(
      cleanEnv({
        CRON_SECRET: 'secret-value',
        PORT: String(stub.port),
      }),
    );
    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0].url).toBe('/api/cron/run');
  });

  it('exits 1 cleanly when the server is unreachable', async () => {
    // Bind a server just to grab a port, then close it so the port is
    // (probably) free again and the request fails fast.
    const tmp = await startStubServer();
    const port = tmp.port;
    await stopServer(tmp);

    const result = await runCron(
      cleanEnv({
        CRON_SECRET: 'secret-value',
        PORT: String(port),
      }),
    );

    expect(result.code).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});
