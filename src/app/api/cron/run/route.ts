import { createHash, timingSafeEqual } from 'node:crypto';

import { type NextRequest, NextResponse } from 'next/server';

import { runBatch } from '@/lib/llm/orchestrator';
import {
  getPrimaryBrand,
  listActivePrompts,
  listCompetitors,
} from '@/lib/queries';
import type { CronRunResponse } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BEARER_PREFIX = 'Bearer ';

function unauthorized(): NextResponse {
  return new NextResponse(null, { status: 401 });
}

function extractBearer(header: string | null): string | null {
  if (!header) return null;
  if (!header.startsWith(BEARER_PREFIX)) return null;
  return header.slice(BEARER_PREFIX.length);
}

function constantTimeMatch(provided: string, expected: string): boolean {
  // SHA-256 hash both sides so timingSafeEqual always sees equal-length
  // buffers (32 bytes) regardless of input length. This avoids the length
  // leak that a raw Buffer comparison would have.
  const providedHash = createHash('sha256').update(provided).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse<CronRunResponse> | NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron/run] CRON_SECRET is not set');
    return NextResponse.json(
      { error: 'Server misconfigured' },
      { status: 500 },
    );
  }

  const provided = extractBearer(req.headers.get('authorization'));
  if (provided === null) {
    return unauthorized();
  }
  if (!constantTimeMatch(provided, secret)) {
    return unauthorized();
  }

  try {
    const brand = await getPrimaryBrand();
    if (!brand) {
      return NextResponse.json(
        { error: 'No primary brand configured' },
        { status: 500 },
      );
    }

    const [prompts, competitors] = await Promise.all([
      listActivePrompts(brand.id),
      listCompetitors(brand.id),
    ]);

    const result = await runBatch(
      prompts.map((p) => ({ id: p.id, text: p.text })),
      { name: brand.name, domain: brand.domain },
      competitors.map((c) => ({ name: c.name, domain: c.domain })),
    );

    const body: CronRunResponse = {
      ok: true,
      batchId: result.batchId,
      totalRuns: result.totalRuns,
      totalErrors: result.totalErrors,
    };
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron/run] internal failure', { error: message });
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 },
    );
  }
}
