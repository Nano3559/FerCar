import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { TrendingUp, Trophy, User, ShoppingCart, Boxes, Receipt } from "lucide-react";

export interface AnalyticsSeller {
  id: number;
  name: string;
}

export interface AnalyticsData {
  sellers: AnalyticsSeller[];
  kpis: { total: number; count: number; units: number; avgTicket: number };
  best: {
    month: { key: string; label: string; total: number; count: number } | null;
    seller: { userId: number; name: string; count: number; total: number; units: number } | null;
  };
  salesByMonth: { key: string; label: string; count: number; total: number }[];
  salesBySeller: { userId: number; name: string; count: number; total: number; units: number }[];
  salesByLocation: { locationId: number; name: string; count: number; total: number }[];
  salesByType: { type: string; count: number; total: number }[];
  salesByPayment: { method: string; count: number; total: number }[];
  salesByProduct: { productId: number; name: string; itemCode: string; brand: string; model: string; quantity: number; total: number }[];
  salesByBrand: { brand: string; quantity: number; total: number }[];
  recentSales: {
    id: number;
    date: string;
    total: number;
    type: string;
    location: string;
    user: string;
    customer: string;
    itemCount: number;
  }[];
}

const PIE_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

const TYPE_LABEL: Record<string, string> = {
  NORMAL: "Minorista",
  MAYOR: "Mayorista",
};

const PAY_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  QR: "QR",
  TRANSFERENCIA: "Transferencia",
  CREDITO: "Crédito",
};

function formatCurrency(value: number) {
  return `Bs. ${value.toLocaleString("es-BO", { minimumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function tooltipStyle() {
  return {
    backgroundColor: "rgb(var(--dk-800))",
    border: "1px solid rgb(var(--dk-700))",
    borderRadius: "12px",
    color: "rgb(var(--gray-100))",
  } as const;
}

interface Props {
  data: AnalyticsData | null;
  loading: boolean;
  showLocationChart?: boolean;
}

export default function SalesAnalyticsBoard({ data, loading, showLocationChart = false }: Props) {
  if (loading && !data) {
    return (
      <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Cargando analíticas">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-4 space-y-3">
              <div className="h-4 w-20 bg-dark-700/60 rounded-md" />
              <div className="h-8 w-16 bg-dark-700/60 rounded-lg" />
            </div>
          ))}
        </div>
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-4">
          <div className="h-48 bg-dark-700/40 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        Sin datos de analíticas disponibles
      </div>
    );
  }

  const { kpis, best } = data;
  const gridCls = showLocationChart ? "lg:grid-cols-3" : "lg:grid-cols-2";

  const kpiCards = [
    {
      label: "Total Vendido",
      value: formatCurrency(kpis.total),
      icon: TrendingUp,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
    {
      label: "N° de Ventas",
      value: String(kpis.count),
      icon: ShoppingCart,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    {
      label: "Unidades Vendidas",
      value: String(kpis.units),
      icon: Boxes,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      border: "border-purple-500/20",
    },
    {
      label: "Ticket Promedio",
      value: formatCurrency(kpis.avgTicket),
      icon: Receipt,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/20",
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((stat) => (
          <div
            key={stat.label}
            className={`bg-dark-800/50 border ${stat.border} rounded-2xl p-4 hover:scale-[1.02] transition-all`}
          >
            <div className={`w-9 h-9 ${stat.bg} rounded-xl flex items-center justify-center mb-3`}>
              <stat.icon size={18} className={stat.color} />
            </div>
            <p className="text-xl font-bold text-foreground truncate">{stat.value}</p>
            <p className="text-xs text-gray-400 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Destacados: mejor mes y mejor vendedor */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-orange-500/10 to-dark-800/50 border border-orange-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Trophy size={18} className="text-orange-400" />
            <h3 className="font-semibold text-foreground">Mes con más ventas</h3>
          </div>
          {best.month ? (
            <>
              <p className="text-3xl font-bold text-orange-400">{best.month.label}</p>
              <p className="text-sm text-gray-400 mt-1">
                {formatCurrency(best.month.total)} &middot; {best.month.count} ventas
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">Sin ventas en el período</p>
          )}
        </div>
        <div className="bg-gradient-to-br from-purple-500/10 to-dark-800/50 border border-purple-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <User size={18} className="text-purple-400" />
            <h3 className="font-semibold text-foreground">Mejor vendedor</h3>
          </div>
          {best.seller ? (
            <>
              <p className="text-3xl font-bold text-purple-400">{best.seller.name}</p>
              <p className="text-sm text-gray-400 mt-1">
                {formatCurrency(best.seller.total)} &middot; {best.seller.count} ventas
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">Sin ventas en el período</p>
          )}
        </div>
      </div>

      {/* Ventas por mes + por vendedor */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-green-400" />
            <h3 className="text-lg font-semibold text-foreground">Ventas por Mes</h3>
          </div>
          {data.salesByMonth.some((m) => m.total > 0) ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.salesByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--dk-700))" />
                <XAxis dataKey="label" tick={{ fill: "rgb(var(--gray-400))", fontSize: 11 }} />
                <YAxis tick={{ fill: "rgb(var(--gray-400))", fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle()} formatter={(value: number) => [formatCurrency(value), "Total"]} />
                <Bar dataKey="total" fill="#22c55e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-sm">Sin ventas en el período</p>
          )}
        </div>

        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <User size={18} className="text-purple-400" />
            <h3 className="text-lg font-semibold text-foreground">Ventas por Vendedor</h3>
          </div>
          {data.salesBySeller.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.salesBySeller} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} stroke="rgb(var(--dk-700))" />
                <XAxis type="number" tick={{ fill: "rgb(var(--gray-400))", fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fill: "rgb(var(--gray-400))", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle()} formatter={(value: number) => [formatCurrency(value), "Total"]} />
                <Bar dataKey="total" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-sm">Sin datos</p>
          )}
        </div>
      </div>

      {/* Tienda / tipo / forma de pago */}
      <div className={`grid ${gridCls} gap-6`}>
        {showLocationChart && (
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <ShoppingCart size={18} className="text-blue-400" />
              <h3 className="text-lg font-semibold text-foreground">Ventas por Tienda</h3>
            </div>
            {data.salesByLocation.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.salesByLocation}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--dk-700))" />
                  <XAxis dataKey="name" tick={{ fill: "rgb(var(--gray-400))", fontSize: 11 }} />
                  <YAxis tick={{ fill: "rgb(var(--gray-400))", fontSize: 12 }} />
                  <Tooltip contentStyle={tooltipStyle()} formatter={(value: number) => [formatCurrency(value), "Total"]} />
                  <Bar dataKey="total" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-400 text-sm">Sin datos</p>
            )}
          </div>
        )}

        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Ventas por Tipo</h3>
          {data.salesByType.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie
                    data={data.salesByType}
                    dataKey="total"
                    nameKey="type"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    label={({ type, percent }) => `${TYPE_LABEL[String(type)] || type} (${((percent as number) * 100).toFixed(0)}%)`}
                  >
                    {data.salesByType.map((_entry, i) => (
                      <Cell key={`cell-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle()}
                    formatter={(value: number, _name, item) => {
                      const type = String((item.payload as { type: string }).type);
                      return [formatCurrency(value), TYPE_LABEL[type] || type];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {data.salesByType.map((t) => (
                  <div key={t.type} className="flex justify-between text-sm text-gray-400">
                    <span>{TYPE_LABEL[t.type] || t.type}</span>
                    <span>{t.count} ventas</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-gray-400 text-sm">Sin datos</p>
          )}
        </div>

        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Formas de Pago</h3>
          {data.salesByPayment.length > 0 ? (
            <div className="space-y-4">
              {data.salesByPayment.map((p, i) => {
                const maxAmount = Math.max(...data.salesByPayment.map((x) => x.total));
                const pct = maxAmount > 0 ? (p.total / maxAmount) * 100 : 0;
                return (
                  <div key={p.method} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-300">{PAY_LABEL[p.method] || p.method}</span>
                      <span className="text-gray-400">{formatCurrency(p.total)}</span>
                    </div>
                    <div className="h-2 bg-dark-900 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Sin datos</p>
          )}
        </div>
      </div>

      {/* Top productos */}
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Top Productos Vendidos</h3>
        {data.salesByProduct.length > 0 ? (
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
            {data.salesByProduct.slice(0, 8).map((p, i) => {
              const maxAmount = Math.max(...data.salesByProduct.map((x) => x.total));
              const pct = maxAmount > 0 ? (p.total / maxAmount) * 100 : 0;
              return (
                <div key={p.productId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm gap-2">
                    <span className="text-gray-300 truncate">
                      <span className="text-gray-500 mr-1">#{i + 1}</span>
                      {p.name}
                      <span className="text-gray-600 ml-1">({p.itemCode})</span>
                    </span>
                    <span className="text-gray-400 shrink-0">
                      {p.quantity} uds &middot; {formatCurrency(p.total)}
                    </span>
                  </div>
                  <div className="h-2 bg-dark-900 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">Sin ventas en el período</p>
        )}
      </div>

      {/* Últimas ventas */}
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart size={18} className="text-green-400" />
          <h3 className="text-lg font-semibold text-foreground">Últimas Ventas</h3>
        </div>
        {data.recentSales.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-dark-700/50">
                  <th className="text-left pb-2 font-medium">Fecha</th>
                  <th className="text-left pb-2 font-medium">Cliente</th>
                  <th className="text-left pb-2 font-medium">Tienda</th>
                  <th className="text-left pb-2 font-medium">Vendedor</th>
                  <th className="text-right pb-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSales.map((sale) => (
                  <tr key={sale.id} className="border-b border-dark-700/30 last:border-0">
                    <td className="py-2 text-gray-400">{formatDate(sale.date)}</td>
                    <td className="py-2 text-gray-300">{sale.customer}</td>
                    <td className="py-2 text-gray-400">{sale.location}</td>
                    <td className="py-2 text-gray-300">{sale.user}</td>
                    <td className="py-2 text-right text-green-400 font-medium">{formatCurrency(sale.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">Sin ventas recientes</p>
        )}
      </div>
    </div>
  );
}