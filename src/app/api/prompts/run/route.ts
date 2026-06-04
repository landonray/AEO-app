import { NextResponse } from 'next/server';
import { runBatch } from '@/lib/llm/orchestrator';
import {
  getPrimaryBrand,
  getPrompt,
  listActivePrompts,
  listCompetitors,
} from '@/lib/queries';
import type { BatchResult, RunPromptBody } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function readJson(req: Request): Promise<RunPromptBody> {
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const promptId =
        typeof (body as { promptId?: unknown }).promptId === 'string'
          ? ((body as { promptId: string }).promptId.trim() || undefined)
          : undefined;
      return { promptId };
    }
    return {};
  } catch {
    return {};
  }
}

export async function POST(
  req: Request,
): Promise<NextResponse<BatchResult | { error: string }>> {
  const { promptId } = await readJson(req);

  const brand = await getPrimaryBrand();
  if (!brand) {
    return NextResponse.json(
      { error: 'No primary brand exists' },
      { status: 409 },
    );
  }

  let prompts;
  if (promptId) {
    const single = await getPrompt(promptId);
    if (!single || single.brandId !== brand.id) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
    }
    prompts = [single];
  } else {
    prompts = await listActivePrompts(brand.id);
  }

  const competitors = await listCompetitors(brand.id);

  const result = await runBatch(
    prompts.map((p) => ({ id: p.id, text: p.text })),
    { name: brand.name, domain: brand.domain },
    competitors.map((c) => ({ name: c.name, domain: c.domain })),
  );

  return NextResponse.json(result);
}
