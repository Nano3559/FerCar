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
  User,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import SalesAnalyticsBoard, { AnalyticsData } from "../components/dashboard/SalesAnalyticsBoard";

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

const PERIODS = [
  { value: "day", label: "Hoy" },
  { value: "7d", label: "Últimos 7 días" },
  { value: "month", label: "Este mes" },
  { value: "3m", label: "Últimos 3 meses" },
  { value: "6m", label: "Últimos 6 meses" },
  { value: "12m", label: "Últimos 12 meses" },
  { value: "all", label: "Todo" },
];

function periodRange(period: string, now: Date) {
  const iso = (d: Date) => d.toISOString();
  switch (period) {
    case "day": {
      const st = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { from: iso(st), to: iso(now) };
    }
    case "7d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { from: iso(d), to: iso(now) };
    }
    case "month": {
      const st = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: iso(st), to: iso(now) };
    }
    case "3m": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return { from: iso(d), to: iso(now) };
    }
    case "6m": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      return { from: iso(d), to: iso(now) };
    }
    case "12m": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 12);
      return { from: iso(d), to: iso(now) };
    }
    default:
      return { from: "", to: "" };
  }
}

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
  const [locations, setLocations] = useState<{ id: number; name: string; type: string }[]>([]);
  const [locationFilter, setLocationFilter] = useState("");
  const [sellers, setSellers] = useState<{ id: number; name: string }[]>([]);
  const [sellerFilter, setSellerFilter] = useState("");
  const [period, setPeriod] = useState("12m");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const selectedLocation = locations.find((l) => l.id === Number(locationFilter));
  const selectedStoreName = selectedLocation?.name;
  const isAlmacenMode = selectedLocation?.type === "ALMACEN";

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await api.get("/dashboard", {
        params: {
          ...(locationFilter ? { locationId: locationFilter } : {}),
          ...(sellerFilter ? { userId: sellerFilter } : {}),
        },
      });
      setData(res.data);
      setError("");
    } catch {
      setError("Error al cargar los datos del dashboard");
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true);
    const { from, to } = periodRange(period, new Date());
    const params: Record<string, string> = {};
    if (locationFilter) params.locationId = locationFilter;
    if (sellerFilter) params.userId = sellerFilter;
    if (from) params.from = from;
    if (to) params.to = to;
    try {
      const res = await api.get("/dashboard/analytics", { params });
      setAnalytics(res.data);
      setSellers(res.data.sellers || []);
    } catch {
      setAnalytics(null);
      if (!sellers.length && user?.role === "ADMIN") {
        try {
          const usersRes = await api.get("/users");
          const vendedores = (usersRes.data.users || [])
            .filter((u: any) => u.role === "TIENDA" && u.active !== false)
            .map((u: any) => ({ id: u.id, name: u.name }));
          setSellers(vendedores);
        } catch {
          setSellers([]);
        }
      }
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAlmacenMode) fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationFilter, sellerFilter, isAlmacenMode]);

  useEffect(() => {
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationFilter, sellerFilter, period]);

  useEffect(() => {
    if (sellerFilter && sellers.length > 0 && !sellers.some((s) => String(s.id) === sellerFilter)) {
      setSellerFilter("");
    }
  }, [sellers]);

  useEffect(() => {
    api
      .get("/locations")
      .then((res) => setLocations(res.data.locations || []))
      .catch(() => {});
  }, []);

  if (loading && !isAlmacenMode) {
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

  if (!isAlmacenMode && (error || !data)) {
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

  const { summary } = data || { summary: null as any };

  const mainStats = [
    {
      label: "Total Productos",
      value: summary?.totalProducts ?? 0,
      icon: Package,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    {
      label: "Ventas del Día",
      value: summary?.salesToday ?? 0,
      icon: ShoppingCart,
      color: "text-green-400",
      bg: "bg-green-500/10",
      border: "border-green-500/20",
      sub: formatCurrency(summary?.salesTodayTotal ?? 0),
    },
    {
      label: "Ingresos del Mes",
      value: formatCurrency(summary?.salesMonthTotal ?? 0),
      icon: DollarSign,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      sub: `${summary?.salesMonth ?? 0} ventas`,
    },
    {
      label: "Sin Stock",
      value: summary?.productsWithoutStock ?? 0,
      icon: PackageX,
      color: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/20",
    },
    {
      label: "Stock Bajo",
      value: summary?.productsWithLowStock ?? 0,
      icon: AlertTriangle,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/20",
    },
    {
      label: "Solicitudes Pendientes",
      value: summary?.pendingRequests ?? 0,
      icon: Clock,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      border: "border-orange-500/20",
    },
  ];

  const totalStockAllLocations =
    (data?.stockByLocation || []).reduce((sum, loc) => sum + loc.totalStock, 0) ?? 0;

  const stockByType = {
    tiendas: (data?.stockByLocation || [])
      .filter((l) => l.type === "TIENDA")
      .reduce((s, l) => s + l.totalStock, 0),
    almacenes: (data?.stockByLocation || [])
      .filter((l) => l.type === "ALMACEN")
      .reduce((s, l) => s + l.totalStock, 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            {isAlmacenMode
              ? selectedStoreName
                ? `Analíticas de ventas · vista global (${selectedStoreName})`
                : "Analíticas de ventas · vista global"
              : selectedStoreName
                ? `Resumen de ${selectedStoreName}`
                : isTienda
                  ? "Resumen de tu tienda"
                  : "Resumen general del sistema"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isTienda && locations.length > 0 && (
            <div className="relative">
              <Store size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                aria-label="Filtrar por ubicación"
                className="pl-9 pr-8 py-2 bg-dark-800 border border-dark-700/50 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500 appearance-none max-w-[220px]"
              >
                <option value="">Todas las tiendas</option>
                <optgroup label="Tiendas">
                  {locations
                    .filter((l) => l.type === "TIENDA")
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Almacenes">
                  {locations
                    .filter((l) => l.type === "ALMACEN")
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </optgroup>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
          )}
          {!isTienda && sellers.length > 0 && (
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <select
                value={sellerFilter}
                onChange={(e) => setSellerFilter(e.target.value)}
                aria-label="Filtrar por vendedor"
                className="pl-9 pr-8 py-2 bg-dark-800 border border-dark-700/50 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500 appearance-none max-w-[200px]"
              >
                <option value="">Todos los vendedores</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
          )}
          <div className="relative">
            <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              aria-label="Período de análisis"
              className="pl-9 pr-8 py-2 bg-dark-800 border border-dark-700/50 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500 appearance-none"
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
          <button
            onClick={() => {
              fetchAnalytics();
              if (!isAlmacenMode) fetchDashboard();
            }}
            className="p-2 bg-dark-800 border border-dark-700/50 rounded-xl text-gray-400 hover:text-foreground hover:border-primary-600/50 transition-all"
            title="Actualizar"
            aria-label="Actualizar dashboard"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {isAlmacenMode ? (
        <SalesAnalyticsBoard data={analytics} loading={analyticsLoading} showLocationChart />
      ) : (
        <>
          {/* Main Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {mainStats.map((stat) => (
              <div
                key={stat.label}
                className={`bg-dark-800/50 border ${stat.border} rounded-2xl p-4 hover:scale-[1.02] transition-all`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-9 h-9 ${stat.bg} rounded-xl flex items-center justify-center`}>
                    <stat.icon size={18} className={stat.color} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-gray-400 mt-1">{stat.label}</p>
                {stat.sub && <p className="text-xs text-gray-500 mt-0.5">{stat.sub}</p>}
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
              {data?.salesByLocation.length ? (
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
              {data?.stockByLocation.length ? (
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

          {/* Analíticas de ventas */}
          <SalesAnalyticsBoard data={analytics} loading={analyticsLoading} />

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
                {(data?.stockByLocation || []).filter((l) => l.type === "TIENDA").length} tiendas
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
                {(data?.stockByLocation || []).filter((l) => l.type === "ALMACEN").length} almacenes
              </p>
            </div>
          </div>

          {/* Recent Movements + Pending Requests */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <ArrowLeftRight size={18} className="text-purple-400" />
                <h3 className="text-lg font-semibold text-foreground">
                  Últimos Movimientos
                </h3>
              </div>
              {data?.recentMovements.length ? (
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
                        <tr key={m.id} className="border-b border-dark-700/30 last:border-0">
                          <td className="py-2 text-gray-400">{formatDate(m.date)}</td>
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

            <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Clock size={18} className="text-orange-400" />
                <h3 className="text-lg font-semibold text-foreground">
                  Solicitudes Pendientes
                </h3>
                {(summary?.pendingRequests ?? 0) > 0 && (
                  <span className="ml-auto px-2 py-0.5 bg-orange-500/10 text-orange-400 text-xs font-medium rounded-full">
                    {summary?.pendingRequests ?? 0}
                  </span>
                )}
              </div>
              {data?.pendingRequests.length ? (
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
          </div>

          {/* Critical Stock */}
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={18} className="text-red-400" />
              <h3 className="text-lg font-semibold text-foreground">
                Stock Crítico
              </h3>
              {(summary?.criticalStock ?? 0) > 0 && (
                <span className="ml-auto px-2 py-0.5 bg-red-500/10 text-red-400 text-xs font-medium rounded-full">
                  {summary?.criticalStock ?? 0}
                </span>
              )}
            </div>
            {data?.criticalStock.length ? (
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
                      <tr key={`${item.itemCode}-${item.location}-${i}`} className="border-b border-dark-700/30 last:border-0">
                        <td className="py-2 text-gray-300">
                          {item.product}
                          <span className="text-gray-600 ml-1">({item.itemCode})</span>
                        </td>
                        <td className="py-2 text-gray-400">{item.location}</td>
                        <td className="py-2 text-center text-red-400 font-medium">{item.stock}</td>
                        <td className="py-2 text-center text-gray-500">{item.minStock}</td>
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
        </>
      )}
    </div>
  );
}