import { Link2, MessageSquare } from 'lucide-react';
import { ModelIcon, MODEL_ORDER } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ModelShortId, RecentChatRow } from '@/types';
import {
  EM_DASH,
  formatPosition,
  formatSentimentScore,
  formatShortDate,
  sentimentDotColor,
  truncatePromptText,
} from './overviewFormat';

export interface RecentChatsProps {
  chats: RecentChatRow[];
  className?: string;
  // Up to 3 columns per §15.G.
  maxColumns?: 1 | 2 | 3;
}

function ChatCard({ chat }: { chat: RecentChatRow }) {
  const activeSet = new Set<ModelShortId>(chat.models);
  const { color: sentimentColor } = sentimentDotColor(chat.sentiment?.score ?? null);
  const sentimentText = formatSentimentScore(chat.sentiment?.score ?? null);
  const positionText = chat.position === null ? EM_DASH : formatPosition(chat.position);
  const dateText = formatShortDate(chat.date);

  return (
    <article
      data-testid="recent-chat-card"
      className="flex h-full flex-col gap-3 rounded-lg border border-border/40 bg-card/60 p-4"
    >
      <div className="flex gap-2">
        <MessageSquare
          aria-hidden
          className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
        />
        <p className="text-[12px] leading-snug text-foreground">
          {truncatePromptText(chat.text)}
        </p>
      </div>

      <div
        data-testid="recent-chat-models"
        className="flex items-center gap-1"
        aria-label="Models with runs"
      >
        {MODEL_ORDER.map((m) => (
          <ModelIcon
            key={m}
            model={m}
            size="sm"
            dimmed={!activeSet.has(m)}
            data-testid={`recent-chat-model-${m}`}
          />
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/30 pt-2.5 text-[11px] tabular-nums">
        <span
          data-testid="recent-chat-citations"
          className="inline-flex items-center gap-1 text-muted-foreground"
        >
          <Link2 aria-hidden className="h-3 w-3" />
          {chat.citationCount}
        </span>
        <span
          data-testid="recent-chat-sentiment"
          className="inline-flex items-center gap-1.5 text-foreground"
        >
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: sentimentColor }}
          />
          {sentimentText}
        </span>
        <span data-testid="recent-chat-position" className="text-foreground">
          {positionText}
        </span>
        <span data-testid="recent-chat-date" className="text-muted-foreground">
          {dateText}
        </span>
      </div>
    </article>
  );
}

const COLUMN_CLASSES: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
};

export function RecentChats({ chats, className, maxColumns = 3 }: RecentChatsProps) {
  return (
    <section
      data-testid="recent-chats"
      className={cn('rounded-lg border border-border/40 bg-card/60 p-5', className)}
      aria-label="Recent Chats"
    >
      <header className="mb-4">
        <h3 className="text-[13px] font-semibold text-foreground">Recent Chats</h3>
        <p className="text-[11px] text-muted-foreground">
          Latest prompts and the models that have answered them.
        </p>
      </header>

      {chats.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/40 bg-white/[0.01] p-6 text-center text-[12px] text-muted-foreground">
          No prompt runs in the selected window yet.
        </div>
      ) : (
        <div className={cn('grid gap-3', COLUMN_CLASSES[maxColumns])}>
          {chats.map((chat) => (
            <ChatCard key={chat.promptId} chat={chat} />
          ))}
        </div>
      )}
    </section>
  );
}
