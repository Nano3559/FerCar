import { useState, useEffect, useCallback } from "react";
import {
  Upload, Search, ChevronLeft, ChevronRight, RefreshCw, FileText,
  Eye, Download, Printer, X, Scale, Receipt,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../services/api";
import { useDialogBehavior } from "../components/ui/useDialog";

interface LocationX { id: number; name: string; type: string; }

interface NoteRow {
  id: number; noteNumber: string; date: string;
  supplierName: string; supplierNit: string | null; supplierPhone: string | null;
  locationId: number; locationName: string; locationType: string;
  fileUrl: string | null; exchangeRate: number | null; expensesPer: number | null;
  totalUnits: number; totalCost: number; createdAt: string;
}

interface NoteItem {
  id: number; productId: number; itemCode: string; name: string;
  brand: string; model: string; image: string | null;
  quantity: number; unitCost: number; price1: number | null; price2: number | null;
  disc20: number; disc30: number; disc40: number; disc50: number;
  priceD20: number | null; priceD30: number | null;
  priceD40: number | null; priceD50: number | null; lineTotal: number;
}

interface NoteDetail extends NoteRow { items: NoteItem[]; }

interface ReconcileRow {
  productId: number; itemCode: string; name: string; brand: string; model: string;
  purchases: number; purchasesCost: number; sales: number; expected: number;
  stock: number; difference: number;
}

const PAGE_SIZE = 15;

export default function PurchaseNotesPage() {
  const [tab, setTab] = useState<"notas" | "conciliacion">("notas");

  // Notes list
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesTotal, setNotesTotal] = useState(0);
  const [notesPage, setNotesPage] = useState(1);
  const [notesPages, setNotesPages] = useState(1);
  const [search, setSearch] = useState("");

  // Locations
  const [locations, setLocations] = useState<LocationX[]>([]);

  // New note modal
  const [showNew, setShowNew] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    supplierName: "", supplierNit: "", supplierPhone: "", locationId: "",
    exchangeRate: "6.96", expensesPer: "0", margin1: "25", margin2: "45",
    disc20: "2", disc30: "3", disc40: "5", disc50: "8",
  });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  // Note detail modal
  const [showDetail, setShowDetail] = useState(false);
  const [detail, setDetail] = useState<NoteDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Reconciliation
  const [recRows, setRecRows] = useState<ReconcileRow[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recTotal, setRecTotal] = useState(0);
  const [recPage, setRecPage] = useState(1);
  const [recPages, setRecPages] = useState(1);
  const [recNoteId, setRecNoteId] = useState("");
  const [recLocationId, setRecLocationId] = useState("");
  const [recSearch, setRecSearch] = useState("");

  const newPanelRef = useDialogBehavior(showNew, () => setShowNew(false));
  const detailPanelRef = useDialogBehavior(showDetail, () => setShowDetail(false));

  const formatBs = (v: number) =>
    `Bs. ${v.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fetchNotes = useCallback(async () => {
    try {
      setNotesLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(notesPage));
      params.set("limit", String(PAGE_SIZE));
      if (search) params.set("search", search);
      const res = await api.get(`/purchase-notes?${params.toString()}`);
      setNotes(res.data.notes);
      setNotesTotal(res.data.pagination.total);
      setNotesPages(res.data.pagination.pages);
    } catch { toast.error("Error al cargar notas de compra"); }
    finally { setNotesLoading(false); }
  }, [notesPage, search]);

  const fetchLocations = useCallback(async () => {
    try {
      const res = await api.get("/locations");
      if (Array.isArray(res.data.locations)) setLocations(res.data.locations);
      else setLocations(res.data);
    } catch { toast.error("Error al cargar ubicaciones"); }
  }, []);

  const fetchReconcile = useCallback(async () => {
    try {
      setRecLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(recPage));
      params.set("limit", String(PAGE_SIZE));
      if (recNoteId) params.set("noteId", recNoteId);
      if (recLocationId) params.set("locationId", recLocationId);
      if (recSearch) params.set("search", recSearch);
      const res = await api.get(`/purchase-notes/reconcile?${params.toString()}`);
      setRecRows(res.data.rows);
      setRecTotal(res.data.pagination.total);
      setRecPages(res.data.pagination.pages);
    } catch { toast.error("Error al cargar conciliación"); }
    finally { setRecLoading(false); }
  }, [recPage, recNoteId, recLocationId, recSearch]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);
  useEffect(() => { fetchLocations(); }, [fetchLocations]);
  useEffect(() => {
    if (tab === "conciliacion") fetchReconcile();
  }, [fetchReconcile, tab]);
  useEffect(() => { setNotesPage(1); }, [search]);
  useEffect(() => { setRecPage(1); }, [recNoteId, recLocationId, recSearch]);

  const openNew = () => {
    setExcelFile(null);
    setImportResult(null);
    setForm({
      supplierName: "", supplierNit: "", supplierPhone: "", locationId: "",
      exchangeRate: "6.96", expensesPer: "0", margin1: "25", margin2: "45",
      disc20: "2", disc30: "3", disc40: "5", disc50: "8",
    });
    setShowNew(true);
  };

  const submitImport = async () => {
    if (!excelFile) { toast.error("Selecciona el archivo Excel"); return; }
    if (!form.supplierName.trim()) { toast.error("El proveedor es obligatorio"); return; }
    if (!form.locationId) { toast.error("Selecciona la ubicación destino"); return; }
    try {
      setImporting(true);
      const data = new FormData();
      data.append("file", excelFile);
      data.append("supplierName", form.supplierName.trim());
      if (form.supplierNit) data.append("supplierNit", form.supplierNit.trim());
      if (form.supplierPhone) data.append("supplierPhone", form.supplierPhone.trim());
      data.append("locationId", form.locationId);
      data.append("exchangeRate", form.exchangeRate);
      data.append("expensesPer", form.expensesPer);
      data.append("margin1", form.margin1);
      data.append("margin2", form.margin2);
      data.append("disc20", form.disc20);
      data.append("disc30", form.disc30);
      data.append("disc40", form.disc40);
      data.append("disc50", form.disc50);
      const res = await api.post("/purchase-notes/import", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(res.data);
      toast.success(`Nota ${res.data.note.noteNumber} creada: ${res.data.imported} productos`);
      fetchNotes();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al importar la nota");
    } finally { setImporting(false); }
  };

  const openDetail = async (id: number) => {
    try {
      setDetailLoading(true);
      const res = await api.get(`/purchase-notes/${id}`);
      setDetail(res.data.note);
      setShowDetail(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al cargar la nota");
    } finally { setDetailLoading(false); }
  };

  const downloadExcel = async (filename: string | null) => {
    if (!filename) return;
    try {
      const res = await api.get(`/purchase-notes/file/${encodeURIComponent(filename)}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch { toast.error("No se pudo descargar el archivo"); }
  };

  const upd = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const printNote = () => { window.print(); };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notas de Compra</h1>
          <p className="text-gray-400 text-sm mt-1">Cada Excel subido crea una nota independiente, suma stock al inventario y calcula precios automáticamente</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary-600/20">
          <Upload size={16} /> Nueva Nota
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-dark-800/50 border border-dark-700/50 rounded-xl w-fit">
        <button onClick={() => setTab("notas")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "notas" ? "bg-primary-600/15 text-primary-400" : "text-gray-400 hover:text-gray-200"}`}>
          <Receipt size={16} /> Notas de Compra {notesTotal > 0 && <span className="text-xs text-gray-500">({notesTotal})</span>}
        </button>
        <button onClick={() => setTab("conciliacion")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "conciliacion" ? "bg-primary-600/15 text-primary-400" : "text-gray-400 hover:text-gray-200"}`}>
          <Scale size={16} /> Conciliación
        </button>
      </div>

      {tab === "notas" && (
        <div className="space-y-4">
          <div className="relative">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar notas"
              placeholder="Buscar por número de nota o proveedor..."
              className="w-full pl-10 pr-4 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500 transition-all" />
          </div>

          <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
            {notesLoading ? (
              <div className="flex items-center justify-center h-48">
                <RefreshCw size={24} className="text-primary-400 animate-spin" />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dark-700/50">
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">Nota</th>
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">Fecha</th>
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">Proveedor</th>
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">Ubicación</th>
                        <th className="text-right px-4 py-3 text-gray-400 font-medium">Unidades</th>
                        <th className="text-right px-4 py-3 text-gray-400 font-medium">Total</th>
                        <th className="text-center px-4 py-3 text-gray-400 font-medium">Archivo</th>
                        <th className="text-center px-4 py-3 text-gray-400 font-medium">Ver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notes.length === 0 ? (
                        <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No hay notas de compra registradas</td></tr>
                      ) : notes.map((n) => (
                        <tr key={n.id} className="border-b border-dark-700/30 hover:bg-dark-700/30 transition-colors">
                          <td className="px-4 py-3 text-primary-400 font-mono font-medium">{n.noteNumber}</td>
                          <td className="px-4 py-3 text-gray-300">{new Date(n.date).toLocaleDateString("es-BO")}</td>
                          <td className="px-4 py-3">
                            <div className="text-foreground font-medium">{n.supplierName}</div>
                            {n.supplierNit && <div className="text-xs text-gray-500">{n.supplierNit}</div>}
                          </td>
                          <td className="px-4 py-3 text-gray-300">{n.locationName}</td>
                          <td className="px-4 py-3 text-gray-300 text-right">{n.totalUnits}</td>
                          <td className="px-4 py-3 text-amber-400 font-medium text-right">{formatBs(n.totalCost)}</td>
                          <td className="px-4 py-3 text-center">
                            {n.fileUrl ? (
                              <button onClick={() => downloadExcel(n.fileUrl)} title="Descargar Excel"
                                className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-all">
                                <Download size={14} />
                              </button>
                            ) : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => openDetail(n.id)} title="Ver nota"
                              className="p-1.5 text-gray-400 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg transition-all">
                              <Eye size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {notesPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700/50">
                    <span className="text-xs text-gray-500">{notesTotal} notas</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setNotesPage(Math.max(1, notesPage - 1))} disabled={notesPage === 1}
                        className="p-1.5 text-gray-400 hover:text-foreground disabled:opacity-30 rounded-lg transition-all">
                        <ChevronLeft size={16} />
                      </button>
                      <span className="text-xs text-gray-400">{notesPage}/{notesPages}</span>
                      <button onClick={() => setNotesPage(Math.min(notesPages, notesPage + 1))} disabled={notesPage === notesPages}
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
      )}

      {tab === "conciliacion" && (
        <div className="space-y-4">
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Nota de compra (filtro)</label>
              <div className="relative">
                <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <select value={recNoteId} onChange={(e) => setRecNoteId(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-dark-900/50 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500 appearance-none">
                  <option value="">Todas las notas</option>
                  {notes.map((n) => (
                    <option key={n.id} value={n.id}>{n.noteNumber} · {n.supplierName}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Ubicación</label>
              <select value={recLocationId} onChange={(e) => setRecLocationId(e.target.value)}
                className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500 appearance-none">
                <option value="">Todas las ubicaciones</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Buscar producto</label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={recSearch} onChange={(e) => setRecSearch(e.target.value)} aria-label="Buscar en conciliación"
                  placeholder="Código, producto, marca o modelo..."
                  className="w-full pl-9 pr-3 py-2.5 bg-dark-900/50 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500 transition-all" />
              </div>
            </div>
          </div>

          <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
            {recLoading ? (
              <div className="flex items-center justify-center h-48">
                <RefreshCw size={24} className="text-primary-400 animate-spin" />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dark-700/50">
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">Código</th>
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">Producto</th>
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">Marca</th>
                        <th className="text-right px-4 py-3 text-green-400 font-medium">Compras</th>
                        <th className="text-right px-4 py-3 text-red-400 font-medium">Ventas</th>
                        <th className="text-right px-4 py-3 text-blue-400 font-medium">Esperado</th>
                        <th className="text-right px-4 py-3 text-gray-400 font-medium">Stock real</th>
                        <th className="text-right px-4 py-3 text-gray-400 font-medium">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recRows.length === 0 ? (
                        <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Sin datos de conciliación</td></tr>
                      ) : recRows.map((r) => (
                        <tr key={r.productId} className="border-b border-dark-700/30 hover:bg-dark-700/30 transition-colors">
                          <td className="px-4 py-3 text-gray-300 font-mono text-xs">{r.itemCode}</td>
                          <td className="px-4 py-3 text-foreground font-medium">{r.name}</td>
                          <td className="px-4 py-3 text-gray-300">{r.brand}</td>
                          <td className="px-4 py-3 text-green-400 text-right">{r.purchases}</td>
                          <td className="px-4 py-3 text-red-400 text-right">{r.sales}</td>
                          <td className="px-4 py-3 text-blue-400 text-right">{r.expected}</td>
                          <td className="px-4 py-3 text-gray-200 text-right">{r.stock}</td>
                          <td className={`px-4 py-3 text-right font-medium ${r.difference === 0 ? "text-green-400" : "text-red-400"}`}>
                            {r.difference > 0 ? `+${r.difference}` : r.difference}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {recPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700/50">
                    <span className="text-xs text-gray-500">{recTotal} productos</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setRecPage(Math.max(1, recPage - 1))} disabled={recPage === 1}
                        className="p-1.5 text-gray-400 hover:text-foreground disabled:opacity-30 rounded-lg transition-all">
                        <ChevronLeft size={16} />
                      </button>
                      <span className="text-xs text-gray-400">{recPage}/{recPages}</span>
                      <button onClick={() => setRecPage(Math.min(recPages, recPage + 1))} disabled={recPage === recPages}
                        className="p-1.5 text-gray-400 hover:text-foreground disabled:opacity-30 rounded-lg transition-all">
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Conciliación: <b className="text-green-400">Compras</b> (suma de notas de compra) − <b className="text-red-400">Ventas</b> = saldo esperado vs. stock real en inventario. Nota: los históricos cargados antes de esta función no tienen compras registradas.
          </p>
        </div>
      )}

      {/* New Note Modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div ref={newPanelRef} role="dialog" aria-modal="true" aria-label="Nueva nota de compra"
            className="bg-dark-900 border border-dark-700/50 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/50">
              <h3 className="text-lg font-bold text-foreground">Nueva Nota de Compra</h3>
              <button onClick={() => setShowNew(false)} aria-label="Cerrar" className="p-1.5 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-lg transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-400 leading-relaxed">
                Sube el Excel de la nota (columnas: <b className="text-gray-300">Código</b>, <b className="text-gray-300">Cantidad</b>, <b className="text-gray-300">Precio Unitario</b>).
                Se creará una <span className="text-primary-400 font-medium">nota independiente</span>, se sumará el stock a la ubicación elegida y se recalcularán costo, Precio 1, Precio 2 y precios por mayor (descuento por volumen).
              </p>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Excel de la nota *</label>
                <label className="flex items-center gap-2 px-4 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-gray-400 text-sm cursor-pointer hover:border-primary-500 transition-all">
                  <Upload size={16} />
                  <span className="truncate">{excelFile ? excelFile.name : "Seleccionar archivo .xlsx"}</span>
                  <input type="file" className="hidden" accept=".xlsx,.xls" onChange={(e) => setExcelFile(e.target.files?.[0] || null)} />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Proveedor *</label>
                  <input value={form.supplierName} onChange={(e) => upd("supplierName", e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">NIT</label>
                  <input value={form.supplierNit} onChange={(e) => upd("supplierNit", e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Teléfono</label>
                  <input value={form.supplierPhone} onChange={(e) => upd("supplierPhone", e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Ubicación destino (suma stock) *</label>
                  <select value={form.locationId} onChange={(e) => upd("locationId", e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500">
                    <option value="">Seleccionar...</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Tipo cambio (Bs/USD)</label>
                  <input type="number" step="0.01" min="0" value={form.exchangeRate} onChange={(e) => upd("exchangeRate", e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">% Gastos</label>
                  <input type="number" min="0" value={form.expensesPer} onChange={(e) => upd("expensesPer", e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">% Margen P1 (mayorista)</label>
                  <input type="number" min="0" value={form.margin1} onChange={(e) => upd("margin1", e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">% Margen P2 (minorista)</label>
                  <input type="number" min="0" value={form.margin2} onChange={(e) => upd("margin2", e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">% Descuento 20+</label>
                  <input type="number" min="0" max="90" value={form.disc20} onChange={(e) => upd("disc20", e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">% Descuento 30+</label>
                  <input type="number" min="0" max="90" value={form.disc30} onChange={(e) => upd("disc30", e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">% Descuento 40+</label>
                  <input type="number" min="0" max="90" value={form.disc40} onChange={(e) => upd("disc40", e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">% Descuento 50+</label>
                  <input type="number" min="0" max="90" value={form.disc50} onChange={(e) => upd("disc50", e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                </div>
              </div>

              <div className="p-3 bg-dark-800 border border-primary-600/20 rounded-xl text-xs text-gray-300 leading-relaxed">
                <b className="text-primary-400">Fórmulas:</b> Costo = PU × TC × (1 + %gastos/100) · P1 = Costo × (1 + margen1/100) · P2 = Costo × (1 + margen2/100) · Precio por mayor = P1 × (1 − %desc/100)
              </div>

              {importResult && (
                <div className="p-3 bg-dark-800 border border-dark-700 rounded-xl text-sm">
                  <p className="text-gray-300">
                    Nota <b className="text-primary-400">{importResult.note.noteNumber}</b>: {importResult.imported} productos importados · <span className="text-red-400">{importResult.errores} errores</span> · Total {formatBs(importResult.note.totalCost)}
                  </p>
                  {Array.isArray(importResult.errors) && importResult.errors.length > 0 && (
                    <pre className="mt-2 text-xs text-red-400 max-h-32 overflow-y-auto whitespace-pre-wrap">{importResult.errors.join("\n")}</pre>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-700/50">
              <button onClick={() => setShowNew(false)}
                className="px-4 py-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl text-sm transition-all">
                Cerrar
              </button>
              <button onClick={submitImport} disabled={importing}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary-600/20 disabled:opacity-50">
                {importing ? "Procesando..." : "Crear Nota de Compra"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note Detail Modal */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div ref={detailPanelRef} role="dialog" aria-modal="true" aria-label="Nota de compra" className="w-full max-w-3xl">
            <div className="no-print flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-foreground">{detail?.noteNumber}</h3>
              <div className="flex gap-2">
                <button onClick={printNote}
                  className="flex items-center gap-2 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all">
                  <Printer size={15} /> Imprimir
                </button>
                <button onClick={() => setShowDetail(false)} aria-label="Cerrar"
                  className="p-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl transition-all">
                  <X size={18} />
                </button>
              </div>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center h-48 bg-dark-800/50 border border-dark-700/50 rounded-2xl">
                <RefreshCw size={24} className="text-primary-400 animate-spin" />
              </div>
            ) : detail && (
              <div className="nota-doc bg-white text-black rounded-2xl shadow-2xl p-6 md:p-8">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-300 pb-4 mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">NOTA DE COMPRA</h2>
                    <p className="text-sm text-gray-600 mt-1">Shibumi · Inventario de Autopartes</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">{detail.noteNumber}</p>
                    <p className="text-sm text-gray-600">{new Date(detail.date).toLocaleDateString("es-BO")}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs uppercase">Proveedor</p>
                    <p className="font-semibold text-gray-900">{detail.supplierName}</p>
                    {detail.supplierNit && <p className="text-gray-600">NIT: {detail.supplierNit}</p>}
                    {detail.supplierPhone && <p className="text-gray-600">Tel: {detail.supplierPhone}</p>}
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase">Destino (stock)</p>
                    <p className="font-semibold text-gray-900">{detail.locationName}</p>
                    <p className="text-gray-600">Tipo: {detail.locationType}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase">Cálculo</p>
                    <p className="text-gray-700">Tipo cambio: {detail.exchangeRate ?? "1"} Bs/USD</p>
                    <p className="text-gray-700">Gastos: {detail.expensesPer ?? 0}%</p>
                  </div>
                </div>

                <table className="w-full text-sm border-collapse mb-5">
                  <thead>
                    <tr className="border-b-2 border-gray-800">
                      <th className="text-left py-2 px-2 font-semibold text-gray-800">Producto</th>
                      <th className="text-left py-2 px-2 font-semibold text-gray-800">Código</th>
                      <th className="text-right py-2 px-2 font-semibold text-gray-800">Cant.</th>
                      <th className="text-right py-2 px-2 font-semibold text-gray-800">Costo unit.</th>
                      <th className="text-right py-2 px-2 font-semibold text-gray-800">Precio 1</th>
                      <th className="text-right py-2 px-2 font-semibold text-gray-800">Precio 2</th>
                      <th className="text-right py-2 px-2 font-semibold text-gray-800">Mayor 20+</th>
                      <th className="text-right py-2 px-2 font-semibold text-gray-800">Mayor 50+</th>
                      <th className="text-right py-2 px-2 font-semibold text-gray-800">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((it) => (
                      <tr key={it.id} className="border-b border-gray-200">
                        <td className="py-2 px-2 text-gray-800">
                          <span className="font-medium">{it.name}</span>
                          <span className="block text-xs text-gray-500">{it.brand} · {it.model}</span>
                        </td>
                        <td className="py-2 px-2 font-mono text-xs text-gray-700">{it.itemCode}</td>
                        <td className="py-2 px-2 text-right text-gray-800">{it.quantity}</td>
                        <td className="py-2 px-2 text-right text-gray-800">{formatBs(it.unitCost)}</td>
                        <td className="py-2 px-2 text-right text-gray-800">{it.price1 != null ? formatBs(it.price1) : "—"}</td>
                        <td className="py-2 px-2 text-right text-gray-800">{it.price2 != null ? formatBs(it.price2) : "—"}</td>
                        <td className="py-2 px-2 text-right text-gray-800">{it.priceD20 != null ? formatBs(it.priceD20) : "—"}</td>
                        <td className="py-2 px-2 text-right text-gray-800">{it.priceD50 != null ? formatBs(it.priceD50) : "—"}</td>
                        <td className="py-2 px-2 text-right font-semibold text-gray-900">{formatBs(it.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={8} className="py-3 px-2 text-right font-bold text-gray-900">TOTAL</td>
                      <td className="py-3 px-2 text-right font-bold text-gray-900">{formatBs(detail.totalCost)}</td>
                    </tr>
                  </tfoot>
                </table>

                <div className="text-xs text-gray-600 space-y-0.5">
                  <p>Precios por mayor (descuento por volumen sobre Precio 1): 20+ (−{detail.items[0]?.disc20 ?? 0}%), 30+ (−{detail.items[0]?.disc30 ?? 0}%), 40+ (−{detail.items[0]?.disc40 ?? 0}%), 50+ (−{detail.items[0]?.disc50 ?? 0}%)</p>
                  <p>Total unidades: {detail.totalUnits} · Total compra: {formatBs(detail.totalCost)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}