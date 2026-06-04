import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set. Add it to your environment (see .env.example).');
    process.exit(1);
  }

  const schemaPath = path.join(process.cwd(), 'src/sql/schema.sql');
  let sqlText: string;
  try {
    sqlText = await readFile(schemaPath, 'utf8');
  } catch (err) {
    console.error(`Failed to read schema file at ${schemaPath}:`, err);
    process.exit(1);
  }

  const sql = neon(databaseUrl);
  const statements = splitSqlStatements(sqlText);
  if (statements.length === 0) {
    console.error(`Schema file at ${schemaPath} contained no SQL statements.`);
    process.exit(1);
  }
  try {
    await sql.transaction(statements.map((stmt) => sql(stmt)));
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }

  console.log(`Applied schema from ${schemaPath}`);
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

main().catch((err) => {
  console.error('Unexpected migration error:', err);
  process.exit(1);
});
