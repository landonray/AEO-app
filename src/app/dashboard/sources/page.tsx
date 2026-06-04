import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { SourcesTab } from '@/components/dashboard/SourcesTab';
import { getLastRunTimestamp, getPrimaryBrand } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SourcesPage() {
  const brand = await getPrimaryBrand();

  if (!brand) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="max-w-md rounded-lg border border-border/40 bg-card/60 p-8 text-center">
          <h1 className="text-xl font-semibold">No brand configured</h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Complete onboarding before viewing the Sources tab.
          </p>
        </div>
      </main>
    );
  }

  const lastUpdated = await getLastRunTimestamp(brand.id);

  return (
    <DashboardShell brandName={brand.name} lastUpdated={lastUpdated}>
      <SourcesTab />
    </DashboardShell>
  );
}
