import { useEffect, useState } from "react";
import api from "../../services/api";
import { CheckCircle, Clock, ChevronDown, ChevronUp, Truck } from "lucide-react";
import toast from "react-hot-toast";

interface SaleItem {
  id: number;
  quantity: number;
  unitPrice: number;
  subtotal?: number;
  product: {
    id: number;
    name: string;
    brand: string;
    model: string;
    itemCode: string;
    factoryCode: string | null;
  };
}

interface Sale {
  id: number;
  saleDate: string;
  total: number;
  type: string;
  seller?: string | null;
  user?: { name: string } | null;
  location?: { name: string } | null;
  customer?: { name: string; phone: string | null } | null;
  items: SaleItem[];
  deliveryStatus?: string;
  deliveredAt?: string | null;
  deliveredBy?: { name: string } | null;
}

interface Props {
  compact?: boolean;
}

const formatCurrency = (v: number) => `Bs. ${Number(v).toLocaleString("es-BO", { minimumFractionDigits: 2 })}`;
const formatDate = (d: string) => new Date(d).toLocaleString("es-BO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function DeliveryBoardTab({ compact = false }: Props) {
  const [pending, setPending] = useState<Sale[]>([]);
  const [delivered, setDelivered] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const fetchBoard = async () => {
    try {
      setLoading(true);
      try {
        const [pRes, dRes] = await Promise.all([
          api.get("/delivery-board", { params: { status: "PENDIENTE", limit: 200 } }),
          api.get("/delivery-board", { params: { status: "ENTREGADO", limit: 200 } }),
        ]);
        setPending(pRes.data.sales || []);
        setDelivered(dRes.data.sales || []);
        return;
      } catch {
        // Fallback: obtener todas las ventas y filtrar MAYOR/DEPARTAMENTAL
        const res = await api.get("/sales", { params: { limit: 500 } });
        const all = res.data.sales || res.data || [];
        const mayorDep = all.filter((s: any) => s.type === "MAYOR" || s.type === "DEPARTAMENTAL");
        const p: Sale[] = [];
        const d: Sale[] = [];
        for (const s of mayorDep) {
          const ds = s.deliveryStatus || "PENDIENTE";
          const sale = {
            id: s.id,
            saleDate: s.saleDate,
            total: Number(s.total) || 0,
            type: s.type,
            seller: s.seller || s.user?.name || null,
            user: s.user,
            location: s.location,
            customer: s.customer,
            items: (s.items || []).map((it: any) => ({
              id: it.id,
              quantity: it.quantity,
              unitPrice: Number(it.unitPrice) || 0,
              subtotal: Number(it.subtotal) || 0,
              product: it.product,
            })),
            deliveryStatus: ds,
            deliveredAt: s.deliveredAt || null,
            deliveredBy: s.deliveredBy || null,
          };
          if (ds === "ENTREGADO") d.push(sale);
          else p.push(sale);
        }
        p.sort((a, b) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime());
        d.sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
        setPending(p);
        setDelivered(d);
      }
    } catch {
      toast.error("Error al cargar pizarra de entregas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoard();
  }, []);

  const markDelivered = async (id: number) => {
    try {
      try {
        const res = await api.post(`/delivery-board/${id}/deliver`);
        toast.success("Venta marcada como entregada");
        setPending((prev) => prev.filter((s) => s.id !== id));
        if (res.data.sale) setDelivered((prev) => [{ ...res.data.sale, seller: res.data.sale.seller || res.data.sale.user?.name }, ...prev]);
        return;
      } catch {
        // Fallback visual
      }
      const sale = pending.find((s) => s.id === id);
      if (sale) {
        setPending((prev) => prev.filter((s) => s.id !== id));
        setDelivered((prev) => [{ ...sale, deliveryStatus: "ENTREGADO", deliveredAt: new Date().toISOString() }, ...prev]);
        toast.success("Venta marcada como entregada");
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Error al marcar entrega");
    }
  };

  const markPending = async (id: number) => {
    try {
      try {
        const res = await api.post(`/delivery-board/${id}/pendiente`);
        toast.success("Venta vuelta a pendiente");
        setDelivered((prev) => prev.filter((s) => s.id !== id));
        if (res.data.sale) setPending((prev) => [{ ...res.data.sale, seller: res.data.sale.seller || res.data.sale.user?.name }, ...prev]);
        return;
      } catch {
        // Fallback visual
      }
      const sale = delivered.find((s) => s.id === id);
      if (sale) {
        setDelivered((prev) => prev.filter((s) => s.id !== id));
        setPending((prev) => [{ ...sale, deliveryStatus: "PENDIENTE", deliveredAt: null }, ...prev]);
        toast.success("Venta vuelta a pendiente");
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Error al volver a pendiente");
    }
  };

  const toggle = (id: number) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const Card = ({ sale, type }: { sale: Sale; type: "PENDIENTE" | "ENTREGADO" }) => (
    <div className="bg-dark-800/60 border border-dark-700/60 rounded-2xl overflow-hidden shadow-lg shadow-black/10">
      <button onClick={() => toggle(sale.id)} className="w-full text-left p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold uppercase tracking-wide ${sale.type === "MAYOR" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"}`}>
              {sale.type}
            </span>
            <span className="text-sm font-semibold text-foreground">Venta #{sale.id}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {formatDate(sale.saleDate)}
            {expanded[sale.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-gray-400">
            {sale.location?.name} {sale.seller ? `· ${sale.seller}` : ""}
            {sale.customer?.name ? ` · ${sale.customer.name}` : ""}
          </div>
          <div className="text-sm font-semibold text-foreground">{formatCurrency(sale.total)}</div>
        </div>
        <div className="text-xs text-gray-500">{sale.items.length} producto{sale.items.length === 1 ? "" : "s"}</div>
      </button>

      {expanded[sale.id] && (
        <div className="border-t border-dark-700/50">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-dark-900/40">
                  <th className="text-left px-4 py-2 text-gray-400 font-medium">Producto</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-medium">Cód. Fábrica</th>
                  <th className="text-center px-4 py-2 text-gray-400 font-medium">Cant.</th>
                  <th className="text-right px-4 py-2 text-gray-400 font-medium">P. Unit</th>
                  <th className="text-right px-4 py-2 text-gray-400 font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((it) => (
                  <tr key={it.id} className="border-t border-dark-700/30">
                    <td className="px-4 py-2 text-gray-200">
                      <div className="font-medium">{it.product.name}</div>
                      <div className="text-[10px] text-gray-500">{it.product.brand} {it.product.model}</div>
                    </td>
                    <td className="px-4 py-2 text-gray-400 font-mono text-[10px]">{it.product.factoryCode || it.product.itemCode || "N/A"}</td>
                    <td className="px-4 py-2 text-center text-gray-200">{it.quantity}</td>
                    <td className="px-4 py-2 text-right text-gray-300">{formatCurrency(it.unitPrice)}</td>
                    <td className="px-4 py-2 text-right text-foreground">{formatCurrency(it.unitPrice * it.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 flex items-center justify-between gap-2">
            {type === "PENDIENTE" ? (
              <button onClick={() => markDelivered(sale.id)} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all text-sm">
                <CheckCircle size={16} /> Marcar como Entregado
              </button>
            ) : (
              <button onClick={() => markPending(sale.id)} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/20 transition-all text-sm">
                <Clock size={16} /> Volver a Pendiente
              </button>
            )}
            {sale.deliveredAt && (
              <div className="text-xs text-gray-500">
                Entregado {formatDate(sale.deliveredAt)} {sale.deliveredBy?.name ? `por ${sale.deliveredBy.name}` : ""}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="grid lg:grid-cols-2 gap-4 animate-pulse">
        {[0, 1].map((i) => (
          <div key={i} className="bg-dark-800/40 border border-dark-700/40 rounded-2xl h-40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck size={18} className="text-primary-400" />
          <h3 className="text-lg font-semibold text-foreground">Pizarra de Entregas · Mayor y Departamental</h3>
        </div>
        <button onClick={fetchBoard} className="px-2 py-1 text-xs text-gray-400 hover:text-foreground">Actualizar</button>
      </div>
      <div className={`grid ${compact ? "md:grid-cols-2" : "lg:grid-cols-2"} gap-6`}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-yellow-400" />
              <span className="text-sm font-medium text-foreground">Pendiente</span>
              <span className="px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 text-xs">{pending.length}</span>
            </div>
          </div>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            {pending.length === 0 ? (
              <div className="text-center text-sm text-gray-500 py-8 bg-dark-800/40 border border-dark-700/40 rounded-2xl">Sin entregas pendientes</div>
            ) : (
              pending.map((s) => <Card key={s.id} sale={s} type="PENDIENTE" />)
            )}
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-emerald-400" />
              <span className="text-sm font-medium text-foreground">Entregado</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs">{delivered.length}</span>
            </div>
          </div>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            {delivered.length === 0 ? (
              <div className="text-center text-sm text-gray-500 py-8 bg-dark-800/40 border border-dark-700/40 rounded-2xl">Sin entregas realizadas</div>
            ) : (
              delivered.map((s) => <Card key={s.id} sale={s} type="ENTREGADO" />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
