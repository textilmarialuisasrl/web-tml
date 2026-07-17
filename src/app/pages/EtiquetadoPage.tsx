import React, { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import { catalogService } from "../services/catalog.service";
import { queueService } from "../offline/queue.service";
import { CheckCircle, XCircle, Tag, RefreshCw } from "lucide-react";
import { useRuntimeStore } from "../runtime/runtime.store";
import { authFetch } from "../auth/auth.api";

interface StockItem {
  productoId: string;
  depositoId: string | null;
  tallerId: string | null;
  calidad: "PERFECTO" | "FALLADO";
  presentacion: "UNIDAD" | "DOCENA" | "FARDO" | "SIN_ETIQUETA";
  canal: "MAYORISTA" | "MINORISTA";
  cantidadUnidades: number;
}

export const EtiquetadoPage: React.FC = () => {
  const authPhase = useRuntimeStore((s) => s.authPhase);
  const currentUser = useRuntimeStore((s) => s.currentUser);
  const online = useRuntimeStore((s) => s.online);

  // Master Lists
  const [depositos, setDepositos] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form States
  const [selectedDepositoId, setSelectedDepositoId] = useState("");
  const [selectedStockRow, setSelectedStockRow] = useState<{
    productoId: string;
    nombre: string;
    codigo: string;
    canal: "MAYORISTA" | "MINORISTA";
    stockDisponible: number;
    familiaId: string | null;
    linea: string | null;
  } | null>(null);

  const [selectedDestinoId, setSelectedDestinoId] = useState("");
  const [cantidadLabel, setCantidadLabel] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);

  const lastMovement = useLiveQuery(
    async () => {
      if (!lastCreatedId) return null;
      return db.movementsQueue.where("clientGeneratedId").equals(lastCreatedId).first();
    },
    [lastCreatedId]
  );

  useEffect(() => {
    if (lastMovement && lastMovement.syncStatus === "SYNCED") {
      const timer = setTimeout(() => {
        setLastCreatedId(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [lastMovement]);

  // Load catalogs and stock
  const loadData = async () => {
    try {
      setLoading(true);
      await catalogService.syncCatalogos();

      const [pList, dList] = await Promise.all([
        catalogService.getProductos(),
        catalogService.getDepositos()
      ]);

      setProductos(pList);
      setDepositos(dList.filter((d: any) => d.activo));

      if (online) {
        const stockRes = await authFetch("/api/stock?limit=1000");
        if (stockRes.ok) {
          const json = await stockRes.json();
          setStockItems(json.data || []);
        }
      } else {
        const items = await db.stockCache.toArray();
        setStockItems(items as StockItem[]);
      }
    } catch (err) {
      console.error("Error loading master data in EtiquetadoPage:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [authPhase, currentUser]);

  // Get active commercial products that require labeling and have stock in the chosen deposit
  const getAvailableStockRows = () => {
    if (!selectedDepositoId) return [];

    // Filter base products purchased from supplier
    const baseProds = productos.filter(p => p.activo && p.tipoProducto === "BASE" && p.origen === "Compra");

    const rows: typeof selectedStockRow[] = [];

    baseProds.forEach(prod => {
      // Find matching stock cache entries: same product, selected deposit, PERFECTO, units
      const matchingStocks = stockItems.filter(
        item => item.productoId === prod.id &&
                item.depositoId === selectedDepositoId &&
                item.calidad === "PERFECTO" &&
                item.cantidadUnidades > 0
      );

      matchingStocks.forEach(stock => {
        rows.push({
          productoId: prod.id,
          nombre: prod.nombre,
          codigo: prod.codigo,
          canal: stock.canal,
          stockDisponible: stock.cantidadUnidades,
          familiaId: prod.familiaId,
          linea: prod.linea
        });
      });
    });

    return rows;
  };

  const handleSelectRow = (row: any) => {
    setSelectedStockRow(row);
    setSelectedDestinoId("");
    setCantidadLabel("");
    setSubmitError(null);
  };

  const triggerHaptic = (type: "success" | "warning") => {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      if (type === "success") navigator.vibrate([100, 50, 100]);
      else navigator.vibrate([200, 100, 200]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!selectedDepositoId || !selectedStockRow || !selectedDestinoId) {
      alert("Complete todos los campos obligatorios antes de continuar.");
      return;
    }

    const qty = parseInt(cantidadLabel, 10);
    if (isNaN(qty) || qty <= 0) {
      alert("Ingrese una cantidad válida mayor a cero.");
      return;
    }

    if (qty > selectedStockRow.stockDisponible) {
      alert(`Error: La cantidad a etiquetar (${qty} u.) supera el stock disponible (${selectedStockRow.stockDisponible} u.).`);
      return;
    }

    const destProduct = productos.find(p => p.id === selectedDestinoId);
    if (!destProduct) return;

    try {
      const items = [
        // 1. Decrement base product (SALIDA)
        {
          productoId: selectedStockRow.productoId,
          cantidadUnidades: qty,
          depositoOrigenId: selectedDepositoId,
          depositoDestinoId: null,
          tallerOrigenId: null,
          tallerDestinoId: null,
          calidad: "PERFECTO" as const,
          presentacion: "UNIDAD" as const,
          canal: selectedStockRow.canal,
          direccion: "SALIDA" as const
        },
        // 2. Increment commercial finished product (ENTRADA)
        {
          productoId: selectedDestinoId,
          cantidadUnidades: qty,
          depositoOrigenId: null,
          depositoDestinoId: selectedDepositoId,
          tallerOrigenId: null,
          tallerDestinoId: null,
          calidad: "PERFECTO" as const,
          presentacion: "UNIDAD" as const,
          canal: selectedStockRow.canal,
          direccion: "ENTRADA" as const
        }
      ];

      const movement = await queueService.enqueue(
        "ETIQUETADO",
        items,
        null,
        observaciones.trim() || `Etiquetado: ${selectedStockRow.codigo} -> ${destProduct.codigo} (${qty} u.)`,
        "HIGH"
      );

      triggerHaptic("success");
      setLastCreatedId(movement.clientGeneratedId);
      setSelectedStockRow(null);
      setSelectedDestinoId("");
      setCantidadLabel("");
      setObservaciones("");
      
      // Reload stocks to reflect optimistic update locally
      await loadData();
    } catch (err: any) {
      triggerHaptic("warning");
      setSubmitError(err.message || "Error al encolar la operación de etiquetado");
    }
  };

  const availableRows = getAvailableStockRows();

  return (
    <div className="flex-1 flex flex-col gap-6 max-w-4xl mx-auto w-full p-2">
      {/* Title Header */}
      <div className="flex justify-between items-center bg-gray-900 border-2 border-gray-800 p-6 rounded-2xl shadow-md">
        <div className="space-y-1">
          <h1 className="text-lg font-black tracking-wide text-white uppercase flex items-center gap-2">
            <Tag className="w-5 h-5 text-blue-500" />
            Etiquetado de Productos
          </h1>
          <p className="text-xs text-slate-400 font-medium">
            Transformación física de productos base a productos comerciales etiquetados del mismo modelo físico.
          </p>
        </div>
        <button
          onClick={() => void loadData()}
          disabled={loading}
          className="p-2 hover:bg-slate-800 text-slate-350 hover:text-white rounded-xl border border-slate-700 transition cursor-pointer active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Sync Status Banners */}
      {lastMovement && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs font-black tracking-wide uppercase transition ${
          lastMovement.syncStatus === "SYNCED"
            ? "bg-green-950/20 border-green-900/50 text-green-400"
            : lastMovement.syncStatus === "FAILED"
            ? "bg-red-950/20 border-red-900/50 text-red-400"
            : "bg-blue-950/20 border-blue-900/50 text-blue-400"
        }`}>
          {lastMovement.syncStatus === "SYNCED" ? (
            <>
              <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
              <span>Etiquetado guardado y sincronizado con el servidor.</span>
            </>
          ) : lastMovement.syncStatus === "FAILED" ? (
            <>
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>Fallo en sincronización: {lastMovement.syncErrorMessage || "Error desconocido"}. Reintentando...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
              <span>Operación registrada localmente. Pendiente de sincronización...</span>
            </>
          )}
        </div>
      )}

      {submitError && (
        <div className="bg-red-950/20 border border-red-900/40 p-4 rounded-xl text-xs text-red-400 font-bold flex items-center gap-2.5">
          <XCircle className="w-4 h-4" />
          <span>{submitError}</span>
        </div>
      )}

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Column: Warehouse Selection and Available Stocks list */}
        <div className="md:col-span-7 space-y-6">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
            <label className="block text-[11px] font-black text-slate-400 uppercase tracking-wider">
              1. Seleccionar Depósito de Operación
            </label>
            <select
              value={selectedDepositoId}
              onChange={(e) => {
                setSelectedDepositoId(e.target.value);
                setSelectedStockRow(null);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-xs text-white focus:outline-none focus:border-blue-500 font-bold cursor-pointer"
            >
              <option value="">-- SELECCIONE DEPÓSITO --</option>
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre} ({d.tipo})
                </option>
              ))}
            </select>
          </div>

          {selectedDepositoId && (
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
              <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                2. Materias Primas Disponibles
              </h2>
              {loading ? (
                <div className="text-center text-xs text-gray-500 py-4 uppercase">Cargando inventario...</div>
              ) : availableRows.length === 0 ? (
                <div className="bg-slate-950/50 border border-dashed border-slate-800 p-6 rounded-xl text-center text-xs text-gray-500 uppercase tracking-wide">
                  No hay productos base en este depósito.
                </div>
              ) : (
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 uppercase text-[9px] tracking-wider border-b border-slate-800">
                        <th className="p-3">Producto Base</th>
                        <th className="p-3">Canal</th>
                        <th className="p-3 text-right">Stock Disp.</th>
                        <th className="p-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {availableRows.map((row, idx) => {
                        const isSelected = selectedStockRow?.productoId === row?.productoId && selectedStockRow?.canal === row?.canal;
                        return (
                          <tr
                            key={idx}
                            onClick={() => handleSelectRow(row)}
                            className={`cursor-pointer transition ${
                              isSelected
                                ? "bg-blue-950/30 text-white"
                                : "hover:bg-slate-850/50 text-slate-350"
                            }`}
                          >
                            <td className="p-3 font-semibold">
                              <div>{row?.nombre}</div>
                              <div className="text-[9px] text-gray-500 font-mono mt-0.5">{row?.codigo}</div>
                            </td>
                            <td className="p-3 font-bold text-[10px] tracking-wider uppercase">
                              <span className={`px-2 py-0.5 rounded ${
                                row?.canal === "MAYORISTA" ? "bg-slate-800 text-slate-350" : "bg-emerald-950 text-emerald-400"
                              }`}>
                                {row?.canal}
                              </span>
                            </td>
                            <td className="p-3 text-right font-black font-mono">{row?.stockDisponible} u.</td>
                            <td className="p-3 text-right">
                              <button
                                className={`px-2 py-1 rounded text-[10px] font-black uppercase transition ${
                                  isSelected
                                    ? "bg-blue-600 text-white"
                                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                                }`}
                              >
                                {isSelected ? "Listo" : "Elegir"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Execution Form */}
        <div className="md:col-span-5">
          {selectedStockRow ? (
            <form
              onSubmit={handleSubmit}
              className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm space-y-5 animate-fadeIn"
            >
              <div className="border-b border-slate-800 pb-3">
                <span className="bg-blue-950 text-blue-400 border border-blue-900 px-2.5 py-0.5 rounded text-[9px] font-black tracking-widest font-mono uppercase">
                  TRANSFORMACIÓN
                </span>
                <h3 className="text-sm font-black text-white uppercase mt-2 leading-tight">
                  {selectedStockRow.nombre}
                </h3>
                <p className="text-[10px] text-gray-500 font-bold font-mono mt-1">
                  Código: {selectedStockRow.codigo} | Canal: {selectedStockRow.canal}
                </p>
              </div>

              {/* Stock Indicator */}
              <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl flex justify-between items-center">
                <div className="space-y-0.5">
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Disponible Origen</div>
                  <div className="text-xs text-gray-500 font-medium">Calidad PERFECTO</div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black font-mono text-white">{selectedStockRow.stockDisponible}</span>
                  <span className="text-[10px] text-gray-500 font-bold ml-1">UNIDADES</span>
                </div>
              </div>

              {/* Destination Product Select (Filtered by Family and Line) */}
              <div className="space-y-2">
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  Seleccionar Producto Comercial Destino *
                </label>
                <select
                  required
                  value={selectedDestinoId}
                  onChange={(e) => setSelectedDestinoId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-xs text-white focus:outline-none focus:border-blue-500 font-bold cursor-pointer"
                >
                  <option value="">-- SELECCIONE PRODUCTO COMERCIAL --</option>
                  {productos
                    .filter(
                      (p) =>
                        p.activo &&
                        p.tipoProducto === "COMERCIAL" &&
                        p.familiaId === selectedStockRow.familiaId &&
                        p.linea === selectedStockRow.linea
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.codigo} - {p.nombre}
                      </option>
                    ))}
                </select>
              </div>

              {/* Quantity Input */}
              <div className="space-y-2">
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  Cantidad a Etiquetar (Unidades)
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max={selectedStockRow.stockDisponible}
                  placeholder="Ej: 50"
                  value={cantidadLabel}
                  onChange={(e) => setCantidadLabel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-xs text-white focus:outline-none focus:border-blue-500 font-mono font-bold"
                />
              </div>

              {/* Quality & Channel Read Only Badges */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
                  <span className="text-[9px] text-slate-400 font-bold uppercase">Calidad Destino</span>
                  <div className="text-xs font-extrabold text-white">PERFECTO</div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
                  <span className="text-[9px] text-slate-400 font-bold uppercase">Canal Destino</span>
                  <div className="text-xs font-extrabold text-white">{selectedStockRow.canal}</div>
                </div>
              </div>

              {/* Observaciones Input */}
              <div className="space-y-2">
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  Observaciones (Opcional)
                </label>
                <textarea
                  placeholder="Detalles sobre el proceso de etiquetado..."
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 leading-relaxed font-semibold resize-none"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full bg-blue-700 hover:bg-blue-650 text-white font-black py-3.5 px-4 rounded-xl border-2 border-blue-500 text-xs uppercase tracking-wider transition active:scale-[0.98] cursor-pointer shadow-md"
              >
                Confirmar y Registrar
              </button>
            </form>
          ) : (
            <div className="bg-slate-900/30 border-2 border-dashed border-slate-800/80 p-8 rounded-2xl text-center text-xs text-gray-500 uppercase tracking-wider leading-relaxed">
              Seleccione un depósito y luego elija un producto sin etiquetar de la lista para proceder.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
