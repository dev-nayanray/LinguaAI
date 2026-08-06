import * as React from 'react';

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from '@ui/icons';
import { cn } from '@ui/lib/cn';

import { Button } from '../button';
import { Skeleton } from '../ui/skeleton';

export interface ColumnDef<T> {
  id: string;
  header: string;
  accessor: (row: T) => React.ReactNode;
  /** Opts this column into sorting when the table-level `sortable` prop is also true. Default `false` — most columns (actions, avatars) aren't meaningfully sortable. */
  sortable?: boolean;
  /** The value sorting compares. Required whenever `accessor` returns JSX rather than a plain string/number, since sorting can't read a comparable value out of a rendered node. */
  sortValue?: (row: T) => string | number;
}

type SortDirection = 'ascending' | 'descending';

interface SortState {
  columnId: string;
  direction: SortDirection;
}

export interface AdminDataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  /** Unique key per row — required since `data` is arbitrary `T` (same reasoning as `Combobox`'s `getOptionValue`). */
  getRowId: (row: T) => string;
  /** Table-wide sort switch; individual columns still opt in via their own `sortable`. Default `true`. */
  sortable?: boolean;
  pageSize?: number;
  loading?: boolean;
  emptyMessage?: string;
  error?: { message: string; onRetry?: () => void };
  disabled?: boolean;
  /** Accessible name for the table (rendered as a visually-hidden `<caption>`). */
  caption: string;
  className?: string;
}

/**
 * E3 §12.4/§12.5 admin data table — sort/filter/paginate, `aria-sort` on
 * sortable headers, paginated via an internal, uncontrolled page index
 * (the contract's `pageSize` prop has no paired `page`/`onPageChange`, so
 * this owns its own pagination state rather than requiring the caller to).
 *
 * One of the eight components requiring mandatory manual screen-reader
 * verification (§12.5); that pass has not been performed — see the T14
 * report. Row-selection checkboxes, mentioned in the disabled-state
 * description of this component's own contract, are not implemented: no
 * selection prop (`selectable`, `onSelectionChange`, or similar) appears
 * anywhere in this contract's enumerated Props, so building selection UI
 * here would be inventing an unspecified feature rather than implementing
 * a documented one — flagged as a doc gap in the T14 report, not silently
 * resolved either by adding or by ignoring the mention.
 */
export function AdminDataTable<T>({
  columns,
  data,
  getRowId,
  sortable = true,
  pageSize = 10,
  loading = false,
  emptyMessage = 'No results found.',
  error,
  disabled = false,
  caption,
  className,
}: AdminDataTableProps<T>) {
  const [sort, setSort] = React.useState<SortState | null>(null);
  const [page, setPage] = React.useState(0);
  const [focusedRow, setFocusedRow] = React.useState(0);
  const rowRefs = React.useRef<Array<HTMLTableRowElement | null>>([]);

  const sortedData = React.useMemo(() => {
    if (!sort) return data;
    const column = columns.find((c) => c.id === sort.columnId);
    if (!column) return data;
    const getValue =
      column.sortValue ?? ((row: T) => column.accessor(row) as unknown as string | number);

    return [...data].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (va < vb) return sort.direction === 'ascending' ? -1 : 1;
      if (va > vb) return sort.direction === 'ascending' ? 1 : -1;
      return 0;
    });
  }, [data, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = sortedData.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  // A sort or page change invalidates the previous page's row indices —
  // resetting keeps `focusedRow`/the clamped page index from pointing at a
  // row that no longer exists at that position.
  React.useEffect(() => {
    setPage(0);
  }, [sort]);

  React.useEffect(() => {
    setFocusedRow(0);
  }, [clampedPage]);

  function handleSort(column: ColumnDef<T>) {
    if (disabled || !sortable || !column.sortable) return;
    setSort((prev) => {
      if (!prev || prev.columnId !== column.id)
        return { columnId: column.id, direction: 'ascending' };
      if (prev.direction === 'ascending') return { columnId: column.id, direction: 'descending' };
      return null;
    });
  }

  function handleRowKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>, index: number) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = Math.min(index + 1, pageRows.length - 1);
      setFocusedRow(next);
      rowRefs.current[next]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = Math.max(index - 1, 0);
      setFocusedRow(prev);
      rowRefs.current[prev]?.focus();
    }
  }

  const showLoading = loading;
  const showError = !loading && Boolean(error);
  const showEmpty = !loading && !error && sortedData.length === 0;
  const showRows = !loading && !error && sortedData.length > 0;

  return (
    <div className={cn('overflow-hidden rounded-md border border-border', className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border bg-surface-muted">
              {columns.map((column) => {
                const isSortable = sortable && column.sortable;
                const isActive = sort?.columnId === column.id;
                const ariaSort = isSortable ? (isActive ? sort.direction : 'none') : undefined;

                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={ariaSort}
                    className="px-4 py-2 type-body-sm font-semibold text-text"
                  >
                    {isSortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(column)}
                        disabled={disabled}
                        aria-disabled={disabled || undefined}
                        className="inline-flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {column.header}
                        {isActive && sort.direction === 'ascending' && (
                          <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                        {isActive && sort.direction === 'descending' && (
                          <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                        {!isActive && (
                          <ChevronsUpDown
                            aria-hidden="true"
                            className="h-3.5 w-3.5 text-neutral-text"
                          />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {showLoading &&
              Array.from({ length: pageSize }, (_, index) => (
                <tr key={`skeleton-${index}`} className="border-b border-border last:border-0">
                  {columns.map((column) => (
                    <td key={column.id} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))}

            {showError && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center">
                  <p role="alert" className="type-body-sm text-danger-text">
                    {error?.message}
                  </p>
                  {error?.onRetry && (
                    <Button
                      variant="secondary"
                      size="default"
                      className="mt-3"
                      onClick={error.onRetry}
                    >
                      Retry
                    </Button>
                  )}
                </td>
              </tr>
            )}

            {showEmpty && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center type-body-sm text-neutral-text"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}

            {showRows &&
              pageRows.map((row, index) => (
                <tr
                  key={getRowId(row)}
                  ref={(el) => {
                    rowRefs.current[index] = el;
                  }}
                  tabIndex={index === focusedRow ? 0 : -1}
                  onFocus={() => setFocusedRow(index)}
                  onKeyDown={(event) => handleRowKeyDown(event, index)}
                  className="border-b border-border last:border-0 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset"
                >
                  {columns.map((column) => (
                    <td key={column.id} className="px-4 py-3 type-body-sm text-text">
                      {column.accessor(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
        <p aria-live="polite" className="type-caption text-neutral-text">
          Page {clampedPage + 1} of {pageCount}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            disabled={disabled || clampedPage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            disabled={disabled || clampedPage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            aria-label="Next page"
          >
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
