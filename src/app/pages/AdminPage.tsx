import React, { useState, useEffect } from "react";
import { useRuntimeStore } from "../runtime/runtime.store";
import { authFetch } from "../auth/auth.api";
import { Plus, Edit2, Trash2, Download, Check, X, Users, Warehouse, Wrench, Package, ShieldAlert } from "lucide-react";

export const AdminPage: React.FC = () => {
  const currentUser = useRuntimeStore((s) => s.currentUser);
  const online = useRuntimeStore((s) => s.online);

  const isAdmin = currentUser?.permisos?.includes("ADMIN_SISTEMA") || currentUser?.nombre === "Ariel" || currentUser?.nombre === "Leo";
  const isSupervisor = currentUser?.permisos?.includes("MOVIMIENTOS_VER") && currentUser?.permisos?.includes("MOVIMIENTOS_CREAR") && !isAdmin;

  // Active Tab
  const [activeTab, setActiveTab] = useState<"productos" | "talleres" | "depositos" | "usuarios" | "pagos">("productos");

  // General Loading & Error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Data lists
  const [productos, setProductos] = useState<any[]>([]);
  const [talleres, setTalleres] = useState<any[]>([]);
  const [depositos, setDepositos] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [pagos, setPagos] = useState<any[]>([]);
  const [permisosList, setPermisosList] = useState<any[]>([]);

  // Search / Filters
  const [searchTerm, setSearchTerm] = useState("");

  // Modals / Editors
  const [modalMode, setModalMode] = useState<"NEW" | "EDIT" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Fields
  // Product Form
  const [prodNombre, setProdNombre] = useState("");
  const [prodDesc, setProdDesc] = useState("");
  const [prodMedida, setProdMedida] = useState("");
  const [prodColor, setProdColor] = useState("");
  const [prodTipo, setProdTipo] = useState("");
  const [prodUnidadesPorFardo, setProdUnidadesPorFardo] = useState("60");
  const [prodCategoria, setProdCategoria] = useState("TERMINADO");
  const [prodStockMinimo, setProdStockMinimo] = useState("0");
  const [prodActivo, setProdActivo] = useState(true);

  // Workshop Form
  const [tallerNombre, setTallerNombre] = useState("");
  const [tallerObs, setTallerObs] = useState("");
  const [tallerPrecioTrapo, setTallerPrecioTrapo] = useState("0");
  const [tallerPrecioRejilla, setTallerPrecioRejilla] = useState("0");
  const [tallerActivo, setTallerActivo] = useState(true);

  // Warehouse Form
  const [depNombre, setDepNombre] = useState("");
  const [depDesc, setDepDesc] = useState("");
  const [depTipo, setDepTipo] = useState("FABRICA");
  const [depActivo, setDepActivo] = useState(true);

  // User Form
  const [userNombre, setUserNombre] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userSelectedPerms, setUserSelectedPerms] = useState<string[]>([]);
  const [userActivo, setUserActivo] = useState(true);

  // Load data depending on permissions
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (online) {
        // Load products (accessible to both Admin and Supervisor)
        const prodRes = await authFetch("/api/admin/productos");
        if (prodRes.ok) {
          const json = await prodRes.json();
          setProductos(json.data || []);
        }

        // Admin-only data
        if (isAdmin) {
          const [tRes, dRes, uRes, pRes, permRes] = await Promise.all([
            authFetch("/api/admin/talleres"),
            authFetch("/api/admin/depositos"),
            authFetch("/api/admin/usuarios"),
            authFetch("/api/talleres/pagos"),
            authFetch("/api/admin/permisos")
          ]);

          if (tRes.ok) setTalleres((await tRes.json()).data || []);
          if (dRes.ok) setDepositos((await dRes.json()).data || []);
          if (uRes.ok) setUsuarios((await uRes.json()).data || []);
          if (pRes.ok) setPagos((await pRes.json()).data || []);
          if (permRes.ok) setPermisosList((await permRes.json()).data || []);
        }
      } else {
        setError("Debe estar en línea para poder administrar registros.");
      }
    } catch (err: any) {
      setError("Error de conexión al cargar datos de administración.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (isSupervisor) {
      setActiveTab("productos");
    }
  }, [online, activeTab]);

  const showFeedback = (msg: string, isError = false) => {
    if (isError) {
      setError(msg);
      setTimeout(() => setError(null), 4000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  };

  // --- CRUD OPERATIONS ---
  const handleOpenNewModal = () => {
    setModalMode("NEW");
    setEditingId(null);
    
    // Reset Form fields
    setProdNombre(""); setProdDesc(""); setProdMedida(""); setProdColor(""); setProdTipo(""); setProdUnidadesPorFardo("60"); setProdCategoria("TERMINADO"); setProdStockMinimo("0"); setProdActivo(true);
    setTallerNombre(""); setTallerObs(""); setTallerPrecioTrapo("0"); setTallerPrecioRejilla("0"); setTallerActivo(true);
    setDepNombre(""); setDepDesc(""); setDepTipo("FABRICA"); setDepActivo(true);
    setUserNombre(""); setUserEmail(""); setUserPassword(""); setUserSelectedPerms([]); setUserActivo(true);
  };

  const handleOpenEditModal = (item: any) => {
    setModalMode("EDIT");
    setEditingId(item.id);

    if (activeTab === "productos") {
      setProdNombre(item.nombre || "");
      setProdDesc(item.descripcion || "");
      setProdMedida(item.medida || "");
      setProdColor(item.color || "");
      setProdTipo(item.tipo || "");
      setProdUnidadesPorFardo(String(item.unidadesPorFardo || 60));
      setProdCategoria(item.categoria || "TERMINADO");
      setProdStockMinimo(String(item.stockMinimo || 0));
      setProdActivo(item.activo);
    } else if (activeTab === "talleres") {
      setTallerNombre(item.nombre || "");
      setTallerObs(item.observaciones || "");
      setTallerPrecioTrapo(String(item.precioTrapoFardo || 0));
      setTallerPrecioRejilla(String(item.precioRejillaFardo || 0));
      setTallerActivo(item.activo);
    } else if (activeTab === "depositos") {
      setDepNombre(item.nombre || "");
      setDepDesc(item.descripcion || "");
      setDepTipo(item.tipo || "FABRICA");
      setDepActivo(item.activo);
    } else if (activeTab === "usuarios") {
      setUserNombre(item.nombre || "");
      setUserEmail(item.email || "");
      setUserPassword("");
      setUserActivo(item.activo);
      setUserSelectedPerms((item.permisos || []).map((up: any) => up.permiso?.clave || up.permisoClave));
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let url = "";
    let method = "POST";
    let bodyData: any = {};

    if (activeTab === "productos") {
      url = "/api/admin/productos";
      bodyData = {
        nombre: prodNombre,
        descripcion: prodDesc,
        medida: prodMedida,
        color: prodColor,
        tipo: prodTipo,
        unidadesPorFardo: parseInt(prodUnidadesPorFardo, 10),
        categoria: prodCategoria,
        stockMinimo: parseInt(prodStockMinimo, 10),
        activo: prodActivo
      };
    } else if (activeTab === "talleres") {
      url = "/api/admin/talleres";
      bodyData = {
        nombre: tallerNombre,
        observaciones: tallerObs,
        precioTrapoFardo: parseFloat(tallerPrecioTrapo),
        precioRejillaFardo: parseFloat(tallerPrecioRejilla),
        activo: tallerActivo
      };
    } else if (activeTab === "depositos") {
      url = "/api/admin/depositos";
      bodyData = {
        nombre: depNombre,
        descripcion: depDesc,
        tipo: depTipo,
        activo: depActivo
      };
    } else if (activeTab === "usuarios") {
      url = "/api/admin/usuarios";
      bodyData = {
        nombre: userNombre,
        email: userEmail,
        password: userPassword || undefined,
        permisos: userSelectedPerms,
        activo: userActivo
      };
    }

    if (modalMode === "EDIT") {
      url += `/${editingId}`;
      method = "PUT";
    }

    try {
      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData)
      });

      if (res.ok) {
        showFeedback(modalMode === "NEW" ? "Registro creado correctamente." : "Registro actualizado correctamente.");
        setModalMode(null);
        void loadData();
      } else {
        const json = await res.json();
        showFeedback(json.message || "Error al guardar el registro.", true);
      }
    } catch {
      showFeedback("Error de conexión con el servidor.", true);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm("¿Está seguro de eliminar este registro de forma permanente?")) return;
    try {
      let url = "";
      if (activeTab === "productos") url = `/api/admin/productos/${id}`;
      else if (activeTab === "talleres") url = `/api/admin/talleres/${id}`;
      else if (activeTab === "depositos") url = `/api/admin/depositos/${id}`;
      else if (activeTab === "usuarios") url = `/api/admin/usuarios/${id}`;
      else if (activeTab === "pagos") url = `/api/talleres/pagos/${id}`;

      const res = await authFetch(url, { method: "DELETE" });
      if (res.ok) {
        showFeedback("Registro eliminado.");
        void loadData();
      } else {
        showFeedback("No se pudo eliminar el registro.", true);
      }
    } catch {
      showFeedback("Error de red al intentar eliminar.", true);
    }
  };

  const handleDownloadPdf = (pagoId: string) => {
    window.open(`/api/talleres/pagos/${pagoId}/pdf`, "_blank");
  };

  const togglePermission = (key: string) => {
    if (userSelectedPerms.includes(key)) {
      setUserSelectedPerms(userSelectedPerms.filter(k => k !== key));
    } else {
      setUserSelectedPerms([...userSelectedPerms, key]);
    }
  };

  // Filter list
  const getFilteredItems = () => {
    if (activeTab === "productos") {
      return productos.filter(p => p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || p.categoria.toLowerCase().includes(searchTerm.toLowerCase()));
    } else if (activeTab === "talleres") {
      return talleres.filter(t => t.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
    } else if (activeTab === "depositos") {
      return depositos.filter(d => d.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || d.tipo.toLowerCase().includes(searchTerm.toLowerCase()));
    } else if (activeTab === "usuarios") {
      return usuarios.filter(u => u.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase()));
    } else if (activeTab === "pagos") {
      return pagos.filter(p => p.taller?.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) || p.periodoNombre?.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return [];
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
        <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs uppercase font-black tracking-widest">Cargando base de datos...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full space-y-6 pb-12 px-2 text-gray-200 font-sans">
      
      {/* Title block */}
      <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-md flex justify-between items-center gap-4">
        <div>
          <span className="bg-slate-800 text-slate-350 border border-slate-700 px-2 py-0.5 rounded text-[9px] font-black tracking-widest font-mono">
            SISTEMA CENTRAL
          </span>
          <h2 className="text-lg font-black tracking-wide text-white uppercase mt-1">
            Panel de Control Administrativo
          </h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">
            Configuración y ABMs maestros sin código
          </p>
        </div>
      </div>

      {/* Notification Banners */}
      {error && (
        <div className="bg-red-950/40 border-2 border-red-900/60 p-4 rounded-md text-xs text-red-300 font-black flex items-center gap-2.5">
          <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="bg-green-950/40 border-2 border-green-900/60 p-4 rounded-md text-xs text-green-300 font-black flex items-center gap-2.5">
          <Check className="w-5 h-5 text-green-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-slate-900 p-1.5 rounded-md border-2 border-slate-800 overflow-x-auto no-scrollbar gap-1.5">
        <button
          onClick={() => { setActiveTab("productos"); setSearchTerm(""); }}
          className={`px-4 py-3.5 rounded-md text-xs font-black tracking-wider transition uppercase shrink-0 cursor-pointer ${activeTab === "productos" ? "bg-blue-700 text-white border-2 border-blue-600 shadow-md" : "text-gray-400 hover:text-gray-250"}`}
        >
          <Package className="w-4 h-4 inline-block mr-1.5 -mt-0.5" /> Productos
        </button>

        {isAdmin && (
          <>
            <button
              onClick={() => { setActiveTab("talleres"); setSearchTerm(""); }}
              className={`px-4 py-3.5 rounded-md text-xs font-black tracking-wider transition uppercase shrink-0 cursor-pointer ${activeTab === "talleres" ? "bg-blue-700 text-white border-2 border-blue-600 shadow-md" : "text-gray-400 hover:text-gray-250"}`}
            >
              <Wrench className="w-4 h-4 inline-block mr-1.5 -mt-0.5" /> Talleres
            </button>

            <button
              onClick={() => { setActiveTab("depositos"); setSearchTerm(""); }}
              className={`px-4 py-3.5 rounded-md text-xs font-black tracking-wider transition uppercase shrink-0 cursor-pointer ${activeTab === "depositos" ? "bg-blue-700 text-white border-2 border-blue-600 shadow-md" : "text-gray-400 hover:text-gray-250"}`}
            >
              <Warehouse className="w-4 h-4 inline-block mr-1.5 -mt-0.5" /> Depósitos
            </button>

            <button
              onClick={() => { setActiveTab("usuarios"); setSearchTerm(""); }}
              className={`px-4 py-3.5 rounded-md text-xs font-black tracking-wider transition uppercase shrink-0 cursor-pointer ${activeTab === "usuarios" ? "bg-blue-700 text-white border-2 border-blue-600 shadow-md" : "text-gray-400 hover:text-gray-250"}`}
            >
              <Users className="w-4 h-4 inline-block mr-1.5 -mt-0.5" /> Usuarios
            </button>

            <button
              onClick={() => { setActiveTab("pagos"); setSearchTerm(""); }}
              className={`px-4 py-3.5 rounded-md text-xs font-black tracking-wider transition uppercase shrink-0 cursor-pointer ${activeTab === "pagos" ? "bg-blue-700 text-white border-2 border-blue-600 shadow-md" : "text-gray-400 hover:text-gray-250"}`}
            >
              <Download className="w-4 h-4 inline-block mr-1.5 -mt-0.5" /> Pagos & PDFs
            </button>
          </>
        )}
      </div>

      {/* Grid Toolbar: Search & Add button */}
      <div className="bg-slate-900 border-2 border-slate-800 p-4 rounded-md flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="w-full sm:max-w-xs relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Buscar por nombre...`}
            className="w-full bg-slate-950 border-2 border-slate-800 rounded-md px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-600 font-bold"
          />
        </div>
        {activeTab !== "pagos" && (
          <button
            onClick={handleOpenNewModal}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-500 text-white font-black px-5 py-3 rounded-md text-xs uppercase tracking-wider transition active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Agregar Nuevo
          </button>
        )}
      </div>

      {/* Grid Table */}
      <div className="bg-slate-900 border-2 border-slate-800 rounded-md overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-slate-950 text-gray-450 border-b border-slate-850 uppercase tracking-wider text-[9px] font-black">
                {activeTab === "productos" && (
                  <>
                    <th className="p-4">Nombre</th>
                    <th className="p-4">Categoría</th>
                    <th className="p-4 text-center">U. x Fardo</th>
                    <th className="p-4">Color</th>
                    <th className="p-4">Medida</th>
                    <th className="p-4">Tipo (Tela)</th>
                    <th className="p-4 text-center">Stock Mín.</th>
                    <th className="p-4 text-center">Estado</th>
                    <th className="p-4 text-center w-24">Acciones</th>
                  </>
                )}
                {activeTab === "talleres" && (
                  <>
                    <th className="p-4">Nombre</th>
                    <th className="p-4">Observaciones</th>
                    <th className="p-4 text-right">Fardo Trapo</th>
                    <th className="p-4 text-right">Fardo Rejilla</th>
                    <th className="p-4 text-center">Estado</th>
                    <th className="p-4 text-center w-24">Acciones</th>
                  </>
                )}
                {activeTab === "depositos" && (
                  <>
                    <th className="p-4">Nombre</th>
                    <th className="p-4">Descripción</th>
                    <th className="p-4">Tipo</th>
                    <th className="p-4 text-center">Estado</th>
                    <th className="p-4 text-center w-24">Acciones</th>
                  </>
                )}
                {activeTab === "usuarios" && (
                  <>
                    <th className="p-4">Nombre</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Permisos</th>
                    <th className="p-4 text-center">Estado</th>
                    <th className="p-4 text-center w-24">Acciones</th>
                  </>
                )}
                {activeTab === "pagos" && (
                  <>
                    <th className="p-4">Taller</th>
                    <th className="p-4">Período</th>
                    <th className="p-4">Fecha Pago</th>
                    <th className="p-4 text-right">Monto</th>
                    <th className="p-4">Observaciones</th>
                    <th className="p-4 text-center w-28">Liquidación</th>
                    <th className="p-4 text-center w-12"></th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {getFilteredItems().length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-gray-500 font-bold uppercase italic text-[10px]">
                    No se encontraron registros.
                  </td>
                </tr>
              ) : (
                getFilteredItems().map((item) => (
                  <tr key={item.id} className="hover:bg-slate-850/20">
                    
                    {/* PRODUCTOS ROW */}
                    {activeTab === "productos" && (
                      <>
                        <td className="p-4 font-bold text-white uppercase">{item.nombre}</td>
                        <td className="p-4">
                          <span className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-[9px] font-bold text-slate-350">
                            {item.categoria}
                          </span>
                        </td>
                        <td className="p-4 text-center font-mono font-bold">{item.unidadesPorFardo} u.</td>
                        <td className="p-4 uppercase">{item.color || "-"}</td>
                        <td className="p-4 uppercase">{item.medida || "-"}</td>
                        <td className="p-4 uppercase">{item.tipo || "-"}</td>
                        <td className="p-4 text-center font-mono font-bold text-yellow-500">{item.stockMinimo || 0} u.</td>
                        <td className="p-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black ${item.activo ? "bg-green-950 text-green-400" : "bg-red-950 text-red-400"}`}>
                            {item.activo ? "ACTIVO" : "INACTIVO"}
                          </span>
                        </td>
                        <td className="p-3 text-center flex justify-center gap-1">
                          <button onClick={() => handleOpenEditModal(item)} className="p-2 bg-slate-800 text-blue-400 hover:text-blue-300 rounded border border-slate-700 cursor-pointer">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteItem(item.id)} className="p-2 bg-slate-800 text-red-400 hover:text-red-300 rounded border border-slate-700 cursor-pointer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </>
                    )}

                    {/* TALLERES ROW */}
                    {activeTab === "talleres" && (
                      <>
                        <td className="p-4 font-bold text-white uppercase">{item.nombre}</td>
                        <td className="p-4 text-gray-400">{item.observaciones || "-"}</td>
                        <td className="p-4 text-right font-mono font-bold text-green-400">${item.precioTrapoFardo?.toLocaleString()}</td>
                        <td className="p-4 text-right font-mono font-bold text-green-400">${item.precioRejillaFardo?.toLocaleString()}</td>
                        <td className="p-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black ${item.activo ? "bg-green-950 text-green-400" : "bg-red-950 text-red-400"}`}>
                            {item.activo ? "ACTIVO" : "INACTIVO"}
                          </span>
                        </td>
                        <td className="p-3 text-center flex justify-center gap-1">
                          <button onClick={() => handleOpenEditModal(item)} className="p-2 bg-slate-800 text-blue-400 hover:text-blue-300 rounded border border-slate-700 cursor-pointer">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteItem(item.id)} className="p-2 bg-slate-800 text-red-400 hover:text-red-300 rounded border border-slate-700 cursor-pointer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </>
                    )}

                    {/* DEPOSITOS ROW */}
                    {activeTab === "depositos" && (
                      <>
                        <td className="p-4 font-bold text-white uppercase">{item.nombre}</td>
                        <td className="p-4 text-gray-400">{item.descripcion || "-"}</td>
                        <td className="p-4 font-bold text-blue-400">{item.tipo}</td>
                        <td className="p-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black ${item.activo ? "bg-green-950 text-green-400" : "bg-red-950 text-red-400"}`}>
                            {item.activo ? "ACTIVO" : "INACTIVO"}
                          </span>
                        </td>
                        <td className="p-3 text-center flex justify-center gap-1">
                          <button onClick={() => handleOpenEditModal(item)} className="p-2 bg-slate-800 text-blue-400 hover:text-blue-300 rounded border border-slate-700 cursor-pointer">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteItem(item.id)} className="p-2 bg-slate-800 text-red-400 hover:text-red-300 rounded border border-slate-700 cursor-pointer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </>
                    )}

                    {/* USUARIOS ROW */}
                    {activeTab === "usuarios" && (
                      <>
                        <td className="p-4 font-bold text-white uppercase">{item.nombre}</td>
                        <td className="p-4 text-gray-450">{item.email}</td>
                        <td className="p-4 flex flex-wrap gap-1">
                          {(item.permisos || []).map((up: any) => (
                            <span key={up.id} className="bg-slate-850 border border-slate-800 text-[8px] font-bold px-1.5 py-0.5 text-gray-400 rounded">
                              {up.permiso?.clave || up.permisoClave}
                            </span>
                          ))}
                        </td>
                        <td className="p-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black ${item.activo ? "bg-green-950 text-green-400" : "bg-red-950 text-red-400"}`}>
                            {item.activo ? "ACTIVO" : "INACTIVO"}
                          </span>
                        </td>
                        <td className="p-3 text-center flex justify-center gap-1">
                          <button onClick={() => handleOpenEditModal(item)} className="p-2 bg-slate-800 text-blue-400 hover:text-blue-300 rounded border border-slate-700 cursor-pointer">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {item.nombre !== "Ariel" && item.nombre !== "Leo" && (
                            <button onClick={() => handleDeleteItem(item.id)} className="p-2 bg-slate-800 text-red-400 hover:text-red-300 rounded border border-slate-700 cursor-pointer">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </>
                    )}

                    {/* PAGOS ROW */}
                    {activeTab === "pagos" && (
                      <>
                        <td className="p-4 font-bold text-white uppercase">{item.taller?.nombre}</td>
                        <td className="p-4 font-bold text-blue-450 uppercase">{item.periodoNombre || "Unico"}</td>
                        <td className="p-4 font-mono">{new Date(item.fecha).toLocaleDateString()}</td>
                        <td className="p-4 text-right font-mono font-bold text-green-400">${item.monto?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="p-4 text-gray-400">{item.observaciones || "-"}</td>
                        <td className="p-3 text-center">
                          {item.periodoNombre ? (
                            <button
                              onClick={() => handleDownloadPdf(item.id)}
                              className="px-3 py-1.5 bg-blue-900/60 hover:bg-blue-900 border border-blue-700 text-white font-bold text-[10px] rounded uppercase tracking-wider flex items-center justify-center gap-1 mx-auto cursor-pointer"
                            >
                              <Download className="w-3 h-3" /> PDF
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-500 font-bold uppercase italic">Sin liquidación</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <button onClick={() => handleDeleteItem(item.id)} className="p-2 bg-slate-800 text-red-400 hover:text-red-300 border border-slate-700 rounded cursor-pointer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </>
                    )}

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT/NEW MODAL FORM */}
      {modalMode && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-md max-w-lg w-full p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h3 className="text-sm font-black uppercase tracking-widest text-blue-450">
                {modalMode === "NEW" ? "Agregar Nuevo" : "Editar Registro"} - {activeTab.toUpperCase()}
              </h3>
              <button onClick={() => setModalMode(null)} className="text-gray-450 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4 text-xs">
              
              {/* PRODUCTOS FORM FIELDS */}
              {activeTab === "productos" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-300 uppercase mb-1">Nombre Producto *</label>
                    <input type="text" required value={prodNombre} onChange={(e) => setProdNombre(e.target.value)} placeholder="Ej. Trapo Grande..." className="w-full bg-slate-950 border-2 border-slate-800 rounded px-3 py-2 text-white font-bold" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-300 uppercase mb-1">Categoría *</label>
                      <select value={prodCategoria} onChange={(e) => setProdCategoria(e.target.value)} className="w-full bg-slate-950 border-2 border-slate-800 rounded px-3 py-2 text-white font-bold uppercase cursor-pointer">
                        <option value="TERMINADO">PRODUCTO TERMINADO</option>
                        <option value="INTERMEDIO">TELA CORTADA (INTERMEDIO)</option>
                        <option value="TELA">TELA RULO (ROLO)</option>
                        <option value="INSUMO">INSUMO</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-300 uppercase mb-1">Unidades por Fardo *</label>
                      <input type="number" required value={prodUnidadesPorFardo} onChange={(e) => setProdUnidadesPorFardo(e.target.value)} placeholder="Ej. 60" className="w-full bg-slate-950 border-2 border-slate-800 rounded px-3 py-2 text-white font-mono font-bold" />
                    </div>
                  </div>
                  
                  {prodCategoria === "TELA" && (
                    <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-md border border-slate-850">
                      <div>
                        <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Medida (Tela)</label>
                        <input type="text" value={prodMedida} onChange={(e) => setProdMedida(e.target.value)} placeholder="Ej. 1.20m" className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-white" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Color (Tela)</label>
                        <input type="text" value={prodColor} onChange={(e) => setProdColor(e.target.value)} placeholder="Ej. Blanco" className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-white" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Tipo (Tela)</label>
                        <input type="text" value={prodTipo} onChange={(e) => setProdTipo(e.target.value)} placeholder="Ej. Algodón" className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-white" />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-gray-300 uppercase mb-1">Descripción</label>
                    <textarea value={prodDesc} onChange={(e) => setProdDesc(e.target.value)} placeholder="Notas..." className="w-full bg-slate-950 border-2 border-slate-800 rounded px-3 py-2 text-white h-16 resize-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-300 uppercase mb-1">Stock Mínimo Configurable (u.)</label>
                    <input type="number" value={prodStockMinimo} onChange={(e) => setProdStockMinimo(e.target.value)} placeholder="0" className="w-full bg-slate-950 border-2 border-slate-800 rounded px-3 py-2 text-white font-mono font-bold" />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input type="checkbox" id="prodActivo" checked={prodActivo} onChange={(e) => setProdActivo(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                    <label htmlFor="prodActivo" className="text-gray-305 font-bold uppercase cursor-pointer">Producto Activo en Sistema</label>
                  </div>
                </div>
              )}

              {/* TALLERES FORM FIELDS */}
              {activeTab === "talleres" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-300 uppercase mb-1">Nombre Taller *</label>
                    <input type="text" required value={tallerNombre} onChange={(e) => setTallerNombre(e.target.value)} placeholder="Ej. Taller Evelina..." className="w-full bg-slate-950 border-2 border-slate-800 rounded px-3 py-2 text-white font-bold" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 bg-slate-955 p-3 rounded-md border border-slate-850">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-350 uppercase mb-1">Precio Fardo Trapos ($) *</label>
                      <input type="number" step="0.01" required value={tallerPrecioTrapo} onChange={(e) => setTallerPrecioTrapo(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white font-mono font-bold text-green-400" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-355 uppercase mb-1">Precio Fardo Rejillas ($) *</label>
                      <input type="number" step="0.01" required value={tallerPrecioRejilla} onChange={(e) => setTallerPrecioRejilla(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white font-mono font-bold text-green-400" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-300 uppercase mb-1">Observaciones</label>
                    <textarea value={tallerObs} onChange={(e) => setTallerObs(e.target.value)} placeholder="Detalles de contacto, ubicación..." className="w-full bg-slate-950 border-2 border-slate-800 rounded px-3 py-2 text-white h-16 resize-none" />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input type="checkbox" id="tallerActivo" checked={tallerActivo} onChange={(e) => setTallerActivo(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                    <label htmlFor="tallerActivo" className="text-gray-305 font-bold uppercase cursor-pointer">Taller Activo</label>
                  </div>
                </div>
              )}

              {/* DEPOSITOS FORM FIELDS */}
              {activeTab === "depositos" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-300 uppercase mb-1">Nombre Depósito *</label>
                    <input type="text" required value={depNombre} onChange={(e) => setDepNombre(e.target.value)} placeholder="Ej. Galpón Central..." className="w-full bg-slate-950 border-2 border-slate-800 rounded px-3 py-2 text-white font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-300 uppercase mb-1">Tipo de Depósito *</label>
                    <select value={depTipo} onChange={(e) => setDepTipo(e.target.value)} className="w-full bg-slate-950 border-2 border-slate-800 rounded px-3 py-2 text-white font-bold uppercase cursor-pointer">
                      <option value="FABRICA">FABRICA (MATERIAS PRIMAS)</option>
                      <option value="CORTE">ZONA DE CORTE</option>
                      <option value="MINORISTA">VENTA DIRECTA / LOCAL</option>
                      <option value="TRANSITO">TRANSITO / ALMACENAMIENTO TEMPORAL</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-300 uppercase mb-1">Descripción</label>
                    <textarea value={depDesc} onChange={(e) => setDepDesc(e.target.value)} placeholder="Detalles..." className="w-full bg-slate-950 border-2 border-slate-800 rounded px-3 py-2 text-white h-16 resize-none" />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input type="checkbox" id="depActivo" checked={depActivo} onChange={(e) => setDepActivo(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                    <label htmlFor="depActivo" className="text-gray-305 font-bold uppercase cursor-pointer">Depósito Activo</label>
                  </div>
                </div>
              )}

              {/* USUARIOS FORM FIELDS */}
              {activeTab === "usuarios" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-300 uppercase mb-1">Nombre Completo *</label>
                    <input type="text" required value={userNombre} onChange={(e) => setUserNombre(e.target.value)} placeholder="Ej. Rolando..." className="w-full bg-slate-950 border-2 border-slate-800 rounded px-3 py-2 text-white font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-300 uppercase mb-1">Email *</label>
                    <input type="email" required value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="Ej. user@gmail.com..." className="w-full bg-slate-950 border-2 border-slate-800 rounded px-3 py-2 text-white" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-300 uppercase mb-1">Contraseña {modalMode === "EDIT" && "(Dejar en blanco para no modificar)"}</label>
                    <input type="password" required={modalMode === "NEW"} value={userPassword} onChange={(e) => setUserPassword(e.target.value)} placeholder="Mínimo 6 caracteres..." className="w-full bg-slate-950 border-2 border-slate-800 rounded px-3 py-2 text-white" />
                  </div>
                  
                  {/* Permissions Selection list */}
                  <div className="border border-slate-800 bg-slate-955 p-3 rounded-md">
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-2">Permisos y Roles Asignados</label>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto no-scrollbar">
                      {permisosList.map((p) => {
                        const hasPerm = userSelectedPerms.includes(p.clave);
                        return (
                          <div
                            key={p.id}
                            onClick={() => togglePermission(p.clave)}
                            className={`flex justify-between items-center p-2 rounded border cursor-pointer select-none transition ${hasPerm ? "bg-blue-950/40 border-blue-900 text-blue-300" : "bg-slate-900 border-slate-850 text-gray-400 hover:text-gray-250"}`}
                          >
                            <span className="font-bold">{p.clave}</span>
                            <span className="text-[9px] italic text-gray-500 font-sans">{p.descripcion}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input type="checkbox" id="userActivo" checked={userActivo} onChange={(e) => setUserActivo(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                    <label htmlFor="userActivo" className="text-gray-305 font-bold uppercase cursor-pointer">Usuario Activo (Permite Login)</label>
                  </div>
                </div>
              )}

              {/* Form Buttons */}
              <div className="flex gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="flex-1 bg-slate-800 hover:bg-slate-750 text-gray-305 font-bold py-3.5 rounded-md text-xs uppercase tracking-wider border border-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-700 hover:bg-blue-600 text-white font-black py-3.5 rounded-md text-xs uppercase tracking-wider transition"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
export default AdminPage;
