import React, { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import { catalogService } from "../services/catalog.service";
import { queueService } from "../offline/queue.service";
import { CheckCircle, RefreshCw, XCircle, Plus, Trash2 } from "lucide-react";
import { useRuntimeStore } from "../runtime/runtime.store";

export const CortePage: React.FC = () => {
  const authPhase = useRuntimeStore((s) => s.authPhase);
  const currentUser = useRuntimeStore((s) => s.currentUser);
  
  // Master lists
  const [productosIntermedios, setProductosIntermedios] = useState<any[]>([]);
  const [retazosCatalog, setRetazosCatalog] = useState<any[]>([]);
  const [zonaCorteId, setZonaCorteId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  
  // Form states
  const [corteItems, setCorteItems] = useState<any[]>([]);
  const [tempProductId, setTempProductId] = useState("");
  const [tempQty, setTempQty] = useState("");

  const [corteRetazos, setCorteRetazos] = useState<any[]>([]);
  const [tempRetazoId, setTempRetazoId] = useState("");
  const [tempRetazoQty, setTempRetazoQty] = useState("");
  
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

  // Load catalogs offline on mount
  useEffect(() => {
    async function loadData() {
      try {
        await catalogService.syncCatalogos();

        const [pList, dList] = await Promise.all([
          catalogService.getProductos(),
          catalogService.getDepositos()
        ]);

        // Filter: only intermediate products (cut pieces of type BASE) that are active
        const intermedios = pList.filter(p => p.tipoProducto === "BASE" && p.nombre.toLowerCase().includes("cortada") && p.activo === true);
        setProductosIntermedios(intermedios);

        // Filter: only retazos that are active
        const retazos = pList.filter(p => p.tipoProducto === "RETAZO" && p.activo === true);
        setRetazosCatalog(retazos);

        // Find ZONA DE CORTE warehouse id (tipo PRODUCCION)
        const corteDep = dList.find(d => d.tipo === "PRODUCCION" || d.nombre.toUpperCase().includes("CORTE"));
        if (corteDep) {
          setZonaCorteId(corteDep.id);
        }

        console.log("[CATALOGOS] CortePage loaded:", {
          intermedios: intermedios.length,
          retazos: retazos.length,
          zonaCorteId: corteDep?.id || "not found"
        });
      } catch (err) {
        console.error("Error loading offline master catalogs in CortePage:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [authPhase, currentUser]);

  const triggerHaptic = (type: "success" | "warning") => {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      if (type === "success") navigator.vibrate([100, 50, 100]);
      else navigator.vibrate([200, 100, 200]);
    }
  };

  const handleAddItem = () => {
    const qty = parseInt(tempQty, 10);
    if (!tempProductId) return;
    if (isNaN(qty) || qty <= 0) {
      alert("Ingrese una cantidad válida mayor a cero.");
      return;
    }
    
    const prod = productosIntermedios.find(p => p.id === tempProductId);
    if (!prod) return;

    // Check duplicate
    const exists = corteItems.find(item => item.productoId === tempProductId);
    if (exists) {
      setCorteItems(corteItems.map(item => 
        item.productoId === tempProductId ? { ...item, cantidadUnidades: item.cantidadUnidades + qty } : item
      ));
    } else {
      setCorteItems([...corteItems, {
        productoId: tempProductId,
        nombre: prod.nombre,
        cantidadUnidades: qty
      }]);
    }

    setTempProductId("");
    setTempQty("");
  };

  const handleRemoveItem = (index: number) => {
    setCorteItems(corteItems.filter((_, i) => i !== index));
  };

  const handleAddRetazo = () => {
    const qty = parseInt(tempRetazoQty, 10);
    if (!tempRetazoId) return;
    if (isNaN(qty) || qty <= 0) {
      alert("Ingrese una cantidad de retazo válida mayor a cero.");
      return;
    }

    const ret = retazosCatalog.find(r => r.id === tempRetazoId);
    if (!ret) return;

    // Check duplicate/consolidation
    const exists = corteRetazos.find(item => item.productoId === tempRetazoId);
    if (exists) {
      setCorteRetazos(corteRetazos.map(item =>
        item.productoId === tempRetazoId ? { ...item, cantidadUnidades: item.cantidadUnidades + qty } : item
      ));
    } else {
      setCorteRetazos([...corteRetazos, {
        productoId: tempRetazoId,
        nombre: ret.nombre,
        cantidadUnidades: qty
      }]);
    }

    setTempRetazoId("");
    setTempRetazoQty("");
  };

  const handleRemoveRetazo = (index: number) => {
    setCorteRetazos(corteRetazos.filter((_, i) => i !== index));
  };

  const handleProcessSubmit = async () => {
    setSubmitError(null);
    setLastCreatedId(null);

    if (corteItems.length === 0) {
      setSubmitError("Debe agregar al menos un producto cortado.");
      triggerHaptic("warning");
      return;
    }

    if (!zonaCorteId) {
      setSubmitError("Error: No se encontró el depósito ZONA DE CORTE en el sistema.");
      triggerHaptic("warning");
      return;
    }

    try {
      // Map products registered to Movement items
      const items = corteItems.map(item => ({
        productoId: item.productoId,
        cantidadUnidades: item.cantidadUnidades,
        depositoDestinoId: zonaCorteId, // strictly to ZONA DE CORTE
        depositoOrigenId: null,
        tallerOrigenId: null,
        tallerDestinoId: null,
        calidad: "PERFECTO" as const,
        presentacion: "SIN_ETIQUETA" as const,
        canal: "MAYORISTA" as const,
        direccion: "ENTRADA" as const
      }));

      // Map retazos registered as Insumos parameter of queueService.enqueue
      const insumos = corteRetazos.map(ret => ({
        descripcion: ret.nombre,
        cantidad: ret.cantidadUnidades
      }));

      const movement = await queueService.enqueue(
        "CORTADA",
        items,
        null,
        observaciones || "Producción diaria de corte registrada",
        "HIGH",
        insumos
      );

      triggerHaptic("success");
      setLastCreatedId(movement.clientGeneratedId || null);
      
      // Reset form
      setCorteItems([]);
      setCorteRetazos([]);
      setObservaciones("");
    } catch (err: any) {
      triggerHaptic("warning");
      setSubmitError(err.message || "Error al registrar la producción.");
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-xs uppercase font-bold tracking-widest">
        Cargando catálogos maestros de corte...
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-lg mx-auto w-full space-y-4 pb-8 text-gray-200 font-sans">
      
      <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md shadow-md space-y-4">
        <div>
          <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded text-[9px] font-black tracking-widest font-mono">
            SECCIÓN OPERATIVA
          </span>
          <h2 className="text-sm font-black uppercase tracking-widest text-blue-400 mt-1.5">Registrar Producción de Corte</h2>
          <p className="text-[10px] text-gray-400 mt-1">El stock ingresará directamente al depósito ZONA DE CORTE en UNIDADES.</p>
        </div>

        {/* Input Form Fields */}
        <div className="space-y-3.5 border-t border-slate-800 pt-3.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Producto Cortado</label>
              <select
                value={tempProductId}
                onChange={(e) => setTempProductId(e.target.value)}
                className="w-full bg-slate-950 border-2 border-slate-800 rounded-md px-3 py-3 text-xs text-slate-200 focus:outline-none focus:border-blue-600 uppercase font-extrabold cursor-pointer"
                style={{ minHeight: "45px" }}
              >
                <option value="">-- Seleccionar --</option>
                {productosIntermedios.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Cantidad (Unidades)</label>
              <input
                type="number"
                value={tempQty}
                onChange={(e) => setTempQty(e.target.value)}
                placeholder="Cantidad..."
                className="w-full bg-slate-950 border-2 border-slate-800 rounded-md px-3.5 py-3 text-xs text-slate-200 focus:outline-none focus:border-blue-600 font-bold"
                style={{ minHeight: "45px" }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddItem}
            className="w-full bg-slate-800 hover:bg-slate-750 text-gray-250 border-2 border-slate-700 font-black py-3.5 rounded-md text-xs uppercase tracking-wider transition active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-blue-400" />
            <span>Agregar al listado</span>
          </button>
        </div>

        {/* List of items to register */}
        {corteItems.length > 0 && (
          <div className="space-y-2 border-t border-slate-800 pt-3">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Listado a Registrar:</h3>
            <div className="space-y-1.5">
              {corteItems.map((item, idx) => (
                <div key={idx} className="bg-black/30 border-2 border-slate-850 p-3 rounded-md flex justify-between items-center text-xs">
                  <div>
                    <span className="font-extrabold text-gray-205 uppercase">{item.nombre}</span>
                    <span className="block text-[10px] text-gray-400 mt-0.5 font-mono font-bold">{item.cantidadUnidades.toLocaleString()} Unidades</span>
                  </div>
                  <button
                    onClick={() => handleRemoveItem(idx)}
                    className="p-1.5 text-red-450 hover:bg-red-950/20 border border-transparent hover:border-red-900/30 rounded transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Retazos Form Fields */}
        <div className="space-y-3.5 border-t border-slate-800 pt-3.5">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Retazos Obtenidos (Opcional)</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Tipo de Retazo</label>
              <select
                value={tempRetazoId}
                onChange={(e) => setTempRetazoId(e.target.value)}
                className="w-full bg-slate-950 border-2 border-slate-800 rounded-md px-3 py-3 text-xs text-slate-200 focus:outline-none focus:border-blue-600 uppercase font-extrabold cursor-pointer"
                style={{ minHeight: "45px" }}
              >
                <option value="">-- Seleccionar --</option>
                {retazosCatalog.map(r => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Cantidad Retazos</label>
              <input
                type="number"
                value={tempRetazoQty}
                onChange={(e) => setTempRetazoQty(e.target.value)}
                placeholder="Cantidad..."
                className="w-full bg-slate-950 border-2 border-slate-800 rounded-md px-3.5 py-3 text-xs text-slate-200 focus:outline-none focus:border-blue-600 font-bold"
                style={{ minHeight: "45px" }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddRetazo}
            className="w-full bg-slate-800 hover:bg-slate-750 text-gray-250 border-2 border-slate-700 font-black py-3 rounded-md text-xs uppercase tracking-wider transition active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-green-400" />
            <span>Agregar Retazo</span>
          </button>
        </div>

        {/* List of retazos to register */}
        {corteRetazos.length > 0 && (
          <div className="space-y-2 border-t border-slate-800 pt-3">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Retazos Registrados:</h3>
            <div className="space-y-1.5">
              {corteRetazos.map((item, idx) => (
                <div key={idx} className="bg-black/30 border-2 border-slate-850 p-3 rounded-md flex justify-between items-center text-xs">
                  <div>
                    <span className="font-extrabold text-gray-205 uppercase">{item.nombre}</span>
                    <span className="block text-[10px] text-gray-400 mt-0.5 font-mono font-bold">{item.cantidadUnidades.toLocaleString()} Unidades</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveRetazo(idx)}
                    className="p-1.5 text-red-450 hover:bg-red-950/20 border border-transparent hover:border-red-900/30 rounded transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Observations */}
        <div className="border-t border-slate-800 pt-3">
          <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Observaciones</label>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Comentarios adicionales sobre el corte del día..."
            className="w-full bg-slate-950 border-2 border-slate-800 rounded-md px-3.5 py-3 text-xs text-slate-200 focus:outline-none focus:border-blue-600 h-16 resize-none"
          />
        </div>

        {submitError && (
          <div className="bg-red-950/30 border-2 border-red-900/50 p-3 rounded-md text-xs text-red-300 font-bold flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Submit action */}
        <button
          type="button"
          onClick={handleProcessSubmit}
          className="w-full bg-blue-750 hover:bg-blue-700 text-white border-2 border-blue-600 font-black py-4.5 rounded-md text-xs uppercase tracking-wider transition active:scale-[0.98] shadow-md cursor-pointer"
        >
          Registrar Corte del Día
        </button>
      </div>

      {/* Sync visual status notifications for last submission */}
      {lastCreatedId && lastMovement && (
        <div className={`p-4 rounded-md border-2 text-xs flex items-center gap-3 animate-fadeIn transition ${
          lastMovement.syncStatus === "SYNCED"
            ? "bg-green-950/30 border-green-900/50 text-green-300"
            : lastMovement.syncStatus === "FAILED" || lastMovement.syncStatus === "CONFLICT"
            ? "bg-red-950/30 border-red-900/50 text-red-300"
            : "bg-yellow-950/30 border-yellow-900/50 text-yellow-300"
        }`}>
          {lastMovement.syncStatus === "SYNCED" ? (
            <>
              <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
              <div>
                <span className="font-bold block">Sincronizado con el servidor</span>
                <span className="text-[10px] text-gray-400 mt-0.5">La producción ya se encuentra guardada en la base de datos central.</span>
              </div>
            </>
          ) : lastMovement.syncStatus === "FAILED" || lastMovement.syncStatus === "CONFLICT" ? (
            <>
              <XCircle className="w-5 h-5 text-red-400 shrink-0" />
              <div>
                <span className="font-bold block">Fallo de sincronización</span>
                <span className="text-[10px] text-gray-400 mt-0.5">Se guardó localmente en cola. Error: {lastMovement.syncErrorMessage || "Error desconocido."}</span>
              </div>
            </>
          ) : (
            <>
              <RefreshCw className="w-5 h-5 text-yellow-400 animate-spin shrink-0" />
              <div>
                <span className="font-bold block">Guardado localmente</span>
                <span className="text-[10px] text-gray-400 mt-0.5">Sin conexión. Sincronización pendiente (enviando automáticamente al restablecer red).</span>
              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
};
