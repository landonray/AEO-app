'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Check, Database, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { SetupDbResponse, SetupDbTableStatus } from '@/types';

type LoadState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'migrating' };

const EXPECTED_TABLES: SetupDbTableStatus['table'][] = [
  'brands',
  'competitors',
  'prompts',
  'runs',
  'citations',
];

function pendingStatus(): SetupDbResponse {
  return {
    allTablesExist: false,
    results: EXPECTED_TABLES.map((table) => ({ table, exists: false })),
  };
}

export default function SetupPage() {
  const [status, setStatus] = useState<SetupDbResponse>(pendingStatus);
  const [loaded, setLoaded] = useState(false);
  const [load, setLoad] = useState<LoadState>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);

  const recheck = useCallback(async () => {
    setLoad({ kind: 'checking' });
    setError(null);
    try {
      const res = await fetch('/api/setup-db', { cache: 'no-store' });
      if (!res.ok) {
        setError(`Could not check tables (${res.status})`);
        return;
      }
      const body = (await res.json()) as SetupDbResponse;
      setStatus(body);
    } catch {
      setError('Could not reach the server. Make sure the dev server is running.');
    } finally {
      setLoad({ kind: 'idle' });
      setLoaded(true);
    }
  }, []);

  const runMigration = useCallback(async () => {
    setLoad({ kind: 'migrating' });
    setError(null);
    try {
      const res = await fetch('/api/setup-db', { method: 'POST', cache: 'no-store' });
      if (!res.ok) {
        setError(`Migration failed (${res.status})`);
        return;
      }
      const body = (await res.json()) as SetupDbResponse;
      setStatus(body);
    } catch {
      setError('Migration failed. Check the server logs for details.');
    } finally {
      setLoad({ kind: 'idle' });
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void recheck();
  }, [recheck]);

  const allGreen = status.allTablesExist;
  const isBusy = load.kind !== 'idle';

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      data-testid="setup-page"
    >
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-6 py-10">
        <div className="flex flex-1 flex-col items-center justify-start">
          <div className="w-full">
            <Card padded className="p-8" data-testid="setup-card">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
                    <Database className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold text-foreground">Database setup</h1>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      Ontraport AEO needs the schema applied to your database before you can
                      onboard a brand.
                    </p>
                  </div>
                </div>

                <ul
                  className="flex flex-col gap-1 rounded-md border border-border/40 bg-card/40 p-2"
                  data-testid="setup-table-list"
                  aria-live="polite"
                >
                  {status.results.map((row) => (
                    <li
                      key={row.table}
                      data-testid={`setup-table-${row.table}`}
                      data-exists={row.exists ? 'true' : 'false'}
                      className="flex items-center justify-between px-3 py-2 text-[13px]"
                    >
                      <span className="font-mono text-foreground">{row.table}</span>
                      {row.exists ? (
                        <span className="inline-flex items-center gap-1.5 text-primary">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="text-[11px] uppercase tracking-wide">Ready</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="text-[11px] uppercase tracking-wide">Missing</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {error && (
                  <div
                    role="alert"
                    data-testid="setup-error"
                    className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive"
                  >
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}

                {allGreen && loaded ? (
                  <div
                    className="flex flex-col gap-3 rounded-md border border-primary/30 bg-primary/[0.06] p-4 text-center"
                    data-testid="setup-all-green"
                  >
                    <p className="text-[13px] text-foreground">
                      All tables are ready. You can continue to onboarding.
                    </p>
                    <Link
                      href="/"
                      data-testid="setup-continue-link"
                      className="inline-flex h-9 items-center justify-center gap-2 self-center rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 active:bg-primary/85"
                    >
                      Continue
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <Button
                      type="button"
                      variant="primary"
                      data-testid="setup-run-migration"
                      onClick={runMigration}
                      disabled={isBusy}
                      loading={load.kind === 'migrating'}
                      leftIcon={
                        load.kind === 'migrating' ? null : (
                          <Database className="h-4 w-4" aria-hidden="true" />
                        )
                      }
                    >
                      Run migration
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      data-testid="setup-recheck"
                      onClick={recheck}
                      disabled={isBusy}
                      loading={load.kind === 'checking'}
                      leftIcon={
                        load.kind === 'checking' ? null : (
                          <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        )
                      }
                    >
                      Re-check tables
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
