import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRuntimeStore } from "../../runtime/runtime.store";
import { formatHumanMovement } from "../../utils/human-timeline";
import { safeModeEngine } from "../../runtime/safe-mode";
import { runtimeAdaptive } from "../../runtime/runtime.adaptive";
import { registerRuntimeCleanup } from "../../runtime/runtime.cleanup-registry";
import { metricsService } from "../../services/metrics.service";
import { catalogService } from "../../services/catalog.service";
import {
  fetchTimelinePage,
  mapUiStatusFilter,
  mergeTimelineItems,
  type TimelineCursor,
} from "../../render/timeline.slice";
import {
  useRenderPolicy,
  getTimelineMemoryCeiling,
  isTimelineSearchAllowed,
  shouldDisableAnimations,
} from "../../render/render.policy";
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  AlertOctagon,
  Search,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export const IncrementalTimeline: React.FC = () => {
  const policy = useRenderPolicy();
  const searchAllowed = isTimelineSearchAllowed(policy);
  const memoryCeiling = getTimelineMemoryCeiling(policy);

  // Dynamic Catalog Dictionaries
  const [productMap, setProductMap] = useState<Record<string, string>>({});
  const [tallerMap, setTallerMap] = useState<Record<string, string>>({});
  const [depositoMap, setDepositoMap] = useState<Record<string, string>>({});

  const currentUser = useRuntimeStore((s) => s.currentUser);
  const tallerIdRestricted = currentUser && currentUser.allowedTalleres && currentUser.allowedTalleres.length > 0 && !currentUser.permisos.includes("MOVIMIENTOS_CREAR")
    ? currentUser.allowedTalleres[0]
    : undefined;

  useEffect(() => {
    async function loadCatalogs() {
      try {
        const [pList, tList, dList] = await Promise.all([
          catalogService.getProductos(),
          catalogService.getTalleres(),
          catalogService.getDepositos()
        ]);
        
        const pMap: Record<string, string> = {};
        const tMap: Record<string, string> = {};
        const dMap: Record<string, string> = {};

        pList.forEach(p => { if (p?.id && p?.nombre) pMap[p.id] = p.nombre; });
        tList.forEach(t => { if (t?.id && t?.nombre) tMap[t.id] = t.nombre; });
        dList.forEach(d => { if (d?.id && d?.nombre) dMap[d.id] = d.nombre; });

        setProductMap(pMap);
        setTallerMap(tMap);
        setDepositoMap(dMap);
      } catch (err) {
        console.error("Failed to load catalog products for timeline mapping:", err);
      }
    }
    void loadCatalogs();
  }, []);

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [items, setItems] = useState<Awaited<ReturnType<typeof fetchTimelinePage>>["items"]>([]);
  const [cursorBefore, setCursorBefore] = useState<TimelineCursor>(null);
  const [searchOffset, setSearchOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [memoryCapped, setMemoryCapped] = useState(false);

  const loaderRef = useRef<HTMLDivElement>(null);
  const loadGenRef = useRef(0);

  const buildParams = useCallback(
    (cursor: TimelineCursor, sOffset: number) => ({
      statusFilter: mapUiStatusFilter(statusFilter),
      searchQuery: searchAllowed ? searchQuery : "",
      cursorBefore: cursor,
      searchOffset: sOffset,
      policy,
      tallerId: tallerIdRestricted,
    }),
    [statusFilter, searchQuery, searchAllowed, policy, tallerIdRestricted]
  );

  const loadFirstPage = useCallback(async () => {
    const gen = ++loadGenRef.current;
    setLoading(true);
    setMemoryCapped(false);
    setCursorBefore(null);
    setSearchOffset(0);

    try {
      const result = await fetchTimelinePage(buildParams(null, 0));
      if (gen !== loadGenRef.current) return;

      setItems(result.items);
      setCursorBefore(result.nextCursorBefore);
      setSearchOffset(result.nextSearchOffset);
      setHasMore(result.hasMore);

      await metricsService.trackTimelineBatchFetch(result.queryDurationMs, {
        statusFilter,
        itemCount: result.items.length,
        hasMore: result.hasMore,
        searchActive: Boolean(searchQuery.trim()),
        scannedRows: result.scannedRows,
      });
      await metricsService.trackTimelineVisibleCount(result.items.length);
      await metricsService.trackMemoryPressureIfNeeded();
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [buildParams, statusFilter, searchQuery]);

  const loadNextPage = useCallback(async () => {
    if (!hasMore || loadingMore || loading || memoryCapped) return;

    if (items.length >= memoryCeiling) {
      setMemoryCapped(true);
      setHasMore(false);
      return;
    }

    setLoadingMore(true);
    const gen = loadGenRef.current;

    try {
      const result = await fetchTimelinePage(
        buildParams(cursorBefore, searchOffset)
      );
      if (gen !== loadGenRef.current) return;

      const merged = mergeTimelineItems(items, result.items);
      setItems(merged);
      setCursorBefore(result.nextCursorBefore);
      setSearchOffset(result.nextSearchOffset);
      setHasMore(result.hasMore);

      if (merged.length >= memoryCeiling) {
        setMemoryCapped(true);
        setHasMore(false);
      }

      await metricsService.trackTimelineBatchFetch(result.queryDurationMs, {
        statusFilter,
        itemCount: result.items.length,
        hasMore: result.hasMore,
        searchActive: Boolean(searchQuery.trim()),
        scannedRows: result.scannedRows,
      });
      await metricsService.trackTimelineVisibleCount(merged.length);
    } finally {
      setLoadingMore(false);
    }
  }, [
    hasMore,
    loadingMore,
    loading,
    memoryCapped,
    items,
    cursorBefore,
    searchOffset,
    buildParams,
    statusFilter,
    searchQuery,
    memoryCeiling,
  ]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => {
    const unsub = useRuntimeStore.subscribe(
      (s) =>
        `${s.syncPending}|${s.conflicts}|${s.failed}|${s.lastSyncAt ?? ""}|${s.syncing}`,
      () => {
        void loadFirstPage();
      }
    );
    const unregister = registerRuntimeCleanup(() => unsub());
    return () => {
      unregister();
      unsub();
    };
  }, [loadFirstPage]);

  useEffect(() => {
    runtimeAdaptive.setVisibleTimelineItems(items.length);
    runtimeAdaptive.recordRender();
    const paintStart = performance.now();
    const id = requestAnimationFrame(() => {
      const duration = performance.now() - paintStart;
      void metricsService.trackTimelineRenderDuration(duration, items.length);
    });
    return () => cancelAnimationFrame(id);
  }, [items, loading]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadNextPage();
        }
      },
      { threshold: 0.1, rootMargin: "120px" }
    );

    const node = loaderRef.current;
    if (node) observer.observe(node);

    const unregister = registerRuntimeCleanup(() => observer.disconnect());
    return () => {
      unregister();
      observer.disconnect();
    };
  }, [loadNextPage]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "SYNCED":
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case "PENDING":
      case "RETRY_SCHEDULED":
        return <Clock className="w-5 h-5 text-yellow-400" />;
      case "SYNCING":
        return <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />;
      case "CONFLICT":
        return <AlertTriangle className="w-5 h-5 text-orange-400 animate-pulse" />;
      case "FAILED":
        return <AlertOctagon className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "SYNCED":
        return "border-2 border-green-900/40 bg-green-950/15 text-green-300";
      case "PENDING":
      case "RETRY_SCHEDULED":
        return "border-2 border-yellow-900/40 bg-yellow-950/15 text-yellow-300";
      case "SYNCING":
        return "border-2 border-blue-900/40 bg-blue-950/15 text-blue-300";
      case "CONFLICT":
        return "border-2 border-orange-900/40 bg-orange-950/20 text-orange-300";
      case "FAILED":
        return "border-2 border-red-900/45 bg-red-950/20 text-red-400";
      default:
        return "border-2 border-slate-800 bg-slate-900/50 text-gray-400";
    }
  };

  const resetList = () => {
    loadGenRef.current += 1;
    setItems([]);
    setHasMore(false);
  };

  return (
    <div className="flex-1 flex flex-col space-y-4 max-w-lg mx-auto w-full pb-16 text-gray-200 font-sans">
      <div className="bg-slate-900 border-2 border-slate-800 p-4 rounded-md space-y-3 shadow-md">
        <div className="relative">
          <Search className="absolute left-3 top-4 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            disabled={!searchAllowed}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              resetList();
            }}
            placeholder={
              searchAllowed
                ? "Buscar por producto, tipo, notas..."
                : "Búsqueda deshabilitada (modo ahorro / seguro)"
            }
            className="w-full bg-slate-950 border-2 border-slate-800 rounded-md pl-9 pr-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-blue-600 disabled:opacity-50 font-bold"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 text-[11px] font-black uppercase tracking-wider">
          {[
            { label: "Todos", value: "ALL" },
            { label: "Pendientes", value: "PENDING" },
            { label: "Sincronizados", value: "SYNCED" },
            { label: "Conflictos", value: "CONFLICT" },
            { label: "Fallidos", value: "FAILED" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setStatusFilter(opt.value);
                resetList();
              }}
              className={`px-3.5 py-2 rounded-md border-2 whitespace-nowrap transition cursor-pointer ${
                statusFilter === opt.value
                  ? "bg-blue-700 border-blue-600 text-white"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-250 hover:bg-slate-750"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-10 text-xs text-gray-500">
            Cargando historial...
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-500 bg-slate-900 border-2 border-slate-850 rounded-md uppercase font-bold">
            No se encontraron movimientos registrados en IndexedDB.
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((m) => {
              const isDisableAnimations =
                shouldDisableAnimations(policy) || safeModeEngine.shouldDisableAnimations();              return (
                <div
                  key={m.id ?? m.clientGeneratedId}
                  className={`border-2 p-4 rounded-md flex flex-col gap-2.5 transition-all ${getStatusClass(m.syncStatus)} ${
                    isDisableAnimations
                      ? "shadow-none"
                      : "shadow-sm hover:shadow-md hover:translate-x-0.5 duration-100"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(m.syncStatus)}
                      <div className="flex-1 pr-4">
                        <span className="font-bold text-[13px] text-gray-250 leading-relaxed block font-sans">
                          {formatHumanMovement(m, productMap, tallerMap, depositoMap)}
                        </span>
                        <span
                          className={`text-[8px] font-black px-1.5 py-0.5 rounded mt-1.5 inline-block uppercase ${
                            m.priority === "HIGH"
                              ? "bg-red-950 text-red-300 border border-red-900/60 font-mono"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {m.priority}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-500 font-bold font-mono">
                      {new Date(m.offlineCreatedAt).toLocaleDateString()}{" "}
                      {new Date(m.offlineCreatedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-2.5 rounded-md border-2 border-slate-850 text-[11px] space-y-1.5 font-mono">
                    {m.items.map((it, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-center text-gray-300"
                      >
                        <span className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
                          <span className="font-extrabold text-gray-150 tracking-wide font-sans uppercase text-[10.5px]">
                            {productMap[it.productoId] || it.productoId.replace("prod-", "").toUpperCase()}
                          </span>
                          <span className="text-gray-500 text-[9.5px] font-sans">
                            ({formatPresentation(it.presentacion)} / {formatQuality(it.calidad)})
                          </span>
                        </span>
                        <span className={`font-bold text-xs flex items-center gap-1.5 px-2 py-0.5 rounded ${
                          it.direccion === "ENTRADA" 
                            ? "bg-green-500/10 text-green-400 border border-green-500/25" 
                            : "bg-red-500/10 text-red-400 border border-red-500/25"
                        }`}>
                          {it.direccion === "ENTRADA" ? (
                            <ArrowUp className="w-3.5 h-3.5 text-green-400 shrink-0" />
                          ) : it.direccion === "SALIDA" ? (
                            <ArrowDown className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          ) : null}
                          <span>{it.cantidadUnidades.toLocaleString()} U.</span>
                        </span>
                      </div>
                    ))}
                  </div>

                  {m.observaciones && (
                    <p className="text-[11px] text-gray-400 italic px-1">
                      Nota: {m.observaciones}
                    </p>
                  )}

                  {m.syncErrorMessage && (
                    <TimelineErrorAccordion message={m.syncErrorMessage} />
                  )}

                  <div className="flex justify-between items-center text-[9px] text-gray-550 px-1 pt-1 border-t-2 border-slate-850">
                    <span>ID: {m.clientGeneratedId.substring(0, 8)}...</span>
                    <span>Intentos: {m.syncAttempts}/5</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        ref={loaderRef}
        className="h-8 flex items-center justify-center text-[10px] text-gray-600 font-semibold tracking-wider"
      >
        {loadingMore
          ? "CARGANDO MÁS HISTORIAL..."
          : memoryCapped
            ? `HISTORIAL LIMITADO (${memoryCeiling} ítems — modo ahorro)`
            : hasMore
              ? "DESPLAZÁ PARA CARGAR MÁS"
              : "FIN DEL HISTORIAL LOCAL"}
      </div>
    </div>
  );
};

const TimelineErrorAccordion: React.FC<{ message: string }> = ({ message }) => {
  const [expanded, setExpanded] = useState(false);
  
  const isLengthy = message.length > 80 || message.includes("\n") || message.includes("at ");
  
  if (!isLengthy) {
    return (
      <div className="text-[10px] bg-red-950/20 border-2 border-red-900/60 p-2.5 rounded-md text-red-300 font-mono break-all leading-normal flex items-start gap-1.5 shadow-inner">
        <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Error:</span> {message}
        </div>
      </div>
    );
  }

  return (
    <div className="text-[10px] bg-red-950/20 border-2 border-red-900/60 rounded-md text-red-300 font-mono break-all overflow-hidden shadow-inner">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-2.5 hover:bg-red-950/40 transition text-left font-bold text-red-450 focus:outline-none cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Error de Sincronización</span>
        </span>
        <span className="flex items-center gap-0.5 text-[9px] text-red-400 hover:text-red-300 bg-red-900/30 px-1.5 py-0.5 rounded border-2 border-red-800/50">
          {expanded ? (
            <>
              Ocultar <ChevronUp className="w-3 h-3" />
            </>
          ) : (
            <>
              Detalles <ChevronDown className="w-3 h-3" />
            </>
          )}
        </span>
      </button>
      {expanded ? (
        <div className="p-2.5 border-t-2 border-red-900/30 bg-red-950/30 text-[9.5px] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
          {message}
        </div>
      ) : (
        <div className="px-2.5 pb-2.5 text-red-400 text-[9px] truncate">
          {message}
        </div>
      )}
    </div>
  );
};

const formatPresentation = (p: string) => {
  if (p === "SIN_ETIQUETA") return "Sin Etiqueta";
  if (p === "ETIQUETADO") return "Etiquetado";
  return p;
};

const formatQuality = (q: string) => {
  if (q === "PERFECTO") return "Perfecto";
  if (q === "FALLADO") return "Fallado";
  return q;
};

export default IncrementalTimeline;
