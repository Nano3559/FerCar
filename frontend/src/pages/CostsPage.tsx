import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, X, Upload, Search, Pencil, Trash2, Download,
  ChevronLeft, ChevronRight, Building2, RefreshCw,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../services/api";
import { useDialogBehavior } from "../components/ui/useDialog";

interface Supplier { id: number; name: string; nit: string; phone: string; costsCount?: number; }
interface Product { id: number; itemCode: string; name: string; brand: string; model: string; }
interface CostRecord {
  id: number; productId: number; productName: string; itemCode: string;
  brand: string; model: string; supplierId: number; supplierName: string;
  invoiceUrl: string | null; exchangeRate: number | null; percentage: number | null;
  costPrice: number; date: string;
}

const PAGE_SIZE = 15;

export default function CostsPage() {
  const [costs, setCosts] = useState<CostRecord[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");

  // Cost form
  const [showCostModal, setShowCostModal] = useState(false);
  const [editingCost, setEditingCost] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [costSupplierId, setCostSupplierId] = useState("");
  const [exchangeRate, setExchangeRate] = useState("6.96");
  const [percentage, setPercentage] = useState("");
  const [costUsd, setCostUsd] = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Invoice bulk import
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceExcel, setInvoiceExcel] = useState<File | null>(null);
  const [invFactFile, setInvFactFile] = useState<File | null>(null);
  const [invoiceSupplierId, setInvoiceSupplierId] = useState("");
  const [invoiceRate, setInvoiceRate] = useState("6.96");
  const [invoicePercent, setInvoicePercent] = useState("10");
  const [invoiceMargin, setInvoiceMargin] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  // Supplier form
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<number | null>(null);
  const [supplierForm, setSupplierForm] = useState({ name: "", nit: "", phone: "" });

  const costPanelRef = useDialogBehavior(showCostModal, () => setShowCostModal(false));
  const supplierPanelRef = useDialogBehavior(showSupplierModal, () => setShowSupplierModal(false));
  const invoicePanelRef = useDialogBehavior(showInvoiceModal, () => setShowInvoiceModal(false));

  const formatBs = (v: number) =>
    `Bs. ${v.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fetchCosts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      if (search) params.set("search", search);
      const res = await api.get(`/costs?${params.toString()}`);
      setCosts(res.data.costs);
      setTotal(res.data.pagination.total);
      setPages(res.data.pagination.pages);
    } catch { toast.error("Error al cargar costos"); }
    finally { setLoading(false); }
  }, [page, search]);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await api.get(`/suppliers?limit=100`);
      setSuppliers(res.data.suppliers);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchCosts(); }, [fetchCosts]);
  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);
  useEffect(() => { setPage(1); }, [search]);

  // Product search
  const searchProducts = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setProductResults([]); return; }
    try {
      const res = await api.get(`/products?search=${encodeURIComponent(q)}&limit=8`);
      setProductResults(res.data.products);
    } catch { toast.error("Error al buscar productos"); }
  }, []);

  const handleProductSearch = (v: string) => {
    setProductSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => searchProducts(v), 300);
  };

  // ========== COST CRUD ==========
  const openCreateCost = () => {
    setEditingCost(null);
    setSelectedProduct(null); setProductSearch(""); setCostSupplierId("");
    setExchangeRate("6.96"); setPercentage(""); setCostUsd(""); setInvoiceFile(null);
    setShowCostModal(true);
  };

  const openEditCost = (c: CostRecord) => {
    setEditingCost(c.id);
    setSelectedProduct({ id: c.productId, itemCode: c.itemCode, name: c.productName, brand: c.brand, model: c.model });
    setProductSearch(c.productName);
    setCostSupplierId(String(c.supplierId));
    const tc = c.exchangeRate ? Number(c.exchangeRate) : 6.96;
    const pct = c.percentage ? Number(c.percentage) : 0;
    setExchangeRate(String(tc));
    setPercentage(c.percentage ? String(c.percentage) : "");
    const usd = tc > 0 ? c.costPrice / (tc * (1 + pct / 100)) : c.costPrice;
    setCostUsd(String(usd));
    setInvoiceFile(null);
    setShowCostModal(true);
  };

  const saveCost = async () => {
    if (!selectedProduct || !costSupplierId || !costUsd) {
      toast.error("Producto, proveedor, costo USD y tipo de cambio son obligatorios"); return;
    }
    const tc = Number(exchangeRate) || 0;
    if (tc <= 0) { toast.error("El tipo de cambio debe ser mayor a 0"); return; }
    const pct = Number(percentage) || 0;
    const computed = Number(costUsd) * tc * (1 + pct / 100);
    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("productId", String(selectedProduct.id));
      formData.append("supplierId", costSupplierId);
      formData.append("costPrice", String(computed));
      if (exchangeRate) formData.append("exchangeRate", exchangeRate);
      if (percentage) formData.append("percentage", percentage);
      if (invoiceFile) formData.append("invoice", invoiceFile);

      if (editingCost) {
        await api.put(`/costs/${editingCost}`, formData, { headers: { "Content-Type": "multipart/form-data" } });
        toast.success("Costo actualizado");
      } else {
        await api.post("/costs", formData, { headers: { "Content-Type": "multipart/form-data" } });
        toast.success("Costo registrado");
      }
      setShowCostModal(false);
      fetchCosts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al guardar costo");
    } finally { setSaving(false); }
  };

  const downloadInvoice = async (filename: string | null) => {
    if (!filename) return;
    try {
      const res = await api.get(`/costs/invoice/${encodeURIComponent(filename)}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo descargar la factura");
    }
  };

  const deleteCost = async (id: number) => {
    try {
      await api.delete(`/costs/${id}`);
      toast.success("Costo eliminado");
      fetchCosts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al eliminar");
    }
  };

  const openImportInvoice = () => {
    setInvoiceExcel(null); setInvFactFile(null); setInvoiceSupplierId("");
    setInvoiceRate("6.96"); setInvoicePercent("10"); setInvoiceMargin(""); setImportResult(null);
    setShowInvoiceModal(true);
  };

  const importInvoice = async () => {
    if (!invoiceExcel || !invoiceSupplierId || !invoiceRate) {
      toast.error("Excel, proveedor y tipo de cambio son obligatorios"); return;
    }
    try {
      setImporting(true);
      const formData = new FormData();
      formData.append("file", invoiceExcel);
      if (invFactFile) formData.append("invoice", invFactFile);
      formData.append("supplierId", invoiceSupplierId);
      formData.append("exchangeRate", invoiceRate);
      if (invoicePercent) formData.append("percentage", invoicePercent);
      if (invoiceMargin) formData.append("defaultMargin", invoiceMargin);
      const res = await api.post("/costs/import-invoice", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(res.data);
      toast.success(`Factura importada: ${res.data.imported} registrados, ${res.data.updated} actualizados`);
      fetchCosts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al importar factura");
    } finally { setImporting(false); }
  };

  // ========== SUPPLIER CRUD ==========
  const openCreateSupplier = () => {
    setEditingSupplier(null);
    setSupplierForm({ name: "", nit: "", phone: "" });
    setShowSupplierModal(true);
  };

  const openEditSupplier = (s: Supplier) => {
    setEditingSupplier(s.id);
    setSupplierForm({ name: s.name, nit: s.nit || "", phone: s.phone || "" });
    setShowSupplierModal(true);
  };

  const saveSupplier = async () => {
    if (!supplierForm.name) { toast.error("El nombre es obligatorio"); return; }
    try {
      if (editingSupplier) {
        await api.put(`/suppliers/${editingSupplier}`, supplierForm);
        toast.success("Proveedor actualizado");
      } else {
        await api.post("/suppliers", supplierForm);
        toast.success("Proveedor creado");
      }
      setShowSupplierModal(false);
      fetchSuppliers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al guardar proveedor");
    }
  };

  const deleteSupplier = async (id: number) => {
    try {
      await api.delete(`/suppliers/${id}`);
      toast.success("Proveedor eliminado");
      fetchSuppliers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al eliminar proveedor");
    }
  };

  const filteredSuppliers = suppliers.filter((s) =>
    !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.nit && s.nit.includes(supplierSearch)) ||
    (s.phone && s.phone.includes(supplierSearch))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Costos</h1>
          <p className="text-gray-400 text-sm mt-1">Gestión de costos, facturas y proveedores</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openCreateSupplier}
            className="flex items-center gap-2 px-4 py-2.5 bg-dark-700 hover:bg-dark-600 text-gray-300 rounded-xl text-sm transition-all border border-dark-600">
            <Building2 size={16} /> Proveedor
          </button>
          <button onClick={openImportInvoice}
            className="flex items-center gap-2 px-4 py-2.5 bg-dark-700 hover:bg-dark-600 text-gray-300 rounded-xl text-sm transition-all border border-dark-600">
            <Upload size={16} /> Importar Factura
          </button>
          <button onClick={openCreateCost}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary-600/20">
            <Plus size={16} /> Nuevo Costo
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar costos"
          placeholder="Buscar por producto, código, marca o proveedor..."
          className="w-full pl-10 pr-4 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500 transition-all" />
      </div>

      {/* Costs table */}
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
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Fecha</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Código</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Producto</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Marca</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Proveedor</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Factura</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">T. Cambio</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">%</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Costo</th>
                    <th className="text-center px-4 py-3 text-gray-400 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {costs.length === 0 ? (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">No hay costos registrados</td></tr>
                  ) : costs.map((c) => (
                    <tr key={c.id} className="border-b border-dark-700/30 hover:bg-dark-700/30 transition-colors">
                      <td className="px-4 py-3 text-gray-300">{new Date(c.date).toLocaleDateString("es-BO")}</td>
                      <td className="px-4 py-3 text-gray-300 font-mono text-xs">{c.itemCode}</td>
                      <td className="px-4 py-3 text-foreground font-medium">{c.productName}</td>
                      <td className="px-4 py-3 text-gray-300">{c.brand}</td>
                      <td className="px-4 py-3 text-gray-300">{c.supplierName}</td>
                      <td className="px-4 py-3">
                        {c.invoiceUrl ? (
                          <button onClick={() => downloadInvoice(c.invoiceUrl)} className="text-green-400 hover:text-green-300 text-xs flex items-center gap-1"><Download size={12} /> {c.invoiceUrl}</button>
                        ) : (
                          <span className="text-gray-600 text-xs">Sin archivo</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-right">{c.exchangeRate || "—"}</td>
                      <td className="px-4 py-3 text-gray-300 text-right">{c.percentage ? `${c.percentage}%` : "—"}</td>
                      <td className="px-4 py-3 text-amber-400 font-medium text-right">{formatBs(c.costPrice)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEditCost(c)} className="p-1.5 text-gray-400 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg transition-all" title="Editar">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => deleteCost(c.id)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title="Eliminar">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700/50">
                <span className="text-xs text-gray-500">{total} registros</span>
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

      {/* Suppliers */}
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-700/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-foreground font-medium">Proveedores ({filteredSuppliers.length})</h3>
            <button onClick={openCreateSupplier} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 transition-all">
              <Plus size={14} /> Agregar
            </button>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} aria-label="Buscar proveedor"
              placeholder="Buscar por nombre, NIT o teléfono..."
              className="w-full pl-9 pr-3 py-2 bg-dark-900/50 border border-dark-700/50 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500 transition-all" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-700/50">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">NIT</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Teléfono</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Costos</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map((s) => (
                <tr key={s.id} className="border-b border-dark-700/30 hover:bg-dark-700/30 transition-colors">
                  <td className="px-4 py-3 text-foreground font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-gray-300 font-mono text-xs">{s.nit || "—"}</td>
                  <td className="px-4 py-3 text-gray-300">{s.phone || "—"}</td>
                  <td className="px-4 py-3 text-gray-400 text-center text-xs">{s.costsCount || 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEditSupplier(s)} className="p-1.5 text-gray-400 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg transition-all" title="Editar">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => deleteSupplier(s.id)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost Modal */}
      {showCostModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div ref={costPanelRef} role="dialog" aria-modal="true" aria-label="Nuevo costo" className="bg-dark-900 border border-dark-700/50 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/50">
              <h3 className="text-lg font-bold text-foreground">{editingCost ? "Editar Costo" : "Nuevo Costo"}</h3>
              <button onClick={() => setShowCostModal(false)} aria-label="Cerrar" className="p-1.5 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-lg transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Product search */}
              <div className="relative">
                <label className="block text-xs text-gray-400 mb-1">Producto *</label>
                {selectedProduct ? (
                  <div className="flex items-center justify-between p-3 bg-dark-800 border border-primary-600/20 rounded-xl">
                    <div>
                      <p className="text-sm text-foreground font-medium">{selectedProduct.name}</p>
                      <p className="text-xs text-gray-500">{selectedProduct.brand} · {selectedProduct.itemCode}</p>
                    </div>
                    <button onClick={() => { setSelectedProduct(null); setProductSearch(""); }} className="p-1 text-gray-400 hover:text-red-400">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <Search size={16} className="absolute left-3 top-[34px] text-gray-500" />
                    <input value={productSearch} onChange={(e) => handleProductSearch(e.target.value)} placeholder="Buscar producto..." aria-label="Buscar producto"
                      className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                    {productResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
                        {productResults.map((p) => (
                          <button key={p.id} onClick={() => { setSelectedProduct(p); setProductSearch(p.name); setProductResults([]); }}
                            className="w-full text-left px-4 py-2.5 hover:bg-dark-700 transition-colors border-b border-dark-700/30 last:border-0">
                            <p className="text-sm text-foreground">{p.name}</p>
                            <p className="text-xs text-gray-500">{p.brand} · {p.itemCode}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Proveedor *</label>
                <select value={costSupplierId} onChange={(e) => setCostSupplierId(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500">
                  <option value="">Seleccionar...</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Tipo Cambio (Bs/USD) *</label>
                  <input type="number" step="0.01" min="0" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">% Gastos</label>
                  <input type="number" value={percentage} onChange={(e) => setPercentage(e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Costo (USD) *</label>
                  <input type="number" step="0.01" min="0" value={costUsd} onChange={(e) => setCostUsd(e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                </div>
              </div>

              <div className="p-3 bg-primary-600/10 border border-primary-600/20 rounded-xl flex items-center justify-between">
                <span className="text-xs text-gray-300">Costo Puesto Aquí (Bs.)</span>
                <span className="text-sm font-semibold text-primary-300">
                  {formatBs(Number(costUsd || 0) * (Number(exchangeRate) || 0) * (1 + (Number(percentage) || 0) / 100))}
                </span>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Factura (archivo)</label>
                <label className="flex items-center gap-2 px-4 py-2 bg-dark-800 border border-dark-700 rounded-xl text-gray-400 text-sm cursor-pointer hover:border-primary-500 transition-all">
                  <Upload size={16} />
                  <span>{invoiceFile ? invoiceFile.name : "Subir factura"}</span>
                  <input type="file" className="hidden" accept=".pdf,.jpg,.png" onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-700/50">
              <button onClick={() => setShowCostModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl text-sm transition-all">
                Cancelar
              </button>
              <button onClick={saveCost} disabled={saving}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary-600/20 disabled:opacity-50">
                {saving ? "Guardando..." : editingCost ? "Guardar Cambios" : "Registrar Costo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div ref={supplierPanelRef} role="dialog" aria-modal="true" aria-label="Nuevo proveedor" className="bg-dark-900 border border-dark-700/50 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/50">
              <h3 className="text-lg font-bold text-foreground">{editingSupplier ? "Editar Proveedor" : "Nuevo Proveedor"}</h3>
              <button onClick={() => setShowSupplierModal(false)} aria-label="Cerrar" className="p-1.5 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-lg transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nombre *</label>
                <input value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">NIT</label>
                <input value={supplierForm.nit} onChange={(e) => setSupplierForm({ ...supplierForm, nit: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Teléfono</label>
                <input value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-700/50">
              <button onClick={() => setShowSupplierModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl text-sm transition-all">
                Cancelar
              </button>
              <button onClick={saveSupplier}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary-600/20">
                {editingSupplier ? "Guardar Cambios" : "Crear Proveedor"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Invoice Import Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div ref={invoicePanelRef} role="dialog" aria-modal="true" aria-label="Importar factura" className="bg-dark-900 border border-dark-700/50 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/50">
              <h3 className="text-lg font-bold text-foreground">Importar Factura (Costos)</h3>
              <button onClick={() => setShowInvoiceModal(false)} aria-label="Cerrar" className="p-1.5 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-lg transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-400 leading-relaxed">
                Sube el Excel de la factura (columnas: Código, Cantidad, Precio Unitario) y si tienes el PDF/imagen de la factura. El sistema calculará automáticamente el <span className="text-primary-400 font-medium">Costo Puesto Aquí</span> de cada producto.
              </p>

              <div className="p-3 bg-dark-800 border border-primary-600/20 rounded-xl text-xs text-gray-300 leading-relaxed">
                <b className="text-primary-400">Fórmula aplicada:</b> Costo Puesto Aquí = Precio Unitario (USD) × Tipo Cambio × (1 + %Gastos/100)
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Excel de factura *</label>
                <label className="flex items-center gap-2 px-4 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-gray-400 text-sm cursor-pointer hover:border-primary-500 transition-all">
                  <Upload size={16} />
                  <span className="truncate">{invoiceExcel ? invoiceExcel.name : "Seleccionar archivo .xlsx"}</span>
                  <input type="file" className="hidden" accept=".xlsx,.xls" onChange={(e) => setInvoiceExcel(e.target.files?.[0] || null)} />
                </label>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Factura PDF/Imagen (opcional)</label>
                <label className="flex items-center gap-2 px-4 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-gray-400 text-sm cursor-pointer hover:border-primary-500 transition-all">
                  <Upload size={16} />
                  <span className="truncate">{invFactFile ? invFactFile.name : "Seleccionar archivo .pdf/.jpg/.png"}</span>
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setInvFactFile(e.target.files?.[0] || null)} />
                </label>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Proveedor *</label>
                <select value={invoiceSupplierId} onChange={(e) => setInvoiceSupplierId(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500">
                  <option value="">Seleccionar...</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Tipo de Cambio (Bs/USD) *</label>
                  <input type="number" step="0.01" value={invoiceRate} onChange={(e) => setInvoiceRate(e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">% Gastos (flete/nac.)</label>
                  <input type="number" value={invoicePercent} onChange={(e) => setInvoicePercent(e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">% Margen (precio)</label>
                  <input type="number" value={invoiceMargin} onChange={(e) => setInvoiceMargin(e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                </div>
              </div>

              {importResult && (
                <div className="p-3 bg-dark-800 border border-dark-700 rounded-xl text-sm">
                  <p className="text-gray-300">Excel: {importResult.total} filas · <span className="text-green-400">{importResult.imported} nuevos</span> · <span className="text-blue-400">{importResult.updated} actualizados</span> · <span className="text-red-400">{importResult.errors} errores</span></p>
                  {importResult.errors > 0 && (
                    <pre className="mt-2 text-xs text-red-400 max-h-32 overflow-y-auto whitespace-pre-wrap">{importResult.details?.errors?.join("\n")}</pre>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-700/50">
              <button onClick={() => setShowInvoiceModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl text-sm transition-all">
                Cerrar
              </button>
              <button onClick={importInvoice} disabled={importing}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary-600/20 disabled:opacity-50">
                {importing ? "Procesando..." : "Importar Factura"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
