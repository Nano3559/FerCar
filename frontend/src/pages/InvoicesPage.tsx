import { useEffect, useState } from "react";
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
  createdAt: string;
}

export default function InvoicesPage() {
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
  const [preview, setPreview] = useState<any>(null);

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
    setPreview(null);
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    try {
      const res = await api.post("/invoices/preview", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPreview(res.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Error previsualizando");
    }
  };

  const importInvoice = async () => {
    if (!file) return toast.error("Seleccione archivo Excel");
    if (!form.locationId) return toast.error("Seleccione almacén");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("supplierId", form.supplierId || "");
    fd.append("manufacturerId", form.manufacturerId || "");
    fd.append("locationId", form.locationId);
    fd.append("exchangeRate", form.exchangeRate);
    fd.append("expensesPer", form.expensesPer);
    fd.append("marginTienda", form.marginTienda);
    fd.append("dimCode", form.dimCode);
    try {
      setImporting(true);
      await api.post("/invoices/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Factura importada correctamente");
      setShowImport(false);
      setFile(null);
      setPreview(null);
      loadData();
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
          <p className="text-gray-400 text-sm mt-1">Importar Excel, completar datos y subir a inventario</p>
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
                  <td className="py-3 text-sm text-right">
                    {inv.fileUrl && (
                      <a href={`/uploads/facturas/${inv.fileUrl}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300">
                        <Eye size={14} /> Ver
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-400">Sin facturas cargadas</td>
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
              {preview && (
                <div className="text-xs text-gray-400">
                  Filas detectadas: {preview.count}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowImport(false)} className="px-4 py-2 border border-dark-700/50 rounded-xl text-gray-300 hover:bg-dark-700/50">Cancelar</button>
                <button disabled={importing || !file} onClick={importInvoice} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl disabled:opacity-50">
                  {importing ? "Importando..." : "Confirmar e Importar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
