'use client';

import { cn } from '@/lib/utils';

export type OnboardingStep = 1 | 2 | 3;

export interface ProgressDotsProps {
  current: OnboardingStep;
}

const STEPS: { step: OnboardingStep; label: string }[] = [
  { step: 1, label: 'Website' },
  { step: 2, label: 'Analyzing' },
  { step: 3, label: 'Review & Launch' },
];

export function ProgressDots({ current }: ProgressDotsProps) {
  return (
    <div
      role="group"
      aria-label="Onboarding progress"
      data-testid="onboarding-progress"
      className="flex items-center justify-center gap-3 text-[11px] text-muted-foreground"
    >
      {STEPS.map(({ step, label }, idx) => {
        const isActive = step === current;
        const isComplete = step < current;
        return (
          <div key={step} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                data-state={isActive ? 'active' : isComplete ? 'complete' : 'pending'}
                className={cn(
                  'inline-block h-2 w-2 rounded-full transition-colors duration-150',
                  isActive && 'bg-primary',
                  isComplete && 'bg-primary/70',
                  !isActive && !isComplete && 'bg-white/[0.12]',
                )}
              />
              <span
                className={cn(
                  'tabular-nums',
                  isActive && 'text-foreground font-medium',
                )}
              >
                {label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <span aria-hidden="true" className="text-muted-foreground/40">
                →
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
