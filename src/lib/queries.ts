import { sql } from '@/lib/db';
import type {
  Brand,
  Citation,
  Competitor,
  DomainType,
  ModelFilter,
  ModelShortId,
  Prompt,
  Run,
  Sentiment,
  SetupDbTableStatus,
  SourcesView,
} from '@/types';

export interface BuiltQuery {
  sql: string;
  params: unknown[];
}

interface RunsBrandRow {
  id: string;
  prompt_id: string;
  model: string;
  response: string | null;
  mentioned: boolean;
  position_score: number | null;
  sentiment: string;
  competitor_mentions: Record<string, boolean> | null;
  estimated_cost: number | string | null;
  created_at: string;
}

interface CitationBrandRow {
  id: string;
  run_id: string;
  domain: string;
  url: string | null;
  domain_type: string;
  created_at: string;
}

function isFilterableModel(model: ModelFilter | undefined): model is ModelShortId {
  return typeof model === 'string' && model !== 'all';
}

function coerceNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asSentiment(value: string | null | undefined): Sentiment {
  return value === 'positive' || value === 'negative' ? value : 'neutral';
}

function asModelShortId(value: string): ModelShortId {
  return value as ModelShortId;
}

function asDomainType(value: string | null | undefined): DomainType {
  const allowed: DomainType[] = [
    'You',
    'Competitor',
    'UGC',
    'Editorial',
    'Reference',
    'Institutional',
    'Corporate',
    'Other',
  ];
  return (allowed as string[]).includes(value ?? '') ? (value as DomainType) : 'Other';
}

function mapRunRow(row: RunsBrandRow): Run {
  return {
    id: row.id,
    promptId: row.prompt_id,
    model: asModelShortId(row.model),
    response: row.response,
    mentioned: Boolean(row.mentioned),
    positionScore: coerceNumber(row.position_score),
    sentiment: asSentiment(row.sentiment),
    competitorMentions: row.competitor_mentions ?? {},
    estimatedCost: coerceNumber(row.estimated_cost),
    createdAt: row.created_at,
  };
}

function mapCitationRow(row: CitationBrandRow): Citation {
  return {
    id: row.id,
    runId: row.run_id,
    domain: row.domain,
    url: row.url,
    domainType: asDomainType(row.domain_type),
    createdAt: row.created_at,
  };
}

async function run<T = Record<string, unknown>>(built: BuiltQuery): Promise<T[]> {
  const result = await sql(built.sql, built.params);
  return result as T[];
}

// --------------------------------------------------------------------------
// Brand
// --------------------------------------------------------------------------

export function buildGetPrimaryBrand(): BuiltQuery {
  return {
    sql: `SELECT id, name, domain, is_primary, category, description, created_at
          FROM brands
          WHERE is_primary = true
          ORDER BY created_at ASC
          LIMIT 1`,
    params: [],
  };
}

export async function getPrimaryBrand(): Promise<Brand | null> {
  const rows = await run<{
    id: string;
    name: string;
    domain: string;
    is_primary: boolean;
    category: string | null;
    description: string | null;
    created_at: string;
  }>(buildGetPrimaryBrand());
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    isPrimary: Boolean(row.is_primary),
    category: row.category,
    description: row.description,
    createdAt: row.created_at,
  };
}

export interface InsertBrandInput {
  name: string;
  domain: string;
  category: string | null;
  description: string | null;
  isPrimary?: boolean;
}

export function buildInsertBrand(input: InsertBrandInput): BuiltQuery {
  return {
    sql: `INSERT INTO brands (name, domain, is_primary, category, description)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, name, domain, is_primary, category, description, created_at`,
    params: [
      input.name,
      input.domain,
      input.isPrimary ?? true,
      input.category,
      input.description,
    ],
  };
}

export async function insertBrand(input: InsertBrandInput): Promise<Brand> {
  const rows = await run<{
    id: string;
    name: string;
    domain: string;
    is_primary: boolean;
    category: string | null;
    description: string | null;
    created_at: string;
  }>(buildInsertBrand(input));
  const row = rows[0];
  if (!row) {
    throw new Error('insertBrand: no row returned');
  }
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    isPrimary: Boolean(row.is_primary),
    category: row.category,
    description: row.description,
    createdAt: row.created_at,
  };
}

export function buildPrimaryBrandExists(): BuiltQuery {
  return {
    sql: `SELECT 1 AS one FROM brands WHERE is_primary = true LIMIT 1`,
    params: [],
  };
}

export async function primaryBrandExists(): Promise<boolean> {
  const rows = await run<{ one: number }>(buildPrimaryBrandExists());
  return rows.length > 0;
}

// --------------------------------------------------------------------------
// Competitor
// --------------------------------------------------------------------------

export interface InsertCompetitorRow {
  name: string;
  domain: string;
}

export function buildInsertCompetitors(
  brandId: string,
  rows: InsertCompetitorRow[],
): BuiltQuery {
  if (rows.length === 0) {
    return { sql: `SELECT 1 WHERE false`, params: [] };
  }
  const params: unknown[] = [brandId];
  const valueClauses = rows.map((r) => {
    params.push(r.name, r.domain);
    const nameIdx = params.length - 1;
    const domainIdx = params.length;
    return `($${nameIdx}, $${domainIdx}, $1)`;
  });
  return {
    sql: `INSERT INTO competitors (name, domain, brand_id)
          VALUES ${valueClauses.join(', ')}
          RETURNING id, name, domain, brand_id, created_at`,
    params,
  };
}

export async function insertCompetitors(
  brandId: string,
  rows: InsertCompetitorRow[],
): Promise<Competitor[]> {
  if (rows.length === 0) return [];
  const result = await run<{
    id: string;
    name: string;
    domain: string;
    brand_id: string;
    created_at: string;
  }>(buildInsertCompetitors(brandId, rows));
  return result.map((r) => ({
    id: r.id,
    name: r.name,
    domain: r.domain,
    brandId: r.brand_id,
    createdAt: r.created_at,
  }));
}

export function buildListCompetitors(brandId: string): BuiltQuery {
  return {
    sql: `SELECT id, name, domain, brand_id, created_at
          FROM competitors
          WHERE brand_id = $1
          ORDER BY created_at ASC`,
    params: [brandId],
  };
}

export async function listCompetitors(brandId: string): Promise<Competitor[]> {
  const result = await run<{
    id: string;
    name: string;
    domain: string;
    brand_id: string;
    created_at: string;
  }>(buildListCompetitors(brandId));
  return result.map((r) => ({
    id: r.id,
    name: r.name,
    domain: r.domain,
    brandId: r.brand_id,
    createdAt: r.created_at,
  }));
}

// --------------------------------------------------------------------------
// Prompt
// --------------------------------------------------------------------------

export interface InsertPromptRow {
  text: string;
  topic: string;
}

export function buildInsertPrompts(
  brandId: string,
  rows: InsertPromptRow[],
): BuiltQuery {
  if (rows.length === 0) {
    return { sql: `SELECT 1 WHERE false`, params: [] };
  }
  const params: unknown[] = [brandId];
  const valueClauses = rows.map((r) => {
    params.push(r.text, r.topic);
    const textIdx = params.length - 1;
    const topicIdx = params.length;
    return `($${textIdx}, $${topicIdx}, $1)`;
  });
  return {
    sql: `INSERT INTO prompts (text, topic, brand_id)
          VALUES ${valueClauses.join(', ')}
          RETURNING id, text, topic, tags, is_active, brand_id, created_at`,
    params,
  };
}

export async function insertPrompts(
  brandId: string,
  rows: InsertPromptRow[],
): Promise<Prompt[]> {
  if (rows.length === 0) return [];
  const result = await run<{
    id: string;
    text: string;
    topic: string;
    tags: string[] | null;
    is_active: boolean;
    brand_id: string;
    created_at: string;
  }>(buildInsertPrompts(brandId, rows));
  return result.map((r) => ({
    id: r.id,
    text: r.text,
    topic: r.topic,
    tags: r.tags ?? [],
    isActive: Boolean(r.is_active),
    brandId: r.brand_id,
    createdAt: r.created_at,
  }));
}

export function buildInsertPrompt(
  brandId: string,
  input: InsertPromptRow,
): BuiltQuery {
  return {
    sql: `INSERT INTO prompts (text, topic, brand_id)
          VALUES ($1, $2, $3)
          RETURNING id, text, topic, tags, is_active, brand_id, created_at`,
    params: [input.text, input.topic, brandId],
  };
}

export async function insertPrompt(
  brandId: string,
  input: InsertPromptRow,
): Promise<Prompt> {
  const result = await run<{
    id: string;
    text: string;
    topic: string;
    tags: string[] | null;
    is_active: boolean;
    brand_id: string;
    created_at: string;
  }>(buildInsertPrompt(brandId, input));
  const row = result[0];
  if (!row) {
    throw new Error('insertPrompt: no row returned');
  }
  return {
    id: row.id,
    text: row.text,
    topic: row.topic,
    tags: row.tags ?? [],
    isActive: Boolean(row.is_active),
    brandId: row.brand_id,
    createdAt: row.created_at,
  };
}

export function buildListPrompts(brandId: string): BuiltQuery {
  return {
    sql: `SELECT id, text, topic, tags, is_active, brand_id, created_at
          FROM prompts
          WHERE brand_id = $1
          ORDER BY created_at ASC`,
    params: [brandId],
  };
}

export async function listPrompts(brandId: string): Promise<Prompt[]> {
  const result = await run<{
    id: string;
    text: string;
    topic: string;
    tags: string[] | null;
    is_active: boolean;
    brand_id: string;
    created_at: string;
  }>(buildListPrompts(brandId));
  return result.map((r) => ({
    id: r.id,
    text: r.text,
    topic: r.topic,
    tags: r.tags ?? [],
    isActive: Boolean(r.is_active),
    brandId: r.brand_id,
    createdAt: r.created_at,
  }));
}

export function buildListActivePrompts(brandId: string): BuiltQuery {
  return {
    sql: `SELECT id, text, topic, tags, is_active, brand_id, created_at
          FROM prompts
          WHERE brand_id = $1 AND is_active = true
          ORDER BY created_at ASC`,
    params: [brandId],
  };
}

export async function listActivePrompts(brandId: string): Promise<Prompt[]> {
  const result = await run<{
    id: string;
    text: string;
    topic: string;
    tags: string[] | null;
    is_active: boolean;
    brand_id: string;
    created_at: string;
  }>(buildListActivePrompts(brandId));
  return result.map((r) => ({
    id: r.id,
    text: r.text,
    topic: r.topic,
    tags: r.tags ?? [],
    isActive: Boolean(r.is_active),
    brandId: r.brand_id,
    createdAt: r.created_at,
  }));
}

export function buildArchivePrompt(id: string): BuiltQuery {
  return {
    sql: `UPDATE prompts SET is_active = false WHERE id = $1`,
    params: [id],
  };
}

export async function archivePrompt(id: string): Promise<void> {
  await run(buildArchivePrompt(id));
}

export function buildGetPrompt(id: string): BuiltQuery {
  return {
    sql: `SELECT id, text, topic, tags, is_active, brand_id, created_at
          FROM prompts
          WHERE id = $1
          LIMIT 1`,
    params: [id],
  };
}

export async function getPrompt(id: string): Promise<Prompt | null> {
  const result = await run<{
    id: string;
    text: string;
    topic: string;
    tags: string[] | null;
    is_active: boolean;
    brand_id: string;
    created_at: string;
  }>(buildGetPrompt(id));
  const row = result[0];
  if (!row) return null;
  return {
    id: row.id,
    text: row.text,
    topic: row.topic,
    tags: row.tags ?? [],
    isActive: Boolean(row.is_active),
    brandId: row.brand_id,
    createdAt: row.created_at,
  };
}

// --------------------------------------------------------------------------
// Run
// --------------------------------------------------------------------------

export interface InsertRunInput {
  promptId: string;
  model: ModelShortId;
  response: string | null;
  mentioned: boolean;
  positionScore: number | null;
  sentiment: Sentiment;
  competitorMentions: Record<string, boolean>;
  estimatedCost: number | null;
}

export function buildInsertRun(input: InsertRunInput): BuiltQuery {
  return {
    sql: `INSERT INTO runs (prompt_id, model, response, mentioned, position_score, sentiment, competitor_mentions, estimated_cost)
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
          RETURNING id`,
    params: [
      input.promptId,
      input.model,
      input.response,
      input.mentioned,
      input.positionScore,
      input.sentiment,
      JSON.stringify(input.competitorMentions ?? {}),
      input.estimatedCost,
    ],
  };
}

export async function insertRun(input: InsertRunInput): Promise<string> {
  const result = await run<{ id: string }>(buildInsertRun(input));
  const row = result[0];
  if (!row) {
    throw new Error('insertRun: no row returned');
  }
  return row.id;
}

export interface GetRunsParams {
  brandId?: string;
  days: number;
  model?: ModelFilter;
}

export function buildGetRuns(params: GetRunsParams): BuiltQuery {
  const args: unknown[] = [];
  const where: string[] = [];

  args.push(String(params.days));
  const daysIdx = args.length;
  where.push(`r.created_at >= now() - ($${daysIdx} || ' days')::interval`);

  if (params.brandId) {
    args.push(params.brandId);
    const brandIdx = args.length;
    where.push(`p.brand_id = $${brandIdx}`);
  }

  if (isFilterableModel(params.model)) {
    args.push(params.model);
    const modelIdx = args.length;
    where.push(`r.model = $${modelIdx}`);
  }

  return {
    sql: `SELECT r.id, r.prompt_id, r.model, r.response, r.mentioned,
                 r.position_score, r.sentiment, r.competitor_mentions,
                 r.estimated_cost, r.created_at
          FROM runs r
          JOIN prompts p ON p.id = r.prompt_id
          WHERE ${where.join(' AND ')}
          ORDER BY r.created_at DESC`,
    params: args,
  };
}

export async function getRuns(params: GetRunsParams): Promise<Run[]> {
  const result = await run<RunsBrandRow>(buildGetRuns(params));
  return result.map(mapRunRow);
}

export function buildGetRunsForPrompt(promptId: string, limit: number): BuiltQuery {
  return {
    sql: `SELECT r.id, r.prompt_id, r.model, r.response, r.mentioned,
                 r.position_score, r.sentiment, r.competitor_mentions,
                 r.estimated_cost, r.created_at
          FROM runs r
          WHERE r.prompt_id = $1
          ORDER BY r.created_at DESC
          LIMIT $2`,
    params: [promptId, limit],
  };
}

export async function getRunsForPrompt(
  promptId: string,
  limit: number,
): Promise<Run[]> {
  const result = await run<RunsBrandRow>(buildGetRunsForPrompt(promptId, limit));
  return result.map(mapRunRow);
}

export interface GetLatestRunPerModelPerPromptParams {
  brandId: string;
  days: number;
  model?: ModelFilter;
}

export function buildGetLatestRunPerModelPerPrompt(
  params: GetLatestRunPerModelPerPromptParams,
): BuiltQuery {
  const args: unknown[] = [];
  args.push(params.brandId);
  const brandIdx = args.length;
  args.push(String(params.days));
  const daysIdx = args.length;

  let modelClause = '';
  if (isFilterableModel(params.model)) {
    args.push(params.model);
    const modelIdx = args.length;
    modelClause = ` AND r.model = $${modelIdx}`;
  }

  return {
    sql: `SELECT DISTINCT ON (r.prompt_id, r.model)
                 r.id, r.prompt_id, r.model, r.response, r.mentioned,
                 r.position_score, r.sentiment, r.competitor_mentions,
                 r.estimated_cost, r.created_at
          FROM runs r
          JOIN prompts p ON p.id = r.prompt_id
          WHERE p.brand_id = $${brandIdx}
            AND r.created_at >= now() - ($${daysIdx} || ' days')::interval${modelClause}
          ORDER BY r.prompt_id, r.model, r.created_at DESC`,
    params: args,
  };
}

export async function getLatestRunPerModelPerPrompt(
  params: GetLatestRunPerModelPerPromptParams,
): Promise<Run[]> {
  const result = await run<RunsBrandRow>(
    buildGetLatestRunPerModelPerPrompt(params),
  );
  return result.map(mapRunRow);
}

// --------------------------------------------------------------------------
// Citation
// --------------------------------------------------------------------------

export interface InsertCitationRow {
  domain: string;
  url: string | null;
  domainType: DomainType;
}

export function buildInsertCitations(
  runId: string,
  rows: InsertCitationRow[],
): BuiltQuery {
  if (rows.length === 0) {
    return { sql: `SELECT 1 WHERE false`, params: [] };
  }
  const params: unknown[] = [runId];
  const valueClauses = rows.map((r) => {
    params.push(r.domain, r.url, r.domainType);
    const domainIdx = params.length - 2;
    const urlIdx = params.length - 1;
    const typeIdx = params.length;
    return `($1, $${domainIdx}, $${urlIdx}, $${typeIdx})`;
  });
  return {
    sql: `INSERT INTO citations (run_id, domain, url, domain_type)
          VALUES ${valueClauses.join(', ')}
          RETURNING id, run_id, domain, url, domain_type, created_at`,
    params,
  };
}

export async function insertCitations(
  runId: string,
  rows: InsertCitationRow[],
): Promise<Citation[]> {
  if (rows.length === 0) return [];
  const result = await run<CitationBrandRow>(buildInsertCitations(runId, rows));
  return result.map(mapCitationRow);
}

export interface GetCitationsParams {
  brandId: string;
  days: number;
  model?: ModelFilter;
  view?: SourcesView;
}

export function buildGetCitations(params: GetCitationsParams): BuiltQuery {
  const args: unknown[] = [];
  args.push(params.brandId);
  const brandIdx = args.length;
  args.push(String(params.days));
  const daysIdx = args.length;

  const where: string[] = [
    `p.brand_id = $${brandIdx}`,
    `r.created_at >= now() - ($${daysIdx} || ' days')::interval`,
  ];

  if (isFilterableModel(params.model)) {
    args.push(params.model);
    const modelIdx = args.length;
    where.push(`r.model = $${modelIdx}`);
  }

  return {
    sql: `SELECT c.id, c.run_id, c.domain, c.url, c.domain_type, c.created_at
          FROM citations c
          JOIN runs r ON r.id = c.run_id
          JOIN prompts p ON p.id = r.prompt_id
          WHERE ${where.join(' AND ')}
          ORDER BY c.created_at DESC`,
    params: args,
  };
}

export async function getCitations(params: GetCitationsParams): Promise<Citation[]> {
  const result = await run<CitationBrandRow>(buildGetCitations(params));
  return result.map(mapCitationRow);
}

export function buildGetCitationsForRunIds(runIds: ReadonlyArray<string>): BuiltQuery {
  if (runIds.length === 0) {
    return { sql: `SELECT 1 WHERE false`, params: [] };
  }
  return {
    sql: `SELECT id, run_id, domain, url, domain_type, created_at
          FROM citations
          WHERE run_id = ANY($1::uuid[])
          ORDER BY created_at DESC`,
    params: [runIds],
  };
}

export async function getCitationsForRunIds(
  runIds: ReadonlyArray<string>,
): Promise<Citation[]> {
  if (runIds.length === 0) return [];
  const result = await run<CitationBrandRow>(buildGetCitationsForRunIds(runIds));
  return result.map(mapCitationRow);
}

export function buildGetRunsForPromptInWindow(
  promptId: string,
  days: number,
  model?: ModelFilter,
): BuiltQuery {
  const args: unknown[] = [promptId, String(days)];
  let modelClause = '';
  if (isFilterableModel(model)) {
    args.push(model);
    modelClause = ` AND model = $${args.length}`;
  }
  return {
    sql: `SELECT id, prompt_id, model, response, mentioned,
                 position_score, sentiment, competitor_mentions,
                 estimated_cost, created_at
          FROM runs
          WHERE prompt_id = $1
            AND created_at >= now() - ($2 || ' days')::interval${modelClause}
          ORDER BY created_at DESC`,
    params: args,
  };
}

export async function getRunsForPromptInWindow(
  promptId: string,
  days: number,
  model?: ModelFilter,
): Promise<Run[]> {
  const result = await run<RunsBrandRow>(
    buildGetRunsForPromptInWindow(promptId, days, model),
  );
  return result.map(mapRunRow);
}

// --------------------------------------------------------------------------
// Setup / migration / last-updated
// --------------------------------------------------------------------------

const SETUP_TABLES: SetupDbTableStatus['table'][] = [
  'brands',
  'competitors',
  'prompts',
  'runs',
  'citations',
];

export function buildCheckTables(): BuiltQuery {
  return {
    sql: `SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    params: [SETUP_TABLES],
  };
}

export async function checkTables(): Promise<SetupDbTableStatus[]> {
  const rows = await run<{ table_name: string }>(buildCheckTables());
  const present = new Set(rows.map((r) => r.table_name));
  return SETUP_TABLES.map((table) => ({
    table,
    exists: present.has(table),
  }));
}

export async function runMigration(sqlText: string): Promise<void> {
  const statements = splitSqlStatements(sqlText);
  if (statements.length === 0) return;
  await sql.transaction(statements.map((stmt) => sql(stmt)));
}

function splitSqlStatements(sqlText: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inSingle = false;
  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i];
    if (ch === "'" && sqlText[i - 1] !== '\\') {
      inSingle = !inSingle;
      buf += ch;
      continue;
    }
    if (ch === ';' && !inSingle) {
      const trimmed = buf.trim();
      if (trimmed.length > 0) out.push(trimmed);
      buf = '';
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail.length > 0) out.push(tail);
  return out;
}

export function buildGetLastRunTimestamp(brandId: string): BuiltQuery {
  return {
    sql: `SELECT MAX(r.created_at) AS last_run
          FROM runs r
          JOIN prompts p ON p.id = r.prompt_id
          WHERE p.brand_id = $1`,
    params: [brandId],
  };
}

export async function getLastRunTimestamp(brandId: string): Promise<string | null> {
  const rows = await run<{ last_run: string | null }>(
    buildGetLastRunTimestamp(brandId),
  );
  return rows[0]?.last_run ?? null;
}
