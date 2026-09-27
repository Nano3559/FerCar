import { useState, useEffect, useCallback } from "react";
import {
  Search, RotateCcw, RefreshCw, ChevronDown,
  ChevronLeft, ChevronRight, Info, X, Square, CheckSquare, AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../services/api";
import { useDialogBehavior } from "../components/ui/useDialog";
import { saleCode, parseSaleCode } from "../utils/documentCodes";

interface Sale {
  id: number; saleDate: string; total: number; type: string;
  daysOld?: number; returnable?: boolean;
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

  const [selected, setSelected] = useState<number[]>([]);
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
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
  const [vendedores, setVendedores] = useState<{ id: number; name: string; locationId: number | null }[]>([]);

  // El filtro de vendedor se alimenta de las cuentas reales: antes tenia
  // "Vendedor 1/2/3" fijos, que noCoinciden con nadie y no filtraban nada.
  useEffect(() => {
    api.get("/users").then((r) => {
      const users = Array.isArray(r.data) ? r.data : r.data.users || [];
      setVendedores(
        users
          .filter((u: any) => u.role === "TIENDA" || u.role === "ADMIN")
          .map((u: any) => ({ id: u.id, name: u.name, locationId: u.locationId }))
      );
    }).catch(() => {});
  }, []);

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

  const clearReturnForm = () => {
    setSelected([]);
    setReturnQtys({});
    setReason("");
  };

  const searchSaleById = async (id?: string) => {
    const raw = (id || searchId).trim();
    if (!raw) { toast.error("Ingresa el código o ID de la venta"); return; }
    // Acepta el codigo impreso (V-2026-1042), "#1042" o solo el numero.
    const saleId = parseSaleCode(raw);
    if (!saleId) { toast.error("No es un código de venta válido"); return; }
    try {
      setSearching(true);
      clearReturnForm();
      setMethod("EFECTIVO");
      const res = await api.get(`/returns/sale/${saleId}`);
      setSale(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Venta no encontrada");
      setSale(null);
    } finally {
      setSearching(false);
    }
  };

  const returnedFor = (saleData: Sale, productId: number) =>
    (saleData.returns || [])
      .filter((r) => r.productId === productId)
      .reduce((sum, r) => sum + r.quantity, 0);

  const remainingFor = (item: Sale["items"][0]) =>
    item.quantity - returnedFor(sale!, item.productId);

  const canReturn = sale?.returnable !== false;

  const toggleSelect = (productId: number, remaining: number) => {
    if (!canReturn) { toast.error("La venta está fuera del plazo de devolución (10 días)"); return; }
    if (selected.includes(productId)) {
      setSelected((prev) => prev.filter((p) => p !== productId));
      return;
    }
    if (remaining <= 0) { toast.error("Este producto ya fue devuelto completamente"); return; }
    setSelected((prev) => [...prev, productId]);
    setReturnQtys((prev) => ({ ...prev, [productId]: remaining }));
  };

  const selectAll = () => {
    if (!sale || !canReturn) return;
    const toSelect = sale.items.filter((i) => remainingFor(i) > 0);
    if (toSelect.length === 0) { toast.error("Todos los productos ya fueron devueltos"); return; }
    setSelected(toSelect.map((i) => i.productId));
    setReturnQtys((prev) => {
      const next = { ...prev };
      toSelect.forEach((i) => { next[i.productId] = remainingFor(i); });
      return next;
    });
  };

  const clearSelection = () => { setSelected([]); setReturnQtys({}); };

  const setQty = (productId: number, value: number) => {
    const n = Math.max(1, Math.floor(Number(value) || 0));
    setReturnQtys((prev) => ({ ...prev, [productId]: n }));
  };

  const selectedItems = sale ? sale.items.filter((i) => selected.includes(i.productId)) : [];

  const totalReturn = selectedItems.reduce((sum, it) => {
    const qty = Math.min(returnQtys[it.productId] || 0, remainingFor(it));
    return sum + qty * Number(it.unitPrice);
  }, 0);

  const handleReturn = async () => {
    if (!sale) return;
    if (!reason.trim()) { toast.error("Escribe el motivo de la devolución"); return; }
    const items = selectedItems
      .map((it) => ({
        productId: it.productId,
        quantity: Math.min(returnQtys[it.productId] || 1, remainingFor(it)),
      }))
      .filter((i) => i.quantity > 0);
    if (items.length === 0) { toast.error("Selecciona al menos un producto a devolver"); return; }

    try {
      setSaving(true);
      const res = await api.post("/returns", {
        saleId: sale.id,
        reason: reason.trim(),
        method,
        items,
      });
      toast.success(`Devolución registrada (Bs. ${Number(res.data.total || 0).toFixed(2)})`);
      clearReturnForm();
      const refreshed = await api.get(`/returns/sale/${sale.id}`);
      setSale(refreshed.data);
      fetchReturns();
      fetchRecentSales();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al registrar devolución");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Devoluciones</h1>
          <p className="text-gray-400 text-sm mt-1">{retTotal} devoluciones registradas (últimos 30 días)</p>
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
            <p className="text-sm text-gray-400">Ventas recientes · últimos 10 días (selecciona una para devolución rápida)</p>
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
                    <p className="text-sm text-foreground font-medium">{saleCode(rs.id, rs.saleDate)}</p>
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
        <p className="text-sm text-gray-400 mb-3">Buscar venta por código o ID</p>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text" value={searchId} onChange={(e) => setSearchId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchSaleById()}
              placeholder="V-2026-1042 o 1042..."
              aria-label="Buscar venta por codigo o ID"
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

      {/* Detalle de venta + Selección de productos */}
      {sale && (
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-foreground font-semibold">Venta {saleCode(sale.id, sale.saleDate)}</h3>
              <p className="text-gray-400 text-sm">{new Date(sale.saleDate).toLocaleDateString("es-BO")} · {sale.location.name} · {sale.type}</p>
              <p className={`text-xs mt-1 ${canReturn ? "text-emerald-400" : "text-red-400"}`}>
                {canReturn
                  ? `Dentro del plazo · ${sale.daysOld ?? 0} día(s) desde la venta`
                  : `Fuera de plazo · ${sale.daysOld ?? "—"} día(s) desde la venta (máximo 10)`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-foreground font-semibold">{formatBs(Number(sale.total))}</p>
              {sale.customer && <p className="text-gray-400 text-xs">{sale.customer.name}</p>}
            </div>
          </div>

          {!canReturn && (
            <div className="flex items-start gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>Solo se pueden devolver ventas dentro de los últimos 10 días. Esta venta ya no puede devolverse.</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Selecciona los productos a devolver (todos o algunos)</p>
            <div className="flex items-center gap-2">
              <button onClick={selectAll} disabled={!canReturn}
                className="text-xs px-3 py-1.5 rounded-lg bg-primary-600/10 border border-primary-600/25 text-primary-400 hover:bg-primary-600 hover:text-white transition-all disabled:opacity-40">
                Devolver todos
              </button>
              {selected.length > 0 && (
                <button onClick={clearSelection}
                  className="text-xs px-3 py-1.5 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground transition-all">
                  Quitar todos
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {sale.items.map((item) => {
              const returned = returnedFor(sale, item.productId);
              const remaining = item.quantity - returned;
              const isSelected = selected.includes(item.productId);
              const qty = isSelected ? returnQtys[item.productId] || remaining : 0;
              return (
                <div key={item.id}
                  className={`flex flex-wrap items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${isSelected ? "bg-primary-600/10 border-primary-600/40" : remaining > 0 ? "bg-dark-900/50 border-dark-700/30 hover:border-dark-600" : "bg-dark-900/30 border-dark-700/20 opacity-50 cursor-not-allowed"}`}
                  onClick={() => remaining > 0 && toggleSelect(item.productId, remaining)}>
                  <span className={`shrink-0 p-1 rounded-md border ${isSelected ? "bg-primary-600 text-white border-primary-600" : "border-dark-600 text-gray-600 hover:text-white"}`}>
                    {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground font-medium truncate">{item.product.name}</p>
                    <p className="text-xs text-gray-500">{item.product.itemCode} · {item.product.brand} · {item.quantity} vendidos{returned > 0 && <span className="text-yellow-400"> · {returned} devueltos</span>}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm text-green-400">{formatBs(Number(item.unitPrice))}</p>
                    {remaining <= 0 && <p className="text-xs text-red-400">Devuelto</p>}
                  </div>
                  {isSelected && (
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <div>
                        <label className="block text-[10px] text-gray-500 uppercase">Cantidad</label>
                        <input type="number" min={1} max={remaining} value={qty}
                          onChange={(e) => setQty(item.productId, Number(e.target.value))}
                          className="w-20 px-2 py-1.5 bg-dark-900/50 border border-dark-600/50 rounded-lg text-foreground text-sm text-center focus:ring-2 focus:ring-primary-500 outline-none" />
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-gray-500 uppercase">Subtotal</p>
                        <p className="text-sm text-emerald-400 font-medium min-w-[90px]">
                          {formatBs(Math.min(qty, remaining) * Number(item.unitPrice))}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Formulario de devolución (lote) */}
          {selectedItems.length > 0 && (
            <div className="mt-4 pt-4 border-t border-dark-700/50 space-y-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                Devolución de {selectedItems.length} producto(s)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Método *</label>
                  <div className="relative">
                    <select value={method} onChange={(e) => setMethod(e.target.value)}
                      className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8">
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="QR">QR</option>
                      <option value="TRANSFERENCIA">Transferencia</option>
                      <option value="CREDITO">Crédito</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>
                </div>
                <div className="flex items-end justify-end">
                  <div className="text-right w-full">
                    <p className="text-[10px] text-gray-500 uppercase">Total a devolver</p>
                    <p className="text-2xl font-bold text-red-400">{formatBs(totalReturn)}</p>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Motivo de devolución *</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Describe el motivo de la devolución..."
                  className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none placeholder-gray-600 resize-none" />
              </div>
              <div className="flex justify-end">
                <button onClick={handleReturn} disabled={saving}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                  <RotateCcw size={16} /> {saving ? "Procesando..." : `Devolver ${selectedItems.length} producto(s)`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Historial de devoluciones */}
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-700/50 flex items-center justify-between gap-3">
          <h3 className="text-foreground font-semibold">Historial de Devoluciones <span className="text-xs text-gray-500 font-normal">(últimos 30 días)</span></h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select value={retSeller} onChange={(e) => { setRetSeller(e.target.value); setRetPage(1); }}
                aria-label="Filtrar por vendedor"
                className="appearance-none px-3 py-1.5 bg-dark-900/50 border border-dark-600/50 rounded-lg text-foreground text-xs focus:ring-2 focus:ring-primary-500 outline-none pr-6">
                <option value="">Todos los vendedores</option>
                {vendedores.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
            {retSeller && (
              <button onClick={() => { setRetSeller(""); setRetPage(1); }}
                title="Quitar filtro"
                className="text-gray-500 hover:text-gray-300 transition-colors">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        {loadingReturns ? (
          <div className="flex items-center justify-center h-48">
            <RefreshCw size={24} className="text-primary-400 animate-spin" />
          </div>
        ) : returns.length === 0 ? (
          <div className="p-6 text-center">
            <RotateCcw size={40} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Sin devoluciones registradas en los últimos 30 días</p>
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
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { setSearchId(saleCode(r.saleId, r.sale?.saleDate)); searchSaleById(saleCode(r.saleId, r.sale?.saleDate)); }}
                        title="Abrir esta venta"
                        className="text-primary-400 hover:text-primary-300 hover:underline font-mono text-xs transition-colors"
                      >
                        {saleCode(r.saleId, r.sale?.saleDate)}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{r.sale?.seller || "—"}</td>
                    <td className="px-4 py-3 text-center text-yellow-400 font-medium">{r.quantity}</td>
                    <td className="px-4 py-3 text-right text-red-400 font-medium">{formatBs(Number(r.amount))}</td>
                    <td className="px-4 py-3 text-gray-300">{r.method}</td>
                    <td className="px-4 py-3 text-gray-400 max-w-[200px] truncate" title={r.reason}>{r.reason}</td>
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
                  <li>Busca la venta original por su <strong>número de ID</strong> o selecciona una <strong>venta reciente</strong>.</li>
                  <li>Marca los productos que el cliente devuelve: <strong>todos o solo algunos</strong>.</li>
                  <li>Ajusta la <strong>cantidad</strong> por producto y elige el <strong>método</strong> de devolución (efectivo, QR, etc.).</li>
                  <li>Escribe el <strong>motivo</strong> de la devolución.</li>
                  <li>Presiona <strong>"Devolver"</strong> y listo.</li>
                </ol>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1">Plazo de devolución</h4>
                <p>Solo se pueden devolver ventas dentro de los <strong>primeros 10 días</strong>. Las ventas de más de 10 días aparecen marcadas y no se pueden devolver.</p>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1">¿Cuánto tiempo se guarda el registro?</h4>
                <p>Las devoluciones se conservan en el historial por <strong>30 días</strong>.</p>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1">¿Puedo devolver todo?</h4>
                <p>Puedes devolver todos los productos de una venta de una sola vez con el botón <strong>"Devolver todos"</strong> o marcar solo algunos. Lo ya devuelto no se puede devolver dos veces.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}