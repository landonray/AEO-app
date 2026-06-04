'use client';

import { useEffect, useState } from 'react';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import type { BrandResponse } from '@/types';

type BrandState =
  | { kind: 'unknown' }
  | { kind: 'no-brand' }
  | { kind: 'has-brand'; name: string };

export default function Home() {
  const [state, setState] = useState<BrandState>({ kind: 'unknown' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/brand', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setState({ kind: 'no-brand' });
          return;
        }
        const body = (await res.json()) as BrandResponse;
        if (cancelled) return;
        if (!body.brand) {
          setState({ kind: 'no-brand' });
        } else {
          setState({ kind: 'has-brand', name: body.brand.name });
        }
      } catch {
        if (cancelled) return;
        setState({ kind: 'no-brand' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'has-brand') {
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center"
        data-testid="dashboard-placeholder"
      >
        <h1 className="text-xl font-semibold text-foreground">Luminaire</h1>
        <p className="text-[13px] text-muted-foreground">
          Tracking {state.name}. Dashboard coming soon.
        </p>
      </main>
    );
  }

  return <OnboardingFlow />;
}
