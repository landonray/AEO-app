import { Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EM_DASH, formatPercentInt } from './overviewFormat';

export interface AISearchImpactProps {
  competitiveRank: number | null;
  visibility: number;
  totalCitations: number;
  keyInsight: string;
  className?: string;
}

interface RingProps {
  label: string;
  value: string;
  testId: string;
  // Tailwind class for the colored text + ring + background tint.
  colorScheme: 'primary' | 'blue' | 'amber';
}

const SCHEME_CLASSES = {
  primary: {
    text: 'text-primary',
    ring: 'ring-primary/20',
    bg: 'bg-primary/10',
  },
  blue: {
    text: 'text-blue-400',
    ring: 'ring-blue-500/20',
    bg: 'bg-blue-500/10',
  },
  amber: {
    text: 'text-amber-400',
    ring: 'ring-amber-500/20',
    bg: 'bg-amber-500/10',
  },
} as const;

function Ring({ label, value, testId, colorScheme }: RingProps) {
  const c = SCHEME_CLASSES[colorScheme];
  return (
    <div
      data-testid={testId}
      className="flex flex-col items-center gap-2"
    >
      <div
        className={cn(
          'flex h-24 w-24 items-center justify-center rounded-full ring-1',
          c.ring,
          c.bg,
        )}
      >
        <span
          data-testid={`${testId}-value`}
          className={cn('text-[22px] font-semibold tabular-nums', c.text)}
        >
          {value}
        </span>
      </div>
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
        {label}
      </span>
    </div>
  );
}

export function AISearchImpact({
  competitiveRank,
  visibility,
  totalCitations,
  keyInsight,
  className,
}: AISearchImpactProps) {
  const rankDisplay =
    competitiveRank === null || competitiveRank === undefined || !Number.isFinite(competitiveRank)
      ? EM_DASH
      : `#${competitiveRank}`;
  const visibilityDisplay = formatPercentInt(visibility);
  const citationsDisplay = Number.isFinite(totalCitations)
    ? totalCitations.toLocaleString()
    : '0';

  return (
    <section
      data-testid="ai-search-impact"
      className={cn('rounded-lg border border-border/40 bg-card/60 p-5', className)}
      aria-label="AI Search Impact"
    >
      <header className="mb-4">
        <h3 className="text-[13px] font-semibold text-foreground">AI Search Impact</h3>
        <p className="text-[11px] text-muted-foreground">
          How you show up across generative answer surfaces.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-4 px-2">
        <Ring
          label="Competitive Rank"
          value={rankDisplay}
          testId="ai-impact-rank"
          colorScheme="primary"
        />
        <Ring
          label="AI Visibility"
          value={visibilityDisplay}
          testId="ai-impact-visibility"
          colorScheme="blue"
        />
        <Ring
          label="Total Citations"
          value={citationsDisplay}
          testId="ai-impact-citations"
          colorScheme="amber"
        />
      </div>

      <div
        data-testid="ai-impact-key-insight"
        className="mt-5 flex gap-3 rounded-md bg-white/[0.02] p-4"
      >
        <Lightbulb
          aria-hidden
          className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning"
        />
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
            Key Insight
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-foreground">
            {keyInsight}
          </p>
        </div>
      </div>
    </section>
  );
}
