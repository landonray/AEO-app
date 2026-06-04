import { cn, formatPercent } from '@/lib/utils';
import type { SourceRow, SourcesView } from '@/types';
import { domainTypeColor } from './DomainTypesPanel';

export const SOURCES_EMPTY_MESSAGE =
  'No sources retrieved for this model in the selected window.';

export interface SourcesTableProps {
  rows: ReadonlyArray<SourceRow>;
  view: SourcesView;
  className?: string;
  /** Cap the number of rows rendered (used by the Overview "Top Domains" preview). */
  maxRows?: number;
  emptyMessage?: string;
}

function rowLabel(row: SourceRow, view: SourcesView): string {
  if (view === 'urls') return row.url ?? row.domain;
  return row.domain;
}

export function SourcesTable({
  rows,
  view,
  className,
  maxRows,
  emptyMessage = SOURCES_EMPTY_MESSAGE,
}: SourcesTableProps) {
  if (rows.length === 0) {
    return (
      <div
        data-testid="sources-table-empty"
        role="status"
        className={cn(
          'flex w-full items-center justify-center rounded-lg border border-dashed border-border/40 bg-card/40 px-6 py-10 text-center text-[12px] text-muted-foreground',
          className,
        )}
      >
        {emptyMessage}
      </div>
    );
  }

  const visible =
    typeof maxRows === 'number' && maxRows > 0 ? rows.slice(0, maxRows) : rows;
  const headerLabel = view === 'urls' ? 'URL' : 'Domain';

  return (
    <div
      data-testid="sources-table"
      data-view={view}
      className={cn(
        'overflow-hidden rounded-lg border border-border/40 bg-card/60',
        className,
      )}
    >
      <table className="w-full table-fixed text-left text-[13px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground/40">
            <th scope="col" className="w-10 py-3 pl-5 pr-2 font-medium">
              #
            </th>
            <th scope="col" className="py-3 pr-3 font-medium">
              {headerLabel}
            </th>
            <th scope="col" className="w-28 py-3 pr-3 font-medium">
              Type
            </th>
            <th scope="col" className="w-44 py-3 pr-3 font-medium">
              Retrieved
            </th>
            <th scope="col" className="w-28 py-3 pr-5 text-right font-medium">
              Citation Rate
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row, idx) => {
            const label = rowLabel(row, view);
            const color = domainTypeColor(row.type);
            const retrievedPct = Math.max(
              0,
              Math.min(100, row.retrievalRate * 100),
            );
            const rowKey =
              view === 'urls' && row.url
                ? `${row.domain}:${row.url}`
                : row.domain;
            return (
              <tr
                key={`${rowKey}:${idx}`}
                data-testid="sources-row"
                className="border-t border-border/30 transition-colors duration-150 hover:bg-white/[0.015]"
              >
                <td className="py-2.5 pl-5 pr-2 align-middle tabular-nums text-muted-foreground">
                  {idx + 1}
                </td>
                <td
                  className="py-2.5 pr-3 align-middle text-foreground"
                  title={label}
                >
                  <span className="block truncate">{label}</span>
                </td>
                <td className="py-2.5 pr-3 align-middle">
                  <span
                    data-testid="type-badge"
                    data-type={row.type}
                    className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                    style={{
                      color,
                      backgroundColor: `${color}1f`,
                    }}
                  >
                    <span
                      aria-hidden
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    {row.type}
                  </span>
                </td>
                <td className="py-2.5 pr-3 align-middle">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-1 w-24 overflow-hidden rounded-full bg-white/[0.04]"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(retrievedPct)}
                      aria-label={`${label} retrieval rate`}
                    >
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${retrievedPct}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-[12px] text-muted-foreground">
                      {formatPercent(row.retrievalRate)}
                    </span>
                  </div>
                </td>
                <td className="py-2.5 pr-5 text-right align-middle tabular-nums text-foreground">
                  {formatPercent(row.citationRate)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default SourcesTable;
