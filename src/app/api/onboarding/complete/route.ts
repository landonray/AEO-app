import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db';
import { primaryBrandExists } from '@/lib/queries';
import type {
  OnboardingCompleteBody,
  OnboardingCompleteResponse,
} from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface JsonError {
  error: string;
}

interface ValidatedBody {
  brandName: string;
  domain: string;
  category: string;
  description: string;
  prompts: { text: string; topic: string }[];
  competitors: { name: string; domain: string }[];
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateBody(body: unknown): ValidatedBody | string {
  if (!body || typeof body !== 'object') return 'body must be an object';
  const b = body as Partial<OnboardingCompleteBody>;

  const brandName = asTrimmedString(b.brandName);
  if (!brandName) return 'brandName is required';

  const domain = asTrimmedString(b.domain);
  if (!domain) return 'domain is required';

  const category = typeof b.category === 'string' ? b.category : '';
  const description = typeof b.description === 'string' ? b.description : '';

  if (!Array.isArray(b.prompts) || b.prompts.length === 0) {
    return 'prompts is required and must be a non-empty array';
  }
  const prompts: { text: string; topic: string }[] = [];
  for (const p of b.prompts) {
    const text = asTrimmedString((p as { text?: unknown })?.text);
    const topic = asTrimmedString((p as { topic?: unknown })?.topic);
    if (!text || !topic) {
      return 'each prompt must have text and topic';
    }
    prompts.push({ text, topic });
  }

  if (!Array.isArray(b.competitors) || b.competitors.length === 0) {
    return 'competitors is required and must be a non-empty array';
  }
  const competitors: { name: string; domain: string }[] = [];
  for (const c of b.competitors) {
    const name = asTrimmedString((c as { name?: unknown })?.name);
    const dom = asTrimmedString((c as { domain?: unknown })?.domain);
    if (!name || !dom) {
      return 'each competitor must have name and domain';
    }
    competitors.push({ name, domain: dom });
  }

  return {
    brandName,
    domain,
    category,
    description,
    prompts,
    competitors,
  };
}

function buildBrandQuery(input: {
  id: string;
  name: string;
  domain: string;
  category: string;
  description: string;
}) {
  return sql.query(
    `INSERT INTO brands (id, name, domain, is_primary, category, description)
     VALUES ($1, $2, $3, true, $4, $5)`,
    [input.id, input.name, input.domain, input.category, input.description],
  );
}

function buildCompetitorsQuery(
  brandId: string,
  rows: { name: string; domain: string }[],
) {
  const params: unknown[] = [brandId];
  const valueClauses = rows.map((r) => {
    params.push(r.name, r.domain);
    const nameIdx = params.length - 1;
    const domainIdx = params.length;
    return `($${nameIdx}, $${domainIdx}, $1)`;
  });
  const text = `INSERT INTO competitors (name, domain, brand_id) VALUES ${valueClauses.join(', ')}`;
  return sql.query(text, params);
}

function buildPromptsQuery(
  brandId: string,
  rows: { text: string; topic: string }[],
) {
  const params: unknown[] = [brandId];
  const valueClauses = rows.map((r) => {
    params.push(r.text, r.topic);
    const textIdx = params.length - 1;
    const topicIdx = params.length;
    return `($${textIdx}, $${topicIdx}, $1)`;
  });
  const text = `INSERT INTO prompts (text, topic, brand_id) VALUES ${valueClauses.join(', ')}`;
  return sql.query(text, params);
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse<OnboardingCompleteResponse | JsonError>> {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validated = validateBody(rawBody);
  if (typeof validated === 'string') {
    return NextResponse.json({ error: validated }, { status: 400 });
  }

  if (await primaryBrandExists()) {
    return NextResponse.json(
      { error: 'A primary brand already exists' },
      { status: 409 },
    );
  }

  const brandId = randomUUID();

  await sql.transaction([
    buildBrandQuery({
      id: brandId,
      name: validated.brandName,
      domain: validated.domain,
      category: validated.category,
      description: validated.description,
    }),
    buildCompetitorsQuery(brandId, validated.competitors),
    buildPromptsQuery(brandId, validated.prompts),
  ]);

  return NextResponse.json({ brandId });
}
