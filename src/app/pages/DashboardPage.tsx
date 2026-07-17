import React, { useState, useEffect } from "react";
import { useRuntimeStore } from "../runtime/runtime.store";
import { authFetch } from "../auth/auth.api";
import { formatHumanMovement } from "../utils/human-timeline";
import { catalogService } from "../services/catalog.service";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { DataTable } from "../components/tables/DataTable";
import { Form, FormSection, FormRow } from "../components/forms/Form";
import { FormInput } from "../components/forms/FormInput";
import { FormSelect } from "../components/forms/FormSelect";
import { Modal } from "../components/feedback/Modal";
import { Skeleton } from "../components/feedback/Skeleton";
import { EmptyState } from "../components/feedback/EmptyState";
import { useToast } from "../components/feedback/Toast";

export const DashboardPage: React.FC = () => {
  const currentUser = useRuntimeStore((s) => s.currentUser);
  const online = useRuntimeStore((s) => s.online);
  const toast = useToast();

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

  // Finance and metrics states
  const [financeSummary, setFinanceSummary] = useState<any[]>([]);
  const [generalStock, setGeneralStock] = useState<any[]>([]);
  const [recentMovements, setRecentMovements] = useState<any[]>([]);

  // Operational states
  const [loading, setLoading] = useState(true);
  const [, setRefreshing] = useState(false);
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
      toast.error("Error al cargar datos en tiempo real.");
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
  }, [selectedTallerId, financeSummary]);

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
      toast.error("Monto o taller no válido para liquidación.");
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
      
      toast.success("Pago registrado correctamente");

      // Auto open PDF
      if (json.success && json.data?.id && paymentPeriodName) {
        window.open(`/api/talleres/pagos/${json.data.id}/pdf`, "_blank");
      }
      
      void loadDashboardData();
    } catch (err: any) {
      toast.error("Error al registrar pago: " + err.message);
    }
  };

  const handleSaveRates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTallerId) {
      toast.error("Por favor seleccione un taller.");
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
      toast.success("Tarifas de fardos actualizadas");
      void loadDashboardData();
    } catch (err: any) {
      toast.error("Error al guardar tarifas: " + err.message);
    }
  };

  // --- KPI & Summary Computations ---

  // 1. Daily production count (Corte area)
  const getDailyCutCount = () => {
    const today = new Date().toISOString().substring(0, 10);
    const cuts = recentMovements.filter(m => 
      m.tipo === "CORTADA" && 
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

  // 4. Low stock alerts
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

  // 5. Daily production recap
  const getDailyRecap = () => {
    const today = new Date().toISOString().substring(0, 10);
    let cuts = 0;
    let sent = 0;
    let returned = 0;
    let openedFardos = 0;

    recentMovements.forEach(m => {
      const isToday = new Date(m.createdAt).toISOString().substring(0, 10) === today;
      if (!isToday) return;

      if (m.tipo === "CORTADA") {
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

  const recap = getDailyRecap();

  // Premium loading state skeleton
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse select-none bg-background p-4 min-h-screen">
        <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-lg flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48 rounded" />
            <Skeleton className="h-4 w-64 rounded" />
          </div>
          <Skeleton className="h-10 w-28 rounded" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-surface-container-lowest border border-outline-variant p-5 rounded-lg space-y-4">
              <Skeleton className="h-3.5 w-24 rounded" />
              <Skeleton className="h-8 w-36 rounded" />
              <Skeleton className="h-3 w-40 rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-surface-container-lowest border border-outline-variant p-5 rounded-lg space-y-4">
              <Skeleton className="h-5 w-44 rounded" />
              <Skeleton className="h-40 w-full rounded" />
            </div>
          </div>
          <div className="space-y-6">
            <div className="bg-surface-container-lowest border border-outline-variant p-5 rounded-lg space-y-4">
              <Skeleton className="h-5 w-32 rounded" />
              <div className="space-y-2">
                <Skeleton className="h-12 w-full rounded" />
                <Skeleton className="h-12 w-full rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 select-none">
      
      {error && (
        <div className="border border-error-container/30 bg-error-container/10 text-error px-5 py-3 rounded text-xs font-bold uppercase tracking-wider text-center">
          {error}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. ARIEL (ADMIN) EXECUTIVE DASHBOARD                                      */}
      {/* ========================================================================= */}
      {isAdmin && (
        <div className="space-y-6">
          <PageHeader
            title="Tablero Central de Control"
            description="Monitoreo financiero de talleres y existencias críticas de planta."
            breadcrumbs={[{ label: "Tablero" }]}
            actions={
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<span className="material-symbols-outlined text-xs">settings</span>}
                  onClick={() => { setSelectedTallerId(""); setShowRatesModal(true); }}
                  className="text-xs"
                >
                  Tarifas Fardos
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<span className="material-symbols-outlined text-xs">payments</span>}
                  onClick={() => { setSelectedTallerId(""); setCalculatedPayment(null); setShowPaymentModal(true); }}
                  className="text-xs"
                >
                  Registrar Pago
                </Button>
              </div>
            }
          />

          {/* Grid de KPIs principales (Alineados con Stitch) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="hover:shadow-sm transition-shadow duration-150 relative">
              <div className="flex justify-between items-start mb-1">
                <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest block">Deuda Total Talleres</span>
                <span className="text-error bg-error-container/10 px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider">Límite</span>
              </div>
              <span className="text-2xl font-black text-error mt-2 block text-mono">
                ${financeSummary.reduce((sum, t) => sum + t.deudaActual, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[9px] text-on-surface-variant mt-1 block uppercase font-bold">Saldo pendiente de liquidación</span>
            </Card>

            <Card className="hover:shadow-sm transition-shadow duration-150 relative">
              <div className="flex justify-between items-start mb-1">
                <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest block">Producción del Mes</span>
                <span className="text-primary bg-primary-container/20 px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider">+12%</span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <span className="text-2xl font-black text-primary mt-2 block text-mono">
                    {getMonthlyConfeccionCount().toLocaleString()} <span className="text-xs font-normal text-on-surface-variant">u.</span>
                  </span>
                  <span className="text-[9px] text-on-surface-variant mt-1 block uppercase font-bold">Piezas confeccionadas recibidas</span>
                </div>
                {/* Sparklines visuales Stitch */}
                <div className="flex items-end gap-0.5 h-8 pr-1">
                  <div className="w-1 bg-primary rounded-xs" style={{ height: "10px" }}></div>
                  <div className="w-1 bg-primary rounded-xs" style={{ height: "18px" }}></div>
                  <div className="w-1 bg-primary rounded-xs" style={{ height: "12px" }}></div>
                  <div className="w-1 bg-primary rounded-xs" style={{ height: "24px" }}></div>
                  <div className="w-1 bg-primary rounded-xs" style={{ height: "20px" }}></div>
                  <div className="w-1 bg-primary rounded-xs" style={{ height: "30px" }}></div>
                </div>
              </div>
            </Card>

            <Card className="hover:shadow-sm transition-shadow duration-150 relative">
              <div className="flex justify-between items-start mb-1">
                <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest block">Pendiente en Talleres</span>
                <span className="text-amber-600 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider">Pend.</span>
              </div>
              <span className="text-2xl font-black text-amber-600 mt-2 block text-mono">
                {financeSummary.reduce((sum, t) => sum + t.totalPendiente, 0).toLocaleString()} <span className="text-xs font-normal text-on-surface-variant">u.</span>
              </span>
              <span className="text-[9px] text-on-surface-variant mt-1 block uppercase font-bold">Cortes en taller sin confeccionar</span>
            </Card>

            <Card className="hover:shadow-sm transition-shadow duration-150 relative">
              <div className="flex justify-between items-start mb-1">
                <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest block">Talleres Activos</span>
                <span className="text-blue-600 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider">Activos</span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <span className="text-2xl font-black text-blue-600 mt-2 block text-mono">
                    {financeSummary.filter(t => t.totalPendiente > 0).length} <span className="text-xs font-normal text-on-surface-variant">t.</span>
                  </span>
                  <span className="text-[9px] text-on-surface-variant mt-1 block uppercase font-bold">Talleres con saldo activo</span>
                </div>
                <div className="flex items-end gap-0.5 h-8 pr-1">
                  <div className="w-1 bg-blue-600 rounded-xs" style={{ height: "15px" }}></div>
                  <div className="w-1 bg-blue-600 rounded-xs" style={{ height: "10px" }}></div>
                  <div className="w-1 bg-blue-600 rounded-xs" style={{ height: "22px" }}></div>
                  <div className="w-1 bg-blue-600 rounded-xs" style={{ height: "26px" }}></div>
                  <div className="w-1 bg-blue-600 rounded-xs" style={{ height: "18px" }}></div>
                  <div className="w-1 bg-blue-600 rounded-xs" style={{ height: "28px" }}></div>
                </div>
              </div>
            </Card>
          </div>

          {/* Grilla Principal: Tablas y Alertas */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Tabla de talleres (Panel Izquierdo) */}
            <div className="lg:col-span-2 space-y-6">
              <Card
                title="Estado Financiero y Tarifas de Talleres"
                subtitle="Saldos acumulados y tarifas de confección vigentes."
              >
                <DataTable
                  data={financeSummary}
                  getRowId={(row) => row.tallerId}
                  columns={[
                    { key: "tallerNombre", header: "Taller", sortable: true },
                    { 
                      key: "totalPendiente", 
                      header: "Pendiente", 
                      align: "right",
                      render: (row) => <span className="font-bold text-mono">{row.totalPendiente.toLocaleString()} u.</span> 
                    },
                    { 
                      key: "produccionPerfecta", 
                      header: "Confeccionadas", 
                      align: "right",
                      render: (row) => <span className="text-on-surface-variant text-mono">{row.produccionPerfecta.toLocaleString()} u.</span> 
                    },
                    { 
                      key: "precioTrapoFardo", 
                      header: "Tarifa Trapos", 
                      align: "right",
                      render: (row) => <span className="text-mono text-primary font-bold">${row.precioTrapoFardo?.toLocaleString()}</span> 
                    },
                    { 
                      key: "precioRejillaFardo", 
                      header: "Tarifa Rejillas", 
                      align: "right",
                      render: (row) => <span className="text-mono text-primary font-bold">${row.precioRejillaFardo?.toLocaleString()}</span> 
                    },
                    { 
                      key: "deudaActual", 
                      header: "Deuda Actual", 
                      align: "right",
                      render: (row) => (
                        <span className="font-black text-error text-mono">
                          ${row.deudaActual.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      )
                    }
                  ]}
                />
              </Card>

              {/* Stock por depósito */}
              <Card
                title="Stock Físico Consolidado"
                subtitle="Ubicación física e inventario consolidado en depósitos."
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="border border-outline-variant p-4 rounded bg-surface-container-low flex flex-col justify-between">
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Existencias Consolidadas</span>
                    <span className="text-xl font-black text-blue-600 mt-2 block text-mono">
                      {getConsolidatedStock().toLocaleString()} U.
                    </span>
                  </div>
                  <div className="border border-outline-variant p-4 rounded bg-surface-container-low flex flex-col justify-between">
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Cortes del Día</span>
                    <span className="text-xl font-black text-on-surface mt-2 block text-mono">
                      {recap.cuts.toLocaleString()} u.
                    </span>
                  </div>
                  <div className="border border-outline-variant p-4 rounded bg-surface-container-low flex flex-col justify-between">
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Enviado a Talleres</span>
                    <span className="text-xl font-black text-amber-600 mt-2 block text-mono">
                      {recap.sent.toLocaleString()} u.
                    </span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Panel de Alertas y Movimientos (Panel Derecho) */}
            <div className="space-y-6">
              
              {/* Alertas de Stock Mínimo */}
              <Card
                title="Alertas de Stock"
                subtitle="Insumos bajo el nivel mínimo establecido."
              >
                <div className="space-y-2">
                  {getLowStockAlerts().length === 0 ? (
                    <EmptyState message="Todos los productos operan por encima de su stock mínimo." />
                  ) : (
                    getLowStockAlerts().map((alert, idx) => (
                      <div 
                        key={idx} 
                        className={`p-3 rounded border flex flex-col gap-1 duration-100 hover:scale-[1.01] ${
                          alert.prioridad === "ALTA" 
                            ? "bg-error-container/5 border-error-container/30 text-error" 
                            : "bg-amber-500/5 border-amber-500/20 text-amber-600"
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-xs uppercase tracking-wide truncate max-w-[150px]">{alert.producto}</span>
                          <Badge variant={alert.prioridad === "ALTA" ? "danger" : "warning"}>
                            {alert.prioridad}
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-on-surface-variant">
                          <span>Depósito: <strong className="uppercase">{alert.deposito}</strong></span>
                          <span className="font-bold text-mono">
                            {alert.stock.toLocaleString()} / Mín: {alert.min}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              {/* Feed de Movimientos */}
              <Card
                title="Últimos Movimientos"
                subtitle="Historial de movimientos importantes de hoy."
              >
                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1 no-scrollbar">
                  {recentMovements.length === 0 ? (
                    <EmptyState message="No se reportan movimientos recientes." />
                  ) : (
                    recentMovements.slice(0, 10).map((m) => (
                      <div 
                        key={m.id} 
                        className="p-3 border border-outline-variant hover:border-outline rounded bg-surface-container-lowest transition duration-150"
                      >
                        <p className="text-xs text-on-surface font-semibold leading-normal">
                          {formatHumanMovement(m, productMap, tallerMap, depositoMap)}
                        </p>
                        <span className="text-[9px] text-on-surface-variant font-bold text-mono uppercase block mt-1">
                          {new Date(m.createdAt).toLocaleDateString()} {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SUPERVISOR DASHBOARD                                                   */}
      {/* ========================================================================= */}
      {isSupervisor && (
        <div className="space-y-6">
          <PageHeader
            title="Centro de Supervisión"
            description="Control operativo diario de cortes y envíos a talleres."
            breadcrumbs={[{ label: "Tablero" }]}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Quick Actions (Panel Izquierdo) */}
            <div className="md:col-span-1 space-y-6">
              <Card
                title="Acciones Rápidas"
                subtitle="Atajos rápidos para operaciones en planta."
              >
                <div className="flex flex-col gap-3">
                  <Button
                    variant="primary"
                    className="w-full text-xs"
                    onClick={() => window.location.href = "/app/taller"}
                    leftIcon={<span className="material-symbols-outlined text-xs">build</span>}
                  >
                    Entregar / Recibir Taller
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full text-xs"
                    onClick={() => window.location.href = "/app/stock"}
                    leftIcon={<span className="material-symbols-outlined text-xs">inventory_2</span>}
                  >
                    Monitor de Stock
                  </Button>
                </div>
              </Card>

              <Card
                title="Resumen Operativo de Hoy"
                subtitle="Recap de piezas procesadas hoy."
              >
                <div className="space-y-3">
                  <div className="p-4 border border-outline-variant rounded bg-surface-container-low flex justify-between items-center text-xs font-bold text-on-surface">
                    <span className="uppercase tracking-wider">Piezas Cortadas</span>
                    <span className="text-base font-black text-mono">{recap.cuts.toLocaleString()} u.</span>
                  </div>
                  <div className="p-4 border border-outline-variant rounded bg-surface-container-low flex justify-between items-center text-xs font-bold text-on-surface">
                    <span className="uppercase tracking-wider">Enviado a Talleres</span>
                    <span className="text-base font-black text-amber-600 text-mono">{recap.sent.toLocaleString()} u.</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Alertas de Stock (Panel Derecho) */}
            <div className="md:col-span-2 space-y-6">
              <Card
                title="Alertas Críticas de Stock"
                subtitle="Falta de insumos físicos en depósitos."
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {getLowStockAlerts().length === 0 ? (
                    <div className="col-span-2">
                      <EmptyState message="Todos los productos operan por encima de su stock mínimo." />
                    </div>
                  ) : (
                    getLowStockAlerts().map((alert, idx) => (
                      <div 
                        key={idx} 
                        className={`p-4 rounded border flex flex-col gap-2 ${
                          alert.prioridad === "ALTA" 
                            ? "bg-error-container/5 border-error-container/30 text-error" 
                            : "bg-amber-500/5 border-amber-500/20 text-amber-600"
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-xs uppercase truncate">{alert.producto}</span>
                          <Badge variant={alert.prioridad === "ALTA" ? "danger" : "warning"}>
                            {alert.prioridad}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-on-surface-variant font-semibold">
                          Ubicación: <strong className="uppercase">{alert.deposito}</strong>
                        </p>
                        <div className="flex justify-between items-end border-t border-outline-variant/30 pt-2 text-mono font-bold text-xs text-on-surface">
                          <span>Stock: {alert.stock.toLocaleString()} u.</span>
                          <span className="text-[10px] text-on-surface-variant">Mín: {alert.min} u.</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2B. OPERARIO DASHBOARD                                                    */}
      {/* ========================================================================= */}
      {isOperario && (
        <div className="space-y-6">
          <PageHeader
            title="Consola de Corte"
            description="Registro rápido de piezas cortadas."
            breadcrumbs={[{ label: "Tablero" }]}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <Card
              title="Acción Principal"
              subtitle="Operación de corte de bobinas."
              className="sm:col-span-1"
            >
              <Button
                variant="primary"
                onClick={() => window.location.href = "/app/corte"}
                className="w-full text-xs h-14"
                leftIcon={<span className="material-symbols-outlined text-lg">content_cut</span>}
              >
                REGISTRAR CORTADA
              </Button>
            </Card>

            <Card
              title="Producción de Hoy"
              subtitle="Cortes informados hoy por producto."
              className="sm:col-span-2"
            >
              {getDailyCutCount().length === 0 ? (
                <EmptyState message="No se han registrado cortes durante la jornada de hoy." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {getDailyCutCount().map(([prodName, qty]: any) => (
                    <div 
                      key={prodName} 
                      className="border border-outline-variant p-4 rounded flex justify-between items-center bg-surface-container-low text-xs text-on-surface font-bold"
                    >
                      <span className="uppercase truncate mr-2">{prodName}</span>
                      <span className="text-mono text-primary font-bold">{qty.toLocaleString()} U.</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2C. TALLERES INDIVIDUAL DASHBOARD                                         */}
      {/* ========================================================================= */}
      {isTaller && (
        <div className="space-y-6">
          <PageHeader
            title={`Taller: ${currentUser?.nombre}`}
            description="Resumen de producción valorizada y saldos pendientes."
            breadcrumbs={[{ label: "Taller" }]}
          />

          {financeSummary.map((t) => (
            <div key={t.tallerId} className="space-y-6">
              
              {/* Resumen Financiero Taller */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider block">Trabajo Entregado (Mes)</span>
                  <span className="text-2xl font-black text-primary mt-2 block text-mono">
                    ${t.produccionValorizada.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[9px] text-on-surface-variant mt-1 block uppercase font-bold">Producción confeccionada entregada</span>
                </Card>
                
                <Card>
                  <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider block">Pagos Cobrados</span>
                  <span className="text-2xl font-black text-blue-600 mt-2 block text-mono">
                    ${t.totalPagado.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[9px] text-on-surface-variant mt-1 block uppercase font-bold">Liquidaciones cobradas del taller</span>
                </Card>

                <Card>
                  <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider block">Saldo a Cobrar</span>
                  <span className="text-2xl font-black text-error mt-2 block text-mono">
                    ${t.deudaActual.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[9px] text-on-surface-variant mt-1 block uppercase font-bold">Saldo pendiente de pago</span>
                </Card>
              </div>

              {/* Stock Virtual taller */}
              <Card
                title={`Existencias en Depósito ${t.tallerNombre.toUpperCase().replace("TALLER ", "")}`}
                subtitle="Bobinas y piezas pendientes de confección asignadas a su taller."
              >
                {generalStock.filter(s => s.tallerId === t.tallerId).length === 0 ? (
                  <EmptyState message="No se reportan materiales o insumos almacenados en este depósito virtual." />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {generalStock.filter(s => s.tallerId === t.tallerId).map((item) => (
                      <div 
                        key={item.id} 
                        className="border border-outline-variant p-4 rounded flex justify-between items-center bg-surface-container-low text-xs text-on-surface font-bold"
                      >
                        <span className="uppercase truncate mr-2">
                          {item.producto?.nombre || productMap[item.productoId]}
                        </span>
                        <span className="text-mono text-blue-600 font-bold">{item.cantidadUnidades.toLocaleString()} u.</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Detalle tarifas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <Card
                  title="Producción Confeccionada Perfecta"
                  subtitle="Total de fardos devueltos aptos."
                  className="sm:col-span-1"
                >
                  <div className="p-4 border border-outline-variant bg-surface-container-low rounded flex justify-between items-center text-xs font-bold text-on-surface">
                    <span>Devoluciones Perfectas</span>
                    <span className="text-mono text-primary font-bold">{t.produccionPerfecta.toLocaleString()} u.</span>
                  </div>
                </Card>

                <Card
                  title="Cortes Pendientes de Confección"
                  subtitle="Piezas entregadas a confeccionar."
                  className="sm:col-span-1"
                >
                  <div className="p-4 border border-outline-variant bg-surface-container-low rounded flex justify-between items-center text-xs font-bold text-on-surface">
                    <span>Pendientes</span>
                    <span className="text-mono text-error font-bold">{t.totalPendiente.toLocaleString()} u.</span>
                  </div>
                </Card>

                <Card
                  title="Tarifas Pactadas por Fardo"
                  subtitle="Tarifas de liquidación vigentes."
                  className="sm:col-span-1"
                >
                  <div className="space-y-2 text-xs font-bold text-on-surface">
                    <div className="p-2.5 border border-outline-variant bg-surface-container-low rounded flex justify-between items-center">
                      <span>Fardo Trapos</span>
                      <span className="text-mono text-primary font-bold">${t.precioTrapoFardo?.toFixed(2)}</span>
                    </div>
                    <div className="p-2.5 border border-outline-variant bg-surface-container-low rounded flex justify-between items-center">
                      <span>Fardo Rejillas</span>
                      <span className="text-mono text-primary font-bold">${t.precioRejillaFardo?.toFixed(2)}</span>
                    </div>
                  </div>
                </Card>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL WINDOWS (ARIEL ONLY)                                                */}
      {/* ========================================================================= */}
      
      {/* 1. Register Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="Registrar Pago a Taller"
        size="md"
      >
        <Form onSubmit={handleRegisterPayment}>
          <FormSection>
            <FormRow>
              <FormSelect
                label="Taller *"
                required
                value={selectedTallerId}
                onChange={(e) => setSelectedTallerId(e.target.value)}
                placeholder="-- Seleccionar Taller --"
                options={talleres.map(t => ({ value: t.id, label: t.nombre }))}
              />
            </FormRow>

            <div className="border border-outline-variant p-4 rounded bg-surface-container-low space-y-3">
              <span className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest border-b border-outline-variant pb-2">Periodo de Liquidación</span>
              
              <FormRow columns={1}>
                <FormInput
                  label="Nombre Periodo *"
                  required
                  value={paymentPeriodName}
                  onChange={(e) => setPaymentPeriodName(e.target.value)}
                  placeholder="Ej. Semana 26..."
                />
              </FormRow>

              <FormRow columns={2}>
                <FormInput
                  label="Fecha Inicio *"
                  type="date"
                  required
                  value={paymentPeriodInicio}
                  onChange={(e) => setPaymentPeriodInicio(e.target.value)}
                />
                <FormInput
                  label="Fecha Fin *"
                  type="date"
                  required
                  value={paymentPeriodFin}
                  onChange={(e) => setPaymentPeriodFin(e.target.value)}
                />
              </FormRow>
            </div>

            {/* Dynamic Breakdown calculation details */}
            {calculating && (
              <div className="text-center py-4 text-blue-600 animate-pulse font-bold text-xs uppercase tracking-wide">
                Calculando importes de producción...
              </div>
            )}

            {!calculating && calculatedPayment && (
              <div className="bg-surface-container-lowest border border-outline-variant p-4 rounded text-xs font-mono space-y-2 text-on-surface-variant">
                <div className="border-b border-outline-variant pb-2 flex justify-between font-sans text-[10px] font-black uppercase text-on-surface-variant">
                  <span>Producción Computada</span>
                  <span className="text-blue-600 font-bold">{calculatedPayment.tallerNombre}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span>Fardos Trapo:</span>
                  <span className="font-bold text-on-surface">
                    {calculatedPayment.trapoFardos.toFixed(2)} F ({calculatedPayment.trapoUnits.toLocaleString()} u.)
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-on-surface-variant pl-2">
                  <span>Tarifa Trapo:</span>
                  <span>${calculatedPayment.precioTrapo.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center font-bold text-primary pl-2">
                  <span>Subtotal Trapos:</span>
                  <span>${calculatedPayment.subtotalTrapo.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>

                <div className="pt-2 border-t border-outline-variant flex justify-between items-center">
                  <span>Fardos Rejilla:</span>
                  <span className="font-bold text-on-surface">
                    {calculatedPayment.rejillaFardos.toFixed(2)} F ({calculatedPayment.rejillaUnits.toLocaleString()} u.)
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-on-surface-variant pl-2">
                  <span>Tarifa Rejilla:</span>
                  <span>${calculatedPayment.precioRejilla.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center font-bold text-primary pl-2">
                  <span>Subtotal Rejillas:</span>
                  <span>${calculatedPayment.subtotalRejilla.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>

                <div className="pt-3 border-t border-outline-variant flex justify-between items-center text-xs font-sans font-black uppercase text-on-surface bg-surface-container-low p-2.5 rounded">
                  <span>Monto Liquidación</span>
                  <span className="font-mono text-primary text-sm font-black">
                    ${calculatedPayment.total.toLocaleString(undefined, {minimumFractionDigits: 2})}
                  </span>
                </div>
              </div>
            )}

            <FormRow>
              <FormInput
                label="Monto ($ ARS) *"
                type="number"
                step="0.01"
                required
                readOnly
                value={paymentAmount}
                placeholder="Monto calculado..."
                className="text-mono text-primary font-bold"
              />
            </FormRow>

            <FormRow columns={2}>
              <FormInput
                label="Fecha de Pago *"
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </FormRow>

            <FormRow>
              <FormInput
                label="Observaciones"
                value={paymentObs}
                onChange={(e) => setPaymentObs(e.target.value)}
                placeholder="Detalles sobre el pago..."
              />
            </FormRow>
          </FormSection>

          <div className="flex gap-3 justify-end pt-2 border-t border-outline-variant">
            <Button
              variant="outline"
              onClick={() => setShowPaymentModal(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
            >
              Guardar Pago
            </Button>
          </div>
        </Form>
      </Modal>

      {/* 2. Configure Rates Modal */}
      <Modal
        isOpen={showRatesModal}
        onClose={() => setShowRatesModal(false)}
        title="Configurar Tarifas por Fardo"
        size="sm"
      >
        <Form onSubmit={handleSaveRates}>
          <FormSection>
            <FormRow>
              <FormSelect
                label="Taller *"
                required
                value={selectedTallerId}
                onChange={(e) => setSelectedTallerId(e.target.value)}
                placeholder="-- Seleccionar Taller --"
                options={talleres.map(t => ({ value: t.id, label: t.nombre }))}
              />
            </FormRow>

            <FormRow>
              <FormInput
                label="Tarifa Fardo Trapos ($) *"
                type="number"
                step="0.01"
                required
                value={tallerPrecioTrapo}
                onChange={(e) => setTallerPrecioTrapo(e.target.value)}
                className="text-mono text-primary font-bold"
              />
            </FormRow>

            <FormRow>
              <FormInput
                label="Tarifa Fardo Rejillas ($) *"
                type="number"
                step="0.01"
                required
                value={tallerPrecioRejilla}
                onChange={(e) => setTallerPrecioRejilla(e.target.value)}
                className="text-mono text-primary font-bold"
              />
            </FormRow>
          </FormSection>

          <div className="flex gap-3 justify-end pt-2 border-t border-outline-variant">
            <Button
              variant="outline"
              onClick={() => setShowRatesModal(false)}
            >
              Cerrar
            </Button>
            <Button
              type="submit"
              variant="primary"
            >
              Guardar Tarifas
            </Button>
          </div>
        </Form>
      </Modal>

    </div>
  );
};

export default DashboardPage;
