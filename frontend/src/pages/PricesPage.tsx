import { useState, useEffect, useCallback } from "react";
import {
  Search, Download, ChevronLeft, ChevronRight, RefreshCw, FileText, Check,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../services/api";
import * as XLSX from "xlsx";

interface PriceRow {
  id: number; itemCode: string; productName: string; brand: string;
  model: string; years: string; detail: string;
  cost: number; precioMayorista: number; precioMinorista: number;
  currentPrice1: number; currentPrice2: number;
  wholesalePrice: number;
}

interface Invoice {
  id: number; invoiceUrl: string | null; productName: string; itemCode: string;
  supplierName: string | null; date: string;
}

const PAGE_SIZE = 15;

export default function PricesPage() {
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [margin1, setMargin1] = useState("25");
  const [margin2, setMargin2] = useState("45");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [costId, setCostId] = useState("");
  const [applying, setApplying] = useState(false);

  const formatBs = (v: number) =>
    `Bs. ${v.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fetchPrices = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      if (search) params.set("search", search);
      if (margin1) params.set("margin1", margin1);
      if (margin2) params.set("margin2", margin2);
      if (costId) params.set("costId", costId);
      const res = await api.get(`/prices?${params.toString()}`);
      setPrices(res.data.prices);
      setTotal(res.data.pagination.total);
      setPages(res.data.pagination.pages);
      if (Array.isArray(res.data.invoices)) setInvoices(res.data.invoices);
      if (res.data.defaultMargin1 != null) setMargin1(String(res.data.defaultMargin1));
      if (res.data.defaultMargin2 != null) setMargin2(String(res.data.defaultMargin2));
    } catch { toast.error("Error al cargar precios"); }
    finally { setLoading(false); }
  }, [page, search, margin1, margin2, costId]);

  useEffect(() => { fetchPrices(); }, [fetchPrices]);
  useEffect(() => { setPage(1); }, [search, costId, margin1, margin2]);

  const applyPrices = async () => {
    try {
      setApplying(true);
      const res = await api.post("/prices/apply", {
        margin1: Number(margin1) || 0,
        margin2: Number(margin2) || 0,
        costId: costId ? Number(costId) : null,
      });
      toast.success(`Precios aplicados a ${res.data.updated} productos`);
      fetchPrices();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al aplicar precios");
    } finally { setApplying(false); }
  };

  const exportExcel = async () => {
    try {
      const params = new URLSearchParams();
      if (margin1) params.set("margin1", margin1);
      if (margin2) params.set("margin2", margin2);
      const res = await api.get(`/prices/export?${params.toString()}`);
      const data = res.data.data || [];
      if (!data.length) { toast.error("No hay datos para exportar"); return; }
      const rows = data.map((r: any) => ({
        "Código Fábrica": r.itemCode, Producto: r.name, Marca: r.brand, Modelo: r.model,
        Años: r.years, Detalle: r.detail, "Costo (Bs.)": r.cost,
        "Precio 1 (Mayorista)": r.precioMayorista, "Precio 2 (Minorista)": r.precioMinorista,
        "Precio Mayor": r.wholesalePrice,
      }));
      const sheet = XLSX.utils.json_to_sheet(rows);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Precios");
      XLSX.writeFile(book, "precios.xlsx");
      toast.success("Precios exportados");
    } catch { toast.error("Error al exportar"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Precios</h1>
          <p className="text-gray-400 text-sm mt-1">Cálculo desde el costo: Precio 1 (mayorista) y Precio 2 (minorista) con márgenes configurables</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchPrices}
            className="flex items-center gap-2 px-4 py-2.5 bg-dark-700 hover:bg-dark-600 text-gray-300 rounded-xl text-sm transition-all border border-dark-600">
            <RefreshCw size={16} />
          </button>
          <button onClick={exportExcel}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary-600/20">
            <Download size={16} /> Exportar Excel
          </button>
        </div>
      </div>

      {/* Config: filtro por factura + márgenes configurables */}
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <label className="block text-xs text-gray-400 mb-1.5">Factura / Archivo importado</label>
          <div className="relative">
            <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <select value={costId} onChange={(e) => setCostId(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-dark-900/50 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500 appearance-none">
              <option value="">Todas las facturas (todo el inventario)</option>
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.invoiceUrl} · {i.productName} · {i.supplierName || "s/proveedor"}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Margen Precio 1 (%) — mayorista</label>
          <input type="number" min="0" value={margin1} onChange={(e) => setMargin1(e.target.value)}
            className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Margen Precio 2 (%) — minorista</label>
          <input type="number" min="0" value={margin2} onChange={(e) => setMargin2(e.target.value)}
            className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
        </div>
      </div>

      {/* Acciones: aplicar precios */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por producto, código, marca o modelo..."
            aria-label="Buscar precios"
            className="w-full pl-10 pr-4 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500 transition-all" />
        </div>
        <button onClick={applyPrices} disabled={applying}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary-600/20 disabled:opacity-50">
          <Check size={16} /> {applying ? "Aplicando..." : "Aplicar precios"}
        </button>
      </div>

      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <RefreshCw size={24} className="text-primary-400 animate-spin" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700/50">
                    <th className="text-left px-3 py-3 text-gray-400 font-medium">Código</th>
                    <th className="text-left px-3 py-3 text-gray-400 font-medium">Producto</th>
                    <th className="text-left px-3 py-3 text-gray-400 font-medium">Marca</th>
                    <th className="text-left px-3 py-3 text-gray-400 font-medium">Modelo</th>
                    <th className="text-right px-3 py-3 text-gray-400 font-medium">Costo (Bs.)</th>
                    <th className="text-right px-3 py-3 text-primary-400 font-medium">Precio 1 (Mayorista)</th>
                    <th className="text-right px-3 py-3 text-blue-400 font-medium">Precio 2 (Minorista)</th>
                    <th className="text-right px-3 py-3 text-green-400 font-medium">Actual P1</th>
                    <th className="text-right px-3 py-3 text-cyan-400 font-medium">Actual P2</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.length === 0 ? (
                    <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-500">No hay productos con costo registrado</td></tr>
                  ) : prices.map((p) => (
                    <tr key={p.id} className="border-b border-dark-700/30 hover:bg-dark-700/30 transition-colors">
                      <td className="px-3 py-3 text-gray-300 font-mono text-xs">{p.itemCode}</td>
                      <td className="px-3 py-3 text-foreground font-medium">{p.productName}</td>
                      <td className="px-3 py-3 text-gray-300">{p.brand}</td>
                      <td className="px-3 py-3 text-gray-300">{p.model}</td>
                      <td className="px-3 py-3 text-amber-400 font-medium text-right">{formatBs(p.cost)}</td>
                      <td className="px-3 py-3 text-primary-400 font-medium text-right">{formatBs(p.precioMayorista)}</td>
                      <td className="px-3 py-3 text-blue-400 font-medium text-right">{formatBs(p.precioMinorista)}</td>
                      <td className="px-3 py-3 text-green-400 text-right text-xs">{formatBs(p.currentPrice1)}</td>
                      <td className="px-3 py-3 text-cyan-400 text-right text-xs">{formatBs(p.currentPrice2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700/50">
                <span className="text-xs text-gray-500">{total} productos</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                    className="p-1.5 text-gray-400 hover:text-foreground disabled:opacity-30 rounded-lg transition-all">
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-xs text-gray-400">{page}/{pages}</span>
                  <button onClick={() => setPage(Math.min(pages, page + 1))} disabled={page === pages}
                    className="p-1.5 text-gray-400 hover:text-foreground disabled:opacity-30 rounded-lg transition-all">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
