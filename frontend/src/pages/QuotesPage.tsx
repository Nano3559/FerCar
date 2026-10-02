import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Printer, Ban, FileText, X, Eye, AlertTriangle, ShoppingCart } from "lucide-react";
import toast from "react-hot-toast";
import api from "../services/api";
import { useAuthStore } from "../stores/authStore";
import { downloadElementAsPdf } from "../utils/quotePdf";
import QuoteDocument from "../components/quotes/QuoteDocument";

const PAGE_SIZE = 15;

/** Una cotizacion departamental tiene que caer en el carrito de ventas
 *  departamentales: no en el de ventas locales, que es otra pantalla con sus
 *  propias reglas de cliente. El resto va a ventas. */
const salesRouteFor = (type: string) => (type === "DEPARTAMENTAL" ? "/ventas-departamental" : "/ventas");

interface QuoteSummary {
  id: number;
  code: string;
  clientName: string | null;
  status: string;
  total: number;
  itemCount: number;
  seller: string;
  storeName: string | null;
  saleDate: string;
  saleId: number | null;
  type: string;
}

interface QuoteDetail extends QuoteSummary {
  note: string | null;
  type: string;
  customerPhone: string | null;
  items: {
    productId: number;
    itemCode: string;
    name: string;
    brand: string | null;
    quantity: number;
    unitPrice: number;
    priceTier: number | null;
  }[];
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  PENDIENTE: { label: "Pendiente", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  CONVERTIDA: { label: "Convertida en venta", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  ANULADA: { label: "Anulada", cls: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
};

const isSaleTypeLabel = (t: string) =>
  t === "MAYORISTA" ? "Venta por Mayor" : t === "DEPARTAMENTAL" ? "Venta Departamental" : "Venta";

export default function QuotesPage() {
  const user = useAuthStore((s) => s.user);
  const isTienda = user?.role === "TIENDA";
  const navigate = useNavigate();
  const [openingCart, setOpeningCart] = useState<number | null>(null);

  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [store, setStore] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [detail, setDetail] = useState<QuoteDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [annulling, setAnnulling] = useState(false);
  const [confirmAnnul, setConfirmAnnul] = useState<QuoteSummary | null>(null);
  const [printing, setPrinting] = useState(false);
  const [locations, setLocations] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (!isTienda) {
      api.get("/locations")
        .then((r) => setLocations((r.data.locations || r.data || []).filter((l: any) => l.type === "TIENDA")))
        .catch(() => setLocations([]));
    }
  }, [isTienda]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (store) params.set("store", store);
      const res = await api.get(`/quotes?${params.toString()}`);
      setQuotes(res.data.quotes ?? []);
      setPages(res.data.pagination?.pages ?? 1);
      setTotal(res.data.pagination?.total ?? 0);
    } catch {
      toast.error("Error al cargar las cotizaciones");
    } finally {
      setLoading(false);
    }
  }, [page, q, status, from, to, store]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await api.get(`/quotes/${id}`);
      setDetail(res.data.quote);
    } catch (e: any) {
      toast.error(e.response?.data?.message || "No se pudo abrir la cotización");
    } finally {
      setDetailLoading(false);
    }
  };

  const annul = async () => {
    if (!confirmAnnul) return;
    setAnnulling(true);
    try {
      await api.patch(`/quotes/${confirmAnnul.id}`, { status: "ANULADA" });
      toast.success(`Cotización ${confirmAnnul.code} anulada`);
      setConfirmAnnul(null);
      setDetail(null);
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "No se pudo anular la cotización");
    } finally {
      setAnnulling(false);
    }
  };

  /** Reimprime una cotizacion vieja con los datos tal como quedaron guardados. */
  const reprint = async (qt: QuoteDetail) => {
    setPrinting(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      await downloadElementAsPdf("quote-print-doc", `cotizacion-${qt.code}.pdf`);
      toast.success(`Cotización ${qt.code} reimpresa`);
    } catch {
      toast.error("No se pudo reimprimir la cotización");
    } finally {
      setPrinting(false);
    }
  };

  /**
   * Lleva la cotizacion al carrito de Ventas. Solo se pasa el id: la pantalla
   * de ventas pide las lineas al backend para traer precios y stock de hoy, en
   * vez de confiar en lo que quedo guardado cuando se cotizo.
   */
  const loadIntoCart = (qt: { id: number; type: string }) => {
    setOpeningCart(qt.id);
    navigate(salesRouteFor(qt.type), { state: { quoteId: qt.id } });
  };

  const clearFilters = () => {
    setQ(""); setStatus(""); setFrom(""); setTo(""); setStore(""); setPage(1);
  };

  const filtersActive = Boolean(q || status || from || to || store);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText size={22} className="text-primary-500" /> Cotizaciones
          </h1>
          <p className="text-sm text-gray-400">
            Historial de cotizaciones emitidas. Cada una tiene su código, se puede reimprimir tal como salió y se
            puede cargar en el carrito de ventas sin volver a elegir los productos.
          </p>
        </div>
        <p className="text-sm text-gray-400">{total} cotización{total === 1 ? "" : "es"}</p>
      </header>

      {/* Filtros */}
      <div className="bg-dark-800/60 border border-dark-600/50 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2">
            <label className="block text-xs text-gray-400 mb-1" htmlFor="q-search">Código o cliente</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true" />
              <input
                id="q-search" type="search" value={q} placeholder="COT-2026-0007 o el nombre del cliente"
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                className="w-full bg-dark-900/50 border border-dark-600/50 rounded-lg pl-9 pr-3 py-2 text-sm text-foreground focus:border-primary-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor="q-status">Estado</label>
            <select id="q-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="w-full bg-dark-900/50 border border-dark-600/50 rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary-500 outline-none">
              <option value="">Todos</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="CONVERTIDA">Convertida en venta</option>
              <option value="ANULADA">Anulada</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor="q-from">Desde</label>
            <input id="q-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }}
              className="w-full bg-dark-900/50 border border-dark-600/50 rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor="q-to">Hasta</label>
            <input id="q-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }}
              className="w-full bg-dark-900/50 border border-dark-600/50 rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary-500 outline-none" />
          </div>
          {!isTienda && locations.length > 0 && (
            <div>
              <label className="block text-xs text-gray-400 mb-1" htmlFor="q-store">Tienda</label>
              <select id="q-store" value={store} onChange={(e) => { setStore(e.target.value); setPage(1); }}
                className="w-full bg-dark-900/50 border border-dark-600/50 rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary-500 outline-none">
                <option value="">Todas</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-500">
            {filtersActive ? "Filtros aplicados" : "Sin filtros: se muestran las últimas 90 días"}
          </p>
          {filtersActive && (
            <button onClick={clearFilters} className="text-xs text-primary-400 hover:text-primary-300 transition-colors">
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-dark-800/60 border border-dark-600/50 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Cargando cotizaciones...</div>
        ) : quotes.length === 0 ? (
          <div className="p-10 text-center">
            <FileText size={32} className="mx-auto text-gray-600 mb-3" aria-hidden="true" />
            <p className="text-foreground font-medium">Todavía no hay cotizaciones</p>
            <p className="text-gray-500 text-sm mt-1">
              Las cotizaciones se guardan solas al imprimirlas desde el carrito de Ventas. Después puedes
              cargarlas de vuelta al carrito para convertirlas en venta.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-900/60">
                <tr>
                  {["Código", "Cliente", "Tienda", "Fecha", "Ítems", "Total", "Estado", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotes.map((qt) => {
                  const st = STATUS_STYLE[qt.status] ?? STATUS_STYLE.PENDIENTE;
                  return (
                    <tr key={qt.id} className="border-t border-dark-600/40 hover:bg-dark-700/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-amber-400 whitespace-nowrap">{qt.code}</td>
                      <td className="px-4 py-3 text-foreground max-w-[220px] truncate">{qt.clientName || "—"}</td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{qt.storeName || "—"}</td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{new Date(qt.saleDate).toLocaleDateString("es-BO")}</td>
                      <td className="px-4 py-3 text-gray-400 text-center">{qt.itemCount}</td>
                      <td className="px-4 py-3 text-foreground font-medium whitespace-nowrap">
                        Bs. {Number(qt.total).toLocaleString("es-BO", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${st.cls}`}>
                          {st.label}
                        </span>
                        {qt.saleId && <p className="text-[11px] text-gray-500 mt-0.5">Venta #{qt.saleId}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => openDetail(qt.id)} title="Ver detalle"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-foreground hover:bg-dark-600/50 transition-colors">
                            <Eye size={15} />
                            <span className="sr-only">Ver detalle de la cotización {qt.code}</span>
                          </button>
                          {qt.status === "PENDIENTE" && (
                            <>
                              <button onClick={() => loadIntoCart(qt)} title="Cargar en el carrito de ventas"
                                disabled={openingCart === qt.id}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-primary-400 hover:bg-primary-500/10 transition-colors disabled:opacity-50">
                                <ShoppingCart size={15} />
                                <span className="sr-only">Cargar la cotización {qt.code} en el carrito de ventas</span>
                              </button>
                              <button onClick={() => setConfirmAnnul(qt)} title="Anular"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                <Ban size={15} />
                                <span className="sr-only">Anular la cotización {qt.code}</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginación */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-sm bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground disabled:opacity-40 transition-all">
            Anterior
          </button>
          <span className="text-sm text-gray-400">Página {page} de {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
            className="px-3 py-1.5 rounded-lg text-sm bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground disabled:opacity-40 transition-all">
            Siguiente
          </button>
        </div>
      )}

      {/* Detalle */}
      {detailLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="text-gray-400 text-sm">Cargando cotización...</div>
        </div>
      )}

      {detail && !detailLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-label={`Cotización ${detail.code}`}>
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-dark-800 border border-dark-600/60 rounded-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 bg-dark-800 border-b border-dark-600/50">
              <div>
                <h2 className="text-lg font-semibold text-foreground font-mono">{detail.code}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isSaleTypeLabel(detail.type)} · {new Date(detail.saleDate).toLocaleDateString("es-BO")}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-foreground hover:bg-dark-600/50 transition-colors">
                <X size={18} />
                <span className="sr-only">Cerrar</span>
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-dark-900/50 border border-dark-600/40 rounded-lg px-3 py-2">
                  <p className="text-[11px] text-gray-500">Tienda</p>
                  <p className="text-sm text-foreground font-medium">{detail.storeName || "—"}</p>
                </div>
                <div className="bg-dark-900/50 border border-dark-600/40 rounded-lg px-3 py-2">
                  <p className="text-[11px] text-gray-500">Vendedor</p>
                  <p className="text-sm text-foreground font-medium">{detail.seller}</p>
                </div>
                <div className="bg-dark-900/50 border border-dark-600/40 rounded-lg px-3 py-2">
                  <p className="text-[11px] text-gray-500">Cliente</p>
                  <p className="text-sm text-foreground font-medium truncate">{detail.clientName || "—"}</p>
                </div>
                <div className="bg-dark-900/50 border border-dark-600/40 rounded-lg px-3 py-2">
                  <p className="text-[11px] text-gray-500">Total cotizado</p>
                  <p className="text-sm text-amber-400 font-bold">
                    Bs. {Number(detail.total).toLocaleString("es-BO", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {detail.customerPhone && (
                <p className="text-xs text-gray-400">Teléfono: {detail.customerPhone}</p>
              )}

              <div className="overflow-x-auto border border-dark-600/40 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-dark-900/60">
                    <tr>
                      {["Código", "Producto", "Cant.", "P. unitario", "Subtotal"].map((h) => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-400 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((it, i) => (
                      <tr key={`${it.productId}-${i}`} className="border-t border-dark-600/30">
                        <td className="px-3 py-2 text-gray-400 font-mono text-xs">{it.itemCode}</td>
                        <td className="px-3 py-2 text-foreground">
                          {it.name}
                          <span className="text-gray-500 text-xs"> · {it.brand || "—"}</span>
                          {it.priceTier && <span className="text-[11px] text-gray-500"> · P{it.priceTier}</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-300 text-center">{it.quantity}</td>
                        <td className="px-3 py-2 text-gray-300 whitespace-nowrap">
                          Bs. {Number(it.unitPrice).toLocaleString("es-BO", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-foreground font-medium whitespace-nowrap">
                          Bs. {(Number(it.unitPrice) * it.quantity).toLocaleString("es-BO", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {detail.note && (
                <p className="text-xs text-gray-400 border-l-2 border-dark-600 pl-3">{detail.note}</p>
              )}
            </div>

            <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 px-5 py-4 bg-dark-800 border-t border-dark-600/50">
              {detail.status === "PENDIENTE" && (
                <>
                  <button onClick={() => setConfirmAnnul(detail)} disabled={printing}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-red-600/20 text-red-300 border border-red-500/40 hover:bg-red-600/30 transition-all disabled:opacity-50">
                    <Ban size={15} /> Anular
                  </button>
                  <button onClick={() => loadIntoCart(detail)} disabled={printing || openingCart === detail.id}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 transition-all disabled:opacity-50">
                    <ShoppingCart size={15} /> Cargar en el carrito
                  </button>
                </>
              )}
              <button onClick={() => reprint(detail)} disabled={printing}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition-all disabled:opacity-50">
                <Printer size={15} /> {printing ? "Imprimiendo..." : "Reimprimir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación de anulación */}
      {confirmAnnul && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70" role="dialog" aria-modal="true" aria-label="Confirmar anulación">
          <div className="w-full max-w-md bg-dark-800 border border-dark-600/60 rounded-2xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h3 className="text-foreground font-semibold">Anular la cotización {confirmAnnul.code}?</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Deja de estar disponible para reimprimir y para vincularse a una venta. No se borra: queda en el
                  historial como anulada.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmAnnul(null)} disabled={annulling}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-dark-900/50 border border-dark-600/50 text-gray-300 hover:text-foreground transition-all disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={annul} disabled={annulling}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-all disabled:opacity-50">
                {annulling ? "Anulando..." : "Sí, anular"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Documento para reimprimir (oculto, capturado por html2canvas) */}
      {detail && !detailLoading && (
        <QuoteDocument
          id="quote-print-doc"
          code={detail.code}
          copyOf={detail.code}
          date={new Date(detail.saleDate)}
          title={isSaleTypeLabel(detail.type)}
          storeName={detail.storeName || ""}
          sellerName={detail.seller}
          clientName={detail.clientName}
          items={detail.items.map((it) => ({
            itemCode: it.itemCode,
            name: it.name,
            brand: it.brand,
            quantity: it.quantity,
            unitPrice: Number(it.unitPrice),
            priceTier: it.priceTier,
          }))}
          total={Number(detail.total)}
        />
      )}
    </div>
  );
}
