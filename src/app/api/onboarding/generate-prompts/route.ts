import { NextResponse, type NextRequest } from 'next/server';
import { generatePrompts } from '@/lib/generators';
import type {
  CrawlResult,
  OnboardingGeneratePromptsBody,
  OnboardingGeneratePromptsResponse,
} from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REQUIRED_CRAWL_KEYS: (keyof CrawlResult)[] = [
  'title',
  'description',
  'category',
  'targetAudience',
  'coreUseCase',
  'features',
  'integrations',
  'competitorHints',
];

interface JsonError {
  error: string;
}

function isCrawlResult(value: unknown): value is CrawlResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  for (const key of REQUIRED_CRAWL_KEYS) {
    if (!(key in v)) return false;
  }
  return true;
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse<OnboardingGeneratePromptsResponse | JsonError>> {
  let body: Partial<OnboardingGeneratePromptsBody>;
  try {
    body = (await req.json()) as Partial<OnboardingGeneratePromptsBody>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const domain = typeof body?.domain === 'string' ? body.domain.trim() : '';
  if (!domain) {
    return NextResponse.json(
      { error: 'domain is required' },
      { status: 400 },
    );
  }

  if (!isCrawlResult(body?.crawlData)) {
    return NextResponse.json(
      { error: 'crawlData is required and must include all crawl fields' },
      { status: 400 },
    );
  }

  const prompts = await generatePrompts(body.crawlData, domain);
  return NextResponse.json({ prompts });
}
