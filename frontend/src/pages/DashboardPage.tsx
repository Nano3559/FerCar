import { useEffect, useState } from "react";
import api from "../services/api";
import EmptyState from "../components/ui/EmptyState";
import { useAuthStore } from "../stores/authStore";
import {
  Package,
  ShoppingCart,
  AlertTriangle,
  Clock,
  DollarSign,
  TrendingUp,
  ArrowLeftRight,
  RefreshCw,
  PackageX,
  BarChart3,
  Store,
  ChevronDown,
} from "lucide-react";
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

interface DashboardData {
  summary: {
    totalProducts: number;
    productsWithoutStock: number;
    productsWithLowStock: number;
    salesToday: number;
    salesTodayTotal: number;
    salesMonth: number;
    salesMonthTotal: number;
    pendingRequests: number;
    criticalStock: number;
  };
  stockByLocation: {
    locationId: number;
    name: string;
    type: string;
    totalStock: number;
  }[];
  salesByLocation: {
    locationId: number;
    name: string;
    count: number;
    total: number;
  }[];
  salesByBrand: {
    brand: string;
    totalQuantity: number;
    totalAmount: number;
  }[];
  salesByVehicle: {
    model: string;
    totalQuantity: number;
    totalAmount: number;
  }[];
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
  recentMovements: {
    id: number;
    date: string;
    product: string;
    itemCode: string;
    from: string;
    to: string;
    quantity: number;
    user: string;
  }[];
  pendingRequests: {
    id: number;
    product: string;
    itemCode: string;
    quantity: number;
    location: string;
    requestedBy: string;
    date: string;
  }[];
  criticalStock: {
    product: string;
    itemCode: string;
    location: string;
    stock: number;
    minStock: number;
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
];

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

export default function DashboardPage() {
  const { user } = useAuthStore();
  const isTienda = user?.role === "TIENDA";
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stores, setStores] = useState<{ id: number; name: string }[]>([]);
  const [locationFilter, setLocationFilter] = useState("");

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await api.get("/dashboard", {
        params: locationFilter ? { locationId: locationFilter } : {},
      });
      setData(res.data);
      setError("");
    } catch {
      setError("Error al cargar los datos del dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [locationFilter]);

  useEffect(() => {
    api
      .get("/locations")
      .then((res) => {
        const tiendas = (res.data.locations || [])
          .filter((loc: { type: string }) => loc.type === "TIENDA")
          .map((loc: { id: number; name: string }) => ({ id: loc.id, name: loc.name }));
        setStores(tiendas);
      })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Cargando el panel">
        <div>
          <div className="h-7 w-48 bg-dark-800 rounded-lg mb-3" />
          <div className="h-4 w-64 bg-dark-800/70 rounded-md" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-4 space-y-3">
              <div className="h-4 w-24 bg-dark-700/60 rounded-md" />
              <div className="h-8 w-16 bg-dark-700/60 rounded-lg" />
              <div className="h-3 w-20 bg-dark-700/40 rounded-md" />
            </div>
          ))}
        </div>
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-4 space-y-3">
          <div className="h-4 w-32 bg-dark-700/60 rounded-md" />
          <div className="h-48 bg-dark-700/40 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertTriangle size={40} className="text-red-400" />
        <p className="text-gray-400">{error || "No hay datos disponibles"}</p>
        <button
          onClick={fetchDashboard}
          className="px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors text-sm"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const { summary } = data;

  const selectedStoreName = stores.find((s) => s.id === Number(locationFilter))?.name;

  const mainStats = [
    {
      label: "Total Productos",
      value: summary.totalProducts,
      icon: Package,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    {
      label: "Ventas del Día",
      value: summary.salesToday,
      icon: ShoppingCart,
      color: "text-green-400",
      bg: "bg-green-500/10",
      border: "border-green-500/20",
      sub: formatCurrency(summary.salesTodayTotal),
    },
    {
      label: "Ingresos del Mes",
      value: formatCurrency(summary.salesMonthTotal),
      icon: DollarSign,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      sub: `${summary.salesMonth} ventas`,
    },
    {
      label: "Sin Stock",
      value: summary.productsWithoutStock,
      icon: PackageX,
      color: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/20",
    },
    {
      label: "Stock Bajo",
      value: summary.productsWithLowStock,
      icon: AlertTriangle,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/20",
    },
    {
      label: "Solicitudes Pendientes",
      value: summary.pendingRequests,
      icon: Clock,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      border: "border-orange-500/20",
    },
  ];

  const totalStockAllLocations = data.stockByLocation.reduce(
    (sum, loc) => sum + loc.totalStock,
    0
  );

  const stockByType = {
    tiendas: data.stockByLocation
      .filter((l) => l.type === "TIENDA")
      .reduce((s, l) => s + l.totalStock, 0),
    almacenes: data.stockByLocation
      .filter((l) => l.type === "ALMACEN")
      .reduce((s, l) => s + l.totalStock, 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            {selectedStoreName
              ? `Resumen de ${selectedStoreName}`
              : isTienda
                ? "Resumen de tu tienda"
                : "Resumen general del sistema"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isTienda && stores.length > 0 && (
            <div className="relative">
              <Store size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                aria-label="Filtrar por tienda"
                className="pl-9 pr-8 py-2 bg-dark-800 border border-dark-700/50 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500 appearance-none"
              >
                <option value="">Todas las tiendas</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
          )}
          <button
            onClick={fetchDashboard}
            className="p-2 bg-dark-800 border border-dark-700/50 rounded-xl text-gray-400 hover:text-foreground hover:border-primary-600/50 transition-all"
            title="Actualizar"
            aria-label="Actualizar dashboard"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {mainStats.map((stat) => (
          <div
            key={stat.label}
            className={`bg-dark-800/50 border ${stat.border} rounded-2xl p-4 hover:scale-[1.02] transition-all`}
          >
            <div className="flex items-center justify-between mb-3">
              <div
                className={`w-9 h-9 ${stat.bg} rounded-xl flex items-center justify-center`}
              >
                <stat.icon size={18} className={stat.color} />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-gray-400 mt-1">{stat.label}</p>
            {stat.sub && (
              <p className="text-xs text-gray-500 mt-0.5">{stat.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Charts Row 1: Sales by Location + Stock by Location */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-green-400" />
            <h3 className="text-lg font-semibold text-foreground">
              Ventas por Tienda (Mes)
            </h3>
          </div>
          {data.salesByLocation.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.salesByLocation}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--dk-700))" />
                <XAxis dataKey="name" tick={{ fill: "rgb(var(--gray-400))", fontSize: 12 }} />
                <YAxis tick={{ fill: "rgb(var(--gray-400))", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgb(var(--dk-800))",
                    border: "1px solid rgb(var(--dk-700))",
                    borderRadius: "12px",
                    color: "rgb(var(--gray-100))",
                  }}
                  formatter={(value: number) => [formatCurrency(value), "Total"]}
                />
                <Bar dataKey="total" fill="#22c55e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-sm">Sin datos de ventas este mes</p>
          )}
        </div>

        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={18} className="text-blue-400" />
            <h3 className="text-lg font-semibold text-foreground">
              Stock por Ubicación
            </h3>
          </div>
          {data.stockByLocation.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.stockByLocation}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--dk-700))" />
                <XAxis dataKey="name" tick={{ fill: "rgb(var(--gray-400))", fontSize: 11 }} />
                <YAxis tick={{ fill: "rgb(var(--gray-400))", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgb(var(--dk-800))",
                    border: "1px solid rgb(var(--dk-700))",
                    borderRadius: "12px",
                    color: "rgb(var(--gray-100))",
                  }}
                  formatter={(value: number) => [value, "Unidades"]}
                />
                <Bar dataKey="totalStock" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-sm">Sin datos de stock</p>
          )}
        </div>
      </div>

      {/* Charts Row 2: Sales by Brand + Sales by Vehicle */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Ventas por Marca (Mes)
          </h3>
          {data.salesByBrand.length > 0 ? (
            <div className="space-y-3">
              {data.salesByBrand.slice(0, 7).map((brand, i) => {
                const maxAmount = Math.max(
                  ...data.salesByBrand.map((b) => b.totalAmount)
                );
                const pct = maxAmount > 0 ? (brand.totalAmount / maxAmount) * 100 : 0;
                return (
                  <div key={brand.brand} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-300">{brand.brand}</span>
                      <span className="text-gray-400">
                        {brand.totalQuantity} uds &middot;{" "}
                        {formatCurrency(brand.totalAmount)}
                      </span>
                    </div>
                    <div className="h-2 bg-dark-900 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Sin datos de ventas por marca</p>
          )}
        </div>

        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Ventas por Vehículo/Modelo
          </h3>
          {data.salesByVehicle.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={data.salesByVehicle.slice(0, 7)}
                  dataKey="totalAmount"
                  nameKey="model"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ model, percent }) =>
                    `${model} (${(percent * 100).toFixed(0)}%)`
                  }
                >
                  {data.salesByVehicle.slice(0, 7).map((_entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgb(var(--dk-800))",
                    border: "1px solid rgb(var(--dk-700))",
                    borderRadius: "12px",
                    color: "rgb(var(--gray-100))",
                  }}
                  formatter={(value: number) => [formatCurrency(value), "Total"]}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-sm">Sin datos por modelo</p>
          )}
        </div>
      </div>

      {/* Stock Summary Cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
            Stock Total
          </p>
          <p className="text-2xl font-bold text-foreground">{totalStockAllLocations}</p>
          <p className="text-xs text-gray-500 mt-1">unidades en el sistema</p>
        </div>
        <div className="bg-dark-800/50 border border-blue-500/20 rounded-2xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
            Stock en Tiendas
          </p>
          <p className="text-2xl font-bold text-blue-400">
            {stockByType.tiendas}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {data.stockByLocation.filter((l) => l.type === "TIENDA").length}{" "}
            tiendas
          </p>
        </div>
        <div className="bg-dark-800/50 border border-emerald-500/20 rounded-2xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
            Stock en Almacenes
          </p>
          <p className="text-2xl font-bold text-emerald-400">
            {stockByType.almacenes}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {
              data.stockByLocation.filter((l) => l.type === "ALMACEN").length
            }{" "}
            almacenes
          </p>
        </div>
      </div>

      {/* Tables Row: Recent Sales + Recent Movements */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Sales */}
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
                    <th className="text-right pb-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSales.map((sale) => (
                    <tr
                      key={sale.id}
                      className="border-b border-dark-700/30 last:border-0"
                    >
                      <td className="py-2 text-gray-400">
                        {formatDate(sale.date)}
                      </td>
                      <td className="py-2 text-gray-300">{sale.customer}</td>
                      <td className="py-2 text-gray-400">{sale.location}</td>
                      <td className="py-2 text-right text-green-400 font-medium">
                        {formatCurrency(sale.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Sin ventas recientes</p>
          )}
        </div>

        {/* Recent Movements */}
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <ArrowLeftRight size={18} className="text-purple-400" />
            <h3 className="text-lg font-semibold text-foreground">
              Últimos Movimientos
            </h3>
          </div>
          {data.recentMovements.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 border-b border-dark-700/50">
                    <th className="text-left pb-2 font-medium">Fecha</th>
                    <th className="text-left pb-2 font-medium">Producto</th>
                    <th className="text-left pb-2 font-medium">Ruta</th>
                    <th className="text-right pb-2 font-medium">Cant.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentMovements.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-dark-700/30 last:border-0"
                    >
                      <td className="py-2 text-gray-400">
                        {formatDate(m.date)}
                      </td>
                      <td className="py-2 text-gray-300">
                        {m.product}
                        <span className="text-gray-600 ml-1">({m.itemCode})</span>
                      </td>
                      <td className="py-2 text-gray-400">
                        {m.from} → {m.to}
                      </td>
                      <td className="py-2 text-right text-purple-400 font-medium">
                        {m.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Sin movimientos recientes</p>
          )}
        </div>
      </div>

      {/* Bottom Row: Pending Requests + Critical Stock */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pending Requests */}
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-orange-400" />
            <h3 className="text-lg font-semibold text-foreground">
              Solicitudes Pendientes
            </h3>
            {summary.pendingRequests > 0 && (
              <span className="ml-auto px-2 py-0.5 bg-orange-500/10 text-orange-400 text-xs font-medium rounded-full">
                {summary.pendingRequests}
              </span>
            )}
          </div>
          {data.pendingRequests.length > 0 ? (
            <div className="space-y-3">
              {data.pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between p-3 bg-dark-900/50 rounded-xl border border-dark-700/30"
                >
                  <div>
                    <p className="text-sm text-gray-200">{req.product}</p>
                    <p className="text-xs text-gray-500">
                      {req.location} &middot; Solicitado por {req.requestedBy}
                    </p>
                  </div>
                  <span className="px-2 py-1 bg-orange-500/10 text-orange-400 text-xs font-medium rounded-lg">
                    x{req.quantity}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Sin solicitudes pendientes"
              description="Las solicitudes de tiendas aparecerán aquí."
            />
          )}
        </div>

        {/* Critical Stock */}
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-red-400" />
            <h3 className="text-lg font-semibold text-foreground">
              Stock Crítico
            </h3>
            {summary.criticalStock > 0 && (
              <span className="ml-auto px-2 py-0.5 bg-red-500/10 text-red-400 text-xs font-medium rounded-full">
                {summary.criticalStock}
              </span>
            )}
          </div>
          {data.criticalStock.length > 0 ? (
            <div className="max-h-[360px] overflow-y-auto pr-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-dark-800/50">
                  <tr className="text-gray-500 border-b border-dark-700/50">
                    <th className="text-left pb-2 font-medium">Producto</th>
                    <th className="text-left pb-2 font-medium">Ubicación</th>
                    <th className="text-center pb-2 font-medium">Stock</th>
                    <th className="text-center pb-2 font-medium">Mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.criticalStock.map((item, i) => (
                    <tr
                      key={`${item.itemCode}-${item.location}-${i}`}
                      className="border-b border-dark-700/30 last:border-0"
                    >
                      <td className="py-2 text-gray-300">
                        {item.product}
                        <span className="text-gray-600 ml-1">
                          ({item.itemCode})
                        </span>
                      </td>
                      <td className="py-2 text-gray-400">{item.location}</td>
                      <td className="py-2 text-center text-red-400 font-medium">
                        {item.stock}
                      </td>
                      <td className="py-2 text-center text-gray-500">
                        {item.minStock}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Sin productos con stock crítico"
              description="Todo el inventario está dentro de los niveles mínimos."
            />
          )}
        </div>
      </div>
    </div>
  );
}
