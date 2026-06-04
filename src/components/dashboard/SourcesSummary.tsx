import { cn } from '@/lib/utils';
import type { DomainTypeBreakdownRow, SourceRow } from '@/types';
import { domainTypeColor, formatPercentInt } from './overviewFormat';

export interface SourcesSummaryProps {
  sources: SourceRow[];
  domainTypes: DomainTypeBreakdownRow[];
  className?: string;
  maxRows?: number;
}

function ProgressBar({ value, color }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="relative h-1 w-16 overflow-hidden rounded-full bg-white/[0.05]">
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${pct * 100}%`, backgroundColor: color ?? '#8b8b92' }}
        aria-hidden
      />
    </div>
  );
}

function TopDomainsCard({
  sources,
  maxRows,
}: {
  sources: SourceRow[];
  maxRows: number;
}) {
  const rows = sources.slice(0, maxRows);
  return (
    <section
      data-testid="sources-summary-top-domains"
      className="rounded-lg border border-border/40 bg-card/60"
    >
      <header className="px-5 pt-4 pb-2">
        <h3 className="text-[13px] font-semibold text-foreground">Top Domains</h3>
        <p className="text-[11px] text-muted-foreground">
          Highest-retrieval domains across all models in this window.
        </p>
      </header>
      {rows.length === 0 ? (
        <div className="px-5 py-6 text-center text-[12px] text-muted-foreground">
          No sources retrieved in the selected window.
        </div>
      ) : (
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground/40">
              <th className="px-5 py-2 font-normal">#</th>
              <th className="py-2 font-normal">Domain</th>
              <th className="py-2 font-normal">Type</th>
              <th className="py-2 font-normal">Retrieved</th>
              <th className="px-5 py-2 text-right font-normal">Citation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, idx) => {
              const color = domainTypeColor(s.type);
              return (
                <tr
                  key={`${s.domain}-${idx}`}
                  data-testid="source-row"
                  className="border-b border-border/20 last:border-b-0 transition-colors hover:bg-white/[0.015]"
                >
                  <td className="px-5 py-2.5 tabular-nums text-muted-foreground/70">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 font-medium text-foreground">{s.domain}</td>
                  <td className="py-2.5">
                    <span
                      data-testid="source-type-badge"
                      data-type={s.type}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                      style={{
                        color,
                        backgroundColor: `${color}1f`,
                      }}
                    >
                      {s.type}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={s.retrievalRate} color={color} />
                      <span className="tabular-nums text-[12px] text-foreground">
                        {formatPercentInt(s.retrievalRate)}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-foreground">
                    {formatPercentInt(s.citationRate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function DomainTypesCard({ rows }: { rows: DomainTypeBreakdownRow[] }) {
  return (
    <section
      data-testid="sources-summary-domain-types"
      className="rounded-lg border border-border/40 bg-card/60 p-5"
    >
      <header className="mb-3">
        <h3 className="text-[13px] font-semibold text-foreground">Domain Types</h3>
        <p className="text-[11px] text-muted-foreground">
          Composition of cited sources by category.
        </p>
      </header>
      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/40 bg-white/[0.01] p-4 text-center text-[11px] text-muted-foreground">
          No citations to break down yet.
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((row) => {
            const color = domainTypeColor(row.type);
            const pct = Math.max(0, Math.min(1, row.percentage));
            return (
              <li
                key={row.type}
                data-testid="domain-type-row"
                data-type={row.type}
                className="flex items-center gap-2"
              >
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="w-24 text-[12px] text-foreground">{row.type}</span>
                <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${pct * 100}%`, backgroundColor: color }}
                    aria-hidden
                  />
                </div>
                <span className="w-10 text-right tabular-nums text-[12px] text-muted-foreground">
                  {formatPercentInt(row.percentage)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function SourcesSummary({
  sources,
  domainTypes,
  className,
  maxRows = 8,
}: SourcesSummaryProps) {
  return (
    <div
      data-testid="sources-summary"
      className={cn('grid grid-cols-1 gap-4 lg:grid-cols-3', className)}
    >
      <div className="lg:col-span-2">
        <TopDomainsCard sources={sources} maxRows={maxRows} />
      </div>
      <div className="lg:col-span-1">
        <DomainTypesCard rows={domainTypes} />
      </div>
    </div>
  );
}
