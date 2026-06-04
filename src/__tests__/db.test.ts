import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const neonMock = vi.fn(() => {
  const tag = vi.fn();
  return tag;
});

vi.mock("@neondatabase/serverless", () => ({
  neon: neonMock,
}));

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

beforeEach(() => {
  vi.resetModules();
  neonMock.mockClear();
});

afterEach(() => {
  if (ORIGINAL_DATABASE_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
  }
});

describe("lib/db", () => {
  it("calls neon() exactly once at module import", async () => {
    process.env.DATABASE_URL = "postgres://example/neon";
    await import("@/lib/db");
    expect(neonMock).toHaveBeenCalledTimes(1);
    expect(neonMock).toHaveBeenCalledWith("postgres://example/neon");
  });

  it("returns the same sql instance across repeated imports (singleton)", async () => {
    process.env.DATABASE_URL = "postgres://example/neon";
    const first = await import("@/lib/db");
    const second = await import("@/lib/db");
    expect(second.sql).toBe(first.sql);
    expect(neonMock).toHaveBeenCalledTimes(1);
  });

  it("throws MissingDatabaseUrlError at import time when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    await expect(import("@/lib/db")).rejects.toMatchObject({
      name: "MissingDatabaseUrlError",
    });
    expect(neonMock).not.toHaveBeenCalled();
  });

  it("does not export a factory that creates new clients per call", async () => {
    process.env.DATABASE_URL = "postgres://example/neon";
    const mod = await import("@/lib/db");
    const exportedNames = Object.keys(mod);
    expect(exportedNames).toContain("sql");
    expect(exportedNames).not.toContain("createClient");
    expect(exportedNames).not.toContain("getClient");
    expect(exportedNames).not.toContain("getDb");
  });
});
