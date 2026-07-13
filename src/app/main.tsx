import React, { Component, Suspense, lazy, useState, useEffect, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { initChaosFromUrl, isChaosEnabled } from "./chaos/chaos.flags";
import { installChaosFetch } from "./chaos/chaos.fetch";
import { enableChaosRuntime } from "./chaos/chaos.runtime";
import { metricsService } from "./services/metrics.service";

const isDev = import.meta.env.DEV;

initChaosFromUrl();
if (import.meta.env.DEV || isChaosEnabled()) {
  installChaosFetch();
}
if (isChaosEnabled()) {
  enableChaosRuntime();
} else {
  if (import.meta.env.DEV) {
    console.log("[CHAOS] runtime skipped");
  }
}
import { useShallow } from "zustand/react/shallow";
import { runtimeLifecycle } from "./runtime/runtime.lifecycle";
import { selectHeaderStatus } from "./runtime/selectors";
import { useRuntimeStore } from "./runtime/runtime.store";
import { useLocation } from "react-router-dom";
import { LayoutDashboard, History, Wrench, Warehouse, Scissors, Settings, Menu, X } from "lucide-react";
import { RouteErrorBoundary } from "./components/runtime/RouteErrorBoundary";
import { DegradedScreen } from "./components/runtime/DegradedScreen";
import { AuthRecoveryScreen } from "./components/runtime/AuthRecoveryScreen";
import { selectShowAuthRecovery } from "./auth/auth.selectors";
import { SyncDrawer } from "./components/sync/SyncDrawer";
import { useRouteTelemetry } from "./telemetry/use-route-telemetry";
import { runtimeTelemetry } from "./telemetry/runtime.telemetry";
import { disposeRuntimeSubsystems } from "./runtime/runtime.dispose";
import { syncCircuitBreaker } from "./sync/sync.circuit";
import { authService } from "./services/auth.service";

const IncrementalTimeline = lazy(() =>
  import("./components/ui/IncrementalTimeline").then((m) => ({ default: m.IncrementalTimeline }))
);
const TallerPage = lazy(() =>
  import("./pages/TallerPage").then((m) => ({ default: m.TallerPage }))
);
const StockPage = lazy(() =>
  import("./pages/StockPage").then((m) => ({ default: m.StockPage }))
);
const CortePage = lazy(() =>
  import("./pages/CortePage").then((m) => ({ default: m.CortePage }))
);
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage }))
);
const AdminPage = lazy(() =>
  import("./pages/AdminPage").then((m) => ({ default: m.AdminPage }))
);

function TelemetryRoute({ name, children }: { name: string; children: ReactNode }) {
  useRouteTelemetry(name);
  return <>{children}</>;
}

metricsService.startStartupTimer();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function RouteFallback() {
  return (
    <div className="flex-1 flex items-center justify-center text-xs text-gray-500 uppercase tracking-wider">
      Cargando módulo…
    </div>
  );
}

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[CRITICAL] Uncaught UI error:", error, errorInfo);
    void metricsService.trackMetric("fatal_boundary_crashed", 1, {
      message: error.message,
      stack: error.stack,
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col justify-center items-center p-6 text-center select-none font-sans">
          <div className="max-w-md space-y-4">
            <span className="bg-red-950 text-red-400 border border-red-900 px-3 py-1 rounded text-[10px] font-black tracking-widest font-mono uppercase">
              UI_CRASH_PROTECT
            </span>
            <h2 className="text-lg font-black text-white uppercase tracking-wide">Fallo crítico en el renderizado</h2>
            <p className="text-xs text-gray-400 leading-relaxed font-semibold">
              El subsistema de interfaz de usuario ha fallado inesperadamente debido a una inconsistencia de estado o red.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-700 hover:bg-blue-650 border-2 border-blue-500 text-white font-black px-6 py-3 rounded text-xs uppercase tracking-wider transition cursor-pointer"
            >
              Forzar Recarga
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}



function UnauthorizedScreen({ requiredPermission }: { requiredPermission: string }) {
  return (
    <div className="flex-1 flex flex-col justify-center items-center gap-4 text-center py-12 max-w-sm mx-auto">
      <div className="bg-red-950/20 border border-red-900/35 p-6 rounded-2xl w-full space-y-3 shadow-md">
        <h2 className="text-sm font-extrabold text-red-400 uppercase tracking-wider">
          Acceso Denegado
        </h2>
        <p className="text-xs text-gray-400 leading-relaxed">
          No tienes el permiso necesario ({requiredPermission}) para acceder a este módulo.
        </p>
        <Link
          to="/app/"
          className="inline-block bg-gray-850 text-gray-250 font-bold py-2.5 px-4 rounded-xl border border-gray-700 text-xs transition active:scale-[0.98] mt-2 uppercase tracking-wide"
        >
          Volver al Inicio
        </Link>
      </div>
    </div>
  );
}

function ProtectedRoute({ permission, children }: { permission: string; children: ReactNode }) {
  const currentUser = useRuntimeStore((s) => s.currentUser);
  const permissions = currentUser?.permisos || [];
  const hasPermission = permissions.includes(permission) || permissions.includes("ADMIN_SISTEMA");

  if (!hasPermission) {
    return <UnauthorizedScreen requiredPermission={permission} />;
  }

  return <>{children}</>;
}

function AppShell() {
  console.count("AppShell render");
  const { online } = useRuntimeStore(useShallow(selectHeaderStatus));
  const showAuthRecovery = useRuntimeStore(selectShowAuthRecovery);
  const runtimeTier = useRuntimeStore((s) => s.runtimeTier);
  const currentUser = useRuntimeStore((s) => s.currentUser);

  const navigate = useNavigate();
  const location = useLocation();

  const [isCircuitOpen, setIsCircuitOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const checkCircuit = () => {
      setIsCircuitOpen(syncCircuitBreaker.isOpen());
    };
    checkCircuit();
    const interval = setInterval(checkCircuit, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        const routes = ["/app/", "/app/stock", "/app/timeline", "/app/taller", "/app/diag"];
        const targetRoute = routes[parseInt(e.key, 10) - 1];
        if (targetRoute) {
          navigate(targetRoute);
          if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            navigator.vibrate(30);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  // Technical sync variables removed to simplify header layout

  // Disable degraded and safe mode warning overlays completely as per user request
  const showFullscreenDegraded = false;
  const showDegradedPanel = false;

  // Permissions check for Tab Navigation
  const userPerms = currentUser?.permisos || [];
  const isAdmin = userPerms.includes("ADMIN_SISTEMA") || currentUser?.nombre === "Ariel" || currentUser?.nombre === "Leo";
  const isSupervisor = userPerms.includes("MOVIMIENTOS_VER") && userPerms.includes("MOVIMIENTOS_CREAR") && !isAdmin;
  const isOperario = userPerms.includes("MOVIMIENTOS_CREAR") && !userPerms.includes("MOVIMIENTOS_VER");
  const hasStockVer = userPerms.includes("STOCK_VER") || isAdmin;
  const hasMovimientosVer = userPerms.includes("MOVIMIENTOS_VER") || isAdmin;

  if (!currentUser) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-gray-950 text-gray-100 selection:bg-blue-600 selection:text-white p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-black uppercase tracking-wider text-blue-500">Textil María Luisa</h1>
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Sistema Industrial ERP</p>
          </div>
          <AuthRecoveryScreen />
          <footer className="text-center text-[10px] text-gray-650 space-y-1">
            <p className="font-bold">Textil María Luisa SRL</p>
            <p className="leading-relaxed">Planta Industrial - Registro y Sincronización Resiliente Offline-First</p>
          </footer>
        </div>
      </div>
    );
  }

  const allowedTabs: { to: string; label: string; icon: any }[] = [];
  if (currentUser) {
    allowedTabs.push({ to: "/app/", label: "INICIO", icon: LayoutDashboard });
    if (isOperario || isSupervisor || isAdmin) {
      allowedTabs.push({ to: "/app/corte", label: "CORTE", icon: Scissors });
    }
    if (hasStockVer && !isOperario) {
      allowedTabs.push({ to: "/app/stock", label: "STOCK", icon: Warehouse });
    }
    if (hasMovimientosVer) {
      allowedTabs.push({ to: "/app/timeline", label: "HISTORIAL", icon: History });
    }
    if (isSupervisor || isAdmin) {
      allowedTabs.push({ to: "/app/taller", label: "TALLERES", icon: Wrench });
    }
    if (isSupervisor || isAdmin) {
      allowedTabs.push({ to: "/app/admin", label: "ADMIN", icon: Settings });
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-gray-100 pb-12 select-none">
      <header className="bg-black border-b-2 border-gray-800 px-6 py-4 flex justify-between items-center sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSidebarOpen(true)}
            className="p-2 hover:bg-slate-900 rounded text-slate-350 hover:text-white transition active:scale-95 cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-extrabold text-sm md:text-base tracking-widest text-white uppercase">
            TEXTIL MARÍA LUISA SRL
          </span>
          {currentUser.nombre === "Leo" && (
            <span className="bg-red-950/60 text-red-400 border border-red-900/60 px-2 py-0.5 rounded font-black text-[9px] font-mono">
              SYSTEM
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 font-bold text-gray-300 uppercase">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${online && !isCircuitOpen ? "bg-green-500" : "bg-red-500 animate-pulse"}`} />
            <span>{currentUser.nombre}</span>
          </div>
        </div>
      </header>

      {/* Hamburger Sidebar Drawer */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/70 z-50 backdrop-blur-xs transition-opacity duration-200 animate-fadeIn"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      <div 
        className={`fixed inset-y-0 left-0 w-64 bg-slate-900 border-r-2 border-slate-800 z-50 p-5 transform transition-transform duration-200 ease-in-out flex flex-col justify-between ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="space-y-6">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <span className="font-black text-xs tracking-wider text-gray-400 uppercase">Menú Operativo</span>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 hover:bg-slate-850 rounded text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <nav className="flex flex-col gap-1.5">
            {allowedTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive =
                location.pathname === tab.to ||
                (tab.to !== "/app/" && location.pathname.startsWith(tab.to.replace(/\/$/, "")));
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={`flex items-center gap-3 px-4 py-3 rounded text-xs font-black uppercase tracking-wider transition ${
                    isActive 
                      ? "bg-blue-700 text-white border-l-4 border-blue-500 shadow-md" 
                      : "text-slate-350 hover:bg-slate-850 hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-slate-800 pt-4 text-center">
          <button
            onClick={() => {
              if (confirm("¿Está seguro de que desea cerrar sesión?")) {
                void authService.logout();
                navigate("/app/");
              }
            }}
            className="w-full bg-red-955/20 border-2 border-red-900/40 text-red-400 hover:bg-red-955/40 font-black py-3 rounded text-xs uppercase tracking-wider transition cursor-pointer active:scale-95"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>

      {showFullscreenDegraded && (
        <DegradedScreen mode="fullscreen" tier={runtimeTier} />
      )}

      {!showFullscreenDegraded && (
        <main className="flex-1 p-4 flex flex-col gap-4">
          {isCircuitOpen && (
            <div className="bg-red-950/20 border border-red-900/35 p-3.5 rounded-xl text-xs text-red-300 font-semibold flex items-center gap-2.5 animate-fadeIn">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
              <span>Sincronización pausada debido a fallos de red persistentes. El terminal opera localmente con total normalidad.</span>
            </div>
          )}
          {showDegradedPanel && <DegradedScreen mode="panel" tier="DEGRADED" />}
          {showAuthRecovery && <AuthRecoveryScreen />}
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route
                path="/app/"
                element={
                  <TelemetryRoute name="dashboard">
                    <RouteErrorBoundary routeName="dashboard">
                      <DashboardPage />
                    </RouteErrorBoundary>
                  </TelemetryRoute>
                }
              />
              <Route
                path="/app/corte"
                element={
                  <TelemetryRoute name="corte">
                    <RouteErrorBoundary routeName="corte">
                      <ProtectedRoute permission="MOVIMIENTOS_CREAR">
                        <CortePage />
                      </ProtectedRoute>
                    </RouteErrorBoundary>
                  </TelemetryRoute>
                }
              />
              <Route
                path="/app/stock"
                element={
                  <TelemetryRoute name="stock">
                    <RouteErrorBoundary routeName="stock">
                      <ProtectedRoute permission="STOCK_VER">
                        <StockPage />
                      </ProtectedRoute>
                    </RouteErrorBoundary>
                  </TelemetryRoute>
                }
              />
              <Route
                path="/app/timeline"
                element={
                  <TelemetryRoute name="timeline">
                    <RouteErrorBoundary routeName="timeline">
                      <ProtectedRoute permission="MOVIMIENTOS_VER">
                        <IncrementalTimeline />
                      </ProtectedRoute>
                    </RouteErrorBoundary>
                  </TelemetryRoute>
                }
              />
              <Route
                path="/app/taller"
                element={
                  <TelemetryRoute name="taller">
                    <RouteErrorBoundary routeName="taller">
                      <ProtectedRoute permission="MOVIMIENTOS_CREAR">
                        {isSupervisor || isAdmin ? <TallerPage /> : <UnauthorizedScreen requiredPermission="SUPERVISOR" />}
                      </ProtectedRoute>
                    </RouteErrorBoundary>
                  </TelemetryRoute>
                }
              />
              <Route
                path="/app/admin"
                element={
                  <TelemetryRoute name="admin">
                    <RouteErrorBoundary routeName="admin">
                      <ProtectedRoute permission="MOVIMIENTOS_CREAR">
                        <AdminPage />
                      </ProtectedRoute>
                    </RouteErrorBoundary>
                  </TelemetryRoute>
                }
              />
              <Route
                path="*"
                element={
                  <RouteErrorBoundary routeName="fallback">
                    <DashboardPage />
                  </RouteErrorBoundary>
                }
              />
            </Routes>
          </Suspense>
        </main>
      )}

      <SyncDrawer />
    </div>
  );
}


// Obsolete DashboardScreen removed

if (isDev) {
  setTimeout(() => console.log("[BOOT] still alive after 250ms"), 250);
  setTimeout(() => console.log("[BOOT] still alive after 500ms"), 500);
  setTimeout(() => console.log("[BOOT] still alive after 1000ms"), 1000);
  setTimeout(() => console.log("[BOOT] still alive after 2000ms"), 2000);
  setTimeout(() => console.log("[BOOT] still alive after 4000ms"), 4000);
}

runtimeLifecycle.runBoot().catch((err: any) => {
  console.error("Boot diagnostics crashed:", err);
});

console.log("[BOOT] before createRoot");
const root = ReactDOM.createRoot(document.getElementById("root")!);
console.log("[BOOT] after createRoot");

console.log("[BOOT] before render");
if (isDev) {
  root.render(
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
} else {
  root.render(
    <React.StrictMode>
      <GlobalErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppShell />
          </BrowserRouter>
        </QueryClientProvider>
      </GlobalErrorBoundary>
    </React.StrictMode>
  );
}
console.log("[BOOT] after render");

requestAnimationFrame(() => {
  console.log("[BOOT] app mounted");
  runtimeTelemetry.markRootMounted();
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    console.log("[HMR] cleaning up runtime services");
    disposeRuntimeSubsystems();
  });
}
