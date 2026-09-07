import { useState, useEffect, useCallback, useRef } from "react";
import {
  Send, Plus, X, RefreshCw, ChevronDown, ChevronLeft, ChevronRight,
  Search, Clock, Package, Truck, CheckCircle, Ban, Info, History,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../services/api";
import { useAuthStore } from "../stores/authStore";
import { useDialogBehavior } from "../components/ui/useDialog";

interface Product {
  id: number; itemCode: string; name: string; brand: string; model: string;
  stock: number; category: string | null; image: string | null;
}

interface RequestRecord {
  id: number; productId: number; quantity: number; locationId: number;
  status: string; date: string; note: string | null;
  product: { id: number; name: string; itemCode: string; brand: string; model: string };
  location: { id: number; name: string; type: string };
  requestedBy: { id: number; name: string; email: string };
  history?: { id: number; previousStatus: string | null; newStatus: string; userId: number; userRole: string; createdAt: string }[];
}

interface Location {
  id: number; name: string; type: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock; bg: string }> = {
  PENDIENTE: { label: "Pendiente", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", icon: Clock },
  RECIBIDO_POR_INVENTARIO: { label: "Recibido por Inventario", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", icon: Package },
  PREPARANDO: { label: "Preparando", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20", icon: Package },
  ENTREGADO: { label: "Entregado", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", icon: Truck },
  RECIBIDO_POR_TIENDA: { label: "Recibido por Tienda", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20", icon: CheckCircle },
  CANCELADO: { label: "Cancelado", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", icon: Ban },
};

const STATUS_FLOW: Record<string, { to: string; label: string; icon: typeof Clock; color: string; hoverColor: string }[]> = {
  PENDIENTE: [
    { to: "RECIBIDO_POR_INVENTARIO", label: "Recibir", icon: Package, color: "text-blue-400 bg-blue-500/10 border-blue-500/20", hoverColor: "hover:bg-blue-500/20 hover:border-blue-500/40" },
    { to: "CANCELADO", label: "Cancelar", icon: Ban, color: "text-red-400 bg-red-500/10 border-red-500/20", hoverColor: "hover:bg-red-500/20 hover:border-red-500/40" },
  ],
  RECIBIDO_POR_INVENTARIO: [
    { to: "PREPARANDO", label: "Preparar", icon: Package, color: "text-purple-400 bg-purple-500/10 border-purple-500/20", hoverColor: "hover:bg-purple-500/20 hover:border-purple-500/40" },
    { to: "CANCELADO", label: "Cancelar", icon: Ban, color: "text-red-400 bg-red-500/10 border-red-500/20", hoverColor: "hover:bg-red-500/20 hover:border-red-500/40" },
  ],
  PREPARANDO: [
    { to: "ENTREGADO", label: "Entregar", icon: Truck, color: "text-orange-400 bg-orange-500/10 border-orange-500/20", hoverColor: "hover:bg-orange-500/20 hover:border-orange-500/40" },
    { to: "CANCELADO", label: "Cancelar", icon: Ban, color: "text-red-400 bg-red-500/10 border-red-500/20", hoverColor: "hover:bg-red-500/20 hover:border-red-500/40" },
  ],
  ENTREGADO: [
    { to: "RECIBIDO_POR_TIENDA", label: "Confirmar recepción", icon: CheckCircle, color: "text-green-400 bg-green-500/10 border-green-500/20", hoverColor: "hover:bg-green-500/20 hover:border-green-500/40" },
  ],
  RECIBIDO_POR_TIENDA: [],
  CANCELADO: [],
};

const PAGE_SIZE = 15;

export default function RequestsPage() {
  const { user } = useAuthStore();
  const role = user?.role || "";
  const isInventario = role === "INVENTARIO" || role === "ADMIN";
  const isTienda = role === "TIENDA" || role === "ADMIN";

  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [filterStatus, setFilterStatus] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [searchProd, setSearchProd] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [saving, setSaving] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showHistory, setShowHistory] = useState<RequestRecord | null>(null);

  const newPanelRef = useDialogBehavior(showNew, () => { setShowNew(false); clearProduct(); });
  const historyPanelRef = useDialogBehavior(showHistory !== null, () => setShowHistory(null));
  const infoPanelRef = useDialogBehavior(showInfo, () => setShowInfo(false));

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      const res = await api.get(`/requests?${params.toString()}`);
      setRequests(res.data.requests);
      setTotal(res.data.pagination.total);
      setPages(res.data.pagination.pages);
    } catch {
      toast.error("Error al cargar solicitudes");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, page]);

  const fetchLocations = useCallback(async () => {
    try {
      const res = await api.get("/locations");
      setLocations(res.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);
  useEffect(() => { fetchLocations(); }, [fetchLocations]);
  useEffect(() => { setPage(1); }, [filterStatus]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const doSearch = (q: string) => {
    setSearchProd(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q || q.trim().length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await api.get(`/products?search=${encodeURIComponent(q.trim())}&limit=8`);
        setSearchResults(res.data.products);
        setSearchFocused(true);
      } catch { /* ignore */ }
      finally { setSearching(false); }
    }, 300);
  };

  const selectProduct = (p: Product) => {
    setSelectedProduct(p);
    setSearchProd(`${p.itemCode} — ${p.name}`);
    setSearchResults([]);
    setSearchFocused(false);
  };

  const clearProduct = () => {
    setSelectedProduct(null);
    setSearchProd("");
    setSearchResults([]);
  };

  const handleCreate = async () => {
    if (!selectedProduct || !selectedLocation || !quantity || !user) {
      toast.error("Completa todos los campos obligatorios");
      return;
    }
    const qty = Number(quantity);
    if (qty <= 0) { toast.error("La cantidad debe ser mayor a 0"); return; }

    try {
      setSaving(true);
      await api.post("/requests", {
        productId: selectedProduct.id,
        quantity: qty,
        locationId: Number(selectedLocation),
        requestedById: user.id,
        note: note.trim() || null,
      });
      toast.success("Solicitud creada");
      setShowNew(false);
      clearProduct();
      setSelectedLocation(""); setQuantity(""); setNote("");
      fetchRequests();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al crear solicitud");
    } finally {
      setSaving(false);
    }
  };

  const canPerformAction = (actionTo: string): boolean => {
    if (role === "ADMIN") return true;
    if (["RECIBIDO_POR_INVENTARIO", "PREPARANDO", "ENTREGADO"].includes(actionTo)) return isInventario;
    if (actionTo === "RECIBIDO_POR_TIENDA") return isTienda;
    return false;
  };

  const changeStatus = async (id: number, newStatus: string) => {
    try {
      await api.put(`/requests/${id}`, { status: newStatus });
      toast.success(`Estado cambiado a ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
      fetchRequests();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al cambiar estado");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Solicitudes</h1>
          <p className="text-gray-400 text-sm mt-1">{total} solicitudes</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowInfo(true)} className="p-2.5 bg-dark-800 border border-dark-700/50 rounded-xl text-gray-400 hover:text-blue-400 hover:border-blue-500/30 transition-all" title="¿Cómo funciona?">
            <Info size={18} />
          </button>
          <button onClick={fetchRequests} className="p-2.5 bg-dark-800 border border-dark-700/50 rounded-xl text-gray-400 hover:text-foreground hover:border-primary-600/50 transition-all" title="Actualizar">
            <RefreshCw size={18} />
          </button>
          <button onClick={() => setShowNew(true)} className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 shadow-lg shadow-primary-600/20">
            <Plus size={18} /> Nueva Solicitud
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilterStatus("")} className={`px-3 py-2 rounded-xl text-sm border transition-all ${!filterStatus ? "bg-primary-600/10 border-primary-600/20 text-primary-400" : "bg-dark-800/50 border-dark-700/50 text-gray-400 hover:text-foreground"}`}>
          Todas
        </button>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button key={key} onClick={() => setFilterStatus(key)}
              className={`px-3 py-2 rounded-xl text-sm border transition-all flex items-center gap-1.5 ${filterStatus === key ? `${cfg.bg} ${cfg.color}` : "bg-dark-800/50 border-dark-700/50 text-gray-400 hover:text-foreground"}`}>
              <Icon size={14} /> {cfg.label}
            </button>
          );
        })}
      </div>

      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <RefreshCw size={24} className="text-primary-400 animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <div className="p-6 text-center">
            <Send size={40} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Sin solicitudes</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-dark-700/50">
                  <th className="text-left px-4 py-3 font-medium">ID</th>
                  <th className="text-left px-4 py-3 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium">Producto</th>
                  <th className="text-left px-4 py-3 font-medium">Ubicación</th>
                  <th className="text-center px-4 py-3 font-medium">Cantidad</th>
                  <th className="text-left px-4 py-3 font-medium">Solicitado por</th>
                  <th className="text-left px-4 py-3 font-medium">Nota</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                  <th className="text-center px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.PENDIENTE;
                  const Icon = cfg.icon;
                  const actions = STATUS_FLOW[r.status] || [];
                  return (
                    <tr key={r.id} className="border-b border-dark-700/30 last:border-0 hover:bg-dark-900/30 transition-colors">
                      <td className="px-4 py-3 text-gray-400">{r.id}</td>
                      <td className="px-4 py-3 text-gray-300">{new Date(r.date).toLocaleDateString("es-BO")}</td>
                      <td className="px-4 py-3">
                        <p className="text-foreground font-medium">{r.product.name}</p>
                        <p className="text-xs text-gray-500">{r.product.itemCode}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-300">{r.location.name}</td>
                      <td className="px-4 py-3 text-center text-foreground font-medium">{r.quantity}</td>
                      <td className="px-4 py-3 text-gray-400">{r.requestedBy.name}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-[120px] truncate" title={r.note || ""}>
                        {r.note || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 text-xs font-medium rounded-full border inline-flex items-center gap-1 ${cfg.bg} ${cfg.color}`}>
                          <Icon size={12} /> {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => setShowHistory(r)} className="p-2 rounded-xl text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all" title="Ver historial">
                            <History size={15} />
                          </button>
                          {actions.filter((a) => canPerformAction(a.to)).map((action) => {
                            const ActionIcon = action.icon;
                            return (
                              <div key={action.to} className="relative group">
                                <button
                                  onClick={() => changeStatus(r.id, action.to)}
                                  className={`p-2 rounded-xl border transition-all duration-200 ${action.color} ${action.hoverColor} hover:shadow-lg active:scale-95`}
                                >
                                  <ActionIcon size={15} />
                                </button>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-dark-950 border border-dark-700 rounded-lg text-xs text-foreground whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 shadow-xl z-10">
                                  {action.label}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700/50">
            <p className="text-gray-400 text-sm">Página {page} de {pages}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="p-2 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground disabled:opacity-30 transition-all">
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, pages - 4));
                const p = start + i;
                if (p > pages) return null;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${p === page ? "bg-primary-600 text-white" : "bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground"}`}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
                className="p-2 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground disabled:opacity-30 transition-all">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div ref={newPanelRef} role="dialog" aria-modal="true" aria-label="Nueva solicitud" className="bg-dark-800 border border-dark-700/50 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-dark-700/50">
              <h2 className="text-lg font-bold text-foreground">Nueva Solicitud</h2>
              <button onClick={() => { setShowNew(false); clearProduct(); }} aria-label="Cerrar"
                className="p-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div ref={searchRef}>
                <label htmlFor="req-producto" className="block text-xs text-gray-400 mb-1.5">Producto *</label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    id="req-producto"
                    type="text"
                    value={searchProd}
                    onChange={(e) => { setSearchProd(e.target.value); if (selectedProduct) setSelectedProduct(null); doSearch(e.target.value); }}
                    onFocus={() => { if (searchResults.length > 0) setSearchFocused(true); }}
                    placeholder="Escribe código, nombre o marca..."
                    disabled={!!selectedProduct}
                    className="w-full pl-9 pr-9 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none placeholder-gray-500 disabled:opacity-50"
                  />
                  {searchProd && !selectedProduct && (
                    <button onClick={() => { setSearchProd(""); setSearchResults([]); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-foreground transition-colors">
                      <X size={16} />
                    </button>
                  )}
                  {searching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <RefreshCw size={14} className="text-primary-400 animate-spin" />
                    </div>
                  )}
                </div>

                {searchFocused && searchResults.length > 0 && !selectedProduct && (
                  <div className="mt-2 bg-dark-900 border border-dark-700/50 rounded-xl max-h-56 overflow-y-auto shadow-xl">
                    {searchResults.map((p) => (
                      <button key={p.id} onClick={() => selectProduct(p)}
                        className="w-full text-left px-3 py-3 hover:bg-primary-600/10 transition-colors border-b border-dark-700/30 last:border-0">
                        <p className="text-sm text-foreground font-medium truncate">{p.name}</p>
                        <p className="text-xs text-gray-500">{p.itemCode} · {p.brand} · Stock: {p.stock}</p>
                      </button>
                    ))}
                  </div>
                )}

                {selectedProduct && (
                  <div className="mt-2 p-3 bg-primary-600/10 border border-primary-600/20 rounded-xl flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground font-medium truncate">{selectedProduct.name}</p>
                      <p className="text-xs text-gray-400">{selectedProduct.itemCode} · Stock: {selectedProduct.stock}</p>
                    </div>
                    <button onClick={clearProduct} className="ml-3 p-1.5 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-lg transition-all">
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="relative">
                <label className="block text-xs text-gray-400 mb-1.5">Ubicación solicitante *</label>
                <select value={selectedLocation} onChange={(e) => setSelectedLocation(e.target.value)}
                  className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8">
                  <option value="">Seleccionar tienda</option>
                  {locations.filter((l) => l.type === "TIENDA").map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-[38px] text-gray-500 pointer-events-none" />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Cantidad *</label>
                <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="1"
                  className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>

              <div>
                <label htmlFor="req-nota" className="block text-xs text-gray-400 mb-1.5">Nota (opcional)</label>
                <textarea id="req-nota" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                  placeholder="Observaciones adicionales..."
                  className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none placeholder-gray-600" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-dark-700/50">
              <button onClick={() => { setShowNew(false); clearProduct(); }} className="px-4 py-2.5 text-sm text-gray-400 hover:text-foreground transition-colors">Cancelar</button>
              <button onClick={handleCreate} disabled={saving || !selectedProduct}
                className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                <Send size={16} /> {saving ? "Creando..." : "Crear Solicitud"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div ref={historyPanelRef} role="dialog" aria-modal="true" aria-label="Historial de solicitud" className="bg-dark-800 border border-dark-700/50 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-dark-700/50">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <History size={20} className="text-blue-400" /> Historial — Solicitud #{showHistory.id}
              </h2>
              <button onClick={() => setShowHistory(null)} aria-label="Cerrar" className="p-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              <div className="mb-4 p-3 bg-dark-900/50 rounded-xl border border-dark-700/30">
                <p className="text-foreground font-medium">{showHistory.product.name}</p>
                <p className="text-xs text-gray-400">{showHistory.product.itemCode} · Cantidad: {showHistory.quantity} · {showHistory.location.name}</p>
                {showHistory.note && <p className="text-xs text-gray-400 mt-1 italic">Nota: {showHistory.note}</p>}
              </div>
              {showHistory.history && showHistory.history.length > 0 ? (
                <div className="space-y-3">
                  {showHistory.history.map((h) => {
                    const cfg = STATUS_CONFIG[h.newStatus] || STATUS_CONFIG.PENDIENTE;
                    const Icon = cfg.icon;
                    return (
                      <div key={h.id} className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                          <Icon size={14} className={cfg.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground">
                            {h.previousStatus ? (
                              <>{STATUS_CONFIG[h.previousStatus]?.label || h.previousStatus} → <span className={`font-medium ${cfg.color}`}>{cfg.label}</span></>
                            ) : (
                              <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            {h.userRole} · {new Date(h.createdAt).toLocaleString("es-BO")}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">Sin historial de cambios</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div ref={infoPanelRef} role="dialog" aria-modal="true" aria-label="Cómo funciona" className="bg-dark-800 border border-dark-700/50 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-dark-700/50">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Info size={20} className="text-blue-400" /> ¿Cómo funciona?</h2>
              <button onClick={() => setShowInfo(false)} aria-label="Cerrar" className="p-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl transition-all"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4 text-sm text-gray-300">
              <div>
                <h4 className="text-foreground font-semibold mb-1">¿Para qué sirve?</h4>
                <p>Cuando una tienda se queda sin stock de un producto, desde aquí se pide al almacén que lo envíe.</p>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1">Flujo de estados:</h4>
                <div className="space-y-1.5 ml-1">
                  <p className="flex items-center gap-2"><Clock size={14} className="text-yellow-400" /> <strong className="text-yellow-400">Pendiente</strong> — Solicitud creada</p>
                  <p className="flex items-center gap-2"><Package size={14} className="text-blue-400" /> <strong className="text-blue-400">Recibido por Inventario</strong> — Inventario tomó conocimiento</p>
                  <p className="flex items-center gap-2"><Package size={14} className="text-purple-400" /> <strong className="text-purple-400">Preparando</strong> — Armando el pedido</p>
                  <p className="flex items-center gap-2"><Truck size={14} className="text-orange-400" /> <strong className="text-orange-400">Entregado</strong> — Pedido enviado</p>
                  <p className="flex items-center gap-2"><CheckCircle size={14} className="text-green-400" /> <strong className="text-green-400">Recibido por Tienda</strong> — La tienda confirmó recepción</p>
                </div>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1">¿Quién puede cambiar el estado?</h4>
                <p><strong className="text-blue-400">Inventario/Admin:</strong> Recibir, Preparar, Entregar</p>
                <p><strong className="text-green-400">Tienda/Admin:</strong> Confirmar recepción</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
