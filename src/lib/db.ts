import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export class MissingDatabaseUrlError extends Error {
  readonly name = "MissingDatabaseUrlError";
  constructor() {
    super(
      "DATABASE_URL is not set. Add it to your environment (see .env.example).",
    );
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new MissingDatabaseUrlError();
}

export const sql: NeonQueryFunction<false, false> = neon(databaseUrl);
