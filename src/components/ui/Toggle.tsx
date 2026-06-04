'use client';

import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ToggleOption<T extends string = string> {
  value: T;
  label: ReactNode;
}

export interface ToggleProps<T extends string = string>
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  options: ToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}

export function Toggle<T extends string = string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  ...props
}: ToggleProps<T>) {
  return (
    <div
      role="group"
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-white/[0.04] p-1',
        className,
      )}
      {...props}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            data-active={active || undefined}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded font-medium transition-colors duration-150',
              size === 'sm' ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-[12px]',
              active
                ? 'bg-white/[0.08] text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
