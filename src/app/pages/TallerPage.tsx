import React, { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import { catalogService } from "../services/catalog.service";
import { queueService } from "../offline/queue.service";
import { CheckCircle, AlertTriangle, XCircle, Trash2, Plus, ArrowRight, Monitor, Wrench } from "lucide-react";
import { formatSyncError } from "../sync/sync-error-mapper";
import { useRuntimeStore } from "../runtime/runtime.store";
import { authFetch } from "../auth/auth.api";

export const TallerPage: React.FC = () => {
  const authPhase = useRuntimeStore((s) => s.authPhase);
  const currentUser = useRuntimeStore((s) => s.currentUser);
  const online = useRuntimeStore((s) => s.online);

  const isAdmin = currentUser?.permisos?.includes("ADMIN_SISTEMA") || currentUser?.nombre === "Ariel" || currentUser?.nombre === "Leo";
  const isSupervisor = currentUser?.permisos?.includes("MOVIMIENTOS_VER") && currentUser?.permisos?.includes("MOVIMIENTOS_CREAR") && !isAdmin;

  // Master lists
  const [talleres, setTalleres] = useState<any[]>([]);
  const [depositos, setDepositos] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [productionSummary, setProductionSummary] = useState<any[]>([]);

  // Form Mode
  const [tipoOp, setTipoOp] = useState<"ENTREGA" | "DEVOLUCION" | "MONITOREO">("ENTREGA");
  
  // Shared Form Fields
  const [selectedTallerId, setSelectedTallerId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // --- ENTREGA (Delivery) States ---
  const [entregasTelas, setEntregasTelas] = useState<any[]>([]);
  const [entregasInsumos, setEntregasInsumos] = useState<any[]>([]);
  
  // Temp fields for adding to delivery lists
  const [tempTelaId, setTempTelaId] = useState("");
  const [tempTelaQty, setTempTelaQty] = useState("");
  const [tempInsumoId, setTempInsumoId] = useState("");
  const [tempInsumoQty, setTempInsumoQty] = useState("");

  // --- DEVOLUCION (Return) States ---
  const [selectedDepositoId, setSelectedDepositoId] = useState(""); // Destination deposit
  const [devolucionesProductos, setDevolucionesProductos] = useState<any[]>([]);

  // Temp fields for adding to return list
  const [tempProductId, setTempProductId] = useState("");
  const [tempPerfectQty, setTempPerfectQty] = useState("");
  const [tempPerfectUnit, setTempPerfectUnit] = useState<"UNIDAD" | "DOCENA" | "FARDO">("UNIDAD");
  const [tempFalladoQty, setTempFalladoQty] = useState("");
  const [tempFalladoUnit, setTempFalladoUnit] = useState<"UNIDAD" | "DOCENA" | "FARDO">("UNIDAD");

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
  const loadData = async () => {
    try {
      await catalogService.syncCatalogos();

      const [pList, dList, tList] = await Promise.all([
        catalogService.getProductos(),
        catalogService.getDepositos(),
        catalogService.getTalleres()
      ]);

      setProductos(pList);
      setDepositos(dList);
      setTalleres(tList);

      // Load Stock Levels to validate available quantities
      if (online) {
        const stockRes = await authFetch("/api/stock?limit=1000");
        if (stockRes.ok) {
          const json = await stockRes.json();
          setStockItems(json.data || []);
        }
      } else {
        const items = await db.stockCache.toArray();
        setStockItems(items);
      }

      // Load sticky session values
      const stickyTaller = sessionStorage.getItem("tml_taller_id");
      const stickyDeposito = sessionStorage.getItem("tml_deposito_id");
      if (stickyTaller) setSelectedTallerId(stickyTaller);
      if (stickyDeposito) setSelectedDepositoId(stickyDeposito);

      // Fetch production monitoring if online and Admin/Supervisor
      if (online && (isAdmin || isSupervisor)) {
        const res = await authFetch("/api/talleres/resumen-financiero");
        if (res.ok) {
          const json = await res.json();
          setProductionSummary(json.data || []);
        }
      }
    } catch (err) {
      console.error("Error loading catalogs in TallerPage:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [authPhase, currentUser, online, tipoOp]);

  const handleTallerChange = (id: string) => {
    setSelectedTallerId(id);
    sessionStorage.setItem("tml_taller_id", id);
  };

  const handleDepositoChange = (id: string) => {
    setSelectedDepositoId(id);
    sessionStorage.setItem("tml_deposito_id", id);
  };

  const triggerHapticSuccess = () => {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([100, 50, 100]);
    }
  };

  const triggerHapticError = () => {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([200, 100, 200]);
    }
  };

  // Unit conversion helper
  const convertToUnits = (qty: number, type: string, unitsPerFardo: number) => {
    if (type === "DOCENA") return qty * 12;
    if (type === "FARDO") return qty * (unitsPerFardo || 60);
    return qty; // UNIDAD
  };

  const formatUnitText = (qty: string, type: string) => {
    if (!qty || parseFloat(qty) === 0) return "";
    if (type === "DOCENA") return `${qty} Doc`;
    if (type === "FARDO") return `${qty} F`;
    return `${qty} U`;
  };

  // Identify warehouses
  const corteDep = depositos.find(d => d.tipo === "PRODUCCION" || d.nombre.toUpperCase().includes("CORTE"));
  const corteDepId = corteDep?.id;

  const centralDep = depositos.find(d => d.tipo === "STOCK" || d.nombre.toUpperCase().includes("CENTRAL"));
  const centralDepId = centralDep?.id;

  // Filter products by tipoProducto as per unified model
  const telasCortadasRaw = productos.filter(p => p.tipoProducto === "BASE");
  const insumosRaw = productos.filter(p => p.tipoProducto === "INSUMO");
  const productosTerminados = productos.filter(p => p.tipoProducto === "COMERCIAL" || p.tipoProducto === "FALLADO");

  // Get available items with stock levels
  const getAvailableTelasCortadas = () => {
    if (!corteDepId) return [];
    return telasCortadasRaw.map(p => {
      const stock = stockItems.find(item => item.productoId === p.id && item.depositoId === corteDepId);
      const available = stock ? stock.cantidadUnidades : 0;
      return { ...p, available };
    }).filter(p => p.available > 0);
  };

  const getAvailableInsumos = () => {
    return insumosRaw.map(p => {
      const stock = stockItems.find(item => item.productoId === p.id && (item.depositoId === centralDepId || !centralDepId));
      const available = stock ? stock.cantidadUnidades : 0;
      return { ...p, available };
    }).filter(p => p.available > 0);
  };

  // --- Adders for lists ---
  const handleAddTela = () => {
    const qty = parseInt(tempTelaQty, 10);
    if (!tempTelaId) return;
    if (isNaN(qty) || qty <= 0) {
      alert("Ingrese una cantidad válida mayor a cero.");
      return;
    }
    const tela = getAvailableTelasCortadas().find(p => p.id === tempTelaId);
    if (!tela) {
      alert("El producto seleccionado no cuenta con existencias en Zona de Corte.");
      return;
    }
    if (qty > tela.available) {
      alert(`Error: No puede entregar más unidades que las disponibles físicas en la Zona de Corte (${tela.available} u. disponibles).`);
      return;
    }

    // Check duplicate in form list
    const exists = entregasTelas.find(item => item.productoId === tempTelaId);
    if (exists) {
      if (exists.cantidadUnidades + qty > tela.available) {
        alert(`Error: La suma agregada supera el stock disponible en Zona de Corte (${tela.available} u.).`);
        return;
      }
      setEntregasTelas(entregasTelas.map(item => 
        item.productoId === tempTelaId ? { ...item, cantidadUnidades: item.cantidadUnidades + qty } : item
      ));
    } else {
      setEntregasTelas([...entregasTelas, {
        productoId: tempTelaId,
        nombre: tela.nombre,
        cantidadUnidades: qty
      }]);
    }
    setTempTelaId("");
    setTempTelaQty("");
  };

  const handleAddInsumo = () => {
    const qty = parseFloat(tempInsumoQty);
    if (!tempInsumoId) return;
    if (isNaN(qty) || qty <= 0) {
      alert("Ingrese una cantidad de insumo válida mayor a cero.");
      return;
    }
    const insumo = getAvailableInsumos().find(p => p.id === tempInsumoId);
    if (!insumo) {
      alert("El insumo seleccionado no cuenta con existencias en el Galpón Central.");
      return;
    }
    if (qty > insumo.available) {
      alert(`Error: No puede entregar más unidades que las disponibles físicas en el Galpón Central (${insumo.available} u. disponibles).`);
      return;
    }

    const desc = insumo.nombre;
    const exists = entregasInsumos.find(item => item.descripcion === desc);
    if (exists) {
      if (exists.cantidad + qty > insumo.available) {
        alert(`Error: La suma agregada supera el stock disponible en el Galpón Central (${insumo.available} u.).`);
        return;
      }
      setEntregasInsumos(entregasInsumos.map(item => 
        item.descripcion === desc ? { ...item, cantidad: item.cantidad + qty } : item
      ));
    } else {
      setEntregasInsumos([...entregasInsumos, {
        productoId: tempInsumoId,
        descripcion: desc,
        cantidad: qty
      }]);
    }
    setTempInsumoId("");
    setTempInsumoQty("");
  };

  const handleAddProductoDevolucion = () => {
    const rawPerf = parseInt(tempPerfectQty, 10) || 0;
    const rawFall = parseInt(tempFalladoQty, 10) || 0;

    if (!tempProductId) return;
    if (rawPerf <= 0 && rawFall <= 0) {
      alert("Ingrese al menos una cantidad mayor a cero.");
      return;
    }
    const prod = productos.find(p => p.id === tempProductId);
    if (!prod) return;

    const uPorFardo = prod.unidadesPorFardo || 60;
    const perfUnits = convertToUnits(rawPerf, tempPerfectUnit, uPorFardo);
    const fallUnits = convertToUnits(rawFall, tempFalladoUnit, uPorFardo);

    const labelPerf = formatUnitText(tempPerfectQty, tempPerfectUnit);
    const labelFall = formatUnitText(tempFalladoQty, tempFalladoUnit);

    const exists = devolucionesProductos.find(item => item.productoId === tempProductId);
    if (exists) {
      setDevolucionesProductos(devolucionesProductos.map(item => 
        item.productoId === tempProductId 
          ? { 
              ...item, 
              cantidadUnidades: item.cantidadUnidades + perfUnits, 
              cantidadFallados: item.cantidadFallados + fallUnits,
              displayPerfect: item.displayPerfect ? `${item.displayPerfect} + ${labelPerf}` : labelPerf,
              displayFallado: item.displayFallado ? `${item.displayFallado} + ${labelFall}` : labelFall
            } 
          : item
      ));
    } else {
      setDevolucionesProductos([...devolucionesProductos, {
        productoId: tempProductId,
        nombre: prod.nombre,
        cantidadUnidades: perfUnits,
        cantidadFallados: fallUnits,
        displayPerfect: labelPerf,
        displayFallado: labelFall
      }]);
    }
    setTempProductId("");
    setTempPerfectQty("");
    setTempFalladoQty("");
    setTempPerfectUnit("UNIDAD");
    setTempFalladoUnit("UNIDAD");
  };

  const handleRemoveTela = (index: number) => {
    setEntregasTelas(entregasTelas.filter((_, i) => i !== index));
  };

  const handleRemoveInsumo = (index: number) => {
    setEntregasInsumos(entregasInsumos.filter((_, i) => i !== index));
  };

  const handleRemoveDevolucion = (index: number) => {
    setDevolucionesProductos(devolucionesProductos.filter((_, i) => i !== index));
  };

  // --- Submit handler ---
  const handleProcessSubmit = async () => {
    setSubmitError(null);
    setLastCreatedId(null);

    if (!selectedTallerId) {
      setSubmitError("Debe seleccionar un Taller.");
      triggerHapticError();
      return;
    }

    if (tipoOp === "ENTREGA") {
      if (entregasTelas.length === 0) {
        setSubmitError("Debe agregar al menos una tela cortada en la entrega.");
        triggerHapticError();
        return;
      }

      try {
        const items = entregasTelas.map(t => ({
          productoId: t.productoId,
          cantidadUnidades: t.cantidadUnidades,
          depositoOrigenId: corteDepId || null, // Fixed to Zona de Corte
          depositoDestinoId: null,
          tallerOrigenId: null,
          tallerDestinoId: selectedTallerId,
          calidad: "PERFECTO" as const,
          presentacion: "SIN_ETIQUETA" as const,
          canal: "MAYORISTA" as const,
          direccion: "SALIDA" as const
        }));

        // Append insumos if any
        const insumoItems = entregasInsumos.map(ins => ({
          productoId: ins.productoId,
          cantidadUnidades: ins.cantidad,
          depositoOrigenId: centralDepId || null, // Fixed to Central
          depositoDestinoId: null,
          tallerOrigenId: null,
          tallerDestinoId: selectedTallerId,
          calidad: "PERFECTO" as const,
          presentacion: "SIN_ETIQUETA" as const,
          canal: "MAYORISTA" as const,
          direccion: "SALIDA" as const
        }));

        const movement = await queueService.enqueue(
          "ENTREGA_TALLER",
          [...items, ...insumoItems],
          selectedTallerId,
          observaciones || "Entrega de telas cortadas e insumos a taller",
          "HIGH"
        );

        triggerHapticSuccess();
        setLastCreatedId(movement.clientGeneratedId);
        
        // Reset lists
        setEntregasTelas([]);
        setEntregasInsumos([]);
        setObservaciones("");
        void loadData(); // Reload stock
      } catch (err: any) {
        triggerHapticError();
        setSubmitError(err.message || "Error al registrar la entrega.");
      }
    } else if (tipoOp === "DEVOLUCION") {
      if (!selectedDepositoId) {
        setSubmitError("Debe seleccionar un Depósito de Destino.");
        triggerHapticError();
        return;
      }
      if (devolucionesProductos.length === 0) {
        setSubmitError("Debe agregar al menos un producto devuelto.");
        triggerHapticError();
        return;
      }

      try {
        const items: any[] = [];
        for (const p of devolucionesProductos) {
          if (p.cantidadUnidades > 0) {
            items.push({
              productoId: p.productoId,
              cantidadUnidades: p.cantidadUnidades,
              depositoOrigenId: null,
              depositoDestinoId: selectedDepositoId,
              tallerOrigenId: selectedTallerId,
              tallerDestinoId: null,
              calidad: "PERFECTO" as const,
              presentacion: "SIN_ETIQUETA" as const,
              canal: "MAYORISTA" as const,
              direccion: "ENTRADA" as const
            });
          }
          if (p.cantidadFallados > 0) {
            items.push({
              productoId: p.productoId,
              cantidadUnidades: p.cantidadFallados,
              depositoOrigenId: null,
              depositoDestinoId: selectedDepositoId,
              tallerOrigenId: selectedTallerId,
              tallerDestinoId: null,
              calidad: "FALLADO" as const,
              presentacion: "SIN_ETIQUETA" as const,
              canal: "MAYORISTA" as const,
              direccion: "ENTRADA" as const
            });
          }
        }

        const movement = await queueService.enqueue(
          "DEVOLUCION_TALLER",
          items,
          selectedTallerId,
          observaciones || "Devolución de productos confeccionados desde taller",
          "HIGH"
        );

        triggerHapticSuccess();
        setLastCreatedId(movement.clientGeneratedId);
        setDevolucionesProductos([]);
        setObservaciones("");
        void loadData(); // Reload stock
      } catch (err: any) {
        triggerHapticError();
        setSubmitError(err.message || "Error al registrar la devolución.");
      }
    }
  };

  const handleFormReset = () => {
    setEntregasTelas([]);
    setEntregasInsumos([]);
    setDevolucionesProductos([]);
    setObservaciones("");
    setSubmitError(null);
    setLastCreatedId(null);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
        <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs uppercase font-black tracking-widest">Cargando base de datos...</span>
      </div>
    );
  }

  const availableTelasCortadas = getAvailableTelasCortadas();
  const availableInsumos = getAvailableInsumos();

  return (
    <div className="flex-1 max-w-lg mx-auto w-full space-y-4 pb-8 text-gray-200 font-sans">
      
      {/* Operation selector tabs */}
      <div className="grid grid-cols-3 gap-2 bg-slate-900 p-1.5 rounded-md border-2 border-slate-800">
        <button
          type="button"
          onClick={() => { setTipoOp("ENTREGA"); handleFormReset(); }}
          className={`py-3.5 rounded-md text-xs font-black tracking-wider transition uppercase cursor-pointer ${
            tipoOp === "ENTREGA"
              ? "bg-blue-700 text-white shadow-md border-2 border-blue-600"
              : "text-gray-400 hover:text-gray-250"
          }`}
        >
          <ArrowRight className="w-3.5 h-3.5 inline-block mr-1" /> Entrega
        </button>
        
        <button
          type="button"
          onClick={() => { setTipoOp("DEVOLUCION"); handleFormReset(); }}
          className={`py-3.5 rounded-md text-xs font-black tracking-wider transition uppercase cursor-pointer ${
            tipoOp === "DEVOLUCION"
              ? "bg-blue-700 text-white shadow-md border-2 border-blue-600"
              : "text-gray-400 hover:text-gray-250"
          }`}
        >
          <Wrench className="w-3.5 h-3.5 inline-block mr-1" /> Devolución
        </button>

        {(isSupervisor || isAdmin) && (
          <button
            type="button"
            onClick={() => { setTipoOp("MONITOREO"); }}
            className={`py-3.5 rounded-md text-xs font-black tracking-wider transition uppercase cursor-pointer ${
              tipoOp === "MONITOREO"
                ? "bg-blue-700 text-white shadow-md border-2 border-blue-600"
                : "text-gray-400 hover:text-gray-250"
            }`}
          >
            <Monitor className="w-3.5 h-3.5 inline-block mr-1" /> Monitoreo
          </button>
        )}
      </div>

      {tipoOp === "MONITOREO" ? (
        /* --- WORKFLOW: MONITOREO DE TALLERES (SUPERVISORES) --- */
        <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md space-y-4">
          <div>
            <span className="bg-slate-800 text-slate-350 border border-slate-700 px-2 py-0.5 rounded text-[9px] font-black tracking-widest font-mono">
              PANEL GENERAL
            </span>
            <h3 className="text-sm font-black uppercase tracking-widest text-white mt-1 border-b border-slate-800 pb-2">
              Estado de Producción de Talleres
            </h3>
          </div>

          {!online && (
            <div className="bg-amber-950/45 border border-amber-900/50 p-3 rounded-md text-xs text-amber-300 font-bold">
              Modo sin conexión: la información de monitoreo consolidado requiere red.
            </div>
          )}

          <div className="overflow-x-auto border-2 border-slate-850 rounded-md bg-slate-950">
            <table className="w-full text-xs text-left border-collapse min-w-[450px]">
              <thead>
                <tr className="bg-slate-900 text-gray-450 border-b border-slate-800 uppercase tracking-wider text-[8px] font-black">
                  <th className="p-3">Taller</th>
                  <th className="p-3 text-right">Recibido</th>
                  <th className="p-3 text-right">Producido</th>
                  <th className="p-3 text-right text-red-400">Pendiente</th>
                  <th className="p-3 text-right">Devuelto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {productionSummary.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500 font-bold uppercase italic text-[10px] font-sans">
                      No hay datos de producción registrados.
                    </td>
                  </tr>
                ) : (
                  productionSummary.map((t) => (
                    <tr key={t.tallerId} className="hover:bg-slate-850/30">
                      <td className="p-3 font-bold text-white uppercase font-sans">{t.tallerNombre}</td>
                      <td className="p-3 text-right text-gray-300">{t.totalRecibido.toLocaleString()} u.</td>
                      <td className="p-3 text-right text-green-455">{t.produccionPerfecta.toLocaleString()} u.</td>
                      <td className="p-3 text-right font-black text-red-455 bg-red-950/10">{t.totalPendiente.toLocaleString()} u.</td>
                      <td className="p-3 text-right text-blue-400">{t.totalDevuelto.toLocaleString()} u.</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* --- WORKFLOW: ENTREGAS & DEVOLUCIONES --- */
        <div className="space-y-4 animate-fadeIn">
          {/* Metadata Section */}
          <div className="bg-slate-900 border-2 border-slate-800 p-4 rounded-md space-y-4 shadow-md">
            <div>
              <span className="bg-slate-800 text-slate-355 border border-slate-700 px-2 py-0.5 rounded text-[9px] font-black tracking-widest font-mono">
                DATOS DE CABECERA
              </span>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 mt-1.5 border-b border-slate-850 pb-2">
                Información del Movimiento
              </h3>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {/* Taller Selection */}
              <div>
                <label className="block text-[10px] font-black text-gray-455 uppercase tracking-widest mb-1.5">
                  Taller Destinatario *
                </label>
                <div className="relative">
                  <select
                    value={selectedTallerId}
                    onChange={(e) => handleTallerChange(e.target.value)}
                    className="w-full bg-slate-950 border-2 border-slate-800 rounded px-3.5 py-3 text-sm text-slate-200 focus:outline-none focus:border-blue-600 cursor-pointer appearance-none uppercase font-bold"
                    style={{ minHeight: "50px" }}
                  >
                    <option value="">-- Seleccionar Taller --</option>
                    {talleres.map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Destination warehouse for return */}
              {tipoOp === "DEVOLUCION" && (
                <div>
                  <label className="block text-[10px] font-black text-gray-455 uppercase tracking-widest mb-1.5">
                    Depósito de Fábrica Destino *
                  </label>
                  <div className="relative">
                    <select
                      value={selectedDepositoId}
                      onChange={(e) => handleDepositoChange(e.target.value)}
                      className="w-full bg-slate-950 border-2 border-slate-800 rounded px-3.5 py-3 text-sm text-slate-200 focus:outline-none focus:border-blue-600 cursor-pointer appearance-none uppercase font-bold"
                      style={{ minHeight: "50px" }}
                    >
                      <option value="">-- Seleccionar Depósito --</option>
                      {depositos.filter(d => d.tipo !== "TALLER").map((d) => (
                        <option key={d.id} value={d.id}>{d.nombre} ({d.tipo})</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Origin warehouse for delivery is Corte */}
              {tipoOp === "ENTREGA" && (
                <div className="bg-slate-950 border-2 border-slate-800 p-3.5 rounded flex items-center justify-between text-xs">
                  <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">Depósito Origen Fijo</span>
                  <span className="bg-blue-950/30 border border-blue-900/50 px-3 py-1 rounded text-blue-350 font-black tracking-wide">ZONA DE CORTE</span>
                </div>
              )}

              {/* Observaciones */}
              <div>
                <label className="block text-[10px] font-black text-gray-455 uppercase tracking-widest mb-1.5">
                  Observaciones / Notas
                </label>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Detalles sobre remitos, fletes, etc."
                  className="w-full bg-slate-950 border-2 border-slate-800 rounded px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-600 transition resize-none min-h-[64px] font-bold"
                />
              </div>
            </div>
          </div>

          {/* Workflow specific: ENTREGA */}
          {tipoOp === "ENTREGA" && (
            <div className="space-y-4 animate-fadeIn">
              
              {/* Telas Cortadas */}
              <div className="bg-slate-900 border-2 border-slate-800 p-4 rounded-md space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-blue-400 border-b border-slate-850 pb-2">1. Telas Cortadas a Enviar (Origen: Zona de Corte)</h4>
                
                {availableTelasCortadas.length === 0 ? (
                  <p className="text-[10px] text-yellow-400 font-bold uppercase py-2 bg-yellow-950/15 border border-yellow-900/30 px-3 rounded">
                    ⚠️ No hay Telas Cortadas disponibles físicas en la Zona de Corte. Debe registrar cortadas primero.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={tempTelaId}
                      onChange={(e) => setTempTelaId(e.target.value)}
                      className="flex-1 bg-slate-950 border-2 border-slate-800 rounded px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-600 uppercase font-bold cursor-pointer"
                    >
                      <option value="">-- Seleccionar Tela Cortada --</option>
                      {availableTelasCortadas.map((t) => (
                        <option key={t.id} value={t.id}>{t.nombre} (Disponibles: {t.available} u.)</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      pattern="[0-9]*"
                      inputMode="numeric"
                      value={tempTelaQty}
                      onChange={(e) => setTempTelaQty(e.target.value)}
                      placeholder="Unidades"
                      className="w-24 bg-slate-950 border-2 border-slate-800 rounded text-center text-xs text-slate-200 focus:outline-none focus:border-blue-600 font-black font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleAddTela}
                      className="bg-blue-700 hover:bg-blue-650 text-white rounded px-4 font-black text-xs flex items-center gap-1 active:scale-95 transition cursor-pointer font-bold"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Added Telas */}
                <div className="border-2 border-slate-850 rounded overflow-hidden bg-slate-950">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/80 text-gray-400 font-bold uppercase text-[9px]">
                        <th className="p-3">Tela Cortada</th>
                        <th className="p-3 text-center w-24">Cantidad</th>
                        <th className="p-3 w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {entregasTelas.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-gray-500 font-bold uppercase italic text-[9px]">
                            Ninguna tela cortada agregada.
                          </td>
                        </tr>
                      ) : (
                        entregasTelas.map((item, index) => (
                          <tr key={item.productoId} className="border-b border-slate-850 hover:bg-slate-850/20">
                            <td className="p-3 font-semibold text-gray-150 uppercase">{item.nombre}</td>
                            <td className="p-3 text-center font-extrabold text-blue-400 text-sm font-mono">{item.cantidadUnidades.toLocaleString()} u.</td>
                            <td className="p-2 text-center">
                              <button type="button" onClick={() => handleRemoveTela(index)} className="text-red-400 hover:text-red-300 p-1.5 hover:bg-red-950/20 rounded">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Insumos */}
              <div className="bg-slate-900 border-2 border-slate-800 p-4 rounded-md space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-green-400 border-b border-slate-850 pb-2">2. Insumos a Enviar (Origen: Galpón Central)</h4>
                
                {availableInsumos.length === 0 ? (
                  <p className="text-[10px] text-yellow-400 font-bold uppercase py-2 bg-yellow-950/15 border border-yellow-900/30 px-3 rounded">
                    ⚠️ No hay Insumos disponibles físicas en el Galpón Central.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={tempInsumoId}
                      onChange={(e) => setTempInsumoId(e.target.value)}
                      className="flex-1 bg-slate-950 border-2 border-slate-800 rounded px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-600 uppercase font-bold cursor-pointer"
                    >
                      <option value="">-- Seleccionar Insumo --</option>
                      {availableInsumos.map((ins) => (
                        <option key={ins.id} value={ins.id}>{ins.nombre} (Disponibles: {ins.available} u.)</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      pattern="[0-9]*"
                      inputMode="numeric"
                      value={tempInsumoQty}
                      onChange={(e) => setTempInsumoQty(e.target.value)}
                      placeholder="Cantidad"
                      className="w-24 bg-slate-950 border-2 border-slate-800 rounded text-center text-xs text-slate-200 focus:outline-none focus:border-blue-600 font-black font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleAddInsumo}
                      className="bg-green-700 hover:bg-green-655 text-white rounded px-4 font-black text-xs flex items-center gap-1 active:scale-95 transition cursor-pointer font-bold"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Added Insumos */}
                <div className="border-2 border-slate-855 rounded overflow-hidden bg-slate-950">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/80 text-gray-400 font-bold uppercase text-[9px]">
                        <th className="p-3">Insumo</th>
                        <th className="p-3 text-center w-24">Cantidad</th>
                        <th className="p-3 w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {entregasInsumos.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-gray-500 font-bold uppercase italic text-[9px]">
                            Ningún insumo agregado.
                          </td>
                        </tr>
                      ) : (
                        entregasInsumos.map((item, index) => (
                          <tr key={index} className="border-b border-slate-850 hover:bg-slate-850/20">
                            <td className="p-3 font-semibold text-gray-150 uppercase">{item.descripcion}</td>
                            <td className="p-3 text-center font-extrabold text-green-400 text-sm font-mono">{item.cantidad.toLocaleString()} u.</td>
                            <td className="p-2 text-center">
                              <button type="button" onClick={() => handleRemoveInsumo(index)} className="text-red-400 hover:text-red-300 p-1.5 hover:bg-red-950/20 rounded">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* Workflow specific: DEVOLUCION */}
          {tipoOp === "DEVOLUCION" && (
            <div className="bg-slate-900 border-2 border-slate-800 p-4 rounded-md space-y-4 shadow-md animate-fadeIn">
              <h4 className="text-xs font-black uppercase tracking-widest text-blue-400 border-b border-slate-850 pb-2">Productos Devueltos Confeccionados</h4>
              
              <div className="space-y-4 p-3.5 bg-slate-950 border-2 border-slate-855 rounded-md">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Producto Confeccionado Terminado *</label>
                  <select
                    value={tempProductId}
                    onChange={(e) => setTempProductId(e.target.value)}
                    className="w-full bg-slate-950 border-2 border-slate-800 rounded px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-600 font-bold uppercase cursor-pointer"
                  >
                    <option value="">-- Seleccionar Producto --</option>
                    {productosTerminados.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                </div>
                
                {/* Quantity + Unit selectors */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Cantidad Perfecta</label>
                    <div className="flex bg-slate-950 border-2 border-slate-800 rounded overflow-hidden">
                      <input
                        type="number"
                        pattern="[0-9]*"
                        inputMode="numeric"
                        value={tempPerfectQty}
                        onChange={(e) => setTempPerfectQty(e.target.value)}
                        placeholder="0"
                        className="w-full bg-transparent px-2.5 text-center text-xs text-slate-100 font-black font-mono outline-none"
                      />
                      <select
                        value={tempPerfectUnit}
                        onChange={(e: any) => setTempPerfectUnit(e.target.value)}
                        className="bg-slate-900 border-l border-slate-800 text-[10px] font-bold text-gray-300 px-2 uppercase cursor-pointer py-1.5 focus:outline-none"
                      >
                        <option value="UNIDAD">u.</option>
                        <option value="DOCENA">doc.</option>
                        <option value="FARDO">fardos</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Cantidad Fallada</label>
                    <div className="flex bg-slate-950 border-2 border-slate-800 rounded overflow-hidden">
                      <input
                        type="number"
                        pattern="[0-9]*"
                        inputMode="numeric"
                        value={tempFalladoQty}
                        onChange={(e) => setTempFalladoQty(e.target.value)}
                        placeholder="0"
                        className="w-full bg-transparent px-2.5 text-center text-xs text-slate-100 font-black font-mono outline-none"
                      />
                      <select
                        value={tempFalladoUnit}
                        onChange={(e: any) => setTempFalladoUnit(e.target.value)}
                        className="bg-slate-900 border-l border-slate-800 text-[10px] font-bold text-gray-300 px-2 uppercase cursor-pointer py-1.5 focus:outline-none"
                      >
                        <option value="UNIDAD">u.</option>
                        <option value="DOCENA">doc.</option>
                        <option value="FARDO">fardos</option>
                      </select>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddProductoDevolucion}
                  className="w-full bg-blue-700 hover:bg-blue-650 text-white border-2 border-blue-600 rounded py-3 font-black text-xs flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Agregar Producto a Devolución
                </button>
              </div>

              {/* Converted items lists */}
              <div className="border-2 border-slate-850 rounded overflow-hidden bg-slate-950">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/80 text-gray-400 font-bold uppercase text-[9px]">
                      <th className="p-3">Producto</th>
                      <th className="p-3 text-center w-24">Perfecto</th>
                      <th className="p-3 text-center w-24">Fallado</th>
                      <th className="p-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {devolucionesProductos.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-gray-500 font-bold uppercase italic text-[9px]">
                          Ningún producto agregado a la devolución.
                        </td>
                      </tr>
                    ) : (
                      devolucionesProductos.map((item, index) => (
                        <tr key={item.productoId} className="border-b border-slate-850 hover:bg-slate-850/30">
                          <td className="p-3 font-semibold text-gray-150 uppercase">{item.nombre}</td>
                          <td className="p-3 text-center font-black text-green-400 text-sm font-mono">
                            {item.cantidadUnidades.toLocaleString()} u.
                            {item.displayPerfect && <span className="block text-[9px] text-gray-500 font-sans font-medium">({item.displayPerfect})</span>}
                          </td>
                          <td className="p-3 text-center font-black text-red-400 text-sm font-mono">
                            {item.cantidadFallados > 0 ? `${item.cantidadFallados.toLocaleString()} u.` : "-"}
                            {item.displayFallado && item.cantidadFallados > 0 && <span className="block text-[9px] text-gray-500 font-sans font-medium">({item.displayFallado})</span>}
                          </td>
                          <td className="p-2 text-center">
                            <button type="button" onClick={() => handleRemoveDevolucion(index)} className="text-red-400 hover:text-red-300 p-1.5 hover:bg-red-950/20 border border-transparent rounded transition cursor-pointer">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sync / Submit feedback */}
          {submitError && (
            <div className="p-3.5 rounded-md border-2 flex items-start gap-2.5 text-xs bg-red-950/30 border-red-900/50 text-red-300">
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-450" />
              <div>{submitError}</div>
            </div>
          )}

          {lastCreatedId && (
            <div className="p-3.5 rounded border-2 flex items-start gap-2.5 text-xs bg-slate-900 border-slate-850 text-gray-205">
              {!lastMovement ? (
                <>
                  <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
                  <div>Registrando movimiento localmente...</div>
                </>
              ) : lastMovement.syncStatus === "PENDING" ? (
                <>
                  <CheckCircle className="w-5 h-5 shrink-0 text-green-500" />
                  <div>
                    <span className="font-bold text-green-455">✓ Registrado en la cola de salida.</span>{" "}
                    Se enviará al servidor en segundo plano.
                  </div>
                </>
              ) : lastMovement.syncStatus === "SYNCED" ? (
                <>
                  <CheckCircle className="w-5 h-5 shrink-0 text-green-400" />
                  <div className="text-green-300 font-semibold">
                    ✓ Enviado y sincronizado correctamente con el servidor.
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 shrink-0 text-red-500" />
                  <div>
                    <span className="font-bold text-red-400">✕ Error:</span>{" "}
                    <span className="text-red-300 font-mono text-[10px] break-all">{formatSyncError(lastMovement.syncErrorMessage ?? null)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Action button panel */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleProcessSubmit}
              disabled={tipoOp === "ENTREGA" ? (entregasTelas.length === 0 || !selectedTallerId) : (devolucionesProductos.length === 0 || !selectedTallerId || !selectedDepositoId)}
              className={`w-full py-4.5 rounded font-extrabold text-xs tracking-widest transition duration-150 active:scale-[0.98] flex items-center justify-center gap-2 border-2 shadow-lg ${
                (tipoOp === "ENTREGA" ? (entregasTelas.length > 0 && selectedTallerId) : (devolucionesProductos.length > 0 && selectedTallerId && selectedDepositoId))
                  ? "bg-green-600 hover:bg-green-550 text-white border-green-500 active:bg-green-700 cursor-pointer"
                  : "bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed shadow-none"
              }`}
              style={{ minHeight: "56px" }}
            >
              CONFIRMAR {tipoOp === "ENTREGA" ? "ENTREGA A TALLER" : "DEVOLUCIÓN DE TALLER"}
            </button>

            <button
              type="button"
              onClick={handleFormReset}
              className="w-full py-3 bg-slate-800 hover:bg-slate-750 hover:text-slate-200 text-slate-400 border-2 border-slate-700 rounded text-[11px] font-black transition active:scale-[0.98] cursor-pointer"
              style={{ minHeight: "44px" }}
            >
              RESETEAR FORMULARIO
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
export default TallerPage;
