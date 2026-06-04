'use client';

import {
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional header label rendered uppercase + spaced (e.g. "PROMPT DETAIL"). */
  label?: string;
  /** Optional title block — usually long-form text (e.g. the prompt). */
  title?: ReactNode;
  children?: ReactNode;
  /** Tailwind class for max width; defaults to `max-w-3xl` (matches §15 Tab 2 modal). */
  maxWidthClass?: string;
  /** Set false to suppress the built-in X button (rarely needed). */
  showCloseButton?: boolean;
  /** Class applied to the modal card. */
  className?: string;
  /** Class applied to the backdrop. */
  backdropClassName?: string;
}

export function Modal({
  open,
  onClose,
  label,
  title,
  children,
  maxWidthClass = 'max-w-3xl',
  showCloseButton = true,
  className,
  backdropClassName,
}: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    cardRef.current?.focus();
  }, [open]);

  const onBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="presentation"
      onMouseDown={onBackdropClick}
      data-modal-backdrop="true"
      className={cn(
        'fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm',
        backdropClassName,
      )}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof label === 'string' ? label : undefined}
        tabIndex={-1}
        className={cn(
          'relative w-full overflow-y-auto rounded-lg border border-border/60 bg-card text-card-foreground',
          'max-h-[70vh] focus:outline-none',
          maxWidthClass,
          className,
        )}
      >
        {(label || title || showCloseButton) && (
          <div className="flex items-start justify-between gap-4 border-b border-border/40 p-5">
            <div className="min-w-0 flex-1">
              {label && (
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
                  {label}
                </div>
              )}
              {title && (
                <div className="mt-1 text-[13px] text-foreground">{title}</div>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="-m-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-white/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
