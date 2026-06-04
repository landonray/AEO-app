import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const checkTablesMock = vi.fn();
const runMigrationMock = vi.fn();
const readFileMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  checkTables: checkTablesMock,
  runMigration: runMigrationMock,
}));

vi.mock('node:fs/promises', () => ({
  readFile: readFileMock,
}));

const ALL_FIVE = [
  { table: 'brands', exists: true },
  { table: 'competitors', exists: true },
  { table: 'prompts', exists: true },
  { table: 'runs', exists: true },
  { table: 'citations', exists: true },
] as const;

beforeEach(() => {
  vi.resetModules();
  checkTablesMock.mockReset();
  runMigrationMock.mockReset();
  readFileMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/setup-db', () => {
  it('returns allTablesExist=true when every expected table is present', async () => {
    checkTablesMock.mockResolvedValueOnce([...ALL_FIVE]);

    const { GET } = await import('@/app/api/setup-db/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.allTablesExist).toBe(true);
    expect(body.results).toEqual(ALL_FIVE);
    expect(checkTablesMock).toHaveBeenCalledTimes(1);
    expect(runMigrationMock).not.toHaveBeenCalled();
  });

  it('returns allTablesExist=false when only some tables exist (§2.2)', async () => {
    const partial = [
      { table: 'brands', exists: true },
      { table: 'competitors', exists: false },
      { table: 'prompts', exists: true },
      { table: 'runs', exists: false },
      { table: 'citations', exists: false },
    ];
    checkTablesMock.mockResolvedValueOnce(partial);

    const { GET } = await import('@/app/api/setup-db/route');
    const res = await GET();
    const body = await res.json();

    expect(body.allTablesExist).toBe(false);
    expect(body.results).toEqual(partial);
  });
});

describe('POST /api/setup-db', () => {
  it('reads sql/schema.sql, runs migration, then returns updated table status (§2.1)', async () => {
    const SCHEMA = 'CREATE TABLE IF NOT EXISTS brands ();';
    readFileMock.mockResolvedValueOnce(SCHEMA);
    runMigrationMock.mockResolvedValueOnce(undefined);
    checkTablesMock.mockResolvedValueOnce([...ALL_FIVE]);

    const { POST } = await import('@/app/api/setup-db/route');
    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.allTablesExist).toBe(true);
    expect(body.results).toEqual(ALL_FIVE);

    expect(readFileMock).toHaveBeenCalledTimes(1);
    const [readPath, encoding] = readFileMock.mock.calls[0];
    expect(String(readPath)).toContain('src/sql/schema.sql');
    expect(encoding).toBe('utf8');

    expect(runMigrationMock).toHaveBeenCalledTimes(1);
    expect(runMigrationMock).toHaveBeenCalledWith(SCHEMA);
  });

  it('runs migration before checking tables (ordering)', async () => {
    readFileMock.mockResolvedValueOnce('-- noop');
    const calls: string[] = [];
    runMigrationMock.mockImplementationOnce(async () => {
      calls.push('runMigration');
    });
    checkTablesMock.mockImplementationOnce(async () => {
      calls.push('checkTables');
      return [...ALL_FIVE];
    });

    const { POST } = await import('@/app/api/setup-db/route');
    await POST();

    expect(calls).toEqual(['runMigration', 'checkTables']);
  });

  it('reflects partial state when migration produced incomplete tables', async () => {
    readFileMock.mockResolvedValueOnce('-- partial');
    runMigrationMock.mockResolvedValueOnce(undefined);
    const partial = [
      { table: 'brands', exists: true },
      { table: 'competitors', exists: true },
      { table: 'prompts', exists: false },
      { table: 'runs', exists: false },
      { table: 'citations', exists: false },
    ];
    checkTablesMock.mockResolvedValueOnce(partial);

    const { POST } = await import('@/app/api/setup-db/route');
    const res = await POST();
    const body = await res.json();

    expect(body.allTablesExist).toBe(false);
    expect(body.results).toEqual(partial);
  });
});
