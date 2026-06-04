'use client';

import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Input } from '@/components/ui';
import type { CreatePromptResponse } from '@/types';

export interface AddPromptFormProps {
  /** Existing topic strings the user can pick from. Always merged with the spec's five base topics. */
  existingTopics: string[];
  /** Called after a successful POST. The parent typically refetches the prompts list. */
  onCreated: (newId: string) => void;
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
}

const BASE_TOPICS = ['Category', 'Competitor', 'Affiliate', 'Core', 'Free tool'];

function dedupeTopics(...sources: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of sources) {
    for (const t of list) {
      const trimmed = (t ?? '').trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

export function buildSuggestions(
  topicInput: string,
  existing: string[],
): string[] {
  const all = dedupeTopics(BASE_TOPICS, existing);
  const q = topicInput.trim().toLowerCase();
  if (!q) return all;
  return all.filter((t) => t.toLowerCase().includes(q));
}

interface TopicInputProps {
  value: string;
  onChange: (next: string) => void;
  suggestions: string[];
  invalid: boolean;
  inputId: string;
  listboxId: string;
}

function TopicInput({
  value,
  onChange,
  suggestions,
  invalid,
  inputId,
  listboxId,
}: TopicInputProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-[200px]">
      <Input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        value={value}
        invalid={invalid}
        placeholder="Topic"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        className="pr-7"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => setOpen((v) => !v)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
      >
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && suggestions.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border/60 bg-[#161619] p-2 shadow-xl"
        >
          {suggestions.map((s) => {
            const selected = s.toLowerCase() === value.trim().toLowerCase();
            return (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={selected}
                data-selected={selected || undefined}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center rounded px-2 py-1.5 text-left text-[12px] transition-colors duration-150',
                  selected
                    ? 'bg-white/[0.06] text-foreground'
                    : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
                )}
              >
                {s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AddPromptForm({
  existingTopics,
  onCreated,
  fetchImpl,
}: AddPromptFormProps) {
  const [text, setText] = useState('');
  const [topic, setTopic] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reactId = useId();
  const textId = `add-prompt-text-${reactId}`;
  const topicId = `add-prompt-topic-${reactId}`;
  const listboxId = `add-prompt-topic-list-${reactId}`;

  const trimmedText = text.trim();
  const trimmedTopic = topic.trim();
  const canSubmit = trimmedText.length > 0 && trimmedTopic.length > 0 && !submitting;

  const suggestions = useMemo(
    () => buildSuggestions(topic, existingTopics),
    [topic, existingTopics],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!canSubmit) return;
      setSubmitting(true);
      setError(null);
      try {
        const f = fetchImpl ?? fetch;
        const res = await f('/api/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmedText, topic: trimmedTopic }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? `Failed (${res.status})`);
        }
        const body = (await res.json()) as CreatePromptResponse;
        setText('');
        setTopic('');
        onCreated(body.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add prompt');
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, trimmedText, trimmedTopic, fetchImpl, onCreated],
  );

  return (
    <form
      data-testid="add-prompt-form"
      onSubmit={handleSubmit}
      className="rounded-lg border border-border/40 bg-card/60 p-3"
    >
      <div className="flex flex-wrap items-start gap-2">
        <label htmlFor={textId} className="sr-only">
          Prompt text
        </label>
        <Input
          id={textId}
          value={text}
          placeholder="Type a buyer-intent prompt…"
          onChange={(e) => setText(e.target.value)}
          className="min-w-[260px] flex-1"
          disabled={submitting}
        />
        <label htmlFor={topicId} className="sr-only">
          Topic
        </label>
        <TopicInput
          value={topic}
          onChange={setTopic}
          suggestions={suggestions}
          invalid={false}
          inputId={topicId}
          listboxId={listboxId}
        />
        <Button
          type="submit"
          variant="primary"
          loading={submitting}
          disabled={!canSubmit}
          leftIcon={!submitting ? <Plus className="h-3.5 w-3.5" /> : undefined}
        >
          Add
        </Button>
      </div>
      {error && (
        <div
          role="alert"
          className="mt-2 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive"
        >
          {error}
        </div>
      )}
    </form>
  );
}
