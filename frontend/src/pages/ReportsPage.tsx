import { useState, useEffect, useCallback } from "react";
import { jsPDF } from "jspdf";
import {
  BarChart3, Search, Download, TrendingUp, Package, RefreshCw, CalendarDays,
  AlertTriangle, Truck, Users,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../services/api";
import * as XLSX from "xlsx";
import { useAuthStore } from "../stores/authStore";
import { saleCode } from "../utils/documentCodes";

interface InventoryItem {
  id: number; stock: number; minStock: number;
  product: { 
    id: number; 
    name: string; 
    itemCode: string; 
    factoryCode?: string | null;
    oemCode?: string | null;
    brand: string; 
    model: string; 
    year?: string | null;
    detail?: string | null;
    detalles?: string | null;
    manufacturer?: string | null;
    cost?: string | number | null;
    unitPrice?: string | number | null;
    priceHermana?: string | number | null;
    price1?: string | number | null;
    price2?: string | number | null;
    wholesalePrice?: string | number | null;
  };
  location: { id: number; name: string; type: string };
  status: string;
}

interface StoreGroup {
  periodKey: string; periodLabel: string;
  location: { id: number; name: string } | null;
  seller: string | null;
  saleCount: number; totalSales: number; returns: number; netSales: number;
  storeCost: number; utility: number; averagePerSale: number; itemsQty?: number; items?: number;
}

interface StoreDetail {
  saleId: number;
  saleDate: string;
  location: string;
  seller: string;
  factoryCode: string | null;
  productId: number;
  productName: string;
  brand: string;
  model: string;
  quantity: number;
  storeCostUnit: number;
  storeCostLine: number;
  unitPrice: number;
  lineTotal: number;
}

interface StoresReport {
  period: string;
  groupBy?: string;
  groups: StoreGroup[];
  summary: {
    totalSales: number; totalReturns: number; netSales: number;
    storeCost: number; utility: number;
    saleCount: number; itemsQty?: number; items?: number; period: string; range?: { start: string; end: string };
  };
  details?: StoreDetail[];
}

interface SupplierReport {
  id: number; name: string; nit: string | null; phone: string | null;
  totalPurchases: number; productsCount: number; lastPurchase: string | null;
  recentCosts: { id: number; product: { id: number; name: string; itemCode: string; brand: string }; costPrice: number; exchangeRate: number | null; date: string }[];
}

interface Location {
  id: number; name: string;
}

const BASE_TABS = [
  { key: "ventas", label: "Ventas", icon: TrendingUp },
  { key: "periodo", label: "Por Período", icon: CalendarDays },
  { key: "costo", label: "Costo Tiendas", icon: BarChart3 },
  { key: "inventario", label: "Inventario", icon: Package },
  { key: "cero", label: "Cercanos a 0", icon: AlertTriangle },
  { key: "proveedores", label: "Proveedores", icon: Truck },
];

const PERIODS = [
  { key: "day", label: "Diario" },
  { key: "week", label: "Semanal" },
  { key: "month", label: "Mensual" },
  { key: "all", label: "Personalizado" },
];

const TYPES = [
  { key: "", label: "Todos los tipos" },
  { key: "NORMAL", label: "Normal" },
  { key: "MAYOR", label: "Mayor" },
  { key: "DEPARTAMENTAL", label: "Departamental" },
];

const formatBs = (v: number) =>
  `Bs. ${v.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ReportsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const tabs = role === "TIENDA" ? BASE_TABS.filter((t) => t.key !== "proveedores") : BASE_TABS;

  const [activeTab, setActiveTab] = useState("ventas");
  const [locations, setLocations] = useState<Location[]>([]);

  // Sales (detail)
  const [salesDetails, setSalesDetails] = useState<any[]>([]);
  const [salesSummary, setSalesSummary] = useState({ totalSales: 0, count: 0, average: 0, totalQuantity: 0, totalStoreCost: 0 });
  const [salesLoading, setSalesLoading] = useState(false);

  // Stores (period/cost)
  const [storesData, setStoresData] = useState<StoresReport | null>(null);
  const [storesLoading, setStoresLoading] = useState(false);

  // Inventory
  const [inventoryData, setInventoryData] = useState<{ locations: any[]; totalProducts: number; totalStock: number; lowStockCount: number } | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  // Suppliers
  const [suppliersData, setSuppliersData] = useState<{ suppliers: SupplierReport[]; summary: { totalSuppliers: number; totalPurchases: number } } | null>(null);
  const [suppliersLoading, setSuppliersLoading] = useState(false);

  // Filters
  const [filterLocation, setFilterLocation] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterNoInvoice, setFilterNoInvoice] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [filterModel, setFilterModel] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [filterSeller, setFilterSeller] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("day");
  const [filterGroupBy, setFilterGroupBy] = useState<"both" | "location" | "seller">("both");
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    api.get("/locations").then((res) => setLocations(res.data.locations || res.data)).catch(() => {});
    api.get("/suppliers?limit=100").then((res) => setSuppliers(res.data.suppliers || [])).catch(() => {});
  }, []);

  const fetchSales = useCallback(async () => {
    try {
      setSalesLoading(true);
      const params = new URLSearchParams();
      if (filterLocation) params.set("locationId", filterLocation);
      if (filterFrom) params.set("startDate", filterFrom);
      if (filterTo) params.set("endDate", filterTo);
      if (filterNoInvoice) params.set("noInvoice", "true");
      if (filterBrand) params.set("brand", filterBrand);
      if (filterModel) params.set("model", filterModel);
      if (filterSupplier) params.set("supplierId", filterSupplier);
      if (filterProduct) params.set("product", filterProduct);
      if (filterSeller) params.set("seller", filterSeller);
      if (filterType) params.set("type", filterType);
      const res = await api.get(`/reports/sales?${params.toString()}`);
      setSalesDetails(res.data.details || []);
      setSalesSummary({
        totalSales: res.data.summary?.totalSales || 0,
        count: res.data.summary?.count || (res.data.details?.length || 0),
        average: (res.data.summary?.count || (res.data.details?.length || 0)) > 0
          ? Number(((res.data.summary?.totalSales || 0) / (res.data.summary?.count || res.data.details?.length || 1)).toFixed(2))
          : 0,
        totalQuantity: res.data.summary?.totalQuantity || 0,
        totalStoreCost: res.data.summary?.totalStoreCost || 0,
      });
    } catch {
      toast.error("Error al cargar reporte de ventas");
    } finally {
      setSalesLoading(false);
    }
  }, [filterLocation, filterFrom, filterTo, filterNoInvoice, filterBrand, filterModel, filterSupplier, filterProduct, filterSeller, filterType]);

  const fetchStores = useCallback(async () => {
    try {
      setStoresLoading(true);
      const params = new URLSearchParams();
      params.set("period", filterPeriod);
      if (filterLocation) params.set("locationId", filterLocation);
      if (filterFrom) params.set("startDate", filterFrom);
      if (filterTo) params.set("endDate", filterTo);
      if (filterSeller) params.set("seller", filterSeller);
      if (filterType) params.set("type", filterType);
      params.set("groupBy", filterGroupBy);
      const res = await api.get(`/reports/stores?${params.toString()}`);
      setStoresData(res.data);
    } catch {
      toast.error("Error al cargar reporte por período");
    } finally {
      setStoresLoading(false);
    }
  }, [filterPeriod, filterLocation, filterFrom, filterTo, filterSeller, filterType, filterGroupBy]);

  const fetchInventory = useCallback(async (lowStock: boolean) => {
    try {
      setInventoryLoading(true);
      const params = new URLSearchParams();
      if (filterLocation) params.set("locationId", filterLocation);
      if (filterSearch) params.set("brand", filterSearch);
      if (lowStock) params.set("lowStock", "true");
      const res = await api.get(`/reports/inventory?${params.toString()}`);
      setInventoryData(res.data);
    } catch {
      toast.error("Error al cargar reporte de inventario");
    } finally {
      setInventoryLoading(false);
    }
  }, [filterLocation, filterSearch]);

  const fetchSuppliers = useCallback(async () => {
    try {
      setSuppliersLoading(true);
      const res = await api.get("/reports/suppliers");
      setSuppliersData(res.data);
    } catch (err: any) {
      if (err.response?.status === 403) {
        toast.error("Reporte de proveedores no disponible para el rol actual");
      } else {
        toast.error("Error al cargar reporte de proveedores");
      }
    } finally {
      setSuppliersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "ventas") fetchSales();
    if (activeTab === "periodo" || activeTab === "costo") fetchStores();
    if (activeTab === "inventario") fetchInventory(false);
    if (activeTab === "cero") fetchInventory(true);
    if (activeTab === "proveedores") fetchSuppliers();
  }, [activeTab, fetchSales, fetchStores, fetchInventory, fetchSuppliers]);

  const exportCSV = (data: Record<string, any>[], filename: string) => {
    if (!data.length) { toast.error("No hay datos para exportar"); return; }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");
    XLSX.writeFile(wb, `${filename}.xlsx`);
    toast.success("Exportado correctamente");
  };

  const exportPDF = (headers: string[], rows: string[][], title: string, filename: string) => {
    if (!rows.length) { toast.error("No hay datos para exportar"); return; }
    const doc = new jsPDF("l", "mm", "a4");
    doc.setFontSize(14);
    doc.text(`Shibumi - ${title}`, 14, 15);
    doc.setFontSize(9);
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-BO")}`, 14, 22);

    let y = 28;
    const colWidths = headers.map(() => Math.floor(267 / headers.length));
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    let x = 14;
    headers.forEach((h, i) => { doc.text(h, x, y); x += colWidths[i]; });
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.line(14, y, 281, y);
    y += 4;

    for (const row of rows) {
      if (y > 190) { doc.addPage(); y = 15; }
      x = 14;
      row.forEach((cell, i) => { doc.text(String(cell).substring(0, 30), x, y); x += colWidths[i]; });
      y += 4;
    }

    doc.save(`${filename}.pdf`);
    toast.success("PDF exportado correctamente");
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("es-BO", { day: "2-digit", month: "short", year: "numeric" });

  // ---- Derived ----
  const filteredSalesDetails = salesDetails.filter((s: any) =>
    !filterSearch
    || (s.productName || "").toLowerCase().includes(filterSearch.toLowerCase())
    || (s.factoryCode || "").toLowerCase().includes(filterSearch.toLowerCase())
    || (s.brand || "").toLowerCase().includes(filterSearch.toLowerCase())
    || (s.seller || "").toLowerCase().includes(filterSearch.toLowerCase())
    || String(s.saleId).includes(filterSearch)
  );

  const storesGroups = storesData?.groups || [];
  const filteredStores = storesGroups.filter((g) =>
    !filterSearch
    || g.periodLabel.toLowerCase().includes(filterSearch.toLowerCase())
    || g.location?.name.toLowerCase().includes(filterSearch.toLowerCase())
    || (g.seller || "").toLowerCase().includes(filterSearch.toLowerCase())
  );
  const storesSummary = storesData?.summary || {
    totalSales: 0, totalReturns: 0, netSales: 0, storeCost: 0, utility: 0, saleCount: 0, itemsQty: 0, items: 0, period: "day",
  };
  const storesDetails: StoreDetail[] = storesData?.details || [];

  const inventoryItems: InventoryItem[] = inventoryData?.locations?.flatMap((loc: any) => loc.items) || [];
  const filteredInventory = inventoryItems.filter((i) =>
    !filterSearch 
    || i.product.name.toLowerCase().includes(filterSearch.toLowerCase()) 
    || i.product.brand.toLowerCase().includes(filterSearch.toLowerCase()) 
    || i.product.itemCode.toLowerCase().includes(filterSearch.toLowerCase())
    || (i.product.factoryCode || "").toLowerCase().includes(filterSearch.toLowerCase())
    || (i.product.oemCode || "").toLowerCase().includes(filterSearch.toLowerCase())
  );

  const suppliersShow = (suppliersData?.suppliers || []).filter((sup) =>
    !filterSearch
    || sup.name.toLowerCase().includes(filterSearch.toLowerCase())
    || (sup.nit || "").toLowerCase().includes(filterSearch.toLowerCase())
    || sup.recentCosts.some((c) => c.product.name.toLowerCase().includes(filterSearch.toLowerCase()))
  );

  const showDateRange = activeTab === "ventas" || activeTab === "periodo" || activeTab === "costo";
  const showSeller = activeTab === "ventas" || activeTab === "periodo" || activeTab === "costo";
  const showType = activeTab === "ventas" || activeTab === "periodo" || activeTab === "costo";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reportes</h1>
        <p className="text-gray-400 text-sm mt-1">Ventas por período, costo de tiendas, stock y proveedores</p>
      </div>

      <div className="flex flex-wrap gap-2 bg-dark-800/50 border border-dark-700/50 rounded-xl p-1">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? "bg-primary-600/20 text-primary-400 border border-primary-600/30"
                : "text-gray-400 hover:text-gray-200 border border-transparent"
            }`}>
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {/* ===== Summary cards ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {activeTab === "ventas" && (
          <>
            <SummaryCard label="Total Ventas" value={formatBs(salesSummary.totalSales)} tone="emerald" sub={`${salesSummary.totalQuantity || 0} unidades`} />
            <SummaryCard label="Total Costo Tienda" value={formatBs(salesSummary.totalStoreCost || 0)} tone="red" sub="Suma de Costo Tienda" />
            <SummaryCard label="Registros" value={String(filteredSalesDetails.length)} tone="green" sub="líneas de producto" />
          </>
        )}
        {activeTab === "periodo" && (
          <>
            <SummaryCard label="Total Ventas" value={formatBs(storesSummary.totalSales)} tone="emerald" sub={`${storesSummary.saleCount} ventas · ${storesSummary.itemsQty || storesSummary.items || 0} ítems`} />
            <SummaryCard label="Ventas Netas" value={formatBs(storesSummary.netSales)} tone="blue" sub={`${formatBs(storesSummary.totalReturns)} en devoluciones`} />
            <SummaryCard label="Costo Tienda" value={formatBs(storesSummary.storeCost || 0)} tone="red" sub="Suma de priceHermana por producto" />
          </>
        )}
        {activeTab === "costo" && (
          <>
            <SummaryCard label="Total Ventas" value={formatBs(storesSummary.totalSales)} tone="emerald" sub="" />
            <SummaryCard label="Costo Tienda" value={formatBs(storesSummary.storeCost || 0)} tone="blue" sub="priceHermana × cantidad" />
            <SummaryCard label="Utilidad" value={formatBs(storesSummary.utility)} tone="green" sub="Neto − Costo Tienda" />
          </>
        )}
        {(activeTab === "inventario" || activeTab === "cero") && (
          <>
            <SummaryCard label="Productos" value={String(inventoryData?.totalProducts || 0)} tone="emerald" sub={activeTab === "cero" ? "con stock crítico / agotado" : "total en los filtros"} />
            <SummaryCard label="Stock Total" value={`${inventoryData?.totalStock || 0} uds`} tone="blue" sub="" />
            <SummaryCard label="Stock Crítico" value={String(inventoryData?.lowStockCount || 0)} tone={activeTab === "cero" ? "red" : "green"} sub={activeTab === "cero" ? "requiere atención" : ""} />
          </>
        )}
        {activeTab === "proveedores" && (
          <>
            <SummaryCard label="Proveedores" value={String(suppliersData?.summary?.totalSuppliers || 0)} tone="emerald" sub="" />
            <SummaryCard label="Total Compras" value={formatBs(suppliersData?.summary?.totalPurchases || 0)} tone="blue" sub="suma de costos registrados" />
            <SummaryCard label="Productos" value={String(suppliersShow.reduce((sum, s) => sum + s.productsCount, 0))} tone="green" sub="por proveedor" />
          </>
        )}
      </div>

      {/* ===== Filters ===== */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)}
            placeholder={activeTab === "cero" || activeTab === "inventario" ? "Buscar producto / código..." : "Buscar..."}
            aria-label="Buscar"
            className="pl-9 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500 w-48" />
        </div>

        <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)}
          className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500">
          <option value="">Todas las ubicaciones</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>

        {showType && (
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500">
            {TYPES.map((t) => <option key={t.key || "all"} value={t.key}>{t.label}</option>)}
          </select>
        )}

        {showSeller && (
          <input value={filterSeller} onChange={(e) => setFilterSeller(e.target.value)} placeholder="Vendedor" aria-label="Filtrar por vendedor"
            className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500 w-40" />
        )}

        {(activeTab === "periodo" || activeTab === "costo") && (
          <div className="flex gap-1 p-1 bg-dark-800 border border-dark-700 rounded-xl">
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => setFilterPeriod(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filterPeriod === p.key ? "bg-primary-600/20 text-primary-400" : "text-gray-400 hover:text-gray-200"
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        )}

        {showDateRange && (
          <>
            <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
              className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
            <span className="text-gray-500 text-sm">→</span>
            <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
              className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
          </>
        )}

        {(activeTab === "periodo" || activeTab === "costo") && (
          <select value={filterGroupBy} onChange={(e) => setFilterGroupBy(e.target.value as any)}
            className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500">
            <option value="both">Agrupar: Tienda + Vendedor</option>
            <option value="location">Agrupar: Solo por Tienda</option>
            <option value="seller">Agrupar: Solo por Vendedor</option>
          </select>
        )}

        {activeTab === "ventas" && (
          <label className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-300">
            <input type="checkbox" checked={filterNoInvoice} onChange={(e) => setFilterNoInvoice(e.target.checked)} className="accent-primary-600" />
            Sin factura
          </label>
        )}

        {activeTab === "ventas" && (
          <>
            <input value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)} placeholder="Marca" aria-label="Filtrar por marca" className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500 w-32" />
            <input value={filterModel} onChange={(e) => setFilterModel(e.target.value)} placeholder="Modelo" aria-label="Filtrar por modelo" className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500 w-32" />
            <input value={filterProduct} onChange={(e) => setFilterProduct(e.target.value)} placeholder="Producto" aria-label="Filtrar por producto" className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500 w-32" />
            <select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)} className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500 max-w-40">
              <option value="">Proveedor</option>
              {suppliers.map((sup) => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
            </select>
          </>
        )}
      </div>

      {/* ===== Ventas (detalle por producto) ===== */}
      {activeTab === "ventas" && (
        <ReportCard
          title="Reporte de Ventas - Detalle por producto"
          loading={salesLoading}
          refresh={fetchSales}
          onExportExcel={() => exportCSV(filteredSalesDetails.map((s: any) => ({
            Fecha: formatDate(s.date), "Venta N°": saleCode(s.saleId, s.date), "Cód. Fábrica": s.factoryCode || "N/A",
            Producto: s.productName || "N/A", Marca: s.brand || "N/A", Modelo: s.model || "N/A",
            Cantidad: s.quantity, "Precio de Venta": s.unitPrice, "Costo Tienda (unit.)": s.storeCostUnit,
            "Total Venta": s.lineTotal, "Total Costo Tienda": s.lineStoreCost, Ubicación: s.location || "N/A", Vendedor: s.seller || "N/A",
          })), "reporte_ventas_detalle")}
          onExportPDF={() => exportPDF(
            ["Fecha", "Venta N°", "Cód. Fábrica", "Producto", "Cantidad", "Precio Venta", "Costo Tienda", "Total Venta", "Total Costo Tienda"],
            filteredSalesDetails.map((s: any) => [formatDate(s.date), saleCode(s.saleId, s.date), s.factoryCode || "N/A", (s.productName || "N/A").substring(0, 25), String(s.quantity), String(s.unitPrice), String(s.storeCostUnit), String(s.lineTotal), String(s.lineStoreCost)]),
            "Reporte de Ventas - Detalle", "reporte_ventas_detalle"
          )}>
          {filteredSalesDetails.length === 0 ? (
            <EmptyRow cols={12} msg="No hay ventas para los filtros seleccionados" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700/50">
                    <SortableTh>Fecha</SortableTh>
                    <SortableTh>Venta N°</SortableTh>
                    <SortableTh>Cód. Fábrica</SortableTh>
                    <SortableTh>Producto</SortableTh>
                    <SortableTh>Marca</SortableTh>
                    <SortableTh>Modelo</SortableTh>
                    <RightTh>Cantidad</RightTh>
                    <RightTh>Precio de Venta</RightTh>
                    <RightTh>Costo Tienda (unit.)</RightTh>
                    <RightTh>Total Venta</RightTh>
                    <RightTh>Total Costo Tienda</RightTh>
                    <SortableTh>Vendedor</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {filteredSalesDetails.map((s: any, idx: number) => (
                    <tr key={`${s.saleId}-${idx}`} className="border-b border-dark-700/30 hover:bg-dark-700/30 transition-colors">
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{formatDate(s.date)}</td>
                      <td className="px-4 py-3 text-amber-400/90 font-mono text-xs whitespace-nowrap">{saleCode(s.saleId, s.date)}</td>
                      <td className="px-4 py-3 text-gray-300 font-mono text-xs">{s.factoryCode || "N/A"}</td>
                      <td className="px-4 py-3 text-foreground font-medium max-w-[200px] truncate" title={s.productName || ""}>{s.productName || "N/A"}</td>
                      <td className="px-4 py-3 text-gray-300">{s.brand || "N/A"}</td>
                      <td className="px-4 py-3 text-gray-300">{s.model || "N/A"}</td>
                      <td className="px-4 py-3 text-gray-300 text-right">{s.quantity}</td>
                      <td className="px-4 py-3 text-emerald-400 text-right">{formatBs(s.unitPrice)}</td>
                      <td className="px-4 py-3 text-red-400/80 text-right">{formatBs(s.storeCostUnit)}</td>
                      <td className="px-4 py-3 text-emerald-400 font-medium text-right">{formatBs(s.lineTotal)}</td>
                      <td className="px-4 py-3 text-red-400 font-medium text-right">{formatBs(s.lineStoreCost)}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{s.seller || "N/A"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-dark-900/60 border-t-2 border-dark-600">
                    <td colSpan={6} className="px-4 py-3 text-foreground font-bold">TOTALES</td>
                    <td className="px-4 py-3 text-foreground font-bold text-right">{filteredSalesDetails.reduce((sum: number, r: any) => sum + (r.quantity || 0), 0)}</td>
                    <td className="px-4 py-3 text-right">-</td>
                    <td className="px-4 py-3 text-right">-</td>
                    <td className="px-4 py-3 text-emerald-400 font-bold text-right">{formatBs(filteredSalesDetails.reduce((sum: number, r: any) => sum + (r.lineTotal || 0), 0))}</td>
                    <td className="px-4 py-3 text-red-400 font-bold text-right">{formatBs(filteredSalesDetails.reduce((sum: number, r: any) => sum + (r.lineStoreCost || 0), 0))}</td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </ReportCard>
      )}

      {/* ===== Por Período (diario / semanal / mensual / personalizado) ===== */}
      {activeTab === "periodo" && (
        <ReportCard
          title="Ventas por Período · tiendas y vendedor"
          loading={storesLoading}
          refresh={fetchStores}
          onExportExcel={() => exportCSV(filteredStores.map((g) => ({
            Periodo: g.periodLabel, Tienda: g.location?.name || "N/A", Vendedor: g.seller || "Sin vendedor",
            "N° Ventas": g.saleCount, "Items": (g.itemsQty || g.items || 0) as any, Total: g.totalSales, Devoluciones: g.returns, Neto: g.netSales,
            "Costo Tienda": g.storeCost, Utilidad: g.utility,
          })), "reporte_periodo")}
          onExportPDF={() => exportPDF(
            ["Periodo", "Tienda", "Vendedor", "N° Ventas", "Total", "Neto", "Costo Tienda", "Utilidad"],
            filteredStores.map((g) => [g.periodLabel, g.location?.name || "N/A", g.seller || "Sin vendedor", String(g.saleCount), String(g.totalSales), String(g.netSales), String(g.storeCost), String(g.utility)]),
            "Ventas por Período", "reporte_periodo"
          )}>
          <p className="px-4 pt-3 text-xs text-gray-500">
            {filterPeriod === "all" ? "Rango personalizado" : PERIODS.find((p) => p.key === filterPeriod)?.label}
            {filterSeller && <> · vendedor: <span className="text-primary-400">"{filterSeller}"</span></>}
            {filterLocation && <> · solo la ubicación seleccionada</>} · Costo Tienda tomado directamente de <span className="text-primary-400">priceHermana</span> de cada producto
          </p>
          {filteredStores.length === 0 ? (
            <EmptyRowWithPad msg="No hay ventas en el período y filtros seleccionados" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700/50">
                    <SortableTh>Período</SortableTh>
                    <SortableTh>Tienda</SortableTh>
                    <SortableTh>Vendedor</SortableTh>
                    <CenterTh>N° Ventas</CenterTh>
                    <RightTh>Total</RightTh>
                    <RightTh>Devoluciones</RightTh>
                    <RightTh>Neto</RightTh>
                    <RightTh>Costo Tienda</RightTh>
                    <RightTh>Utilidad</RightTh>
                  </tr>
                </thead>
                <tbody>
                  {filteredStores.map((g, i) => (
                    <tr key={i} className="border-b border-dark-700/30 hover:bg-dark-700/30 transition-colors">
                      <td className="px-4 py-3 text-gray-300">{g.periodLabel}</td>
                      <td className="px-4 py-3 text-foreground font-medium">{g.location?.name || "N/A"}</td>
                      <td className="px-4 py-3 text-gray-300 text-xs">{g.seller || "Sin vendedor"}</td>
                      <td className="px-4 py-3 text-gray-300 text-center">{g.saleCount}</td>
                      <td className="px-4 py-3 text-emerald-400 font-medium text-right">{formatBs(g.totalSales)}</td>
                      <td className="px-4 py-3 text-red-400 text-right">{formatBs(g.returns)}</td>
                      <td className="px-4 py-3 text-green-400 font-medium text-right">{formatBs(g.netSales)}</td>
                      <td className="px-4 py-3 text-red-400/80 text-right">{formatBs(g.storeCost)}</td>
                      <td className="px-4 py-3 text-green-400 font-medium text-right">{formatBs(g.utility)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ReportCard>
      )}

      {/* ===== Costo Tiendas ===== */}
      {activeTab === "costo" && (
        <ReportCard
          title="Costo Tiendas · Suma por Costo Tienda (priceHermana) de cada producto vendido"
          loading={storesLoading}
          refresh={fetchStores}
          onExportExcel={() => exportCSV(filteredStores.map((g) => ({
            Periodo: g.periodLabel, Tienda: g.location?.name || "N/A", Vendedor: g.seller || "Sin vendedor",
            Ventas: g.totalSales, Neto: g.netSales, "Costo Tienda": g.storeCost, Utilidad: g.utility,
          })), "reporte_costo_tiendas")}
          onExportPDF={() => exportPDF(
            ["Periodo", "Tienda", "Vendedor", "Ventas", "Neto", "Costo Tienda", "Utilidad"],
            filteredStores.map((g) => [g.periodLabel, g.location?.name || "N/A", g.seller || "Sin vendedor", String(g.totalSales), String(g.netSales), String(g.storeCost), String(g.utility)]),
            "Costo Tiendas", "reporte_costo_tiendas"
          )}>
          <p className="px-4 pt-3 text-xs text-gray-500">
            El "Costo Tienda" se toma directamente de <span className="text-primary-400">priceHermana</span> de cada producto vendido × cantidad. Sin recargo.
            {filterPeriod === "all" ? " Rango personalizado." : ` Agrupado ${PERIODS.find((p) => p.key === filterPeriod)?.label.toLowerCase()}.`}
          </p>
          {filteredStores.length === 0 ? (
            <EmptyRowWithPad msg="No hay datos para el período y filtros seleccionados" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700/50">
                    <SortableTh>Período</SortableTh>
                    <SortableTh>Tienda</SortableTh>
                    <SortableTh>Vendedor</SortableTh>
                    <RightTh>Total Ventas</RightTh>
                    <RightTh>Devoluciones</RightTh>
                    <RightTh>Neto</RightTh>
                    <RightTh textColor="text-red-400">Costo Tienda</RightTh>
                    <RightTh textColor="text-green-400">Utilidad</RightTh>
                  </tr>
                </thead>
                <tbody>
                  {filteredStores.map((g, i) => (
                    <tr key={i} className="border-b border-dark-700/30 hover:bg-dark-700/30 transition-colors">
                      <td className="px-4 py-3 text-gray-300">{g.periodLabel}</td>
                      <td className="px-4 py-3 text-foreground font-medium">{g.location?.name || "N/A"}</td>
                      <td className="px-4 py-3 text-gray-300 text-xs">{g.seller || "Sin vendedor"}</td>
                      <td className="px-4 py-3 text-emerald-400 font-medium text-right">{formatBs(g.totalSales)}</td>
                      <td className="px-4 py-3 text-red-400 text-right">{formatBs(g.returns)}</td>
                      <td className="px-4 py-3 text-green-400 font-medium text-right">{formatBs(g.netSales)}</td>
                      <td className="px-4 py-3 text-red-400/80 text-right">{formatBs(g.storeCost)}</td>
                      <td className="px-4 py-3 text-green-400 font-medium text-right">{formatBs(g.utility)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {activeTab === "costo" && storesDetails.length > 0 && (
            <div className="mt-4 border-t border-dark-700/50">
              <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2">
                <h4 className="text-foreground font-medium text-sm">Detalle de productos vendidos</h4>
                <div className="flex items-center gap-2">
                  <button onClick={() => exportCSV(storesDetails.map((d) => ({
                    Fecha: formatDate(d.saleDate),
                    "Venta N°": saleCode(d.saleId, d.saleDate),
                    Tienda: d.location,
                    Vendedor: d.seller,
                    "Cód. Fábrica": d.factoryCode || "N/A",
                    Producto: d.productName,
                    Marca: d.brand,
                    Modelo: d.model,
                    Cantidad: d.quantity,
                    "Precio Venta": d.unitPrice,
                    "Costo Tienda (unit.)": d.storeCostUnit,
                    "Total Venta": d.lineTotal,
                    "Total Costo Tienda": d.storeCostLine,
                  })), "reporte_costo_tiendas_detalle")} className="px-2 py-1 text-xs bg-dark-800 border border-dark-700 rounded-lg text-gray-300 hover:text-foreground">Exportar detalle Excel</button>
                  <button onClick={() => exportPDF(
                    ["Fecha", "Venta N°", "Tienda", "Vendedor", "Cód. Fábrica", "Producto", "Cantidad", "Precio Venta", "Costo Tienda", "Total Venta", "Total Costo Tienda"],
                    storesDetails.map((d) => [formatDate(d.saleDate), saleCode(d.saleId, d.saleDate), d.location, d.seller, d.factoryCode || "N/A", (d.productName || "N/A").substring(0, 20), String(d.quantity), String(d.unitPrice), String(d.storeCostUnit), String(d.lineTotal), String(d.storeCostLine)]),
                    "Costo Tiendas - Detalle de productos", "reporte_costo_tiendas_detalle"
                  )} className="px-2 py-1 text-xs bg-dark-800 border border-dark-700 rounded-lg text-gray-300 hover:text-foreground">Exportar detalle PDF</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-dark-700/50">
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Fecha</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Venta N°</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Tienda</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Vendedor</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Cód. Fábrica</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Producto</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Marca</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Modelo</th>
                      <th className="px-3 py-2 text-right text-gray-400 font-medium">Cantidad</th>
                      <th className="px-3 py-2 text-right text-gray-400 font-medium">Precio Venta</th>
                      <th className="px-3 py-2 text-right text-gray-400 font-medium">Costo Tienda (unit.)</th>
                      <th className="px-3 py-2 text-right text-gray-400 font-medium">Total Venta</th>
                      <th className="px-3 py-2 text-right text-gray-400 font-medium">Total Costo Tienda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storesDetails.map((d, idx) => (
                      <tr key={`${d.saleId}-${idx}`} className="border-b border-dark-700/30 hover:bg-dark-700/30 transition-colors">
                        <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{formatDate(d.saleDate)}</td>
                        <td className="px-3 py-2 text-amber-400/90 font-mono text-[10px]">{saleCode(d.saleId, d.saleDate)}</td>
                        <td className="px-3 py-2 text-gray-300">{d.location}</td>
                        <td className="px-3 py-2 text-gray-300 text-[11px]">{d.seller}</td>
                        <td className="px-3 py-2 text-gray-300 font-mono text-[10px]">{d.factoryCode || "N/A"}</td>
                        <td className="px-3 py-2 text-foreground max-w-[160px] truncate" title={d.productName}>{d.productName}</td>
                        <td className="px-3 py-2 text-gray-300">{d.brand}</td>
                        <td className="px-3 py-2 text-gray-300">{d.model}</td>
                        <td className="px-3 py-2 text-gray-300 text-right">{d.quantity}</td>
                        <td className="px-3 py-2 text-emerald-400 text-right">{formatBs(d.unitPrice)}</td>
                        <td className="px-3 py-2 text-red-400/80 text-right">{formatBs(d.storeCostUnit)}</td>
                        <td className="px-3 py-2 text-emerald-400 text-right">{formatBs(d.lineTotal)}</td>
                        <td className="px-3 py-2 text-red-400 text-right">{formatBs(d.storeCostLine)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-dark-900/60 border-t-2 border-dark-600">
                      <td colSpan={8} className="px-3 py-2 text-foreground font-bold">TOTALES</td>
                      <td className="px-3 py-2 text-foreground font-bold text-right">{storesDetails.reduce((s, r) => s + (r.quantity || 0), 0)}</td>
                      <td className="px-3 py-2 text-right">-</td>
                      <td className="px-3 py-2 text-right">-</td>
                      <td className="px-3 py-2 text-emerald-400 font-bold text-right">{formatBs(storesDetails.reduce((s, r) => s + (r.lineTotal || 0), 0))}</td>
                      <td className="px-3 py-2 text-red-400 font-bold text-right">{formatBs(storesDetails.reduce((s, r) => s + (r.storeCostLine || 0), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </ReportCard>
      )}

      {/* ===== Inventario ===== */}
      {activeTab === "inventario" && (
        <ReportCard
          title="Reporte de Inventario"
          loading={inventoryLoading}
          refresh={() => fetchInventory(false)}
          onExportExcel={() => exportCSV(filteredInventory.map((i) => ({
            Proveedor: "N/A",
            Fabricante: i.product.manufacturer || "N/A",
            Producto: i.product.name,
            Marca: i.product.brand,
            Modelo: i.product.model,
            Año: i.product.year || "N/A",
            Detalles: i.product.detalles || i.product.detail || "N/A",
            "Cód. OEM": i.product.oemCode || "N/A",
            "Cód. Fábrica": i.product.factoryCode || i.product.itemCode || "N/A",
            "Costo $": i.product.unitPrice || "0",
            "Costo Bs": i.product.cost || "0",
            "Costo Tiendas": i.product.priceHermana || "0",
            "Precio 1": i.product.price1 || "0",
            "Precio 2": i.product.price2 || "0",
            "Precio Mayor": i.product.wholesalePrice || "0",
            Stock: i.stock,
          })), "reporte_inventario")}
          onExportPDF={() => exportPDF(
            ["Proveedor", "Fabricante", "Producto", "Marca", "Modelo", "Año", "Detalles", "Cód. OEM", "Cód. Fábrica", "Costo $", "Costo Bs", "Costo Tiendas", "Precio 1", "Precio 2", "Precio Mayor", "Stock"],
            filteredInventory.map((i) => [
              "N/A",
              (i.product.manufacturer || "N/A").substring(0, 18),
              (i.product.name || "N/A").substring(0, 28),
              i.product.brand || "N/A",
              (i.product.model || "N/A").substring(0, 18),
              i.product.year || "N/A",
              (i.product.detalles || i.product.detail || "N/A").substring(0, 25),
              i.product.oemCode || "N/A",
              i.product.factoryCode || i.product.itemCode || "N/A",
              String(i.product.unitPrice || "0"),
              String(i.product.cost || "0"),
              String(i.product.priceHermana || "0"),
              String(i.product.price1 || "0"),
              String(i.product.price2 || "0"),
              String(i.product.wholesalePrice || "0"),
              String(i.stock),
            ]),
            "Reporte de Inventario", "reporte_inventario"
          )}>
          {filteredInventory.length === 0 ? (
            <EmptyRowWithPad msg="No hay datos para los filtros seleccionados" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-dark-700/50">
                    <SortableTh>Proveedor</SortableTh>
                    <SortableTh>Fabricante</SortableTh>
                    <SortableTh>Producto</SortableTh>
                    <SortableTh>Marca</SortableTh>
                    <SortableTh>Modelo</SortableTh>
                    <SortableTh>Año</SortableTh>
                    <SortableTh>Detalles</SortableTh>
                    <SortableTh>Cód. OEM</SortableTh>
                    <SortableTh>Cód. Fábrica</SortableTh>
                    <RightTh>Costo $</RightTh>
                    <RightTh>Costo Bs</RightTh>
                    <RightTh>Costo Tiendas</RightTh>
                    <RightTh>Precio 1</RightTh>
                    <RightTh>Precio 2</RightTh>
                    <RightTh>Precio Mayor</RightTh>
                    <CenterTh>Stock</CenterTh>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.map((i) => (
                    <tr key={i.id} className="border-b border-dark-700/30 hover:bg-dark-700/30 transition-colors">
                      <td className="px-3 py-2 text-gray-300 max-w-[120px] truncate">N/A</td>
                      <td className="px-3 py-2 text-gray-300 max-w-[120px] truncate" title={i.product.manufacturer || ""}>{i.product.manufacturer || "N/A"}</td>
                      <td className="px-3 py-2 text-foreground font-medium max-w-[180px] truncate" title={i.product.name}>{i.product.name}</td>
                      <td className="px-3 py-2 text-gray-300">{i.product.brand}</td>
                      <td className="px-3 py-2 text-gray-300 max-w-[120px] truncate" title={i.product.model}>{i.product.model}</td>
                      <td className="px-3 py-2 text-gray-300">{i.product.year || "N/A"}</td>
                      <td className="px-3 py-2 text-gray-400 max-w-[150px] truncate" title={i.product.detalles || i.product.detail || ""}>{i.product.detalles || i.product.detail || "N/A"}</td>
                      <td className="px-3 py-2 text-gray-300 font-mono text-[10px]">{i.product.oemCode || "N/A"}</td>
                      <td className="px-3 py-2 text-gray-300 font-mono text-[10px]">{i.product.factoryCode || i.product.itemCode}</td>
                      <td className="px-3 py-2 text-right text-gray-300">{i.product.unitPrice || "0"}</td>
                      <td className="px-3 py-2 text-right text-gray-300">{i.product.cost || "0"}</td>
                      <td className="px-3 py-2 text-right text-red-400/80">{i.product.priceHermana || "0"}</td>
                      <td className="px-3 py-2 text-right text-emerald-400/80">{i.product.price1 || "0"}</td>
                      <td className="px-3 py-2 text-right text-emerald-400/80">{i.product.price2 || "0"}</td>
                      <td className="px-3 py-2 text-right text-emerald-400 font-medium">{i.product.wholesalePrice || "0"}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          i.stock === 0 ? "bg-red-500/20 text-red-400" :
                          i.stock <= i.minStock ? "bg-yellow-500/20 text-yellow-400" :
                          "bg-green-500/20 text-green-400"
                        }`}>{i.stock}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ReportCard>
      )}

      {/* ===== Cercanos a 0 ===== */}
      {activeTab === "cero" && (
        <ReportCard
          title="Productos Cercanos a 0 (agotados o en/bajo mínimo)"
          loading={inventoryLoading}
          refresh={() => fetchInventory(true)}
          onExportExcel={() => exportCSV(filteredInventory.map((i) => ({
            Proveedor: "N/A",
            Fabricante: i.product.manufacturer || "N/A",
            Producto: i.product.name,
            Marca: i.product.brand,
            Modelo: i.product.model,
            Año: i.product.year || "N/A",
            Detalles: i.product.detalles || i.product.detail || "N/A",
            "Cód. OEM": i.product.oemCode || "N/A",
            "Cód. Fábrica": i.product.factoryCode || i.product.itemCode || "N/A",
            "Costo $": i.product.unitPrice || "0",
            "Costo Bs": i.product.cost || "0",
            "Costo Tiendas": i.product.priceHermana || "0",
            "Precio 1": i.product.price1 || "0",
            "Precio 2": i.product.price2 || "0",
            "Precio Mayor": i.product.wholesalePrice || "0",
            Stock: i.stock,
          })), "reporte_cercanos_0")}
          onExportPDF={() => exportPDF(
            ["Proveedor", "Fabricante", "Producto", "Marca", "Modelo", "Año", "Detalles", "Cód. OEM", "Cód. Fábrica", "Costo $", "Costo Bs", "Costo Tiendas", "Precio 1", "Precio 2", "Precio Mayor", "Stock"],
            filteredInventory.map((i) => [
              "N/A",
              (i.product.manufacturer || "N/A").substring(0, 18),
              (i.product.name || "N/A").substring(0, 28),
              i.product.brand || "N/A",
              (i.product.model || "N/A").substring(0, 18),
              i.product.year || "N/A",
              (i.product.detalles || i.product.detail || "N/A").substring(0, 25),
              i.product.oemCode || "N/A",
              i.product.factoryCode || i.product.itemCode || "N/A",
              String(i.product.unitPrice || "0"),
              String(i.product.cost || "0"),
              String(i.product.priceHermana || "0"),
              String(i.product.price1 || "0"),
              String(i.product.price2 || "0"),
              String(i.product.wholesalePrice || "0"),
              String(i.stock),
            ]),
            "Productos Cercanos a 0", "reporte_cercanos_0"
          )}>
          {filteredInventory.length === 0 ? (
            <EmptyRowWithPad msg="Sin productos en riesgo · todo el stock está por encima del mínimo" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-dark-700/50">
                    <SortableTh>Proveedor</SortableTh>
                    <SortableTh>Fabricante</SortableTh>
                    <SortableTh>Producto</SortableTh>
                    <SortableTh>Marca</SortableTh>
                    <SortableTh>Modelo</SortableTh>
                    <SortableTh>Año</SortableTh>
                    <SortableTh>Detalles</SortableTh>
                    <SortableTh>Cód. OEM</SortableTh>
                    <SortableTh>Cód. Fábrica</SortableTh>
                    <RightTh>Costo $</RightTh>
                    <RightTh>Costo Bs</RightTh>
                    <RightTh>Costo Tiendas</RightTh>
                    <RightTh>Precio 1</RightTh>
                    <RightTh>Precio 2</RightTh>
                    <RightTh>Precio Mayor</RightTh>
                    <RightTh>Stock</RightTh>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.map((i) => (
                    <tr key={i.id} className="border-b border-dark-700/30 hover:bg-dark-700/30 transition-colors">
                      <td className="px-3 py-2 text-gray-300 max-w-[120px] truncate">N/A</td>
                      <td className="px-3 py-2 text-gray-300 max-w-[120px] truncate" title={i.product.manufacturer || ""}>{i.product.manufacturer || "N/A"}</td>
                      <td className="px-3 py-2 text-foreground font-medium max-w-[180px] truncate" title={i.product.name}>{i.product.name}</td>
                      <td className="px-3 py-2 text-gray-300">{i.product.brand}</td>
                      <td className="px-3 py-2 text-gray-300 max-w-[120px] truncate" title={i.product.model}>{i.product.model}</td>
                      <td className="px-3 py-2 text-gray-300">{i.product.year || "N/A"}</td>
                      <td className="px-3 py-2 text-gray-400 max-w-[150px] truncate" title={i.product.detalles || i.product.detail || ""}>{i.product.detalles || i.product.detail || "N/A"}</td>
                      <td className="px-3 py-2 text-gray-300 font-mono text-[10px]">{i.product.oemCode || "N/A"}</td>
                      <td className="px-3 py-2 text-gray-300 font-mono text-[10px]">{i.product.factoryCode || i.product.itemCode}</td>
                      <td className="px-3 py-2 text-right text-gray-300">{i.product.unitPrice || "0"}</td>
                      <td className="px-3 py-2 text-right text-gray-300">{i.product.cost || "0"}</td>
                      <td className="px-3 py-2 text-right text-red-400/80">{i.product.priceHermana || "0"}</td>
                      <td className="px-3 py-2 text-right text-emerald-400/80">{i.product.price1 || "0"}</td>
                      <td className="px-3 py-2 text-right text-emerald-400/80">{i.product.price2 || "0"}</td>
                      <td className="px-3 py-2 text-right text-emerald-400 font-medium">{i.product.wholesalePrice || "0"}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${i.stock === 0 ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}`}>{i.stock}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ReportCard>
      )}

      {/* ===== Proveedores ===== */}
      {activeTab === "proveedores" && (
        <ReportCard
          title="Reporte de Proveedores"
          loading={suppliersLoading}
          refresh={fetchSuppliers}
          onExportExcel={() => exportCSV(suppliersShow.map((sup) => ({
            Proveedor: sup.name, NIT: sup.nit || "N/A", Telefono: sup.phone || "N/A",
            Productos: sup.productsCount, "Total Compras": sup.totalPurchases,
            "Última Compra": sup.lastPurchase ? formatDate(sup.lastPurchase) : "N/A",
          })), "reporte_proveedores")}
          onExportPDF={() => exportPDF(
            ["Proveedor", "NIT", "Telefono", "Productos", "Total Compras", "Última Compra"],
            suppliersShow.map((sup) => [sup.name, sup.nit || "N/A", sup.phone || "N/A", String(sup.productsCount), String(sup.totalPurchases), sup.lastPurchase ? formatDate(sup.lastPurchase) : "N/A"]),
            "Reporte de Proveedores", "reporte_proveedores"
          )}>
          {suppliersShow.length === 0 ? (
            <EmptyRowWithPad msg="Sin proveedores registrados" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700/50">
                    <SortableTh>Proveedor</SortableTh>
                    <SortableTh>NIT</SortableTh>
                    <SortableTh>Teléfono</SortableTh>
                    <CenterTh>Productos</CenterTh>
                    <RightTh>Total Compras</RightTh>
                    <SortableTh>Última Compra</SortableTh>
                    <CenterTh>Detalle</CenterTh>
                  </tr>
                </thead>
                <tbody>
                  {suppliersShow.map((sup) => (
                    <tr key={sup.id} className="border-b border-dark-700/30 align-top hover:bg-dark-700/30 transition-colors">
                      <td className="px-4 py-3 text-foreground font-medium">{sup.name}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{sup.nit || "—"}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{sup.phone || "—"}</td>
                      <td className="px-4 py-3 text-gray-300 text-center">{sup.productsCount}</td>
                      <td className="px-4 py-3 text-emerald-400 font-medium text-right">{formatBs(sup.totalPurchases)}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{sup.lastPurchase ? formatDate(sup.lastPurchase) : "—"}</td>
                      <td className="px-4 py-3">
                        {sup.recentCosts.length > 0 && (
                          <Supplement>
                            <span className="flex items-center gap-1 text-[10px] text-gray-500 uppercase mb-1"><Users size={10} /> Últimos costos</span>
                            <span className="flex flex-wrap gap-1">
                              {sup.recentCosts.slice(0, 4).map((c) => (
                                <span key={c.id} className="px-2 py-0.5 bg-dark-900/40 border border-dark-700/30 rounded-md text-[10px] text-gray-400" title={c.product.name}>
                                  {c.product.itemCode} · <span className="text-emerald-400">{formatBs(c.costPrice)}</span>
                                </span>
                              ))}
                            </span>
                          </Supplement>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ReportCard>
      )}
    </div>
  );
}

/* ============ Subcomponentes ============ */

function SummaryCard({ label, value, tone, sub }: { label: string; value: string; tone: "emerald" | "blue" | "green" | "red"; sub: string }) {
  const tones: Record<string, string> = {
    emerald: "text-emerald-400",
    blue: "text-blue-400",
    green: "text-green-400",
    red: "text-red-400",
  };
  return (
    <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4">
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${tones[tone]}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </div>
  );
}

function ReportCard({ title, loading, refresh, onExportExcel, onExportPDF, children }: {
  title: string; loading: boolean; refresh: () => void;
  onExportExcel: () => void; onExportPDF: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-dark-700/50 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-foreground font-medium">{title}</h3>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="p-1.5 text-gray-400 hover:text-foreground rounded-lg transition-all" title="Actualizar"><RefreshCw size={14} /></button>
          <button onClick={onExportExcel}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded-lg text-xs transition-all border border-green-600/30">
            <Download size={14} /> Excel
          </button>
          <button onClick={onExportPDF}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg text-xs transition-all border border-red-600/30">
            <Download size={14} /> PDF
          </button>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-32"><RefreshCw size={24} className="text-primary-400 animate-spin" /></div>
      ) : children}
    </div>
  );
}

function SortableTh({ children, textColor }: { children: React.ReactNode; textColor?: string }) {
  return <th className={`text-left px-4 py-3 font-medium ${textColor || "text-gray-400"}`}>{children}</th>;
}
function RightTh({ children, textColor }: { children: React.ReactNode; textColor?: string }) {
  return <th className={`text-right px-4 py-3 font-medium ${textColor || "text-gray-400"}`}>{children}</th>;
}
function CenterTh({ children, textColor }: { children: React.ReactNode; textColor?: string }) {
  return <th className={`text-center px-4 py-3 font-medium ${textColor || "text-gray-400"}`}>{children}</th>;
}
function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return <tr><td colSpan={cols} className="px-4 py-8 text-center text-gray-500">{msg}</td></tr>;
}
function EmptyRowWithPad({ msg }: { msg: string }) {
  return <div className="p-10 text-center text-gray-500">{msg}</div>;
}
function Supplement({ children }: { children: React.ReactNode }) {
  return <div className="select-none">{children}</div>;
}