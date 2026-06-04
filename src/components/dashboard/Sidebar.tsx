'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Layers,
  LayoutDashboard,
  MessageSquareText,
  Globe,
  Play,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import type { BatchResult } from '@/types';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Overview',
    icon: LayoutDashboard,
    match: (p) => p === '/dashboard' || p === '/',
  },
  {
    href: '/dashboard/prompts',
    label: 'Prompts',
    icon: MessageSquareText,
    match: (p) => p.startsWith('/dashboard/prompts'),
  },
  {
    href: '/dashboard/sources',
    label: 'Sources',
    icon: Globe,
    match: (p) => p.startsWith('/dashboard/sources'),
  },
];

export interface SidebarProps {
  onBatchComplete?: () => void;
}

function formatCost(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '$0.0000';
  return `$${value.toFixed(4)}`;
}

export function Sidebar({ onBatchComplete }: SidebarProps) {
  const pathname = usePathname() ?? '/';
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleRunAll = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setToast(null);
    try {
      const res = await fetch('/api/prompts/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
        setToast({
          kind: 'error',
          message: errBody?.error ?? 'Run failed',
        });
        return;
      }
      const body = (await res.json()) as BatchResult;
      setToast({
        kind: 'success',
        message: `Batch complete — ${body.totalRuns} runs · ${formatCost(body.runTotalCost)}`,
      });
      onBatchComplete?.();
    } catch (err) {
      setToast({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Run failed',
      });
    } finally {
      setRunning(false);
    }
  }, [running, onBatchComplete]);

  return (
    <aside
      data-testid="sidebar"
      className="fixed inset-y-0 left-0 z-30 flex w-[200px] flex-col border-r border-border/40"
      style={{ backgroundColor: '#0d0d10' }}
    >
      <div className="flex items-center gap-2 px-4 pt-5 pb-6">
        <span
          aria-hidden="true"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary"
        >
          <Layers className="h-4 w-4" />
        </span>
        <span className="font-semibold text-[14px] text-foreground tracking-tight">Luminaire</span>
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-2">
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-active={active || undefined}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors duration-150',
                active
                  ? 'bg-white/[0.06] text-foreground'
                  : 'text-muted-foreground hover:bg-white/[0.03] hover:text-foreground',
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  'h-4 w-4',
                  active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2 p-3">
        {toast && (
          <div
            role="status"
            data-toast={toast.kind}
            className={cn(
              'rounded-md px-3 py-2 text-[11px] leading-snug',
              toast.kind === 'success'
                ? 'bg-primary/10 text-primary'
                : 'bg-destructive/10 text-destructive',
            )}
          >
            {toast.message}
          </div>
        )}
        <Button
          variant="primary"
          fullWidth
          loading={running}
          onClick={handleRunAll}
          leftIcon={!running ? <Play className="h-3.5 w-3.5" /> : undefined}
          data-testid="run-all-prompts"
        >
          {running ? 'Running…' : 'Run All Prompts'}
        </Button>
      </div>
    </aside>
  );
}
