import React, { useState } from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { Button } from "../ui/Button";
import { EmptyState } from "../feedback/EmptyState";
import { Skeleton } from "../feedback/Skeleton";

export interface ColumnSpec<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  defaultVisible?: boolean;
}

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnSpec<T>[];
  isLoading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;

  // Sorting
  sortKey?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string, direction: "asc" | "desc") => void;

  // Selection
  selectable?: boolean;
  selectedKeys?: string[] | number[];
  onSelectionChange?: (selectedRows: T[]) => void;
  getRowId?: (row: T) => string | number;

  // Pagination
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;

  // Actions
  rowActions?: (row: T) => React.ReactNode;
}

export function DataTable<T>({
  data,
  columns,
  isLoading = false,
  error = null,
  emptyMessage = "No se encontraron registros.",
  emptyAction,
  sortKey,
  sortDirection,
  onSort,
  selectable = false,
  selectedKeys = [],
  onSelectionChange,
  getRowId,
  currentPage,
  totalPages,
  onPageChange,
  rowActions,
}: DataTableProps<T>) {
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    columns.map((c) => c.key)
  );
  const [showConfig, setShowConfig] = useState(false);

  const handleHeaderClick = (column: ColumnSpec<T>) => {
    if (!column.sortable || !onSort) return;
    const isCurrent = sortKey === column.key;
    const newDir = isCurrent && sortDirection === "asc" ? "desc" : "asc";
    onSort(column.key, newDir);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onSelectionChange || !getRowId) return;
    if (e.target.checked) {
      onSelectionChange(data);
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectRow = (row: T, checked: boolean) => {
    if (!onSelectionChange || !getRowId) return;
    const rowId = getRowId(row);
    const updated = checked
      ? [...data.filter((r) => (selectedKeys as any[]).includes(getRowId(r)) || getRowId(r) === rowId)]
      : data.filter((r) => (selectedKeys as any[]).includes(getRowId(r)) && getRowId(r) !== rowId);
    onSelectionChange(updated);
  };

  const activeColumns = columns.filter((c) => visibleColumns.includes(c.key));

  if (error) {
    return (
      <div className="border border-error-container/30 bg-error-container/10 rounded p-6 text-center select-none">
        <h4 className="text-sm font-bold text-error mb-1">Error de Carga</h4>
        <p className="text-xs text-on-surface-variant">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 select-none">
      {/* Selector de columnas configurable */}
      <div className="flex justify-end relative">
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Settings2 className="w-3.5 h-3.5" />}
          onClick={() => setShowConfig(!showConfig)}
          className="text-xs h-8 px-2"
        >
          Columnas
        </Button>
        {showConfig && (
          <div className="absolute right-0 top-9 bg-surface-container-lowest border border-outline-variant shadow-overlay rounded p-3 z-30 w-48 space-y-2">
            <h5 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider border-b border-outline-variant pb-1.5">
              Configurar Vista
            </h5>
            <div className="space-y-1.5 max-h-40 overflow-y-auto no-scrollbar">
              {columns.map((c) => (
                <label
                  key={c.key}
                  className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes(c.key)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setVisibleColumns([...visibleColumns, c.key]);
                      } else {
                        setVisibleColumns(visibleColumns.filter((k) => k !== c.key));
                      }
                    }}
                    className="rounded border-outline-variant text-primary focus:ring-primary cursor-pointer w-3.5 h-3.5"
                  />
                  <span>{c.header}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Contenedor responsive con scroll horizontal (Redondez 4px) */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded overflow-hidden">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse dense-table">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                {selectable && (
                  <th className="w-10 text-center px-3 py-1">
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={data.length > 0 && selectedKeys.length === data.length}
                      className="rounded border-outline-variant text-primary focus:ring-primary cursor-pointer w-3.5 h-3.5"
                    />
                  </th>
                )}
                {activeColumns.map((col) => {
                  const alignment = {
                    left: "text-left",
                    right: "text-right",
                    center: "text-center",
                  };
                  return (
                    <th
                      key={col.key}
                      onClick={() => handleHeaderClick(col)}
                      className={`text-[10px] font-bold text-on-surface-variant uppercase tracking-wider px-3 py-1.5 ${
                        col.sortable ? "cursor-pointer hover:text-on-surface select-none" : ""
                      } ${alignment[col.align || "left"]}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.header}
                        {col.sortable && <ArrowUpDown className="w-3 h-3 opacity-60" />}
                      </span>
                    </th>
                  );
                })}
                {rowActions && <th className="w-12 text-right px-3 py-1" />}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-outline-variant last:border-b-0 animate-pulse">
                    {selectable && <td className="text-center px-3 py-1.5"><Skeleton className="h-3.5 w-3.5 rounded" /></td>}
                    {activeColumns.map((col) => (
                      <td key={col.key} className="px-3 py-1.5">
                        <Skeleton className="h-3 w-20 rounded" />
                      </td>
                    ))}
                    {rowActions && <td className="px-3 py-1.5"><Skeleton className="h-3.5 w-6 ml-auto rounded" /></td>}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={activeColumns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)} className="p-6">
                    <EmptyState message={emptyMessage} action={emptyAction} />
                  </td>
                </tr>
              ) : (
                data.map((row, index) => {
                  const isRowSelected = getRowId ? (selectedKeys as any[]).includes(getRowId(row)) : false;
                  return (
                    <tr
                      key={getRowId ? getRowId(row) : index}
                      className={`border-b border-outline-variant last:border-b-0 hover:bg-surface-container-low/50 transition-colors duration-150 ${
                        isRowSelected ? "bg-primary/5" : ""
                      }`}
                    >
                      {selectable && getRowId && (
                        <td className="text-center px-3 py-1">
                          <input
                            type="checkbox"
                            checked={isRowSelected}
                            onChange={(e) => handleSelectRow(row, e.target.checked)}
                            className="rounded border-outline-variant text-primary focus:ring-primary cursor-pointer w-3.5 h-3.5"
                          />
                        </td>
                      )}
                      {activeColumns.map((col) => {
                        const alignment = {
                          left: "text-left",
                          right: "text-right text-mono font-bold",
                          center: "text-center",
                        };
                        return (
                          <td
                            key={col.key}
                            className={`text-xs text-on-surface px-3 py-1.5 ${alignment[col.align || "left"]}`}
                          >
                            {col.render ? col.render(row, index) : (row as any)[col.key]}
                          </td>
                        );
                      })}
                      {rowActions && (
                        <td className="text-right px-3 py-1">
                          <div className="inline-flex justify-end gap-1">{rowActions(row)}</div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginador compactador táctil y de escritorio */}
      {totalPages && totalPages > 1 && currentPage && onPageChange && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-outline-variant bg-surface-container-lowest rounded shadow-sm">
          <span className="text-xs text-on-surface-variant">
            Pág. <span className="font-bold text-on-surface">{currentPage}</span> de{" "}
            <span className="font-bold text-on-surface">{totalPages}</span>
          </span>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => onPageChange(currentPage - 1)}
              leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
              className="text-xs h-8 px-2"
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
              className="text-xs h-8 px-2"
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
