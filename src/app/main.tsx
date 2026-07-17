import React, { Component, Suspense, lazy, useState, useEffect, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from "react-router-dom";
import "../css/input.css";
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
import { AppLayout } from "./components/layout/AppLayout";
import { ToastProvider } from "./components/feedback/Toast";


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
const EtiquetadoPage = lazy(() =>
  import("./pages/EtiquetadoPage").then((m) => ({ default: m.EtiquetadoPage }))
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

  const isLoggedAndValid = currentUser && !showAuthRecovery;

  if (!isLoggedAndValid) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-background text-on-surface p-4">
        <div className="w-full max-w-sm space-y-6 bg-surface-container-lowest p-8 rounded border border-outline-variant shadow-sm select-none">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded bg-primary flex items-center justify-center mx-auto mb-2">
              <span className="text-white text-base font-black">TML</span>
            </div>
            <h1 className="text-xl font-bold text-on-surface tracking-tight uppercase">Textil María Luisa</h1>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-extrabold">Sistema Industrial ERP</p>
          </div>
          <AuthRecoveryScreen />
          <footer className="text-center text-[10px] text-on-surface-variant space-y-1 pt-4 border-t border-outline-variant">
            <p className="font-bold">Textil María Luisa SRL</p>
            <p className="leading-relaxed">Planta Industrial - Registro y Sincronización Resiliente Offline-First</p>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <AppLayout
      currentUser={currentUser}
      online={online}
      isCircuitOpen={isCircuitOpen}
      activePath={location.pathname}
      onLogout={() => {
        void authService.logout();
        navigate("/app/");
      }}
    >
      {showFullscreenDegraded && (
        <DegradedScreen mode="fullscreen" tier={runtimeTier} />
      )}

      {!showFullscreenDegraded && (
        <div className="flex flex-col gap-4">
          {showDegradedPanel && <DegradedScreen mode="panel" tier="DEGRADED" />}
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
                path="/app/etiquetado"
                element={
                  <TelemetryRoute name="etiquetado">
                    <RouteErrorBoundary routeName="etiquetado">
                      <ProtectedRoute permission="MOVIMIENTOS_CREAR">
                        {isSupervisor || isAdmin ? <EtiquetadoPage /> : <UnauthorizedScreen requiredPermission="SUPERVISOR" />}
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
        </div>
      )}
      <SyncDrawer />
    </AppLayout>
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
        <ToastProvider>
          <BrowserRouter>
            <AppShell />
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
} else {
  root.render(
    <React.StrictMode>
      <GlobalErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <BrowserRouter>
              <AppShell />
            </BrowserRouter>
          </ToastProvider>
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
