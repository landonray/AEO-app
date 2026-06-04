'use client';

import { useEffect, useState } from 'react';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { Spinner } from '@/components/ui/Spinner';
import type { BrandResponse } from '@/types';

type PageState =
  | { kind: 'loading' }
  | { kind: 'onboarding' }
  | { kind: 'ready'; brandName: string }
  | { kind: 'error'; message: string };

export default function Home() {
  const [state, setState] = useState<PageState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/brand', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`brand request failed (${res.status})`);
        }
        const body = (await res.json()) as BrandResponse;
        if (cancelled) return;
        if (!body.brand) {
          setState({ kind: 'onboarding' });
        } else {
          setState({ kind: 'ready', brandName: body.brand.name });
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Could not load app state';
        setState({ kind: 'error', message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Spinner size="lg" />
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[13px] text-destructive">{state.message}</p>
      </main>
    );
  }

  if (state.kind === 'onboarding') {
    return <OnboardingFlow />;
  }

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center"
      data-testid="dashboard-placeholder"
    >
      <h1 className="text-xl font-semibold text-foreground">Luminaire</h1>
      <p className="text-[13px] text-muted-foreground">
        Tracking {state.brandName}. Dashboard coming soon.
      </p>
    </main>
  );
}
