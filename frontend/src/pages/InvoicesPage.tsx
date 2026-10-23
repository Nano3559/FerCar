import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Eye } from "lucide-react";
import api from "../services/api";
import toast from "react-hot-toast";

interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  date: string;
  supplierName: string;
  manufacturerName?: string | null;
  locationName?: string | null;
  dimCode?: string | null;
  totalUnits: number;
  fileUrl?: string | null;
  status: "ACTIVA" | "ANULADA";
  inventoryAppliedAt?: string | null;
  createdAt: string;
}

interface InvoiceItemEdit {
  factoryCode: string;
  quantity: number;
  costUSD: number;
  productId?: number | null;
  itemCode?: string | null;
  name: string;
  brand: string;
  model: string;
  year: string;
  oemCode?: string | null;
  price1?: number | null;
  price2?: number | null;
  priceMayor?: number | null;
  detail?: string;
}

export default function InvoicesPage() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [manufacturers, setManufacturers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [form, setForm] = useState({
    supplierId: "",
    manufacturerId: "",
    locationId: "",
    exchangeRate: "6.96",
    expensesPer: "0",
    marginTienda: "25",
    dimCode: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [items, setItems] = useState<InvoiceItemEdit[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [invRes, supRes, manRes, locRes] = await Promise.all([
        api.get("/invoices"),
        api.get("/suppliers"),
        api.get("/manufacturers"),
        api.get("/locations"),
      ]);
      setInvoices(invRes.data.invoices || []);
      setSuppliers(supRes.data.suppliers || []);
      setManufacturers(manRes.data.manufacturers || []);
      setLocations(locRes.data.locations || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Error cargando facturas");
    } finally {
      setLoading(false);
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setItems([]);
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    try {
      const res = await api.post("/invoices/preview", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setItems((res.data.items || []).map((it: any) => ({ ...it, detail: it.detail || it.detalles || "" })));
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Error previsualizando");
    }
  };

  const updateItem = (idx: number, field: keyof InvoiceItemEdit, value: any) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const importInvoice = async () => {
    if (!form.locationId) return toast.error("Seleccione almacén");
    if (items.length === 0) return toast.error("No hay items para importar");
    const fd = new FormData();
    if (file) fd.append("file", file);
    fd.append("supplierId", form.supplierId || "");
    fd.append("manufacturerId", form.manufacturerId || "");
    fd.append("locationId", form.locationId);
    fd.append("exchangeRate", form.exchangeRate);
    fd.append("expensesPer", form.expensesPer);
    fd.append("marginTienda", form.marginTienda);
    fd.append("dimCode", form.dimCode);
    fd.append("items", JSON.stringify(items));
    try {
      setImporting(true);
      const res = await api.post("/invoices/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Factura guardada como borrador. Actualiza el inventario cuando esté lista.");
      setShowImport(false);
      setFile(null);
      setItems([]);
      if (res.data?.invoiceId) {
        navigate(`/panel/facturas/${res.data.invoiceId}`);
      } else {
        loadData();
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Error importando factura");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Facturas</h1>
          <p className="text-gray-400 text-sm mt-1">Importar Excel, editar y actualizar el inventario</p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-all"
        >
          <Upload size={18} /> Importar Excel
        </button>
      </div>

      <div className="bg-dark-800 border border-dark-700/50 rounded-xl overflow-hidden">
        <div className="p-4">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700/50">
                <th className="text-left text-xs text-gray-400 font-medium pb-3">N° Factura</th>
                <th className="text-left text-xs text-gray-400 font-medium pb-3">Fecha</th>
                <th className="text-left text-xs text-gray-400 font-medium pb-3">Proveedor</th>
                <th className="text-left text-xs text-gray-400 font-medium pb-3">Fabricante</th>
                <th className="text-left text-xs text-gray-400 font-medium pb-3">Almacén</th>
                <th className="text-left text-xs text-gray-400 font-medium pb-3">Unidades</th>
                <th className="text-left text-xs text-gray-400 font-medium pb-3">DIM</th>
                <th className="text-left text-xs text-gray-400 font-medium pb-3">Estado</th>
                <th className="text-left text-xs text-gray-400 font-medium pb-3">Inventario</th>
                <th className="text-right text-xs text-gray-400 font-medium pb-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-dark-700/50 hover:bg-dark-700/30">
                  <td className="py-3 text-sm text-foreground">{inv.invoiceNumber}</td>
                  <td className="py-3 text-sm text-gray-300">{inv.date}</td>
                  <td className="py-3 text-sm text-gray-300">{inv.supplierName}</td>
                  <td className="py-3 text-sm text-gray-300">{inv.manufacturerName || "-"}</td>
                  <td className="py-3 text-sm text-gray-300">{inv.locationName || "-"}</td>
                  <td className="py-3 text-sm text-gray-300">{inv.totalUnits}</td>
                  <td className="py-3 text-sm text-gray-300">{inv.dimCode || "-"}</td>
                  <td className="py-3 text-sm text-gray-300">{inv.status}</td>
                  <td className="py-3 text-sm">
                    {inv.inventoryAppliedAt ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                        Actualizado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-500/10 text-amber-300 border border-amber-500/30">
                        Pendiente
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-sm text-right">
                    <button
                      onClick={() => navigate(`/panel/facturas/${inv.id}`)}
                      className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300"
                    >
                      <Eye size={14} /> Ver
                    </button>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && !loading && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-gray-400">Sin facturas cargadas</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showImport && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 border border-dark-700/50 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-auto">
            <div className="p-6 border-b border-dark-700/50 flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">Importar Factura Excel</h2>
              <button onClick={() => setShowImport(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Proveedor</label>
                  <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className="w-full px-3 py-2 bg-dark-900 border border-dark-700/50 rounded-lg text-foreground">
                    <option value="">Seleccionar</option>
                    {suppliers.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Fabricante</label>
                  <select value={form.manufacturerId} onChange={(e) => setForm({ ...form, manufacturerId: e.target.value })} className="w-full px-3 py-2 bg-dark-900 border border-dark-700/50 rounded-lg text-foreground">
                    <option value="">Seleccionar</option>
                    {manufacturers.map((m: any) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Almacén</label>
                  <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} className="w-full px-3 py-2 bg-dark-900 border border-dark-700/50 rounded-lg text-foreground" required>
                    <option value="">Seleccionar</option>
                    {locations.map((l: any) => (
                      <option key={l.id} value={l.id}>{l.name} ({l.type})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">% Gastos</label>
                  <input value={form.expensesPer} onChange={(e) => setForm({ ...form, expensesPer: e.target.value })} className="w-full px-3 py-2 bg-dark-900 border border-dark-700/50 rounded-lg text-foreground" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Tipo de cambio</label>
                  <input value={form.exchangeRate} onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })} className="w-full px-3 py-2 bg-dark-900 border border-dark-700/50 rounded-lg text-foreground" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">% Tienda</label>
                  <input value={form.marginTienda} onChange={(e) => setForm({ ...form, marginTienda: e.target.value })} className="w-full px-3 py-2 bg-dark-900 border border-dark-700/50 rounded-lg text-foreground" />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs text-gray-400 mb-1">COD DIM (opcional)</label>
                  <input value={form.dimCode} onChange={(e) => setForm({ ...form, dimCode: e.target.value })} className="w-full px-3 py-2 bg-dark-900 border border-dark-700/50 rounded-lg text-foreground" />
                </div>
              </div>
              <div>
                <input type="file" accept=".xlsx,.xls" onChange={onFileChange} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-primary-600 file:text-white hover:file:bg-primary-700" />
              </div>
              {items && items.length > 0 && (
                <div className="border border-dark-700/50 rounded-xl overflow-auto max-h-[400px]">
                  <table className="w-full text-sm">
                    <thead className="bg-dark-900/50">
                      <tr>
                        <th className="text-left p-2 text-xs text-gray-400">COD FABRICA</th>
                        <th className="text-left p-2 text-xs text-gray-400">PRODUCTO</th>
                        <th className="text-left p-2 text-xs text-gray-400">MARCA</th>
                        <th className="text-left p-2 text-xs text-gray-400">MODELO</th>
                        <th className="text-left p-2 text-xs text-gray-400">AÑO</th>
                        <th className="text-left p-2 text-xs text-gray-400">DETALLES</th>
                        <th className="text-left p-2 text-xs text-gray-400">COD OEM</th>
                        <th className="text-left p-2 text-xs text-gray-400">CANTIDAD</th>
                        <th className="text-left p-2 text-xs text-gray-400">COSTO $</th>
                        <th className="text-left p-2 text-xs text-gray-400">COSTO BS</th>
                        <th className="text-left p-2 text-xs text-gray-400">COSTO TIENDAS</th>
                        <th className="text-center p-2 text-xs text-gray-400">20</th>
                        <th className="text-center p-2 text-xs text-gray-400">30</th>
                        <th className="text-center p-2 text-xs text-gray-400">40</th>
                        <th className="text-center p-2 text-xs text-black bg-red-300 border-x border-red-400/50">50</th>
                        <th className="text-center p-2 text-xs text-gray-400">60</th>
                        <th className="text-center p-2 text-xs text-gray-400">70</th>
                        <th className="text-center p-2 text-xs text-gray-400">80</th>
                        <th className="text-left p-2 text-xs text-gray-400">PRECIO 1</th>
                        <th className="text-left p-2 text-xs text-gray-400">PRECIO 2</th>
                        <th className="text-left p-2 text-xs text-gray-400">PRECIO MAYOR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items && items.map((it, idx) => {
                        const ex = Number(form.exchangeRate) || 0;
                        const expPer = Number(form.expensesPer) || 0;
                        const mT = Number(form.marginTienda) || 0;
                        const costUSD = Number(it.costUSD) || 0;
                        const costBS = ex > 0 ? costUSD * (1 + expPer / 100) * ex : 0;
                        const costTienda = costBS * (1 + mT / 100);
                        const mk = (pct: number) => costBS * (1 + pct / 100);
                        return (
                          <tr key={idx} className="border-t border-dark-700/40">
                          <td className="p-2 text-gray-300 whitespace-nowrap">{it.factoryCode}</td>
                          <td className="p-2"><input value={it.name} onChange={(e) => updateItem(idx, "name", e.target.value)} className="w-40 px-2 py-1 bg-dark-900 border border-dark-700/50 rounded text-foreground" /></td>
                          <td className="p-2"><input value={it.brand} onChange={(e) => updateItem(idx, "brand", e.target.value)} className="w-24 px-2 py-1 bg-dark-900 border border-dark-700/50 rounded text-foreground" /></td>
                          <td className="p-2"><input value={it.model} onChange={(e) => updateItem(idx, "model", e.target.value)} className="w-24 px-2 py-1 bg-dark-900 border border-dark-700/50 rounded text-foreground" /></td>
                          <td className="p-2"><input value={it.year} onChange={(e) => updateItem(idx, "year", e.target.value)} className="w-16 px-2 py-1 bg-dark-900 border border-dark-700/50 rounded text-foreground" /></td>
                          <td className="p-2"><input value={it.detail || ""} onChange={(e) => updateItem(idx, "detail", e.target.value)} className="w-32 px-2 py-1 bg-dark-900 border border-dark-700/50 rounded text-foreground" /></td>
                          <td className="p-2"><input value={it.oemCode || ""} onChange={(e) => updateItem(idx, "oemCode", e.target.value)} className="w-28 px-2 py-1 bg-dark-900 border border-dark-700/50 rounded text-foreground" /></td>
                          <td className="p-2"><input type="number" value={it.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} className="w-16 px-2 py-1 bg-dark-900 border border-dark-700/50 rounded text-foreground" /></td>
                          <td className="p-2"><input type="number" step="0.01" value={it.costUSD} onChange={(e) => updateItem(idx, "costUSD", Number(e.target.value))} className="w-20 px-2 py-1 bg-dark-900 border border-dark-700/50 rounded text-foreground" /></td>
                          <td className="p-2 text-gray-300 text-center">{costBS.toFixed(2)}</td>
                          <td className="p-2 text-gray-300 text-center">{costTienda.toFixed(2)}</td>
                          <td className="p-2 text-gray-300 text-center">{mk(20).toFixed(2)}</td>
                          <td className="p-2 text-gray-300 text-center">{mk(30).toFixed(2)}</td>
                          <td className="p-2 text-gray-300 text-center">{mk(40).toFixed(2)}</td>
                          <td className="p-2 text-black text-center bg-red-200 border-x border-red-400/50 font-bold">{mk(50).toFixed(2)}</td>
                          <td className="p-2 text-gray-300 text-center">{mk(60).toFixed(2)}</td>
                          <td className="p-2 text-gray-300 text-center">{mk(70).toFixed(2)}</td>
                          <td className="p-2 text-gray-300 text-center">{mk(80).toFixed(2)}</td>
                          <td className="p-2"><input type="number" step="0.01" value={it.price1 ?? ""} onChange={(e) => updateItem(idx, "price1", e.target.value === "" ? null : Number(e.target.value))} className="w-20 px-2 py-1 bg-dark-900 border border-dark-700/50 rounded text-foreground" /></td>
                          <td className="p-2"><input type="number" step="0.01" value={it.price2 ?? ""} onChange={(e) => updateItem(idx, "price2", e.target.value === "" ? null : Number(e.target.value))} className="w-20 px-2 py-1 bg-dark-900 border border-dark-700/50 rounded text-foreground" /></td>
                          <td className="p-2"><input type="number" step="0.01" value={it.priceMayor ?? ""} onChange={(e) => updateItem(idx, "priceMayor", e.target.value === "" ? null : Number(e.target.value))} className="w-24 px-2 py-1 bg-dark-900 border border-dark-700/50 rounded text-foreground" /></td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => { setShowImport(false); setFile(null); setItems([]); }} className="px-4 py-2 border border-dark-700/50 rounded-xl text-gray-300 hover:bg-dark-700/50">Cancelar</button>
                <button disabled={importing || (Array.isArray(items) ? items.length === 0 : true)} onClick={importInvoice} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl disabled:opacity-50">
                  {importing ? "Guardando..." : "Guardar factura"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
