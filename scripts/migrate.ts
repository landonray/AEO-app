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
  try {
    await sql.query(sqlText);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }

  console.log(`Applied schema from ${schemaPath}`);
}

main().catch((err) => {
  console.error('Unexpected migration error:', err);
  process.exit(1);
});
