'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

export interface MarkdownProps {
  /** Raw markdown text (e.g. an LLM response). */
  children: string;
  className?: string;
}

/**
 * Renders untrusted markdown (LLM responses) as formatted HTML, styled to fit
 * the dense, muted look of the dashboard panels. GitHub-flavored markdown
 * (tables, task lists, strikethrough, autolinks) is supported. Raw HTML in the
 * source is NOT rendered — it's treated as plain text — so model output can't
 * inject markup. Only the element types we map below are produced; everything
 * else falls back to react-markdown's safe defaults.
 */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div
      className={cn(
        'space-y-2 text-[12px] leading-relaxed text-muted-foreground',
        'break-words [&>:first-child]:mt-0',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-primary underline-offset-2 hover:underline"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          del: ({ children }) => <del className="line-through">{children}</del>,
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-5">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="marker:text-muted-foreground/50">{children}</li>
          ),
          h1: ({ children }) => (
            <h3 className="text-[13px] font-semibold text-foreground">{children}</h3>
          ),
          h2: ({ children }) => (
            <h3 className="text-[13px] font-semibold text-foreground">{children}</h3>
          ),
          h3: ({ children }) => (
            <h4 className="text-[12px] font-semibold text-foreground">{children}</h4>
          ),
          h4: ({ children }) => (
            <h4 className="text-[12px] font-semibold text-foreground">{children}</h4>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-3 italic text-muted-foreground/80">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[11px] text-foreground">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-md bg-white/[0.04] p-3 text-[11px] [&_code]:bg-transparent [&_code]:px-0 [&_code]:py-0">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[11px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border/40 px-2 py-1 text-left font-semibold text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border/40 px-2 py-1 align-top">{children}</td>
          ),
          hr: () => <hr className="border-border/40" />,
          // Remote images would be jarring (and a tracking vector) in this
          // compact panel — skip them.
          img: () => null,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
