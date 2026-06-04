'use client';

import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  count?: number;
}

export interface TabsProps<T extends string = string> extends HTMLAttributes<HTMLDivElement> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: 'pills' | 'underline';
}

export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  variant = 'pills',
  className,
  ...props
}: TabsProps<T>) {
  if (variant === 'underline') {
    return (
      <div
        role="tablist"
        className={cn('flex items-center gap-4 border-b border-border/40', className)}
        {...props}
      >
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              role="tab"
              type="button"
              aria-selected={active}
              data-active={active || undefined}
              onClick={() => onChange(item.value)}
              className={cn(
                'relative -mb-px px-1 pb-2 text-[13px] font-medium transition-colors duration-150',
                active
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                {item.label}
                {item.count !== undefined && (
                  <span className="rounded bg-white/[0.06] px-1 text-[10px] tabular-nums text-muted-foreground">
                    {item.count}
                  </span>
                )}
              </span>
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-px h-px bg-primary"
                />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-white/[0.04] p-1',
        className,
      )}
      {...props}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            data-active={active || undefined}
            onClick={() => onChange(item.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-3 py-1 text-[12px] font-medium transition-colors duration-150',
              active
                ? 'bg-white/[0.08] text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className="rounded bg-white/[0.06] px-1 text-[10px] tabular-nums text-muted-foreground">
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
