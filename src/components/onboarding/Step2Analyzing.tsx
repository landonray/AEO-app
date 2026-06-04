'use client';

import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';

export interface Step2AnalyzingProps {
  domain: string;
}

export function Step2Analyzing({ domain }: Step2AnalyzingProps) {
  return (
    <div className="w-full max-w-md mx-auto">
      <Card padded className="p-8" data-testid="onboarding-step-2">
        <div className="flex flex-col items-center gap-5 py-6">
          <Spinner size="lg" className="text-primary" label="Analyzing website" />
          <div className="text-center">
            <h2 className="text-[15px] font-semibold text-foreground">
              Analyzing {domain || 'your website'}
            </h2>
            <p className="mt-2 text-[12px] text-muted-foreground">
              Reading your site, generating buyer-intent prompts, and finding competitors…
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
