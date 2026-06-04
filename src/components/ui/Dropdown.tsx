'use client';

import {
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DropdownOption<T extends string = string> {
  value: T;
  label: ReactNode;
  /** Optional color dot (CSS color string) shown to the left of the label. */
  dotColor?: string;
}

export interface DropdownProps<T extends string = string>
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Optional label shown to the left of the selected value (e.g. "Range:"). */
  label?: string;
  /** Override the trigger contents entirely. */
  triggerContent?: ReactNode;
  align?: 'left' | 'right';
  placeholder?: string;
  disabled?: boolean;
}

export function Dropdown<T extends string = string>({
  options,
  value,
  onChange,
  label,
  triggerContent,
  align = 'left',
  placeholder = 'Select…',
  disabled = false,
  className,
  ...props
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const selected = options.find((o) => o.value === value);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

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
        close();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)} {...props}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-md border border-border/40 bg-white/[0.02] px-2.5 text-[12px] font-medium text-foreground',
          'hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60',
          'disabled:cursor-not-allowed disabled:opacity-50 transition-colors duration-150',
        )}
      >
        {triggerContent ?? (
          <>
            {label && (
              <span className="text-muted-foreground">{label}</span>
            )}
            {selected ? (
              <span className="inline-flex items-center gap-1.5">
                {selected.dotColor && (
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: selected.dotColor }}
                  />
                )}
                {selected.label}
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground transition-transform duration-150',
                open && 'rotate-180',
              )}
            />
          </>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="listbox"
          tabIndex={-1}
          className={cn(
            'absolute top-full z-50 mt-1 min-w-[160px] rounded-lg border border-border/60 bg-[#161619] p-2 shadow-xl',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-selected={isSelected || undefined}
                onClick={() => {
                  onChange(opt.value);
                  close();
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition-colors duration-150',
                  isSelected
                    ? 'bg-white/[0.06] text-foreground'
                    : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
                )}
              >
                {opt.dotColor && (
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: opt.dotColor }}
                  />
                )}
                <span className="flex-1">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
