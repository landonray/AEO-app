import { redirect } from 'next/navigation';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import type { BrandResponse, SetupDbResponse } from '@/types';

export const dynamic = 'force-dynamic';

// These are server-side calls from the app to its own API on the same machine,
// so they must target the local loopback — never the public Host header. When
// reached through a tunnel (e.g. Cloudflare Access), reconstructing the public
// origin would send this request back out and hit the auth wall, returning an
// HTML login page instead of JSON.
function getOrigin(): string {
  return `http://127.0.0.1:${process.env.PORT ?? '4810'}`;
}

export default async function Home() {
  const origin = getOrigin();

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
