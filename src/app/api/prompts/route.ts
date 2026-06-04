import { NextResponse } from 'next/server';
import {
  archivePrompt,
  getPrimaryBrand,
  insertPrompt,
  listActivePrompts,
} from '@/lib/queries';
import type {
  CreatePromptBody,
  CreatePromptResponse,
  DeletePromptBody,
  OkResponse,
  Prompt,
} from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PromptsListResponse {
  prompts: Prompt[];
}

function trimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length === 0 ? null : t;
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(): Promise<NextResponse<PromptsListResponse | { error: string }>> {
  const brand = await getPrimaryBrand();
  if (!brand) {
    return NextResponse.json({ prompts: [] });
  }
  const prompts = await listActivePrompts(brand.id);
  return NextResponse.json({ prompts });
}

export async function POST(
  req: Request,
): Promise<NextResponse<CreatePromptResponse | { error: string }>> {
  const body = await readJson(req);
  const text = trimmedString(body?.text);
  const topic = trimmedString(body?.topic);
  if (!text || !topic) {
    return NextResponse.json(
      { error: 'text and topic are required' },
      { status: 400 },
    );
  }
  const brand = await getPrimaryBrand();
  if (!brand) {
    return NextResponse.json(
      { error: 'No primary brand exists' },
      { status: 409 },
    );
  }
  const created = await insertPrompt(brand.id, { text, topic });
  return NextResponse.json({ id: created.id }, { status: 201 });
}

export async function DELETE(
  req: Request,
): Promise<NextResponse<OkResponse | { error: string }>> {
  const body = (await readJson(req)) as (DeletePromptBody & Record<string, unknown>) | null;
  const id = trimmedString(body?.id);
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }
  await archivePrompt(id);
  return NextResponse.json({ ok: true });
}
