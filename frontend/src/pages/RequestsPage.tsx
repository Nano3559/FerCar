import { useState, useEffect, useCallback, useRef } from "react";
import {
  Send, Plus, X, RefreshCw, ChevronDown, ChevronLeft, ChevronRight,
  Search, Clock, Package, Truck, CheckCircle, Ban, Info, History, Calendar, MapPin,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../services/api";
import { useAuthStore } from "../stores/authStore";
import { useDialogBehavior } from "../components/ui/useDialog";
import { STATUS_CONFIG, SOURCE_CONFIG } from "../constants/requests";

interface Product {
  id: number; itemCode: string; name: string; brand: string; model: string;
  stock: number; category: string | null; image: string | null;
  stockByLocation?: { locationId: number; stock: number }[];
}

interface RequestRecord {
  id: number; productId: number; quantity: number; locationId: number;
  fromLocationId: number | null; source: string;
  confirmedById: number | null; confirmedAt: string | null;
  despatchNoteId: number | null;
  despatchNote?: { id: number; noteNumber: string; status: string } | null;
  status: string; date: string; note: string | null;
  product: { id: number; name: string; itemCode: string; brand: string; model: string };
  location: { id: number; name: string; type: string };
  fromLocation?: { id: number; name: string; type: string } | null;
  requestedBy: { id: number; name: string; email: string };
  confirmedBy?: { id: number; name: string } | null;
  history?: { id: number; previousStatus: string | null; newStatus: string; userId: number; userRole: string; createdAt: string }[];
}

interface Location {
  id: number; name: string; type: string;
}

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

export default function RequestsPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuthStore();
  const role = user?.role || "";
  const isInventario = role === "INVENTARIO" || role === "ADMIN";
  const isTienda = role === "TIENDA" || role === "ADMIN";
  // Las solicitudes las crean vendedores (tienda) o administradores.
  const canCreate = role === "TIENDA" || role === "ADMIN";

  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [filterStatus, setFilterStatus] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  // El registro se conserva siempre; la lista abre mostrando los últimos 30 días.
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [showNew, setShowNew] = useState(false);
  const [searchProd, setSearchProd] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedOrigin, setSelectedOrigin] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [saving, setSaving] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showHistory, setShowHistory] = useState<RequestRecord | null>(null);

  const newPanelRef = useDialogBehavior(showNew, () => { setShowNew(false); clearProduct(); });
  const historyPanelRef = useDialogBehavior(showHistory !== null, () => setShowHistory(null));
  const infoPanelRef = useDialogBehavior(showInfo, () => setShowInfo(false));

  // El filtro y la pagina se cambian juntos, en el mismo evento, para que haya
  // UNA sola consulta. Resetear la pagina en un useEffect aparte lanzaba dos
  // pedidos seguidos: el primero ya con el filtro nuevo pero con la pagina
  // vieja, y si llegaba despues que el segundo se quedaba mostrando filas de
  // otra pagina.
  const aplicarFiltro = (setFiltro: () => void) => {
    setPage(1);
    setFiltro();
  };

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (dateFrom) params.set("startDate", dateFrom);
      if (dateTo) params.set("endDate", dateTo);
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
  }, [filterStatus, dateFrom, dateTo, page]);

  const fetchLocations = useCallback(async () => {
    try {
      const res = await api.get("/locations");
      // /locations responde { locations: [...] }, pero algunos caminos devuelven
      // el arreglo directo. Guardar el objeto crudo hacia que locations deje de
      // ser un arreglo y el panel de crear solicitud reviente al hacer map/filter.
      const list: Location[] = Array.isArray(res.data) ? res.data : res.data?.locations || [];
      setLocations(list);
      setSelectedOrigin((prev) => {
        if (prev) return prev;
        const almacen = list.find((l) => l.type === "ALMACEN");
        return almacen ? String(almacen.id) : "";
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);
  useEffect(() => { fetchLocations(); }, [fetchLocations]);

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
    if (!selectedProduct || !quantity || !user) {
      toast.error("Completa todos los campos obligatorios");
      return;
    }
    // Para el vendedor el destino es su propia tienda; el admin elige la tienda.
    if (role === "ADMIN" && !selectedLocation) {
      toast.error("Selecciona la tienda que necesita el producto");
      return;
    }
    const qty = Number(quantity);
    if (qty <= 0) { toast.error("La cantidad debe ser mayor a 0"); return; }

    // El backend es el que manda, pero avisar aca evita mandar un pedido que
    // seguro va a ser rechazado: la mercaderia no puede sumar mas que lo que hay
    // sumando todas las tiendas y los almacenes.
    const totalCadena = selectedProduct.stockByLocation?.reduce((s, l) => s + (l.stock || 0), 0);
    if (totalCadena !== undefined && qty > totalCadena) {
      toast.error(`No podés pedir ${qty}: en toda la cadena hay ${totalCadena} unidades`);
      return;
    }

    try {
      setSaving(true);
      await api.post("/requests", {
        productId: selectedProduct.id,
        quantity: qty,
        locationId: selectedLocation ? Number(selectedLocation) : undefined,
        fromLocationId: selectedOrigin ? Number(selectedOrigin) : undefined,
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

  const canPerformAction = (actionTo: string, record: RequestRecord): boolean => {
    // Con nota de despacho asignada, la nota es la que mueve el stock: entregar o
    // cancelar a mano dejaría la nota con unidades que ya no corresponden.
    if (record.despatchNoteId && (actionTo === "ENTREGADO" || actionTo === "CANCELADO")) return false;
    if (role === "ADMIN") return true;
    if (["RECIBIDO_POR_INVENTARIO", "PREPARANDO", "ENTREGADO"].includes(actionTo)) return isInventario;
    // La llegada del producto la confirma quien lo pidió.
    if (actionTo === "RECIBIDO_POR_TIENDA") {
      return isTienda && !!user && record.requestedBy.id === user.id;
    }
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
          {!embedded && <h1 className="text-2xl font-bold text-foreground">Solicitudes</h1>}
          <p className="text-gray-400 text-sm mt-1">
            {total} solicitudes en el periodo · registro conservado
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowInfo(true)} className="p-2.5 bg-dark-800 border border-dark-700/50 rounded-xl text-gray-400 hover:text-blue-400 hover:border-blue-500/30 transition-all" title="¿Cómo funciona?">
            <Info size={18} />
          </button>
          <button onClick={fetchRequests} className="p-2.5 bg-dark-800 border border-dark-700/50 rounded-xl text-gray-400 hover:text-foreground hover:border-primary-600/50 transition-all" title="Actualizar">
            <RefreshCw size={18} />
          </button>
          {canCreate && (
            <button onClick={() => setShowNew(true)} className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 shadow-lg shadow-primary-600/20">
              <Plus size={18} /> Nueva Solicitud
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => aplicarFiltro(() => setFilterStatus(""))} className={`px-3 py-2 rounded-xl text-sm border transition-all ${!filterStatus ? "bg-primary-600/10 border-primary-600/20 text-primary-400" : "bg-dark-800/50 border-dark-700/50 text-gray-400 hover:text-foreground"}`}>
          Todas
        </button>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button key={key} onClick={() => aplicarFiltro(() => setFilterStatus(key))}
              className={`px-3 py-2 rounded-xl text-sm border transition-all flex items-center gap-1.5 ${filterStatus === key ? `${cfg.bg} ${cfg.color}` : "bg-dark-800/50 border-dark-700/50 text-gray-400 hover:text-foreground"}`}>
              <Icon size={14} /> {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Rango de fechas: por defecto los últimos 30 días */}
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 bg-dark-900/50 border border-dark-600/50 rounded-xl text-gray-300 text-sm hover:text-foreground transition-all">
            <Calendar size={16} /> Fechas
            <ChevronDown size={14} className={`transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </button>
          {showFilters && (
            <>
              <div className="flex items-center gap-2">
                <label htmlFor="req-desde" className="text-xs text-gray-500 whitespace-nowrap">Desde</label>
                <input id="req-desde" type="date" value={dateFrom} onChange={(e) => aplicarFiltro(() => setDateFrom(e.target.value))}
                  className="px-2.5 py-2 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="req-hasta" className="text-xs text-gray-500 whitespace-nowrap">Hasta</label>
                <input id="req-hasta" type="date" value={dateTo} onChange={(e) => aplicarFiltro(() => setDateTo(e.target.value))}
                  className="px-2.5 py-2 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <button onClick={() => aplicarFiltro(() => {
                const from = new Date();
                from.setDate(from.getDate() - 30);
                setDateFrom(from.toISOString().slice(0, 10));
                setDateTo(new Date().toISOString().slice(0, 10));
              })} className="px-3 py-2 text-xs text-gray-400 hover:text-foreground transition-colors">
                Últimos 30 días
              </button>
            </>
          )}
          <div className="flex-1" />
          <p className="text-xs text-gray-500">
            {dateFrom || "—"} → {dateTo || "—"}
          </p>
        </div>
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
                  <th className="text-left px-4 py-3 font-medium">Origen → Tienda</th>
                  <th className="text-center px-4 py-3 font-medium">Cantidad</th>
                  <th className="text-left px-4 py-3 font-medium">Solicitado por</th>
                  <th className="text-left px-4 py-3 font-medium">Confirmado por</th>
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
                  const source = SOURCE_CONFIG[r.source] || SOURCE_CONFIG.MANUAL;
                  return (
                    <tr key={r.id} className="border-b border-dark-700/30 last:border-0 hover:bg-dark-900/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-gray-400">{r.id}</p>
                        <span className={`mt-1 inline-block px-1.5 py-0.5 text-[10px] font-medium rounded border ${source.className}`}>
                          {source.label}
                        </span>
                        {r.despatchNote && (
                          <span
                            className="mt-1 block px-1.5 py-0.5 text-[10px] font-medium rounded border border-primary-500/30 bg-primary-500/10 text-primary-400"
                            title="Esta solicitud se entrega con una nota de despacho"
                          >
                            Nota {r.despatchNote.noteNumber}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-300">{new Date(r.date).toLocaleDateString("es-BO")}</td>
                      <td className="px-4 py-3">
                        <p className="text-foreground font-medium">{r.product.name}</p>
                        <p className="text-xs text-gray-500">{r.product.itemCode}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        <p>{r.fromLocation?.name || "—"}</p>
                        <p className="text-xs text-gray-500">→ {r.location.name}</p>
                      </td>
                      <td className="px-4 py-3 text-center text-foreground font-medium">{r.quantity}</td>
                      <td className="px-4 py-3 text-gray-400">{r.requestedBy.name}</td>
                      <td className="px-4 py-3 text-gray-400">
                        {r.confirmedBy ? (
                          <>
                            <p>{r.confirmedBy.name}</p>
                            {r.confirmedAt && (
                              <p className="text-xs text-gray-500">{new Date(r.confirmedAt).toLocaleString("es-BO")}</p>
                            )}
                          </>
                        ) : "—"}
                      </td>
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
                          {actions.filter((a) => canPerformAction(a.to, r)).map((action) => {
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
                <label htmlFor="req-origen" className="block text-xs text-gray-400 mb-1.5">Solicitar desde (origen) *</label>
                <select id="req-origen" value={selectedOrigin} onChange={(e) => setSelectedOrigin(e.target.value)}
                  className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8">
                  <option value="">Seleccionar tienda o almacén</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.type === "ALMACEN" ? "Almacén" : "Tienda"})
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-[38px] text-gray-500 pointer-events-none" />
              </div>

              {role === "ADMIN" && (
                <div className="relative">
                  <label htmlFor="req-destino" className="block text-xs text-gray-400 mb-1.5">Tienda que lo necesita *</label>
                  <select id="req-destino" value={selectedLocation} onChange={(e) => setSelectedLocation(e.target.value)}
                    className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8">
                    <option value="">Seleccionar tienda</option>
                    {locations.filter((l) => l.type === "TIENDA").map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-[38px] text-gray-500 pointer-events-none" />
                </div>
              )}

              {role === "TIENDA" && (
                <div className="p-3 bg-dark-900/30 border border-dark-700/30 rounded-xl">
                  <p className="text-xs text-gray-500">La solicitud se enviará a tu tienda</p>
                  <p className="text-sm text-foreground">{locations.find((l) => l.id === user?.locationId)?.name || "Tu tienda"}</p>
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Cantidad *</label>
                <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="1"
                  className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                {selectedProduct?.stockByLocation && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    En toda la cadena hay{" "}
                    <span className="text-gray-300 font-medium">
                      {selectedProduct.stockByLocation.reduce((s, l) => s + (l.stock || 0), 0)}
                    </span>{" "}
                    unidad(es). No se puede pedir más de eso.
                  </p>
                )}
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
                <p className="text-xs text-gray-400">{showHistory.product.itemCode} · Cantidad: {showHistory.quantity}</p>
                <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                  <MapPin size={11} /> {showHistory.fromLocation?.name || "Sin origen"} → {showHistory.location.name}
                </p>
                {showHistory.source && (
                  <p className="text-xs text-gray-500 mt-1">
                    Origen de la solicitud: {SOURCE_CONFIG[showHistory.source]?.label || showHistory.source}
                  </p>
                )}
                {showHistory.despatchNote && (
                  <p className="text-xs text-primary-400 mt-1">
                    Se entrega con la nota de despacho {showHistory.despatchNote.noteNumber} ({showHistory.despatchNote.status}).
                    El stock se mueve al entregar la nota.
                  </p>
                )}
                {showHistory.confirmedBy && (
                  <p className="text-xs text-green-400 mt-1">
                    Confirmada por {showHistory.confirmedBy.name}
                    {showHistory.confirmedAt ? ` el ${new Date(showHistory.confirmedAt).toLocaleString("es-BO")}` : ""}
                  </p>
                )}
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
                <h4 className="text-foreground font-semibold mb-1">¿Quién puede crear solicitudes?</h4>
                <p>Los <strong className="text-green-400">vendedores</strong> y los <strong className="text-blue-400">administradores</strong>. El vendedor pide para su propia tienda; el administrador elige la tienda de destino y de dónde (tienda o almacén) se requiere el producto.</p>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1">¿Cómo se crean?</h4>
                <ul className="ml-1 space-y-1 list-disc list-inside">
                  <li><strong className="text-purple-400">Automáticamente al registrar una venta</strong> cuando el stock de la tienda queda en cero o por debajo del mínimo.</li>
                  <li><strong className="text-cyan-400">Automáticamente cuando el stock de una tienda baja del mínimo</strong> (revisión diaria del inventario).</li>
                  <li><strong>Manualmente</strong> con el botón <em>Nueva Solicitud</em>, buscando el producto igual que en Inventarios.</li>
                </ul>
                <p className="mt-1 text-xs text-gray-500">Si ya hay una solicitud abierta del mismo producto para la misma tienda, no se genera una nueva.</p>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1">Flujo de estados:</h4>
                <div className="space-y-1.5 ml-1">
                  <p className="flex items-center gap-2"><Clock size={14} className="text-yellow-400" /> <strong className="text-yellow-400">Pendiente</strong> — Solicitud creada</p>
                  <p className="flex items-center gap-2"><Package size={14} className="text-blue-400" /> <strong className="text-blue-400">Recibido por Inventario</strong> — Inventario tomó conocimiento</p>
                  <p className="flex items-center gap-2"><Package size={14} className="text-purple-400" /> <strong className="text-purple-400">Preparando</strong> — Armando el pedido</p>
                  <p className="flex items-center gap-2"><Truck size={14} className="text-orange-400" /> <strong className="text-orange-400">Entregado</strong> — Pedido enviado a la tienda</p>
                  <p className="flex items-center gap-2"><CheckCircle size={14} className="text-green-400" /> <strong className="text-green-400">Recibido por Tienda</strong> — <strong>Quien pidió el producto</strong> confirma su llegada</p>
                </div>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1">¿Quién puede cambiar el estado?</h4>
                <p><strong className="text-blue-400">Inventario/Admin:</strong> Recibir, Preparar, Entregar</p>
                <p><strong className="text-green-400">Quien creó la solicitud (o Admin):</strong> Confirmar que el producto llegó a la tienda</p>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1">¿Cuánto tiempo se guarda el registro?</h4>
                <p>El registro se conserva siempre. La lista muestra por defecto los <strong>últimos 30 días</strong>; podés ampliar el rango con el filtro de fechas.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
