import React, { useState, useEffect } from "react";
import { useRuntimeStore } from "../runtime/runtime.store";
import { authFetch } from "../auth/auth.api";
import { formatHumanMovement } from "../utils/human-timeline";
import { catalogService } from "../services/catalog.service";
import { syncEngine } from "../sync/sync-engine";
import { 
  Settings, 
  AlertOctagon,
  RefreshCw,
  Coins
} from "lucide-react";

export const DashboardPage: React.FC = () => {
  const currentUser = useRuntimeStore((s) => s.currentUser);
  const online = useRuntimeStore((s) => s.online);
  const syncPending = useRuntimeStore((s) => s.syncPending);
  const failed = useRuntimeStore((s) => s.failed);
  const syncing = useRuntimeStore((s) => s.syncing);

  // User Role Helpers
  const isAdmin = currentUser?.permisos?.includes("ADMIN_SISTEMA") || currentUser?.nombre === "Ariel" || currentUser?.nombre === "Leo";
  const isSupervisor = currentUser?.permisos?.includes("MOVIMIENTOS_VER") && currentUser?.permisos?.includes("MOVIMIENTOS_CREAR") && !isAdmin;
  const isOperario = currentUser?.permisos?.includes("MOVIMIENTOS_CREAR") && !currentUser?.permisos?.includes("MOVIMIENTOS_VER");
  const isTaller = !!(currentUser?.allowedTalleres && currentUser.allowedTalleres.length > 0) && !currentUser?.permisos?.includes("MOVIMIENTOS_CREAR");

  // State lists
  const [productos, setProductos] = useState<any[]>([]);
  const [talleres, setTalleres] = useState<any[]>([]);
  const [productMap, setProductMap] = useState<Record<string, string>>({});
  const [tallerMap, setTallerMap] = useState<Record<string, string>>({});
  const [depositoMap, setDepositoMap] = useState<Record<string, string>>({});

  // Finance and metrics states (Ariel & Taller)
  const [financeSummary, setFinanceSummary] = useState<any[]>([]);
  const [generalStock, setGeneralStock] = useState<any[]>([]);
  const [recentMovements, setRecentMovements] = useState<any[]>([]);

  // Operational states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals / Form states (Ariel only)
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [selectedTallerId, setSelectedTallerId] = useState("");
  
  // Payment Form Fields
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentPeriodName, setPaymentPeriodName] = useState("");
  const [paymentPeriodInicio, setPaymentPeriodInicio] = useState("");
  const [paymentPeriodFin, setPaymentPeriodFin] = useState("");
  const [paymentObs, setPaymentObs] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().substring(0, 10));

  // Payment Realtime Calculation State
  const [calculatedPayment, setCalculatedPayment] = useState<any | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Rates Form Fields
  const [tallerPrecioTrapo, setTallerPrecioTrapo] = useState("0");
  const [tallerPrecioRejilla, setTallerPrecioRejilla] = useState("0");

  // Load Catalogs and metrics
  const loadDashboardData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      // 1. Get offline catalogs
      const [pList, dList, tList] = await Promise.all([
        catalogService.getProductos(),
        catalogService.getDepositos(),
        catalogService.getTalleres()
      ]);

      setProductos(pList);
      setTalleres(tList);

      const pMap: Record<string, string> = {};
      const tMap: Record<string, string> = {};
      const dMap: Record<string, string> = {};

      pList.forEach(p => { pMap[p.id] = p.nombre; });
      tList.forEach(t => { tMap[t.id] = t.nombre; });
      dList.forEach(d => { dMap[d.id] = d.nombre; });

      setProductMap(pMap);
      setTallerMap(tMap);
      setDepositoMap(dMap);

      if (online) {
        // 2. Fetch online metrics
        const financeRes = await authFetch("/api/talleres/resumen-financiero");
        if (financeRes.ok) {
          const res = await financeRes.json();
          setFinanceSummary(res.data || []);
        }

        const stockRes = await authFetch("/api/stock?limit=1000");
        if (stockRes.ok) {
          const res = await stockRes.json();
          setGeneralStock(res.data || []);
        }

        const movementsRes = await authFetch("/api/movimientos?limit=50");
        if (movementsRes.ok) {
          const res = await movementsRes.json();
          setRecentMovements(res.data || []);
        }
      }
    } catch (err: any) {
      console.error("Error loading dashboard metrics:", err);
      setError("No se pudieron cargar todas las métricas. Trabajando en modo offline.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [online]);

  // Load selected workshop fardo prices when workshop changes in rates modal
  useEffect(() => {
    if (selectedTallerId) {
      const w = financeSummary.find(t => t.tallerId === selectedTallerId);
      if (w) {
        setTallerPrecioTrapo(String(w.precioTrapoFardo || 0));
        setTallerPrecioRejilla(String(w.precioRejillaFardo || 0));
      } else {
        setTallerPrecioTrapo("0");
        setTallerPrecioRejilla("0");
      }
    } else {
      setTallerPrecioTrapo("0");
      setTallerPrecioRejilla("0");
    }
  }, [selectedTallerId]);

  // Realtime payment calculation
  useEffect(() => {
    const fetchCalculation = async () => {
      if (!selectedTallerId || !paymentPeriodInicio || !paymentPeriodFin) {
        setCalculatedPayment(null);
        setPaymentAmount("");
        return;
      }
      setCalculating(true);
      try {
        const res = await authFetch(`/api/talleres/calcular-pago?tallerId=${selectedTallerId}&inicio=${paymentPeriodInicio}&fin=${paymentPeriodFin}`);
        if (res.ok) {
          const json = await res.json();
          setCalculatedPayment(json.data);
          if (json.data?.total !== undefined) {
            setPaymentAmount(String(json.data.total));
          }
        } else {
          setCalculatedPayment(null);
          setPaymentAmount("");
        }
      } catch (err) {
        console.error("Failed to run payment calculation:", err);
        setCalculatedPayment(null);
        setPaymentAmount("");
      } finally {
        setCalculating(false);
      }
    };
    void fetchCalculation();
  }, [selectedTallerId, paymentPeriodInicio, paymentPeriodFin]);

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTallerId || !paymentAmount || parseFloat(paymentAmount) <= 0) {
      alert("Por favor ingrese un taller y un rango de fechas con producción devuelta válida.");
      return;
    }

    try {
      const res = await authFetch("/api/talleres/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tallerId: selectedTallerId,
          monto: parseFloat(paymentAmount),
          observaciones: paymentObs,
          fecha: paymentDate,
          periodoNombre: paymentPeriodName || undefined,
          periodoInicio: paymentPeriodInicio || undefined,
          periodoFin: paymentPeriodFin || undefined
        })
      });

      if (!res.ok) throw new Error("Error al guardar pago");
      
      const json = await res.json();
      setShowPaymentModal(false);
      setPaymentAmount("");
      setPaymentObs("");
      setPaymentPeriodName("");
      setPaymentPeriodInicio("");
      setPaymentPeriodFin("");
      
      // Auto open PDF
      if (json.success && json.data?.id && paymentPeriodName) {
        window.open(`/api/talleres/pagos/${json.data.id}/pdf`, "_blank");
      }
      
      void loadDashboardData();
    } catch (err: any) {
      alert("Error al registrar pago: " + err.message);
    }
  };

  const handleSaveRates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTallerId) {
      alert("Por favor seleccione un taller.");
      return;
    }

    try {
      const res = await authFetch("/api/talleres/tarifas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tallerId: selectedTallerId,
          precioTrapoFardo: parseFloat(tallerPrecioTrapo),
          precioRejillaFardo: parseFloat(tallerPrecioRejilla)
        })
      });

      if (!res.ok) throw new Error("Error al guardar tarifas");

      setShowRatesModal(false);
      void loadDashboardData();
    } catch (err: any) {
      alert("Error al guardar tarifas: " + err.message);
    }
  };

  // --- KPI & Summary Computations (Ariel & Supervisor) ---

  // 1. Daily production count (Corte area)
  const getDailyCutCount = () => {
    const today = new Date().toISOString().substring(0, 10);
    const cuts = recentMovements.filter(m => 
      m.tipo === "INGRESO_MANUAL" && 
      new Date(m.createdAt).toISOString().substring(0, 10) === today &&
      m.items.some((it: any) => depositoMap[it.depositoDestinoId]?.toUpperCase().includes("CORTE"))
    );

    const productsCut: Record<string, number> = {};
    cuts.forEach(m => {
      m.items.forEach((it: any) => {
        const name = productMap[it.productoId] || it.productoNombreSnapshot;
        productsCut[name] = (productsCut[name] || 0) + it.cantidadUnidades;
      });
    });

    return Object.entries(productsCut);
  };

  // 2. Production monthly count
  const getMonthlyConfeccionCount = () => {
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    const monthlyReturns = recentMovements.filter(m => 
      m.tipo === "DEVOLUCION_TALLER" && 
      new Date(m.createdAt).toISOString().substring(0, 7) === currentMonth
    );

    let total = 0;
    monthlyReturns.forEach(m => {
      m.items.forEach((it: any) => {
        if (it.calidad === "PERFECTO") {
          total += it.cantidadUnidades;
        }
      });
    });
    return total;
  };

  // 3. Consolidated stock
  const getConsolidatedStock = () => {
    return generalStock.reduce((sum, item) => sum + item.cantidadUnidades, 0);
  };

  // 4. Low stock alerts (computed using custom limits per product)
  const getLowStockAlerts = () => {
    const alerts: Array<{ producto: string; deposito: string; stock: number; min: number; prioridad: "ALTA" | "MEDIA" }> = [];
    
    generalStock.forEach(s => {
      if (s.tallerId) return; // Ignore virtual workshop deposits
      const prod = productos.find(p => p.id === s.productoId);
      if (!prod || prod.stockMinimo <= 0) return;

      if (s.cantidadUnidades < prod.stockMinimo) {
        const depName = depositoMap[s.depositoId] || s.deposito?.nombre || "Fábrica";
        const difference = prod.stockMinimo - s.cantidadUnidades;
        const prioridad = difference > (prod.stockMinimo * 0.5) ? "ALTA" : "MEDIA";

        alerts.push({
          producto: prod.nombre,
          deposito: depName,
          stock: s.cantidadUnidades,
          min: prod.stockMinimo,
          prioridad
        });
      }
    });

    return alerts.slice(0, 8);
  };

  // 5. Daily production recap (Centro de Producción)
  const getDailyRecap = () => {
    const today = new Date().toISOString().substring(0, 10);
    let cuts = 0;
    let sent = 0;
    let returned = 0;
    let openedFardos = 0;

    recentMovements.forEach(m => {
      const isToday = new Date(m.createdAt).toISOString().substring(0, 10) === today;
      if (!isToday) return;

      if (m.tipo === "INGRESO_MANUAL") {
        m.items.forEach((it: any) => {
          if (depositoMap[it.depositoDestinoId]?.toUpperCase().includes("CORTE")) {
            cuts += it.cantidadUnidades;
          }
        });
      } else if (m.tipo === "ENTREGA_TALLER") {
        m.items.forEach((it: any) => {
          sent += it.cantidadUnidades;
        });
      } else if (m.tipo === "DEVOLUCION_TALLER") {
        m.items.forEach((it: any) => {
          returned += it.cantidadUnidades;
        });
      } else if (m.tipo === "APERTURA_FARDO") {
        m.items.forEach((it: any) => {
          if (it.direccion === "SALIDA") {
            const uPorFardo = it.producto?.unidadesPorFardo || 60;
            openedFardos += it.cantidadUnidades / uPorFardo;
          }
        });
      }
    });

    return {
      cuts,
      sent,
      returned,
      openedFardos: Math.round(openedFardos)
    };
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
        <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs uppercase font-black tracking-widest">Cargando panel operativo...</span>
      </div>
    );
  }

  const recap = getDailyRecap();

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full space-y-6 pb-12 px-2 text-gray-200 font-sans">
      
      {error && (
        <div className="bg-red-950/40 border border-red-900 rounded p-4 text-xs text-red-300 font-bold">
          {error}
        </div>
      )}

      {/* Header section with role badge */}
      <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md flex justify-between items-center gap-4">
        <div>
          <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded text-[9px] font-black tracking-widest font-mono">
            {isAdmin ? "PANEL EJECUTIVO" : isSupervisor ? "PANEL SUPERVISOR" : isOperario ? "PLANTA DE CORTE" : "ACCESO TALLER"}
          </span>
          <h2 className="text-lg font-black tracking-wide text-white uppercase mt-1">
            {isAdmin ? "Panel de Control de Ariel" : isSupervisor ? "Centro de Supervisión" : isOperario ? "Consola de Corte" : `Taller: ${currentUser?.nombre}`}
          </h2>
        </div>

        <div>
          {online && (
            <button
              onClick={() => loadDashboardData(true)}
              disabled={refreshing}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 border-2 border-slate-700 text-xs font-black uppercase tracking-wider rounded transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span>Recargar</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. ARIEL (ADMIN) EXECUTIVE DASHBOARD                                      */}
      {/* ========================================================================= */}
      {isAdmin && (
        <div className="space-y-6">
          
          {/* Main indicators */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border-2 border-slate-800 p-4.5 rounded-md flex flex-col justify-between">
              <span className="text-[9px] uppercase font-black text-gray-450 tracking-widest block">DEUDA TOTAL TALLERES</span>
              <span className="text-2xl font-black text-red-500 block mt-2 font-mono">
                ${financeSummary.reduce((sum, t) => sum + t.deudaActual, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            
            <div className="bg-slate-900 border-2 border-slate-800 p-4.5 rounded-md flex flex-col justify-between">
              <span className="text-[9px] uppercase font-black text-gray-455 tracking-widest block">PRODUCCIÓN DEL MES</span>
              <span className="text-2xl font-black text-green-400 block mt-2 font-mono">
                {getMonthlyConfeccionCount().toLocaleString()} u.
              </span>
            </div>

            <div className="bg-slate-900 border-2 border-slate-800 p-4.5 rounded-md flex flex-col justify-between">
              <span className="text-[9px] uppercase font-black text-gray-455 tracking-widest block">PENDIENTE EN TALLERES</span>
              <span className="text-2xl font-black text-yellow-500 block mt-2 font-mono">
                {financeSummary.reduce((sum, t) => sum + t.totalPendiente, 0).toLocaleString()} u.
              </span>
            </div>

            <div className="bg-slate-900 border-2 border-slate-800 p-4.5 rounded-md flex flex-col justify-between">
              <span className="text-[9px] uppercase font-black text-gray-455 tracking-widest block">TALLERES ACTIVOS</span>
              <span className="text-2xl font-black text-blue-400 block mt-2 font-mono">
                {financeSummary.filter(t => t.totalPendiente > 0).length} Talleres
              </span>
            </div>
          </div>

          {/* Ariel Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <button
              onClick={() => { setSelectedTallerId(""); setCalculatedPayment(null); setShowPaymentModal(true); }}
              className="bg-blue-700 hover:bg-blue-650 text-white font-black py-4 rounded-md text-sm border-2 border-blue-600 shadow-md transition active:scale-[0.98] uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2"
            >
              <Coins className="w-5 h-5" />
              <span>REGISTRAR PAGO Y LIQUIDACIÓN</span>
            </button>

            <button
              onClick={() => { setSelectedTallerId(""); setShowRatesModal(true); }}
              className="bg-slate-800 hover:bg-slate-750 text-gray-250 border-2 border-slate-700 font-black py-4 rounded-md text-sm shadow-md transition active:scale-[0.98] uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2"
            >
              <Settings className="w-5 h-5" />
              <span>CONFIGURAR TARIFAS DE TALLER</span>
            </button>
          </div>

          {/* Daily recap */}
          <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-350 mb-3 border-b-2 border-slate-850 pb-2">
              Resumen Operativo de Hoy
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-black/30 p-4 border border-slate-850 rounded text-center">
                <span className="text-[9px] text-gray-450 font-bold uppercase tracking-wider block">PIEZAS CORTADAS</span>
                <span className="text-lg font-black text-white font-mono mt-1 block">{recap.cuts.toLocaleString()} U.</span>
              </div>
              <div className="bg-black/30 p-4 border border-slate-855 rounded text-center">
                <span className="text-[9px] text-gray-455 font-bold uppercase tracking-wider block">ENVIADO A TALLERES</span>
                <span className="text-lg font-black text-yellow-500 font-mono mt-1 block">{recap.sent.toLocaleString()} U.</span>
              </div>
              <div className="bg-black/30 p-4 border border-slate-850 rounded text-center">
                <span className="text-[9px] text-gray-455 font-bold uppercase tracking-wider block">CONFECCIÓN RECIBIDA</span>
                <span className="text-lg font-black text-green-450 font-mono mt-1 block">{recap.returned.toLocaleString()} U.</span>
              </div>
              <div className="bg-black/30 p-4 border border-slate-855 rounded text-center">
                <span className="text-[9px] text-gray-455 font-bold uppercase tracking-wider block">FARDOS ABIERTOS</span>
                <span className="text-lg font-black text-blue-400 font-mono mt-1 block">{recap.openedFardos} Fardos</span>
              </div>
            </div>
          </div>

          {/* Daily cuts list details */}
          <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-350 mb-3 border-b-2 border-slate-850 pb-2">
              Detalle Diario de Corte
            </h3>
            {getDailyCutCount().length === 0 ? (
              <p className="text-xs text-gray-500 font-bold uppercase py-2">No se ha registrado producción de corte en la jornada.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {getDailyCutCount().map(([prodName, qty]) => (
                  <div key={prodName} className="bg-black/30 border border-slate-850 p-4 rounded flex justify-between items-center">
                    <span className="text-[10px] text-gray-400 font-black uppercase truncate mr-2">{prodName}</span>
                    <span className="text-base font-black text-white font-mono shrink-0">{qty.toLocaleString()} U.</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Workshops breakdown table */}
          <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-350 mb-3 border-b-2 border-slate-850 pb-2">
              Estado Financiero y Tarifas de Talleres
            </h3>
            <div className="overflow-x-auto border border-slate-850 rounded">
              <table className="w-full text-xs text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-slate-950 text-gray-450 border-b border-slate-800 uppercase tracking-wider text-[9px] font-black">
                    <th className="p-3">Taller</th>
                    <th className="p-3 text-right">Pendiente En taller</th>
                    <th className="p-3 text-right">Confeccionadas</th>
                    <th className="p-3 text-right">Fardo Trapos</th>
                    <th className="p-3 text-right">Fardo Rejillas</th>
                    <th className="p-3 text-right font-black text-red-400">Saldo Pendiente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {financeSummary.map((t) => (
                    <tr key={t.tallerId} className="hover:bg-slate-850/20">
                      <td className="p-3 font-bold text-white uppercase font-sans">{t.tallerNombre}</td>
                      <td className="p-3 text-right text-gray-400">{t.totalPendiente.toLocaleString()} u.</td>
                      <td className="p-3 text-right text-gray-300">{t.produccionPerfecta.toLocaleString()} u.</td>
                      <td className="p-3 text-right text-green-455">${t.precioTrapoFardo?.toLocaleString()}</td>
                      <td className="p-3 text-right text-green-455">${t.precioRejillaFardo?.toLocaleString()}</td>
                      <td className="p-3 text-right font-black text-red-500 bg-red-950/10 text-sm">${t.deudaActual.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stock and Low Stock alert */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* General Stock Card */}
            <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md md:col-span-1 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-350 border-b border-slate-855 pb-2 mb-3">Stock Consolidado</h3>
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Existencias totales en fábrica</span>
              </div>
              <span className="text-3xl font-black text-blue-400 mt-4 block font-mono">
                {getConsolidatedStock().toLocaleString()} U.
              </span>
            </div>

            {/* Low Stock alerts */}
            <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md md:col-span-2 space-y-3.5 animate-fadeIn">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-350 border-b border-slate-850 pb-2 flex items-center gap-1.5 text-yellow-500">
                <AlertOctagon className="w-4 h-4 shrink-0 text-yellow-500" />
                <span>Alertas de Stock Mínimo</span>
              </h3>
              <div className="space-y-2">
                {getLowStockAlerts().length === 0 ? (
                  <p className="text-xs text-gray-500 font-bold uppercase italic py-2">Todos los productos operan por encima de su stock mínimo.</p>
                ) : (
                  getLowStockAlerts().map((alert, idx) => (
                    <div 
                      key={idx} 
                      className={`border-2 p-3.5 rounded flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-xs ${
                        alert.prioridad === "ALTA" 
                          ? "bg-red-950/20 border-red-900/60 text-red-300" 
                          : "bg-amber-950/20 border-amber-900/50 text-amber-300"
                      }`}
                    >
                      <div>
                        <span className="font-extrabold uppercase font-sans tracking-wide block text-[13px]">{alert.producto}</span>
                        <span className="text-[10px] text-gray-400 block mt-0.5">Ubicación: <strong className="uppercase text-slate-300">{alert.deposito}</strong></span>
                      </div>
                      <div className="flex sm:flex-col items-end gap-2 sm:gap-0 font-mono">
                        <span className="font-black text-sm">{alert.stock.toLocaleString()} u. <span className="text-[10px] font-sans text-gray-400">/ Mín: {alert.min} u.</span></span>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded font-sans tracking-widest uppercase mt-0.5 ${
                          alert.prioridad === "ALTA" ? "bg-red-900/40 text-red-200" : "bg-amber-900/40 text-amber-200"
                        }`}>
                          Prioridad {alert.prioridad}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* Ariel Recent movements */}
          <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 mb-3 border-b-2 border-slate-855 pb-2">
              Últimos movimientos importantes
            </h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto border border-slate-800 p-2 bg-black/20 rounded no-scrollbar text-xs">
              {recentMovements.slice(0, 15).map((m) => (
                <div key={m.id} className="p-3 bg-slate-900/60 border border-slate-850 rounded flex justify-between items-center gap-3">
                  <span className="text-gray-250 font-bold uppercase">
                    {formatHumanMovement(m, productMap, tallerMap, depositoMap)}
                  </span>
                  <span className="text-[9px] text-gray-500 font-mono font-bold shrink-0">
                    {new Date(m.createdAt).toLocaleDateString()} {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SUPERVISOR DASHBOARD                                                   */}
      {/* ========================================================================= */}
      {isSupervisor && (
        <div className="space-y-6">
          <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 mb-4 border-b border-slate-800 pb-2">
              Acciones Rápidas
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-center text-xs font-bold">
              <a href="/app/taller" className="bg-blue-700 hover:bg-blue-650 border-2 border-blue-600 text-white py-4.5 rounded uppercase tracking-wider block">
                ENTREGAR / RECIBIR DE TALLERES
              </a>
              <a href="/app/stock" className="bg-slate-800 hover:bg-slate-750 border-2 border-slate-700 text-gray-200 py-4.5 rounded uppercase tracking-wider block">
                MONITOR DE STOCK DE DEPÓSITOS
              </a>
            </div>
          </div>

          <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-350 mb-3 border-b-2 border-slate-850 pb-2">
              Resumen Operativo de Hoy
            </h3>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-black/30 p-4 border border-slate-855 rounded">
                <span className="text-[10px] text-gray-400 font-bold uppercase block">Piezas cortadas hoy</span>
                <span className="text-xl font-black text-white font-mono mt-1 block">{recap.cuts.toLocaleString()} U.</span>
              </div>
              <div className="bg-black/30 p-4 border border-slate-850 rounded">
                <span className="text-[10px] text-gray-400 font-bold uppercase block">Enviado a talleres hoy</span>
                <span className="text-xl font-black text-yellow-500 font-mono mt-1 block">{recap.sent.toLocaleString()} U.</span>
              </div>
            </div>
          </div>

          {/* Low Stock alerts */}
          <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md space-y-3.5 animate-fadeIn">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-350 border-b border-slate-850 pb-2 flex items-center gap-1.5 text-yellow-500">
              <AlertOctagon className="w-4 h-4 shrink-0 text-yellow-500" />
              <span>Alertas de Stock Mínimo</span>
            </h3>
            <div className="space-y-2">
              {getLowStockAlerts().length === 0 ? (
                <p className="text-xs text-gray-500 font-bold uppercase italic py-2">Todos los productos operan por encima de su stock mínimo.</p>
              ) : (
                getLowStockAlerts().map((alert, idx) => (
                  <div 
                    key={idx} 
                    className={`border-2 p-3.5 rounded flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-xs ${
                      alert.prioridad === "ALTA" 
                        ? "bg-red-950/20 border-red-900/60 text-red-300" 
                        : "bg-amber-950/20 border-amber-900/50 text-amber-300"
                    }`}
                  >
                    <div>
                      <span className="font-extrabold uppercase font-sans tracking-wide block text-[13px]">{alert.producto}</span>
                      <span className="text-[10px] text-gray-400 block mt-0.5">Ubicación: <strong className="uppercase text-slate-300">{alert.deposito}</strong></span>
                    </div>
                    <div className="flex sm:flex-col items-end gap-2 sm:gap-0 font-mono">
                      <span className="font-black text-sm">{alert.stock.toLocaleString()} u. <span className="text-[10px] font-sans text-gray-400">/ Mín: {alert.min} u.</span></span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded font-sans tracking-widest uppercase mt-0.5 ${
                        alert.prioridad === "ALTA" ? "bg-red-900/40 text-red-200" : "bg-amber-900/40 text-amber-200"
                      }`}>
                        Prioridad {alert.prioridad}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2B. OPERARIO (ROLANDO) DASHBOARD                                          */}
      {/* ========================================================================= */}
      {isOperario && (
        <div className="space-y-6">
          {/* Main Action */}
          <div className="text-center text-xs font-bold bg-slate-900 border-2 border-slate-800 p-5 rounded-md">
            <a
              href="/app/corte"
              className="bg-blue-700 hover:bg-blue-650 text-white font-black py-4.5 rounded uppercase tracking-wider block border-2 border-blue-600 shadow-md active:scale-[0.98] transition cursor-pointer"
            >
              REGISTRAR CORTADAS DE TELA
            </a>
          </div>

          {/* Lo Cortado Hoy */}
          <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md space-y-4">
            <div>
              <span className="bg-slate-800 text-slate-350 border border-slate-700 px-2 py-0.5 rounded text-[9px] font-black tracking-widest font-mono">
                LO CORTADO HOY
              </span>
              <h3 className="text-sm font-black uppercase tracking-widest text-white mt-1 border-b border-slate-800 pb-2">
                Resumen de mi producción de hoy
              </h3>
            </div>
            
            {getDailyCutCount().length === 0 ? (
              <p className="text-xs text-gray-500 font-bold uppercase italic py-2">
                Aún no has registrado cortadas en el día de hoy.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {getDailyCutCount().map(([prodName, qty]) => (
                    <div key={prodName} className="bg-black/30 border border-slate-850 p-4 rounded flex justify-between items-center font-mono">
                      <span className="text-[10px] text-gray-400 font-black uppercase font-sans truncate mr-2">{prodName}</span>
                      <span className="text-base font-black text-white shrink-0">{qty.toLocaleString()} u.</span>
                    </div>
                  ))}
                </div>
                
                <div className="bg-blue-950/20 border border-blue-900/40 p-4 rounded flex justify-between items-center text-xs">
                  <span className="font-extrabold uppercase text-blue-300">Total Unidades Cortadas Hoy</span>
                  <span className="text-lg font-black text-blue-400 font-mono">
                    {getDailyCutCount().reduce((sum, [_, q]) => sum + q, 0).toLocaleString()} u.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Estado de Sincronización */}
          <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md space-y-4">
            <div>
              <span className="bg-slate-800 text-slate-350 border border-slate-700 px-2 py-0.5 rounded text-[9px] font-black tracking-widest font-mono">
                ESTADO DE CONEXIÓN Y DATOS
              </span>
              <h3 className="text-sm font-black uppercase tracking-widest text-white mt-1 border-b border-slate-800 pb-2">
                Sincronización con el Servidor
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-black/30 border border-slate-850 p-3.5 rounded flex justify-between items-center">
                <span className="font-bold text-gray-400 uppercase">Conexión de Red:</span>
                <span className="flex items-center gap-1.5 font-bold uppercase">
                  <span className={`w-2.5 h-2.5 rounded-full ${online ? "bg-green-500" : "bg-red-500 animate-pulse"}`} />
                  {online ? "En Línea" : "Sin Conexión"}
                </span>
              </div>

              <div className="bg-black/30 border border-slate-850 p-3.5 rounded flex justify-between items-center">
                <span className="font-bold text-gray-400 uppercase">Envíos Pendientes:</span>
                <span className={`font-mono font-black ${syncPending > 0 ? "text-orange-400" : "text-gray-300"}`}>
                  {syncPending}
                </span>
              </div>

              <div className="bg-black/30 border border-slate-850 p-3.5 rounded flex justify-between items-center">
                <span className="font-bold text-gray-400 uppercase">Errores de Envío:</span>
                <span className={`font-mono font-black ${failed > 0 ? "text-red-400" : "text-gray-300"}`}>
                  {failed}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  syncEngine.triggerSync();
                }}
                disabled={syncing || !online}
                className={`px-4 py-3 rounded text-[11px] font-black uppercase tracking-wider transition ${
                  online && !syncing 
                    ? "bg-slate-800 hover:bg-slate-750 text-blue-400 border border-slate-700 cursor-pointer" 
                    : "bg-slate-950 text-gray-600 border border-slate-900 cursor-not-allowed"
                }`}
              >
                {syncing ? "Sincronizando..." : "Sincronizar Ahora"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TALLER (EVE, VANESA) READ-ONLY DASHBOARD SCREEN                       */}
      {/* ========================================================================= */}
      {isTaller && online && (
        <div className="space-y-6">
          {financeSummary.map((t) => (
            <div key={t.tallerId} className="space-y-6">
              
              {/* Financial Status Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md flex flex-col justify-between">
                  <span className="text-[9px] uppercase font-black text-gray-450 tracking-wider block">TRABAJO ENTREGADO (MES)</span>
                  <span className="text-2xl font-black text-green-400 mt-2 font-mono">
                    ${t.produccionValorizada.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                
                <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md flex flex-col justify-between">
                  <span className="text-[9px] uppercase font-black text-gray-455 tracking-wider block">PAGOS COBRADOS</span>
                  <span className="text-2xl font-black text-blue-400 mt-2 font-mono">
                    ${t.totalPagado.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md flex flex-col justify-between">
                  <span className="text-[9px] uppercase font-black text-gray-455 tracking-wider block">SALDO A COBRAR</span>
                  <span className="text-2xl font-black text-red-500 mt-2 font-mono">
                    ${t.deudaActual.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Virtual Warehouse Stock (Only allowed to see their own deposit) */}
              <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 mb-3 border-b-2 border-slate-850 pb-2">
                  Existencias en DEPÓSITO {t.tallerNombre.toUpperCase().replace("TALLER ", "")}
                </h3>
                
                {generalStock.filter(s => s.tallerId === t.tallerId).length === 0 ? (
                  <p className="text-xs text-gray-500 font-bold uppercase py-2">
                    No se reportan materiales o insumos almacenados en este depósito virtual.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {generalStock.filter(s => s.tallerId === t.tallerId).map((item) => (
                      <div key={item.id} className="bg-black/30 border border-slate-850 p-4 rounded flex justify-between items-center font-mono">
                        <span className="text-[10px] text-gray-400 font-black uppercase truncate font-sans mr-2">
                          {item.producto?.nombre || productMap[item.productoId]}
                        </span>
                        <span className="text-sm font-black text-white shrink-0">{item.cantidadUnidades.toLocaleString()} u.</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Total Confection returns */}
              <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-350 mb-3 border-b-2 border-slate-850 pb-2">
                  Total Producción Confeccionada Perfecta
                </h3>
                <div className="bg-black/30 border border-slate-850 rounded p-4 flex justify-between items-center text-xs font-mono">
                  <span className="font-bold text-gray-300 font-sans uppercase">Total Confección Devuelta</span>
                  <span className="text-base font-black text-green-400">{t.produccionPerfecta.toLocaleString()} u.</span>
                </div>
              </div>

              {/* Pending Confection */}
              <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-350 mb-3 border-b-2 border-slate-850 pb-2">
                  Telas Cortadas Pendientes de Confección
                </h3>
                <div className="bg-black/30 border border-slate-855 rounded p-4 flex justify-between items-center text-xs font-mono">
                  <span className="font-bold text-gray-300 font-sans uppercase">Telas cortadas pendientes de confección</span>
                  <span className="text-base font-black text-red-500">{t.totalPendiente.toLocaleString()} u.</span>
                </div>
              </div>

              {/* Taller rates */}
              <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-350 mb-3 border-b-2 border-slate-850 pb-2">
                  Tarifas Pactadas por Fardo
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="bg-black/30 border border-slate-850 p-4 rounded flex justify-between items-center font-mono">
                    <span className="text-[10px] text-gray-400 font-bold uppercase font-sans">Precio Fardo Trapos</span>
                    <span className="text-base font-black text-green-450">${t.precioTrapoFardo?.toFixed(2)}</span>
                  </div>
                  <div className="bg-black/30 border border-slate-850 p-4 rounded flex justify-between items-center font-mono">
                    <span className="text-[10px] text-gray-400 font-bold uppercase font-sans">Precio Fardo Rejillas</span>
                    <span className="text-base font-black text-green-450">${t.precioRejillaFardo?.toFixed(2)}</span>
                  </div>
                </div>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL WINDOWS (ARIEL ONLY)                                                */}
      {/* ========================================================================= */}
      
      {/* 1. Register Payment Modal with Period parameters and auto calculation */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-md max-w-sm w-full p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-sm font-black uppercase tracking-widest text-blue-450 border-b border-slate-800 pb-2">Registrar Pago a Taller</h3>
            
            <form onSubmit={handleRegisterPayment} className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] font-black text-gray-300 uppercase tracking-wider mb-1">Taller *</label>
                <select
                  value={selectedTallerId}
                  onChange={(e) => setSelectedTallerId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border-2 border-slate-800 px-3 py-2.5 text-xs text-white rounded focus:border-blue-600 outline-none uppercase font-bold"
                >
                  <option value="">-- Seleccionar Taller --</option>
                  {talleres.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="border border-slate-800 p-3 rounded bg-slate-950 space-y-3">
                <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-slate-900 pb-1">Periodo de Liquidación</span>
                
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Nombre Periodo (ej: Semana 26) *</label>
                  <input
                    type="text"
                    required
                    value={paymentPeriodName}
                    onChange={(e) => setPaymentPeriodName(e.target.value)}
                    placeholder="Ej. Semana 26..."
                    className="w-full bg-slate-900 border border-slate-800 px-2.5 py-2 text-xs text-white rounded font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[8px] font-bold text-gray-400 uppercase mb-1">Fecha Inicio *</label>
                    <input
                      type="date"
                      required
                      value={paymentPeriodInicio}
                      onChange={(e) => setPaymentPeriodInicio(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 px-2 py-2 text-[10px] text-white rounded font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-bold text-gray-400 uppercase mb-1">Fecha Fin *</label>
                    <input
                      type="date"
                      required
                      value={paymentPeriodFin}
                      onChange={(e) => setPaymentPeriodFin(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 px-2 py-2 text-[10px] text-white rounded font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Breakdown calculation details */}
              {calculating && (
                <div className="text-center py-2 text-blue-450 animate-pulse font-bold text-[10px] uppercase">
                  Calculando importes de producción...
                </div>
              )}

              {!calculating && calculatedPayment && (
                <div className="bg-slate-950/80 border-2 border-slate-850 p-3.5 rounded text-[11px] font-mono space-y-2 text-slate-350">
                  <div className="border-b border-slate-900 pb-1.5 flex justify-between font-sans text-[10px] font-black uppercase text-slate-400">
                    <span>Producción Computada</span>
                    <span className="text-blue-400">{calculatedPayment.tallerNombre}</span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span>Fardos Trapo:</span>
                    <span className="font-bold text-gray-150">
                      {calculatedPayment.trapoFardos.toFixed(2)} F ({calculatedPayment.trapoUnits.toLocaleString()} u.)
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-gray-500 pl-2">
                    <span>Tarifa Trapo / Fardo:</span>
                    <span>${calculatedPayment.precioTrapo.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center font-bold text-green-400 pl-2">
                    <span>Subtotal Trapos:</span>
                    <span>${calculatedPayment.subtotalTrapo.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>

                  <div className="flex justify-between items-center pt-1 border-t border-slate-900">
                    <span>Fardos Rejilla:</span>
                    <span className="font-bold text-gray-150">
                      {calculatedPayment.rejillaFardos.toFixed(2)} F ({calculatedPayment.rejillaUnits.toLocaleString()} u.)
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-gray-500 pl-2">
                    <span>Tarifa Rejilla / Fardo:</span>
                    <span>${calculatedPayment.precioRejilla.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center font-bold text-green-400 pl-2">
                    <span>Subtotal Rejillas:</span>
                    <span>${calculatedPayment.subtotalRejilla.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>

                  <div className="pt-2 border-t border-slate-850 flex justify-between items-center text-xs font-sans font-black uppercase text-white bg-blue-950/20 px-2 py-1.5 rounded">
                    <span>Importe Liquidación</span>
                    <span className="font-mono text-green-455 text-sm font-black">
                      ${calculatedPayment.total.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black text-gray-300 uppercase tracking-wider mb-1">Monto ($ ARS) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  readOnly
                  value={paymentAmount}
                  placeholder="Monto calculado..."
                  className="w-full bg-slate-955 border-2 border-slate-800 px-3 py-2.5 text-xs text-green-400 rounded focus:outline-none font-bold font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-300 uppercase tracking-wider mb-1">Fecha del Pago *</label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full bg-slate-955 border-2 border-slate-800 px-3 py-2.5 text-xs text-white rounded focus:border-blue-600 outline-none font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-300 uppercase tracking-wider mb-1">Observaciones</label>
                <textarea
                  value={paymentObs}
                  onChange={(e) => setPaymentObs(e.target.value)}
                  placeholder="Detalles sobre el pago..."
                  className="w-full bg-slate-955 border-2 border-slate-800 px-3 py-2 text-xs text-white rounded focus:border-blue-600 outline-none h-16 resize-none font-semibold"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-750 text-gray-300 font-bold py-3.5 rounded text-xs uppercase tracking-wider border border-slate-700 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
                  className={`flex-1 font-black py-3.5 rounded text-xs uppercase tracking-wider transition ${
                    paymentAmount && parseFloat(paymentAmount) > 0 
                      ? "bg-blue-700 hover:bg-blue-600 text-white cursor-pointer" 
                      : "bg-slate-950 text-gray-600 border border-slate-900 cursor-not-allowed"
                  }`}
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Configure Rates Modal (Bale-based only) */}
      {showRatesModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-md max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-black uppercase tracking-widest text-blue-455 border-b border-slate-800 pb-2">Configurar Tarifas por Fardo</h3>
            
            <form onSubmit={handleSaveRates} className="space-y-4 text-xs font-bold">
              <div>
                <label className="block text-[10px] font-black text-gray-300 uppercase tracking-wider mb-1.5">Taller *</label>
                <select
                  value={selectedTallerId}
                  onChange={(e) => setSelectedTallerId(e.target.value)}
                  required
                  className="w-full bg-slate-955 border-2 border-slate-800 px-3 py-2.5 text-xs text-white rounded focus:border-blue-600 outline-none uppercase font-bold cursor-pointer"
                >
                  <option value="">-- Seleccionar Taller --</option>
                  {talleres.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-350 uppercase mb-1">Precio por fardo de Trapos ($) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={tallerPrecioTrapo}
                  onChange={(e) => setTallerPrecioTrapo(e.target.value)}
                  className="w-full bg-slate-955 border-2 border-slate-800 px-3 py-2.5 text-xs text-green-400 rounded focus:border-blue-600 outline-none font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-355 uppercase mb-1">Precio por fardo de Rejillas ($) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={tallerPrecioRejilla}
                  onChange={(e) => setTallerPrecioRejilla(e.target.value)}
                  className="w-full bg-slate-955 border-2 border-slate-800 px-3 py-2.5 text-xs text-green-400 rounded focus:border-blue-600 outline-none font-mono font-bold"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRatesModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-750 text-gray-300 font-bold py-3 rounded text-xs uppercase tracking-wider border border-slate-700 transition cursor-pointer"
                  style={{ minHeight: "40px" }}
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-700 hover:bg-blue-650 text-white font-black py-3 rounded text-xs uppercase tracking-wider transition cursor-pointer"
                  style={{ minHeight: "40px" }}
                >
                  Guardar Tarifas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
export default DashboardPage;
