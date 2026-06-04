import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { OverviewTab } from '@/components/dashboard/OverviewTab';
import type { OverviewResponse } from '@/types';

export const dynamic = 'force-dynamic';

interface DashboardPageProps {
  searchParams?: Promise<{ days?: string; model?: string }>;
}

function buildOverviewUrl(
  origin: string,
  days: string | undefined,
  model: string | undefined,
): string {
  const url = new URL('/api/overview', origin);
  if (days) url.searchParams.set('days', days);
  if (model) url.searchParams.set('model', model);
  return url.toString();
}

// Server-to-self call on the same machine: always target the local loopback,
// never the public Host header. Through a tunnel (e.g. Cloudflare Access),
// using the public origin would route this back out and hit the auth wall,
// returning an HTML login page instead of JSON.
function getInternalOrigin(): string {
  return `http://127.0.0.1:${process.env.PORT ?? '4810'}`;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = (await searchParams) ?? {};
  const origin = getInternalOrigin();
  const url = buildOverviewUrl(origin, params.days, params.model);

  const res = await fetch(url, { cache: 'no-store' });

  if (res.status === 404) {
    notFound();
  }

  if (!res.ok) {
    return (
      <DashboardShell brandName="Ontraport AEO" lastUpdated={null}>
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-5 text-[13px] text-destructive"
        >
          Failed to load dashboard data ({res.status}). Try refreshing the page.
        </div>
      </DashboardShell>
    );
  }

  const data = (await res.json()) as OverviewResponse;

  return (
    <DashboardShell brandName={data.brand.name} lastUpdated={data.lastUpdated}>
      <OverviewTab data={data} />
    </DashboardShell>
  );
}
