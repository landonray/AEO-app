import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PromptsTab } from '@/components/dashboard/PromptsTab';
import { getLastRunTimestamp, getPrimaryBrand } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PromptsPage() {
  const brand = await getPrimaryBrand();
  if (!brand) {
    redirect('/');
  }
  const lastUpdated = await getLastRunTimestamp(brand.id);

  return (
    <DashboardShell brandName={brand.name} lastUpdated={lastUpdated}>
      <PromptsTab />
    </DashboardShell>
  );
}
