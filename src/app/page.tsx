import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import type { BrandResponse, SetupDbResponse } from '@/types';

export const dynamic = 'force-dynamic';

async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('host') ?? `localhost:${process.env.PORT ?? '4810'}`;
  const proto =
    h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export default async function Home() {
  const origin = await getOrigin();

  const setupRes = await fetch(`${origin}/api/setup-db`, { cache: 'no-store' });
  if (setupRes.ok) {
    const setup = (await setupRes.json()) as SetupDbResponse;
    if (!setup.allTablesExist) {
      redirect('/setup');
    }
  } else {
    redirect('/setup');
  }

  const brandRes = await fetch(`${origin}/api/brand`, { cache: 'no-store' });
  if (brandRes.ok) {
    const body = (await brandRes.json()) as BrandResponse;
    if (body.brand) {
      redirect('/dashboard');
    }
  }

  return <OnboardingFlow />;
}
