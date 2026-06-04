import { ExternalLink, FileText } from 'lucide-react';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ActionCard } from '@/types';

export interface ActionCardsProps {
  actions: ActionCard[];
  className?: string;
}

const PRIORITY_BORDER: Record<ActionCard['priority'], string> = {
  high: 'border-l-destructive',
  medium: 'border-l-warning',
  low: 'border-l-blue-500',
};

const PRIORITY_LABEL: Record<ActionCard['priority'], string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function ActionRow({ action }: { action: ActionCard }) {
  const isEarned = action.side === 'earned';
  const Icon = isEarned ? ExternalLink : FileText;
  const iconColor = isEarned ? 'text-blue-400' : 'text-primary';
  return (
    <div
      data-testid="action-card"
      data-side={action.side}
      data-priority={action.priority}
      className={cn(
        'flex gap-3 rounded-md border border-border/30 border-l-2 bg-white/[0.015] p-3',
        PRIORITY_BORDER[action.priority],
      )}
    >
      <Icon aria-hidden className={cn('mt-0.5 h-4 w-4 flex-shrink-0', iconColor)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-[12px] font-semibold text-foreground">{action.title}</h4>
          <Badge priority={action.priority}>{PRIORITY_LABEL[action.priority]}</Badge>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {action.description}
        </p>
      </div>
    </div>
  );
}

function Column({
  side,
  title,
  subtitle,
  icon,
  actions,
}: {
  side: 'earned' | 'owned';
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  actions: ActionCard[];
}) {
  return (
    <section
      data-testid={`actions-${side}`}
      className="rounded-lg border border-border/40 bg-card/60 p-5"
    >
      <header className="mb-3 flex items-center gap-2">
        {icon}
        <div>
          <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </header>
      <div className="flex flex-col gap-2">
        {actions.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/40 bg-white/[0.01] p-4 text-center text-[11px] text-muted-foreground">
            No actions in this category.
          </div>
        ) : (
          actions.map((a, i) => <ActionRow key={`${a.side}-${a.priority}-${i}`} action={a} />)
        )}
      </div>
    </section>
  );
}

const PRIORITY_RANK: Record<ActionCard['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function ActionCards({ actions, className }: ActionCardsProps) {
  const sorted = [...actions].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );
  const earned = sorted.filter((a) => a.side === 'earned');
  const owned = sorted.filter((a) => a.side === 'owned');
  return (
    <div
      data-testid="action-cards"
      className={cn('grid grid-cols-1 gap-4 lg:grid-cols-2', className)}
    >
      <Column
        side="earned"
        title="Earned"
        subtitle="Off-page actions to influence external citations."
        icon={
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/15 text-blue-400">
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          </span>
        }
        actions={earned}
      />
      <Column
        side="owned"
        title="Owned"
        subtitle="On-page actions to boost your domain in AI answers."
        icon={
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
            <FileText aria-hidden className="h-3.5 w-3.5" />
          </span>
        }
        actions={owned}
      />
    </div>
  );
}
