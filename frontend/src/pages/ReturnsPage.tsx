import { useState, useEffect, useCallback } from "react";
import {
  Search, RotateCcw, RefreshCw, ChevronDown,
  ChevronLeft, ChevronRight, Info, X,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../services/api";
import { useDialogBehavior } from "../components/ui/useDialog";

interface Sale {
  id: number; saleDate: string; total: number; type: string;
  location: { id: number; name: string };
  customer: { id: number; name: string; nit: string | null } | null;
  seller: string | null;
  items: {
    id: number; productId: number; quantity: number; unitPrice: number; subtotal: number;
    product: { id: number; name: string; itemCode: string; brand: string; price1: string };
  }[];
  payments: { id: number; method: string; amount: number }[];
  returns: { id: number; quantity: number; productId: number }[];
}

interface ReturnRecord {
  id: number; saleId: number; productId: number; reason: string;
  quantity: number; amount: number; method: string; date: string;
  product: { id: number; name: string; itemCode: string; brand: string };
  sale: { id: number; saleDate: string; total: number; type: string; locationId: number; seller: string | null };
}

interface RecentSale {
  id: number; saleDate: string; total: number; type: string;
  location: { id: number; name: string };
  customer: { id: number; name: string; nit: string | null } | null;
  items: { id: number; productId: number; quantity: number; unitPrice: number; subtotal: number;
    product: { id: number; name: string; itemCode: string; brand: string; price1: string } }[];
  payments: { id: number; method: string; amount: number }[];
  returns: { id: number; quantity: number; productId: number }[];
  seller: string | null;
}

const PAGE_SIZE = 15;

export default function ReturnsPage() {
  const [searchId, setSearchId] = useState("");
  const [sale, setSale] = useState<Sale | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState<number | null>(null);

  const [reason, setReason] = useState("");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("EFECTIVO");
  const [saving, setSaving] = useState(false);

  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [loadingReturns, setLoadingReturns] = useState(true);
  const [retPage, setRetPage] = useState(1);
  const [retPages, setRetPages] = useState(1);
  const [retTotal, setRetTotal] = useState(0);
  const [showInfo, setShowInfo] = useState(false);

  const infoPanelRef = useDialogBehavior(showInfo, () => setShowInfo(false));

  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [showRecentSales, setShowRecentSales] = useState(true);
  const [retSeller, setRetSeller] = useState("");

  const formatBs = (v: number) =>
    `Bs. ${v.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fetchReturns = useCallback(async () => {
    try {
      setLoadingReturns(true);
      const params = new URLSearchParams({ page: String(retPage), limit: String(PAGE_SIZE) });
      if (retSeller) params.set("seller", retSeller);
      const res = await api.get(`/returns?${params.toString()}`);
      setReturns(res.data.returns);
      setRetTotal(res.data.pagination.total);
      setRetPages(res.data.pagination.pages);
    } catch {
      toast.error("Error al cargar devoluciones");
    } finally {
      setLoadingReturns(false);
    }
  }, [retPage, retSeller]);

  const fetchRecentSales = useCallback(async () => {
    try {
      setLoadingRecent(true);
      const res = await api.get("/returns/recent-sales");
      setRecentSales(res.data.sales);
    } catch {
      toast.error("Error al cargar ventas recientes");
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => { fetchReturns(); }, [fetchReturns]);
  useEffect(() => { fetchRecentSales(); }, [fetchRecentSales]);

  const searchSaleById = async (id?: string) => {
    const searchIdVal = id || searchId;
    if (!searchIdVal.trim()) { toast.error("Ingresa un ID de venta"); return; }
    try {
      setSearching(true);
      setSelectedItem(null);
      setReason(""); setQuantity(""); setAmount(""); setMethod("EFECTIVO");
      const res = await api.get(`/returns/sale/${searchIdVal.trim()}`);
      setSale(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Venta no encontrada");
      setSale(null);
    } finally {
      setSearching(false);
    }
  };

  const selectItem = (item: Sale["items"][0]) => {
    const alreadyReturned = (sale?.returns || [])
      .filter((r) => r.productId === item.productId)
      .reduce((sum, r) => sum + r.quantity, 0);
    const maxQty = item.quantity - alreadyReturned;
    if (maxQty <= 0) {
      toast.error("Este producto ya fue devuelto completamente");
      return;
    }
    setSelectedItem(item.productId);
    setQuantity(String(maxQty));
    setAmount(String(Number(item.unitPrice) * maxQty));
  };

  const handleReturn = async () => {
    if (!sale || !selectedItem || !reason || !quantity || !amount) {
      toast.error("Completa todos los campos");
      return;
    }
    const qty = Number(quantity);
    const amt = Number(amount);
    if (qty <= 0 || amt <= 0) { toast.error("Cantidad y monto deben ser mayores a 0"); return; }

    try {
      setSaving(true);
      await api.post("/returns", {
        saleId: sale.id,
        productId: selectedItem,
        reason,
        quantity: qty,
        amount: amt,
        method,
      });
      toast.success("Devolución registrada");
      setSelectedItem(null);
      setReason(""); setQuantity(""); setAmount(""); setMethod("EFECTIVO");
      const res = await api.get(`/returns/sale/${sale.id}`);
      setSale(res.data);
      fetchReturns();
      fetchRecentSales();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al registrar devolución");
    } finally {
      setSaving(false);
    }
  };

  const getReturnedQty = (saleData: Sale, productId: number) => {
    return (saleData.returns || [])
      .filter((r) => r.productId === productId)
      .reduce((sum, r) => sum + r.quantity, 0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Devoluciones</h1>
          <p className="text-gray-400 text-sm mt-1">{retTotal} devoluciones registradas</p>
        </div>
        <div className="flex items-center gap-3 self-start">
          <button onClick={() => setShowInfo(true)} className="p-2.5 bg-dark-800 border border-dark-700/50 rounded-xl text-gray-400 hover:text-blue-400 hover:border-blue-500/30 transition-all" title="¿Cómo funciona?">
            <Info size={18} />
          </button>
          <button onClick={fetchReturns} className="p-2.5 bg-dark-800 border border-dark-700/50 rounded-xl text-gray-400 hover:text-foreground hover:border-primary-600/50 transition-all" title="Actualizar">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Recent sales for quick selection */}
      {!sale && showRecentSales && recentSales.length > 0 && (
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-400">Ventas recientes (selecciona una para devolución rápida)</p>
            <button onClick={() => setShowRecentSales(false)} className="text-xs text-gray-500 hover:text-gray-300">
              <X size={14} />
            </button>
          </div>
          {loadingRecent ? (
            <div className="flex items-center justify-center h-16">
              <RefreshCw size={16} className="text-primary-400 animate-spin" />
            </div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {recentSales.map((rs) => (
                <button
                  key={rs.id}
                  onClick={() => { setSearchId(String(rs.id)); searchSaleById(String(rs.id)); setShowRecentSales(false); }}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-dark-900/50 border border-dark-700/30 rounded-xl hover:border-primary-500/30 hover:bg-dark-800/50 transition-all text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground font-medium">Venta #{rs.id}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(rs.saleDate).toLocaleDateString("es-BO")} · {rs.location.name}
                      {rs.seller && <span className="ml-1 text-primary-400">· {rs.seller}</span>}
                    </p>
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <p className="text-sm text-green-400 font-medium">Bs. {Number(rs.total).toFixed(2)}</p>
                    <p className="text-xs text-gray-500">{rs.items.length} producto(s)</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Buscar venta */}
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-4">
        <p className="text-sm text-gray-400 mb-3">Buscar venta por ID</p>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="number" value={searchId} onChange={(e) => setSearchId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchSaleById()}
              placeholder="ID de la venta..."
              aria-label="Buscar venta por ID"
              className="w-full pl-10 pr-4 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground placeholder-gray-500 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
            />
          </div>
          <button onClick={() => searchSaleById()} disabled={searching}
            className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 disabled:opacity-50">
            {searching ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
            Buscar
          </button>
        </div>
      </div>

      {/* Detalle de venta + Selección de producto */}
      {sale && (
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-foreground font-semibold">Venta #{sale.id}</h3>
              <p className="text-gray-400 text-sm">{new Date(sale.saleDate).toLocaleDateString("es-BO")} · {sale.location.name} · {sale.type}</p>
            </div>
            <div className="text-right">
              <p className="text-foreground font-semibold">{formatBs(Number(sale.total))}</p>
              {sale.customer && <p className="text-gray-400 text-xs">{sale.customer.name}</p>}
            </div>
          </div>

          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Selecciona producto a devolver</p>
          <div className="space-y-2">
            {sale.items.map((item) => {
              const returned = getReturnedQty(sale, item.productId);
              const maxQty = item.quantity - returned;
              return (
                <div key={item.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${selectedItem === item.productId ? "bg-primary-600/10 border-primary-600/30" : "bg-dark-900/50 border-dark-700/30 hover:border-dark-600"}`}
                  onClick={() => maxQty > 0 && selectItem(item)}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground font-medium truncate">{item.product.name}</p>
                    <p className="text-xs text-gray-500">{item.product.itemCode} · {item.product.brand} · {item.quantity} vendidos</p>
                  </div>
                  <div className="text-right ml-3">
                    <p className="text-sm text-green-400">{formatBs(Number(item.unitPrice))}</p>
                    {returned > 0 && <p className="text-xs text-yellow-400">{returned} devueltos</p>}
                    {maxQty <= 0 && <p className="text-xs text-red-400">Devuelto</p>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Formulario de devolución */}
          {selectedItem && (
            <div className="mt-4 pt-4 border-t border-dark-700/50 space-y-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Datos de la devolución</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Cantidad *</label>
                  <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="1"
                    className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Monto (Bs.) *</label>
                  <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min="0" step="0.01"
                    className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
                <div className="relative">
                  <label className="block text-xs text-gray-400 mb-1">Método *</label>
                  <select value={method} onChange={(e) => setMethod(e.target.value)}
                    className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8">
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="QR">QR</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="CREDITO">Crédito</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-[38px] text-gray-500 pointer-events-none" />
                </div>
                <div className="flex items-end">
                  <button onClick={handleReturn} disabled={saving}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                    <RotateCcw size={16} /> {saving ? "Procesando..." : "Devolver"}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Motivo *</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Describe el motivo de la devolución..."
                  className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none placeholder-gray-600 resize-none" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Historial de devoluciones */}
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-700/50 flex items-center justify-between">
          <h3 className="text-foreground font-semibold">Historial de Devoluciones</h3>
          <div className="relative">
            <select value={retSeller} onChange={(e) => setRetSeller(e.target.value)}
              className="appearance-none px-3 py-1.5 bg-dark-900/50 border border-dark-600/50 rounded-lg text-foreground text-xs focus:ring-2 focus:ring-primary-500 outline-none pr-6">
              <option value="">Todos los vendedores</option>
              <option value="Vendedor 1">Vendedor 1</option>
              <option value="Vendedor 2">Vendedor 2</option>
              <option value="Vendedor 3">Vendedor 3</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
        </div>
        {loadingReturns ? (
          <div className="flex items-center justify-center h-48">
            <RefreshCw size={24} className="text-primary-400 animate-spin" />
          </div>
        ) : returns.length === 0 ? (
          <div className="p-6 text-center">
            <RotateCcw size={40} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Sin devoluciones registradas</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-dark-700/50">
                  <th className="text-left px-4 py-3 font-medium">ID</th>
                  <th className="text-left px-4 py-3 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium">Producto</th>
                  <th className="text-left px-4 py-3 font-medium">Venta</th>
                  <th className="text-left px-4 py-3 font-medium">Vendedor</th>
                  <th className="text-center px-4 py-3 font-medium">Cantidad</th>
                  <th className="text-right px-4 py-3 font-medium">Monto</th>
                  <th className="text-left px-4 py-3 font-medium">Método</th>
                  <th className="text-left px-4 py-3 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r) => (
                  <tr key={r.id} className="border-b border-dark-700/30 last:border-0 hover:bg-dark-900/30 transition-colors">
                    <td className="px-4 py-3 text-gray-400">{r.id}</td>
                    <td className="px-4 py-3 text-gray-300">{new Date(r.date).toLocaleDateString("es-BO")}</td>
                    <td className="px-4 py-3 text-foreground">{r.product.name}</td>
                    <td className="px-4 py-3 text-gray-400">#{r.saleId}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{r.sale?.seller || "—"}</td>
                    <td className="px-4 py-3 text-center text-yellow-400 font-medium">{r.quantity}</td>
                    <td className="px-4 py-3 text-right text-red-400 font-medium">{formatBs(Number(r.amount))}</td>
                    <td className="px-4 py-3 text-gray-300">{r.method}</td>
                    <td className="px-4 py-3 text-gray-400 max-w-[200px] truncate">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {retPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700/50">
            <p className="text-gray-400 text-sm">Página {retPage} de {retPages}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setRetPage((p) => Math.max(1, p - 1))} disabled={retPage === 1}
                className="p-2 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground disabled:opacity-30 transition-all">
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(5, retPages) }, (_, i) => {
                const start = Math.max(1, Math.min(retPage - 2, retPages - 4));
                const p = start + i;
                if (p > retPages) return null;
                return (
                  <button key={p} onClick={() => setRetPage(p)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${p === retPage ? "bg-primary-600 text-white" : "bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground"}`}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => setRetPage((p) => Math.min(retPages, p + 1))} disabled={retPage === retPages}
                className="p-2 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground disabled:opacity-30 transition-all">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Info */}
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
                <p>Cuando un cliente devuelve un producto, desde aquí se registra para que el stock se actualice automáticamente.</p>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1">¿Cómo registrar una devolución?</h4>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                  <li>Busca la venta original por su <strong>número de ID</strong>.</li>
                  <li>Selecciona el producto que el cliente devuelve.</li>
                  <li>Indica la <strong>cantidad</strong>, el <strong>monto</strong> a devolver y el <strong>método</strong> de devolución (efectivo, QR, etc.).</li>
                  <li>Escribe el <strong>motivo</strong> de la devolución.</li>
                  <li>Presiona <strong>"Devolver"</strong> y listo.</li>
                </ol>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1">¿Qué pasa después?</h4>
                <p>El producto vuelve al stock de la tienda automáticamente. En el historial de abajo puedes ver todas las devoluciones registradas.</p>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1">¿Puedo devolver todo?</h4>
                <p>Solo se puede devolver lo que aún no fue devuelto. Si un producto ya fue devuelto completamente, aparece marcado y no se puede seleccionar de nuevo.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
