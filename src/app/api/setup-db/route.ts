import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { checkTables, runMigration } from '@/lib/queries';
import type { SetupDbResponse } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function buildStatus(): Promise<SetupDbResponse> {
  const results = await checkTables();
  const allTablesExist = results.every((r) => r.exists);
  return { allTablesExist, results };
}

export async function GET(): Promise<NextResponse<SetupDbResponse>> {
  const status = await buildStatus();
  return NextResponse.json(status);
}

export async function POST(): Promise<NextResponse> {
  const schemaPath = path.join(process.cwd(), 'src/sql/schema.sql');
  const sqlText = await readFile(schemaPath, 'utf8');
  await runMigration(sqlText);
  const status = await buildStatus();
  return NextResponse.json(status);
}
