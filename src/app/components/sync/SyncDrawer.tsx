import React, { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type OfflineMovement } from "../../storage/db";
import { queueService, canonicalStringify, generateSHA256 } from "../../offline/queue.service";
import { syncEngine } from "../../sync/sync-engine";
import { formatSyncError } from "../../sync/sync-error-mapper";
import { useRuntimeStore } from "../../runtime/runtime.store";
import { selectOnline, selectSyncing } from "../../runtime/selectors";
import { 
  Cloud, CloudOff, RefreshCw, Trash2, Edit3, X, AlertTriangle, ChevronUp, ChevronDown
} from "lucide-react";

export const SyncDrawer: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OfflineMovement | null>(null);
  const [editQty, setEditQty] = useState("");
  const [timeTick, setTimeTick] = useState(0);

  const online = useRuntimeStore(selectOnline);
  const syncing = useRuntimeStore(selectSyncing);
  const lastSyncAt = useRuntimeStore((s) => s.lastSyncAt);
  void timeTick;

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeTick((t) => t + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const formatLastSync = (iso?: string | null) => {
    if (!iso) return "Nunca";
    try {
      const date = new Date(iso);
      const diffMs = Date.now() - date.getTime();
      if (diffMs < 5000) {
        return "Justo ahora";
      }
      if (diffMs < 60000) {
        const secs = Math.round(diffMs / 1000);
        return `Hace ${secs} segundos`;
      }
      if (diffMs < 3600000) {
        const mins = Math.round(diffMs / 60000);
        return `Hace ${mins} minuto${mins > 1 ? "s" : ""}`;
      }
      return `A las ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    } catch {
      return "Nunca";
    }
  };

  // Live queries for reactive data
  const pendingItems = useLiveQuery(() => 
    db.movementsQueue.where("syncStatus").anyOf("PENDING", "RETRY_SCHEDULED", "SYNCING").toArray()
  ) || [];

  const conflictItems = useLiveQuery(() => 
    db.movementsQueue.where("syncStatus").equals("CONFLICT").toArray()
  ) || [];

  const failedItems = useLiveQuery(() => 
    db.movementsQueue.where("syncStatus").equals("FAILED").toArray()
  ) || [];

  const totalErrors = conflictItems.length + failedItems.length;

  const handleRetryAll = async () => {
    // Reset all failed and conflict items to PENDING
    const itemsToRetry = [...conflictItems, ...failedItems];
    for (const item of itemsToRetry) {
      await db.movementsQueue.update(item.id!, {
        syncStatus: "PENDING",
        syncAttempts: 0,
        syncErrorMessage: null
      });
    }
    await queueService.refreshQueueCounts();
    syncEngine.triggerSync({ force: true, isManual: true });
  };

  const handleDiscard = async (id: number) => {
    if (confirm("¿Está seguro de que desea descartar este movimiento permanentemente?")) {
      await db.movementsQueue.delete(id);
      await queueService.refreshQueueCounts();
    }
  };

  const handleRetryItem = async (item: OfflineMovement) => {
    await db.movementsQueue.update(item.id!, {
      syncStatus: "PENDING",
      syncAttempts: 0,
      syncErrorMessage: null
    });
    await queueService.refreshQueueCounts();
    syncEngine.triggerSync({ force: true, isManual: true });
  };

  const handleStartEdit = (item: OfflineMovement) => {
    setEditingItem(item);
    // Default to the first item's quantity
    const currentQty = item.items[0]?.cantidadUnidades || 0;
    setEditQty(String(currentQty));
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !editingItem.id) return;
    const qty = parseInt(editQty, 10);
    if (isNaN(qty) || qty <= 0) {
      alert("Ingrese una cantidad válida mayor a cero.");
      return;
    }

    try {
      // Modify item quantity in the items array
      const updatedItems = editingItem.items.map(it => ({
        ...it,
        cantidadUnidades: qty
      }));

      // Recalculate canonical hash
      const canonicalPayload = canonicalStringify({ 
        tipo: editingItem.tipo, 
        items: updatedItems, 
        tallerId: editingItem.tallerId, 
        observaciones: editingItem.observaciones 
      });
      const newPayloadHash = await generateSHA256(canonicalPayload);

      // Save changes back to local IndexedDB and reset sync state to PENDING
      await db.movementsQueue.update(editingItem.id, {
        items: updatedItems,
        payloadHash: newPayloadHash,
        syncStatus: "PENDING",
        syncAttempts: 0,
        syncErrorMessage: null
      });

      setEditingItem(null);
      await queueService.refreshQueueCounts();
      syncEngine.triggerSync({ force: true, isManual: true });
    } catch (err: any) {
      alert("Error al actualizar: " + err.message);
    }
  };

  return (
    <>
      {/* Bottom Sticky Status Ribbon */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-0 left-0 right-0 z-50 px-4 py-3 flex justify-between items-center cursor-pointer border-t transition-all ${
          totalErrors > 0 
            ? "bg-amber-950 border-amber-800 text-amber-200" 
            : syncing 
            ? "bg-blue-950 border-blue-900 text-blue-200" 
            : "bg-gray-900 border-gray-800 text-gray-300"
        }`}
      >
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
          {online ? (
            <Cloud className="w-4 h-4 text-green-400" />
          ) : (
            <CloudOff className="w-4 h-4 text-amber-500 animate-pulse" />
          )}
          
          {syncing ? (
            <span className="flex items-center gap-1.5 animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Transmitiendo movimientos al servidor...
            </span>
          ) : totalErrors > 0 ? (
            <span className="flex items-center gap-1.5 text-amber-400">
              <AlertTriangle className="w-4 h-4 animate-bounce" />
              {totalErrors} movimiento(s) rechazado(s) o en conflicto
            </span>
          ) : pendingItems.length > 0 ? (
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
              {pendingItems.length} movimiento(s) pendiente(s) de envío
            </span>
          ) : (
            <span className="text-gray-400">Todos los movimientos transmitidos correctamente</span>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] font-semibold">
          {pendingItems.length > 0 && (
            <span className="bg-gray-800/80 px-2 py-0.5 rounded border border-gray-700 text-gray-300 font-bold">
              PEND: {pendingItems.length}
            </span>
          )}
          {conflictItems.length > 0 && (
            <span className="bg-orange-950 px-2 py-0.5 rounded border border-orange-900 text-orange-300 font-bold">
              CONFL: {conflictItems.length}
            </span>
          )}
          {failedItems.length > 0 && (
            <span className="bg-red-950 px-2 py-0.5 rounded border border-red-900 text-red-300 font-bold">
              RECH: {failedItems.length}
            </span>
          )}

          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </div>
      </div>

      {/* Expandable Overlay Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex flex-col justify-end">
          {/* Dismiss area */}
          <div className="flex-1" onClick={() => setIsOpen(false)}></div>

          {/* Sheet container */}
          <div className="bg-gray-900 border-t border-gray-800 w-full max-h-[75vh] md:max-w-md md:mx-auto rounded-t-3xl flex flex-col overflow-hidden shadow-2xl">
            {/* Drawer Header */}
            <div className="px-4 py-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/85 sticky top-0 z-10">
              <div>
                <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider">Cola de Transmisión de Movimientos</h3>
                <p className="text-[10px] text-gray-500 mt-0.5">Transmisión segura y resolución de anomalías en planta</p>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg bg-gray-800 text-gray-400 hover:text-gray-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Metadata Bar */}
            <div className="px-4 py-2 bg-gray-950 border-b border-gray-850 flex justify-between items-center text-[10px] text-gray-400">
              <div>Conexión: <span className={online ? "text-green-400 font-bold" : "text-amber-500 font-bold"}>{online ? "CONECTADO" : "SIN CONEXIÓN"}</span></div>
              <div>Última transmisión: <span className="text-gray-200 font-bold">{formatLastSync(lastSyncAt)}</span></div>
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
              {/* Batch Actions */}
              {totalErrors > 0 && (
                <button
                  onClick={handleRetryAll}
                  className="w-full py-3 bg-amber-600 active:bg-amber-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-amber-900/10 transition"
                >
                  <RefreshCw className="w-4 h-4" />
                  VOLVER A ENVIAR MOVIMIENTOS RECHAZADOS
                </button>
              )}

              {/* SECTION: CONFLICTS / FAILURES */}
              {totalErrors > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Movimientos Rechazados o con Incidencias ({totalErrors})
                  </h4>

                  <div className="space-y-2">
                    {[...conflictItems, ...failedItems].map(item => (
                      <div 
                        key={item.id} 
                        className={`p-3 rounded-xl border flex flex-col gap-2 text-xs ${
                          item.syncStatus === "CONFLICT" 
                            ? "bg-orange-950/20 border-orange-900/60" 
                            : "bg-red-950/20 border-red-900/60"
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] mr-1.5 ${
                              item.syncStatus === "CONFLICT" ? "bg-orange-900 text-orange-200" : "bg-red-900 text-red-200"
                            }`}>
                              {item.syncStatus === "CONFLICT" ? "CONFL" : "RECHAZ"}
                            </span>
                            <span className="font-semibold text-gray-200">{item.tipo}</span>
                          </div>
                          <span className="text-[9px] text-gray-500">
                            {new Date(item.offlineCreatedAt).toLocaleTimeString()}
                          </span>
                        </div>

                        {/* Error details */}
                        <div className="text-[10px] text-gray-400 bg-black/30 p-2 rounded-lg font-mono break-words leading-relaxed border border-gray-800">
                          {formatSyncError(item.syncErrorMessage ?? null)}
                        </div>

                        {/* Items details */}
                        <div className="text-[10px] text-gray-500 space-y-0.5">
                          {item.items.map((it, idx) => (
                            <div key={idx}>
                              • Cantidad: <span className="text-gray-300 font-semibold">{it.cantidadUnidades} u.</span> | Presentación: {it.presentacion} | Canal: {it.canal}
                            </div>
                          ))}
                        </div>

                        {/* Action Buttons */}
                        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-800/60">
                          <button
                            onClick={() => handleRetryItem(item)}
                            className="py-2 bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-200 rounded-lg flex items-center justify-center gap-1 font-bold text-[10px] transition"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Reintentar
                          </button>
                          <button
                            onClick={() => handleStartEdit(item)}
                            className="py-2 bg-blue-950 hover:bg-blue-900 text-blue-300 rounded-lg flex items-center justify-center gap-1 font-bold text-[10px] border border-blue-900/60 transition"
                          >
                            <Edit3 className="w-3 h-3" />
                            Corregir
                          </button>
                          <button
                            onClick={() => handleDiscard(item.id!)}
                            className="py-2 bg-red-950 hover:bg-red-900 text-red-300 rounded-lg flex items-center justify-center gap-1 font-bold text-[10px] border border-red-900/60 transition"
                          >
                            <Trash2 className="w-3 h-3" />
                            Descartar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION: PENDING */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Movimientos en Espera de Envío ({pendingItems.length})
                </h4>

                {pendingItems.length === 0 ? (
                  <div className="text-center py-6 text-[11px] text-gray-500">
                    No hay movimientos pendientes de envío en este momento.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pendingItems.map(item => (
                      <div key={item.id} className="p-3 bg-gray-800/40 border border-gray-850 rounded-xl flex justify-between items-center text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${
                              item.syncStatus === "SYNCING" ? "bg-blue-400 animate-pulse" : "bg-yellow-500"
                            }`}></span>
                            <span className="font-bold text-gray-300">{item.tipo}</span>
                            <span className={`text-[8px] font-bold px-1 rounded uppercase ${
                              item.priority === "HIGH" ? "bg-red-900/60 text-red-300 border border-red-800" : "bg-gray-700 text-gray-300"
                            }`}>
                              {item.priority}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-500 mt-1">
                            {item.items[0]?.cantidadUnidades} u. | Intentos: {item.syncAttempts}
                          </div>
                        </div>
                        <span className="text-[9px] text-gray-500">
                          {new Date(item.offlineCreatedAt).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Basic Edit modal Dialog */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-bold text-gray-200 uppercase tracking-wider">Corregir Cantidad de Movimiento</h4>
              <button 
                onClick={() => setEditingItem(null)}
                className="p-1 text-gray-400 hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="text-xs text-gray-400">
                Corrija la cantidad del movimiento. Al guardar, se volverá a intentar su envío automáticamente.
              </div>
              
              <div>
                <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Cantidad (Unidades)
                </label>
                <input
                  type="number"
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                  placeholder="Ingrese nueva cantidad"
                  autoFocus
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="py-2.5 bg-gray-800 text-gray-300 font-bold text-xs rounded-xl border border-gray-700 active:scale-95 transition"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="py-2.5 bg-green-600 text-white font-bold text-xs rounded-xl active:scale-95 transition"
              >
                GUARDAR Y TRANSMITIR
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SyncDrawer;
