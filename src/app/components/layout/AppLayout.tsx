import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Modal } from "../feedback/Modal";
import { Button } from "../ui/Button";

export interface AppLayoutProps {
  currentUser: { nombre: string; email: string; permisos: string[] } | null;
  online: boolean;
  isCircuitOpen: boolean;
  activePath: string;
  onLogout: () => void;
  children?: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentUser,
  online,
  isCircuitOpen,
  activePath,
  onLogout,
  children,
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [activeDepot, setActiveDepot] = useState("Depósito Central");
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  if (!currentUser) return <>{children}</>;

  const userPerms = currentUser.permisos || [];
  const isAdmin =
    userPerms.includes("ADMIN_SISTEMA") ||
    currentUser.nombre === "Ariel" ||
    currentUser.nombre === "Leo";
  const isSupervisor =
    userPerms.includes("MOVIMIENTOS_VER") &&
    userPerms.includes("MOVIMIENTOS_CREAR") &&
    !isAdmin;
  const isOperario =
    userPerms.includes("MOVIMIENTOS_CREAR") && !userPerms.includes("MOVIMIENTOS_VER");
  const hasStockVer = userPerms.includes("STOCK_VER") || isAdmin;
  const hasMovimientosVer = userPerms.includes("MOVIMIENTOS_VER") || isAdmin;

  // Enlaces de navegación con Material Symbols
  const menuItems = [
    { to: "/app/", label: "Inicio", icon: "dashboard", visible: true },
    {
      to: "/app/corte",
      label: "Cortes",
      icon: "content_cut",
      visible: isOperario || isSupervisor || isAdmin,
    },
    { to: "/app/stock", label: "Inventario", icon: "inventory_2", visible: hasStockVer && !isOperario },
    { to: "/app/timeline", label: "Historial", icon: "history", visible: hasMovimientosVer },
    { to: "/app/taller", label: "Talleres", icon: "home_repair_service", visible: isSupervisor || isAdmin },
    { to: "/app/etiquetado", label: "Etiquetado", icon: "sell", visible: isSupervisor || isAdmin },
    { to: "/app/admin", label: "Gestión", icon: "settings", visible: isSupervisor || isAdmin },
  ];

  const visibleMenuItems = menuItems.filter((item) => item.visible);

  return (
    <div className="min-h-screen flex bg-background text-on-surface select-none font-sans pb-16 md:pb-0">
      
      {/* 1. SIDEBAR (Desktop - Persistent Left Sidebar) */}
      <aside
        className={`bg-surface-container-low border-r border-outline-variant flex flex-col justify-between shrink-0 transition-all duration-300 md:flex hidden ${
          sidebarCollapsed ? "w-16" : "w-[240px]"
        }`}
      >
        <div className="flex flex-col">
          {/* Logo TML (Alineado con Stitch) */}
          <div className="px-4 py-6 select-none border-b border-outline-variant/30">
            <h1 className="text-2xl font-black text-primary tracking-tight">
              {sidebarCollapsed ? "T" : "TML"}
            </h1>
            {!sidebarCollapsed && (
              <p className="text-[9px] font-bold text-outline uppercase tracking-widest mt-1">
                Industrial ERP v4.2
              </p>
            )}
          </div>

          {/* Menú de navegación (Items con bordes redondeados y Material Symbols) */}
          <nav className="p-2 space-y-1.5 mt-4">
            {visibleMenuItems.map((item) => {
              const isActive =
                activePath === item.to ||
                (item.to !== "/app/" && activePath.startsWith(item.to.replace(/\/$/, "")));

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-4 h-11 transition-all duration-200 ease-in-out select-none cursor-pointer ${
                    isActive
                      ? "bg-secondary-container text-on-secondary-container font-bold rounded-full"
                      : "text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface rounded-full"
                  }`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <span
                    className="material-symbols-outlined text-lg shrink-0"
                    style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {item.icon}
                  </span>
                  {!sidebarCollapsed && (
                    <span className="text-xs uppercase tracking-wide font-semibold">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer Sidebar (User Info & Logout) */}
        <div className="p-4 border-t border-outline-variant mt-auto space-y-4">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-bold uppercase text-xs">
                {currentUser.nombre.substring(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-xs text-on-surface truncate">{currentUser.nombre}</p>
                <p className="text-[9px] text-outline truncate uppercase font-semibold">
                  {online ? (isCircuitOpen ? "Offline Pausado" : "Conectado") : "Modo Local"}
                </p>
              </div>
            </div>
          )}

          <button
            onClick={() => setShowLogoutModal(true)}
            className="flex items-center gap-3 w-full px-4 h-10 text-error hover:bg-error-container/10 transition-colors rounded text-xs font-bold uppercase tracking-wider cursor-pointer active:scale-[0.98]"
            title={sidebarCollapsed ? "Cerrar Sesión" : undefined}
          >
            <span className="material-symbols-outlined text-lg shrink-0">logout</span>
            {!sidebarCollapsed && <span>Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      {/* 2. AREA DE CONTENIDO + TOPBAR */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* TOPBAR (Desktop & Mobile) */}
        <header className="flex justify-between items-center w-full px-6 h-12 bg-surface border-b border-outline-variant sticky top-0 z-40">
          {/* Lado izquierdo: Selector depósito & Colapso Sidebar */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1 hover:bg-surface-container-low rounded text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer md:block hidden"
            >
              <span className="material-symbols-outlined text-lg">menu</span>
            </button>

            {/* Selector de Depósito Activo (Estilo Stripe) */}
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-on-surface-variant bg-surface-container border border-outline-variant px-2.5 py-1 rounded select-none">
              <span className="material-symbols-outlined text-xs text-primary">map</span>
              <select
                value={activeDepot}
                onChange={(e) => setActiveDepot(e.target.value)}
                className="bg-transparent focus:outline-none cursor-pointer pr-1 uppercase tracking-wider font-extrabold"
              >
                <option value="Depósito Central">Central</option>
                <option value="Depósito Hilados">Hilados</option>
                <option value="Depósito Corte">Corte</option>
              </select>
            </div>
          </div>

          {/* Lado derecho: Buscador Spotlight, Notificaciones, Conexión */}
          <div className="flex items-center gap-3">
            {/* Buscador Trigger Spotlight (⌘K) */}
            <button
              onClick={() => setShowSearchModal(true)}
              className="flex items-center gap-2 px-2.5 py-1 border border-outline-variant bg-surface-container hover:bg-surface-container-high rounded text-[10px] text-on-surface-variant transition duration-150 cursor-pointer font-bold uppercase"
            >
              <span className="material-symbols-outlined text-xs">search</span>
              <span className="hidden sm:inline pr-2">Buscar...</span>
              <kbd className="bg-surface-container-lowest border border-outline-variant px-1.5 py-0.5 rounded text-[9px] text-outline">
                ⌘K
              </kbd>
            </button>

            {/* Indicador de Conexión en Topbar */}
            <div className="flex items-center shrink-0">
              <span
                className={`material-symbols-outlined text-base ${
                  online ? "text-primary" : "text-error animate-pulse"
                }`}
                title={online ? "En línea" : "Desconectado"}
              >
                {online ? "wifi" : "wifi_off"}
              </span>
            </div>

            {/* Campana de Notificaciones */}
            <button className="p-1 hover:bg-surface-container-low rounded text-on-surface-variant hover:text-on-surface transition relative cursor-pointer">
              <span className="material-symbols-outlined text-base">notifications</span>
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-error" />
            </button>
          </div>
        </header>

        {/* Banner de Advertencia Offline */}
        {!online && (
          <div className="bg-error-container/10 border-b border-error-container/20 px-6 py-2 text-[10px] text-error font-bold flex items-center gap-2 select-none shrink-0 uppercase tracking-wide">
            <span className="material-symbols-outlined text-xs">cloud_lightning</span>
            <span>ERP operando en modo offline. Los cambios se sincronizarán automáticamente.</span>
          </div>
        )}

        {/* 3. CONTENIDO RENDERIZADO */}
        <main className="flex-1 p-6 md:p-8 bg-background overflow-y-auto no-scrollbar min-h-0">
          {children}
        </main>
      </div>

      {/* 4. BOTTOM NAVIGATION BAR (Mobile - Barra Fija Inferior) */}
      <nav className="md:hidden flex fixed bottom-0 inset-x-0 h-16 bg-surface-container-low border-t border-outline-variant justify-around items-center z-40 select-none">
        {visibleMenuItems.slice(0, 4).map((item) => {
          const isActive =
            activePath === item.to ||
            (item.to !== "/app/" && activePath.startsWith(item.to.replace(/\/$/, "")));

          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center w-16 h-full text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer select-none ${
                isActive ? "text-primary font-extrabold" : "text-on-surface-variant"
              }`}
            >
              <span
                className="material-symbols-outlined text-lg mb-0.5"
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 5. SPOTLIGHT SEARCH MODAL */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 select-none">
          <div
            className="fixed inset-0 bg-on-background/40 backdrop-blur-xs transition-opacity duration-200"
            onClick={() => setShowSearchModal(false)}
          />
          <div className="w-full max-w-lg bg-surface-container-lowest border border-outline-variant shadow-overlay rounded overflow-hidden z-10 flex flex-col animate-fadeIn">
            {/* Input Caja de búsqueda */}
            <div className="px-4 py-3 border-b border-outline-variant flex items-center gap-3 shrink-0">
              <span className="material-symbols-outlined text-on-surface-variant">search</span>
              <input
                type="text"
                autoFocus
                placeholder="Buscar comandos, productos, talleres..."
                className="w-full text-xs text-on-surface placeholder-on-surface-variant/60 focus:outline-none bg-transparent"
              />
              <kbd className="bg-surface-container border border-outline-variant px-1.5 py-0.5 rounded text-[9px] text-outline select-none">
                Esc
              </kbd>
            </div>

            {/* Listado de Categorías y Sugerencias */}
            <div className="p-3 max-h-[50vh] overflow-y-auto no-scrollbar space-y-4">
              {/* Acciones Rápidas */}
              <div className="space-y-1">
                <span className="block text-[8px] font-bold text-on-surface-variant uppercase tracking-widest px-2 pb-1">
                  Acciones recomendadas
                </span>
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-surface-container-low text-xs text-on-surface cursor-pointer">
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm text-outline">content_cut</span>
                      Registrar Cortada
                    </span>
                    <kbd className="text-[9px] text-outline font-bold">C</kbd>
                  </div>
                  <div className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-surface-container-low text-xs text-on-surface cursor-pointer">
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm text-outline">home_repair_service</span>
                      Entrega Taller
                    </span>
                    <kbd className="text-[9px] text-outline font-bold">E</kbd>
                  </div>
                </div>
              </div>

              {/* Vistas Recientes */}
              <div className="space-y-1">
                <span className="block text-[8px] font-bold text-on-surface-variant uppercase tracking-widest px-2 pb-1">
                  Módulos
                </span>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-container-low text-xs text-on-surface cursor-pointer">
                    <span className="material-symbols-outlined text-sm text-outline">inventory_2</span>
                    Monitor de Stock
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-container-low text-xs text-on-surface cursor-pointer">
                    <span className="material-symbols-outlined text-sm text-outline">settings</span>
                    Configuración del ERP
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 6. LOGOUT CONFIRMATION MODAL */}
      <Modal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        title="Confirmar Salida"
        size="sm"
      >
        <div className="space-y-4 text-center">
          <p className="text-xs text-on-surface-variant leading-relaxed">
            ¿Está seguro de que desea cerrar sesión en el sistema industrial TML?
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <Button
              variant="outline"
              onClick={() => setShowLogoutModal(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setShowLogoutModal(false);
                onLogout();
              }}
            >
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
