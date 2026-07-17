import React, { useState, useEffect } from "react";
import { authFetch } from "../auth/auth.api";
import { Search, Filter, ShieldAlert, RefreshCw } from "lucide-react";

interface StockItem {
  id: string;
  productoId: string;
  depositoId: string | null;
  tallerId: string | null;
  calidad: "PERFECTO" | "FALLADO";
  canal: "MAYORISTA" | "MINORISTA";
  cantidadUnidades: number;
  producto?: {
    nombre: string;
    categoria: string;
    unidadesPorFardo: number;
  };
  deposito?: {
    nombre: string;
    tipo: string;
  };
  taller?: {
    nombre: string;
  };
}

interface ProductRow {
  productoId: string;
  nombre: string;
  categoria: string;
  unidadesPorFardo: number;
  // Stock per column: [Central, Casa, Contenedor, Secundario, Corte, Eve, Vanesa]
  stocks: number[];
  total: number;
}

export const StockPage: React.FC = () => {
  const [stockRaw, setStockRaw] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [depositoFilter, setDepositoFilter] = useState("ALL");
  const [categoriaFilter, setCategoriaFilter] = useState("ALL");
  const [viewUnit, setViewUnit] = useState<"UNIDAD" | "DOCENA" | "FARDO">("UNIDAD");

  const loadStock = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/stock?limit=1000", { method: "GET" });
      if (!response.ok) {
        throw new Error(`Error ${response.status}: No se pudo obtener el stock.`);
      }
      const data = await response.json();
      if (data.success) {
        setStockRaw(data.data || []);
      } else {
        throw new Error(data.message || "Error al obtener stock.");
      }
    } catch (err: any) {
      setError(err.message || "Error de conexión con la API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStock();
  }, []);

  // Columns definition (short industrial names for cellphones)
  const warehouseColumns = [
    { label: "Central", key: "CENTRAL" },
    { label: "Casa", key: "CASA" },
    { label: "Contenedor", key: "CONTENEDOR" },
    { label: "Secundario", key: "SECUNDARIO" },
    { label: "Zona Corte", key: "CORTE" },
    { label: "Eve", key: "EVE" },
    { label: "Vanesa", key: "VANESA" }
  ];

  const getColumnIndex = (item: StockItem): number => {
    const depName = item.deposito?.nombre || "";
    const talName = item.taller?.nombre || "";
    const name = (depName || talName).toUpperCase();

    if (name.includes("CENTRAL") || (name.includes("TML") && !name.includes("CASA"))) return 0;
    if (name.includes("CASA")) return 1;
    if (name.includes("CONTENEDOR")) return 2;
    if (name.includes("SECUNDARIO")) return 3;
    if (name.includes("CORTE")) return 4;
    if (name.includes("EVE") || name.includes("EVELINA")) return 5;
    if (name.includes("VANESA")) return 6;
    return -1;
  };

  // Pivot stock data
  const processStockData = (): ProductRow[] => {
    const map = new Map<string, ProductRow>();

    for (const item of stockRaw) {
      if (!item.producto) continue;
      const prodId = item.productoId;
      const colIndex = getColumnIndex(item);
      if (colIndex === -1) continue;

      if (!map.has(prodId)) {
        map.set(prodId, {
          productoId: prodId,
          nombre: item.producto.nombre,
          categoria: item.producto.categoria,
          unidadesPorFardo: item.producto.unidadesPorFardo || 60,
          stocks: [0, 0, 0, 0, 0, 0, 0],
          total: 0
        });
      }

      const row = map.get(prodId)!;
      row.stocks[colIndex] += item.cantidadUnidades;
      row.total += item.cantidadUnidades;
    }

    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  };

  const productRows = processStockData();

  // Filter rows based on search parameters
  const filteredRows = productRows.filter((row) => {
    const matchesProduct = row.nombre.toLowerCase().includes(productQuery.toLowerCase());
    
    const matchesCategory = categoriaFilter === "ALL" || row.categoria === categoriaFilter;
    
    let matchesDeposito = true;
    if (depositoFilter !== "ALL") {
      const idx = parseInt(depositoFilter, 10);
      matchesDeposito = row.stocks[idx] > 0;
    }

    return matchesProduct && matchesCategory && matchesDeposito;
  });

  const formatQuantity = (qty: number, unidadesPorFardo: number) => {
    if (qty === 0) return "-";
    if (viewUnit === "FARDO" && unidadesPorFardo > 0) {
      const fardos = qty / unidadesPorFardo;
      return `${fardos.toFixed(1)} F`;
    }
    if (viewUnit === "DOCENA") {
      const docenas = qty / 12;
      return `${docenas.toFixed(1)} D`;
    }
    return `${qty.toLocaleString()}`;
  };

  return (
    <div className="flex-1 flex flex-col space-y-4 w-full max-w-6xl mx-auto pb-16 px-2 text-gray-200 font-sans">
      
      {/* Header controls */}
      <div className="bg-slate-900 border-2 border-slate-800 p-4 rounded-md space-y-4 shadow-md">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <span className="bg-slate-800 text-slate-355 border border-slate-700 px-2 py-0.5 rounded text-[9px] font-black tracking-widest font-mono">
              MONITOR DE PLANTA
            </span>
            <h2 className="text-sm font-black uppercase tracking-widest text-blue-400 mt-1">Stock de Existencias</h2>
          </div>
          
          {/* Unit selector */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">Mostrar en:</span>
            <div className="flex bg-slate-950 p-1 rounded-md border-2 border-slate-800">
              {(["UNIDAD", "DOCENA", "FARDO"] as const).map((unit) => (
                <button
                  key={unit}
                  onClick={() => setViewUnit(unit)}
                  className={`px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-wider transition cursor-pointer ${
                    viewUnit === unit ? "bg-blue-700 text-white shadow" : "text-gray-400 hover:text-gray-250 hover:bg-slate-850"
                  }`}
                >
                  {unit === "UNIDAD" ? "U." : unit === "DOCENA" ? "Doc" : "Fardos"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3 Filters as requested: Producto, Depósito, Categoría */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Filter 1: Product */}
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full bg-slate-950 border-2 border-slate-800 rounded pl-9 pr-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-600 font-bold"
            />
          </div>

          {/* Filter 2: Depósito */}
          <div className="relative">
            <Filter className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
            <select
              value={depositoFilter}
              onChange={(e) => setDepositoFilter(e.target.value)}
              className="w-full bg-slate-950 border-2 border-slate-800 rounded pl-9 pr-3 py-2.5 text-xs text-slate-350 focus:outline-none focus:border-blue-600 appearance-none font-black uppercase cursor-pointer"
            >
              <option value="ALL">TODOS LOS DEPÓSITOS</option>
              {warehouseColumns.map((col, idx) => (
                <option key={col.key} value={idx}>
                  STOCK EN: {col.label.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Filter 3: Categoría */}
          <div className="relative">
            <Filter className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
            <select
              value={categoriaFilter}
              onChange={(e) => setCategoriaFilter(e.target.value)}
              className="w-full bg-slate-950 border-2 border-slate-800 rounded pl-9 pr-3 py-2.5 text-xs text-slate-350 focus:outline-none focus:border-blue-600 appearance-none font-black uppercase cursor-pointer"
            >
              <option value="ALL">TODAS LAS CATEGORÍAS</option>
              <option value="TELA">TELAS RULO</option>
              <option value="INTERMEDIO">TELAS CORTADAS</option>
              <option value="TERMINADO">PRODUCTOS TERMINADOS</option>
              <option value="INSUMO">INSUMOS</option>
            </select>
          </div>

          {/* Refresh button */}
          <button
            onClick={() => void loadStock()}
            className="bg-slate-800 border-2 border-slate-700 hover:bg-slate-750 py-2 rounded text-xs font-black text-gray-300 transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
          >
            <RefreshCw className="w-4 h-4 text-blue-400" /> Recargar
          </button>
        </div>
      </div>

      {/* Main Stock Table */}
      <div className="bg-slate-900 border-2 border-slate-800 rounded overflow-hidden shadow-lg">
        {loading ? (
          <div className="text-center py-20 text-xs text-gray-400 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
            Cargando niveles de stock en depósitos...
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3 max-w-md mx-auto">
            <ShieldAlert className="w-8 h-8 text-red-400 mx-auto" />
            <p className="text-xs text-red-300 font-mono font-bold uppercase">Error de Conexión</p>
            <p className="text-[11px] text-gray-400 leading-relaxed">{error}</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-20 text-xs text-gray-500 font-bold uppercase italic">
            No se encontraron existencias para los criterios seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs table-auto min-w-[900px]">
              <thead>
                <tr className="border-b-2 border-slate-850 bg-slate-950 text-[10px] font-black uppercase tracking-wider text-slate-450">
                  <th className="p-3.5 sticky left-0 bg-slate-900 z-10 w-64 border-r-2 border-slate-850">Producto</th>
                  {warehouseColumns.map((col, idx) => {
                    const isHighlighted = depositoFilter !== "ALL" && parseInt(depositoFilter, 10) === idx;
                    return (
                      <th
                        key={col.key}
                        className={`p-3.5 text-center ${
                          isHighlighted ? "bg-blue-950/30 text-blue-300 border-x-2 border-blue-900/40" : "border-r border-slate-850"
                        }`}
                      >
                        {col.label}
                      </th>
                    );
                  })}
                  <th className="p-3.5 text-center bg-slate-950/60 text-blue-450 font-black">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 font-mono">
                {filteredRows.map((row) => (
                  <tr key={row.productoId} className="hover:bg-slate-850/30 transition-colors">
                    {/* Product cell */}
                    <td className="p-3 sticky left-0 bg-slate-900 z-10 font-bold text-gray-150 border-r-2 border-slate-850 flex flex-col justify-center min-h-[50px] font-sans">
                      <span className="uppercase tracking-wide text-[11px] font-extrabold">{row.nombre}</span>
                      <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest mt-0.5">{row.categoria}</span>
                    </td>

                    {/* Stock cells */}
                    {row.stocks.map((stockQty, idx) => {
                      const isHighlighted = depositoFilter !== "ALL" && parseInt(depositoFilter, 10) === idx;
                      return (
                        <td
                          key={idx}
                          className={`p-3.5 text-center font-extrabold text-sm ${
                            isHighlighted ? "bg-blue-950/10 text-blue-300 border-x-2 border-blue-950/20" : "text-gray-300 border-r border-slate-850"
                          }`}
                        >
                          {formatQuantity(stockQty, row.unidadesPorFardo)}
                        </td>
                      );
                    })}

                    {/* Total cell */}
                    <td className="p-3.5 text-center font-black text-blue-400 text-sm bg-slate-950/30">
                      {formatQuantity(row.total, row.unidadesPorFardo)}
                      {viewUnit !== "UNIDAD" && (
                        <span className="block text-[9px] font-medium text-gray-500 mt-0.5 font-sans">
                          ({row.total} u.)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

export default StockPage;
