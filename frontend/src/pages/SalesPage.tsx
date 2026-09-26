import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import {
  Search, ShoppingCart, Plus, Minus, Trash2, X, CreditCard,
  FileText, RefreshCw, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Check, Clock, MapPin, User, Filter,
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "axios";
import api from "../services/api";
import { useAuthStore } from "../stores/authStore";
import ColumnManager from "../components/ui/ColumnManager";
import Autocomplete from "../components/ui/Autocomplete";
import { useDialogBehavior } from "../components/ui/useDialog";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

const HISTORY_COLUMNS = ["#", "Fecha", "Cliente", "Usuario", "Ubicación", "Vendedor", "Tipo", "Total", "Pagos"];
const CART_COLUMNS = ["Producto", "Precio", "Cantidad", "Subtotal", "Eliminar"];
const SEARCH_COLUMNS = [
  "Fabricante", "Producto", "Marca", "Modelo", "Año", "Detalles",
  "Cód. OEM", "Cód. Fábrica", "Precio 1", "Precio 2", "Stock", "Acciones",
];

interface Product {
  id: number; itemCode: string; manufacturer: string; name: string;
  brand: string; model: string; year: string; price1: string; price2: string;
  wholesalePrice: string | null; stock: number; category: string | null;
  image: string | null; oemCode: string | null; factoryCode: string | null;
  detail: string | null; detalles: string | null;
}

interface ProductFilters {
  brands: string[]; manufacturers: string[]; models: string[]; years: string[];
  categories: { id: number; name: string }[]; names: string[]; itemCodes: string[];
  oemCodes: string[]; factoryCodes: string[]; detalles: string[];
}

interface Location {
  id: number; name: string; type: string;
}

interface CartItem {
  productId: number; itemCode: string; name: string; brand: string;
  unitPrice: number; priceTier: 1 | 2; price1: number; price2: number;
  quantity: number; availableStock: number;
}

interface PaymentEntry {
  method: "EFECTIVO" | "QR" | "TRANSFERENCIA" | "CREDITO"; amount: string;
}

interface CustomerData { name: string; nit: string; phone: string; }

interface SaleRecord {
  id: number; saleDate: string; total: number; type: string;
  location: { id: number; name: string }; user: { id: number; name: string };
  seller: string | null;
  customer: { id: number; name: string; nit: string | null } | null;
  items: { id: number; quantity: number; unitPrice: number; subtotal: number;
    product: { id: number; name: string; itemCode: string; brand?: string } }[];
  payments: { id: number; method: string; amount: number }[];
}

const PAGE_SIZE = 15;

export default function SalesPage() {
  const { user, allowedCategories } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";
  const isTienda = user?.role === "TIENDA";
  const isVendedor = isTienda;

  // --- Locations ---
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | "">("");

  useEffect(() => {
    api.get("/locations").then((r) => {
      const locationList = Array.isArray(r.data) ? r.data : r.data.locations || [];
      setLocations(locationList);
      if (isTienda && user?.locationId) {
        setSelectedLocationId(user.locationId);
      }
    }).catch(() => {});
  }, [isTienda, user?.locationId]);

  // --- Seller ---
  const [selectedSeller, setSelectedSeller] = useState<string>(isTienda ? user?.name || "" : "");
  const [vendedores, setVendedores] = useState<{ id: number; name: string; locationId: number | null }[]>([]);

  useEffect(() => {
    if (!isTienda && isAdmin) {
      api.get("/users").then((r) => {
        const users = Array.isArray(r.data) ? r.data : r.data.users || [];
        setVendedores(users.filter((u: any) => u.role === "TIENDA").map((u: any) => ({ id: u.id, name: u.name, locationId: u.locationId })));
      }).catch(() => {});
    }
  }, [isAdmin, isTienda]);

  // --- Search (igual que inventario) ---
  const [search, setSearch] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [itemCodeFilter, setItemCodeFilter] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [oemCode, setOemCode] = useState("");
  const [factoryCode, setFactoryCode] = useState("");
  const [detailFilter, setDetailFilter] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState<ProductFilters>({
    brands: [], manufacturers: [], models: [], years: [], categories: [],
    names: [], itemCodes: [], oemCodes: [], factoryCodes: [], detalles: [],
  });
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [searchPages, setSearchPages] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get("/products/filters").then((r) => setFilters(r.data)).catch(() => {});
  }, []);

  // --- Locations modal (ACCIONES) ---
  const [showLocations, setShowLocations] = useState(false);
  const [locationsProduct, setLocationsProduct] = useState<Product | null>(null);
  const [locationsData, setLocationsData] = useState<{ productId: number; stockTotal: number; locations: { locationId: number; locationName: string; locationType: string; stock: number }[] } | null>(null);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const locationsPanelRef = useDialogBehavior(showLocations, () => { setShowLocations(false); setLocationsData(null); setLocationsProduct(null); });

  // Búsqueda con debounce de 300ms y cancelación de peticiones en vuelo
  // (mismo patrón que inventario). Muestra todos los productos, tengan o no
  // stock en la tienda seleccionada (includeZeroStock).
  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (nameFilter) params.set("name", nameFilter);
      if (itemCodeFilter) params.set("itemCode", itemCodeFilter);
      if (brand) params.set("brand", brand);
      if (manufacturer) params.set("manufacturer", manufacturer);
      if (model) params.set("model", model);
      if (year) params.set("year", year);
      if (categoryId) params.set("categoryId", categoryId);
      if (oemCode) params.set("oemCode", oemCode);
      if (factoryCode) params.set("factoryCode", factoryCode);
      if (detailFilter) params.set("detail", detailFilter);
      if (selectedLocationId) params.set("locationId", String(selectedLocationId));
      params.set("includeZeroStock", "true");
      params.set("page", String(searchPage));
      params.set("limit", String(PAGE_SIZE));
      api.get(`/products?${params.toString()}`, { signal: controller.signal })
        .then((res) => {
          setSearchResults((res.data.products || []).filter((p: Product) => !isVendedor || allowedCategories.length === 0 || allowedCategories.includes(p.category || "")));
          setSearchTotal(res.data.pagination?.total || 0);
          setSearchPages(res.data.pagination?.pages || 1);
        })
        .catch((err) => { if (err.code !== "ERR_CANCELED" && !axios.isCancel(err)) toast.error("Error al buscar productos"); })
        .finally(() => setSearching(false));
    }, 300);
    setSearching(true);
    return () => { controller.abort(); clearTimeout(t); };
  }, [search, nameFilter, itemCodeFilter, brand, manufacturer, model, year, categoryId, oemCode, factoryCode, detailFilter, selectedLocationId, searchPage, isVendedor, allowedCategories]);

  useEffect(() => { setSearchPage(1); }, [search, nameFilter, itemCodeFilter, brand, manufacturer, model, year, categoryId, oemCode, factoryCode, detailFilter, selectedLocationId]);

  const clearSearchFilters = () => {
    setNameFilter(""); setItemCodeFilter(""); setManufacturer(""); setBrand(""); setModel(""); setYear("");
    setCategoryName(""); setCategoryId(""); setOemCode(""); setFactoryCode(""); setDetailFilter("");
    setShowFilters(false);
  };

  const hasActiveSearchFilters = !!(nameFilter || itemCodeFilter || manufacturer || brand || model || year || categoryId || oemCode || factoryCode || detailFilter);

  const vendedoresDisponibles = vendedores.filter((v) => !selectedLocationId || v.locationId === selectedLocationId);

  // --- Cart ---
  const [cart, setCart] = useState<CartItem[]>([]);

  // --- Payment modal ---
  const [showPayment, setShowPayment] = useState(false);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [requiereFactura, setRequiereFactura] = useState(false);
  const [customerData, setCustomerData] = useState<CustomerData>({ name: "", nit: "", phone: "" });
  const [processing, setProcessing] = useState(false);

  // --- History ---
  const [showHistory, setShowHistory] = useState(false);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histPage, setHistPage] = useState(1);
  const [histPages, setHistPages] = useState(1);
  const [histTotal, setHistTotal] = useState(0);
  const [histDateFrom, setHistDateFrom] = useState("");
  const [histDateTo, setHistDateTo] = useState("");
  const [expandedSale, setExpandedSale] = useState<number | null>(null);

  const [histColumns, setHistColumns] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("columns_ventas");
      const stored = raw ? JSON.parse(raw) : null;
      const roleCols = useAuthStore.getState().columnConfig?.ventas;
      const base = stored?.length ? stored : roleCols?.length ? roleCols : HISTORY_COLUMNS;
      const merged = HISTORY_COLUMNS.filter((c) => base.includes(c));
      return merged.length ? merged : HISTORY_COLUMNS;
    } catch {
      return HISTORY_COLUMNS;
    }
  });
  const isHistCol = (col: string) => histColumns.includes(col);

  const [cartColumns, setCartColumns] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("columns_carrito");
      const stored = raw ? JSON.parse(raw) : null;
      const base = stored?.length ? stored : CART_COLUMNS;
      const merged = CART_COLUMNS.filter((c) => base.includes(c));
      return merged.length ? merged : CART_COLUMNS;
    } catch {
      return CART_COLUMNS;
    }
  });

  // --- Confirmation ---
  const [showConfirmed, setShowConfirmed] = useState(false);
  const [lastSale, setLastSale] = useState<SaleRecord | null>(null);

  const paymentPanelRef = useDialogBehavior(showPayment, () => setShowPayment(false));
  const confirmedPanelRef = useDialogBehavior(showConfirmed && lastSale !== null, () => { setShowConfirmed(false); setLastSale(null); });

  const formatBs = (v: number) =>
    `Bs. ${v.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const renderCartCell = (c: CartItem, column: string) => {
    if (column === "Producto") return <td key={column} className="px-5 py-3"><p className="text-foreground font-medium text-sm">{c.name}</p><p className="text-xs text-gray-500">{c.brand} · {c.itemCode}</p></td>;
    if (column === "Precio") return (
      <td key={column} className="px-4 py-3 text-right">
        {c.price2 > 0 && c.price2 !== c.price1 ? (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => changePriceTier(c.productId, 1, String(c.price1), String(c.price2))}
              className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${c.priceTier === 1 ? "bg-primary-600 text-white" : "bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground"}`}
            >Mayorista</button>
            <button
              onClick={() => changePriceTier(c.productId, 2, String(c.price1), String(c.price2))}
              className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${c.priceTier === 2 ? "bg-primary-600 text-white" : "bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground"}`}
            >Minorista</button>
          </div>
        ) : (
          <span className="text-gray-300">{formatBs(c.unitPrice)}</span>
        )}
      </td>
    );
    if (column === "Cantidad") return <td key={column} className="px-4 py-3"><div className="flex items-center justify-center gap-1.5"><button onClick={() => updateQuantity(c.productId, c.quantity - 1)} className="p-1 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400"><Minus size={14} /></button><span className="w-10 text-center text-foreground text-sm font-medium">{c.quantity}</span><button onClick={() => updateQuantity(c.productId, c.quantity + 1)} className="p-1 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400"><Plus size={14} /></button></div><p className="text-center text-xs text-gray-600 mt-0.5">disp: {c.availableStock}</p></td>;
    if (column === "Subtotal") return <td key={column} className="px-4 py-3 text-right text-green-400 font-medium">{formatBs(c.unitPrice * c.quantity)}</td>;
    if (column === "Eliminar") return <td key={column} className="px-5 py-3 text-center"><button onClick={() => removeItem(c.productId)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400"><Trash2 size={14} /></button></td>;
    return null;
  };

  // ==================== CART ====================
  const addToCart = (p: Product, tier: 1 | 2 = 2) => {
    const price = tier === 2 && Number(p.price2) > 0 ? Number(p.price2) : Number(p.price1);
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === p.id);
      if (existing) {
        if (existing.quantity >= p.stock) {
          toast.error(`Stock insuficiente (disponible: ${p.stock})`);
          return prev;
        }
        return prev.map((c) =>
          c.productId === p.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, {
        productId: p.id, itemCode: p.itemCode, name: p.name, brand: p.brand,
        unitPrice: price, priceTier: tier, price1: Number(p.price1), price2: Number(p.price2),
        quantity: 1, availableStock: p.stock,
      }];
    });
    setSearch("");
    clearSearchFilters();
    setSearchPage(1);
    setSearchResults([]);
    searchInputRef.current?.focus();
  };

  // ACCIONES: ver ubicaciones donde está el producto
  const openLocations = async (p: Product) => {
    setLocationsProduct(p);
    setLocationsData(null);
    setShowLocations(true);
    setLocationsLoading(true);
    try {
      const res = await api.get(`/inventory/product/${p.id}`);
      setLocationsData(res.data);
    } catch {
      toast.error("Error al cargar ubicaciones");
    } finally {
      setLocationsLoading(false);
    }
  };

  const renderSearchCell = (p: Product, column: string) => {
    if (column === "Fabricante") return <td key={column} className="px-3 py-2 text-gray-300">{p.manufacturer}</td>;
    if (column === "Producto") return <td key={column} className="px-3 py-2 text-foreground font-medium max-w-[200px] truncate">{p.name}</td>;
    if (column === "Marca") return <td key={column} className="px-3 py-2 text-gray-300">{p.brand}</td>;
    if (column === "Modelo") return <td key={column} className="px-3 py-2 text-gray-300">{p.model}</td>;
    if (column === "Año") return <td key={column} className="px-3 py-2 text-gray-400">{p.year}</td>;
    if (column === "Detalles") return <td key={column} className="px-3 py-2 text-gray-400 text-xs">{p.detalles || p.detail || "—"}</td>;
    if (column === "Cód. OEM") return <td key={column} className="px-3 py-2 text-gray-400 text-xs">{p.oemCode || "—"}</td>;
    if (column === "Cód. Fábrica") return <td key={column} className="px-3 py-2 text-gray-400 text-xs">{p.factoryCode || "—"}</td>;
    if (column === "Precio 1") return <td key={column} className="px-3 py-2 text-right text-green-400 font-medium whitespace-nowrap">{formatBs(Number(p.price1))}</td>;
    if (column === "Precio 2") return <td key={column} className="px-3 py-2 text-right text-blue-400 whitespace-nowrap">{Number(p.price2) > 0 ? formatBs(Number(p.price2)) : "—"}</td>;
    if (column === "Stock") return (
      <td key={column} className="px-3 py-2 text-center">
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${p.stock === 0 ? "bg-red-500/10 text-red-400" : p.stock <= 5 ? "bg-yellow-500/10 text-yellow-400" : "bg-green-500/10 text-green-400"}`}>{p.stock}</span>
      </td>
    );
    if (column === "Acciones") return (
      <td key={column} className="px-3 py-2">
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => addToCart(p, 1)}
            disabled={p.stock <= 0}
            title={p.stock > 0 ? "Agregar Mayorista" : "Sin stock en esta tienda"}
            className="p-1.5 rounded-lg text-gray-400 hover:text-green-400 hover:bg-green-500/10 transition-all disabled:opacity-30"
          >
            <Plus size={16} />
          </button>
          {Number(p.price2) > 0 && Number(p.price2) !== Number(p.price1) && (
            <button
              onClick={() => addToCart(p, 2)}
              disabled={p.stock <= 0}
              title={p.stock > 0 ? "Agregar Minorista" : "Sin stock en esta tienda"}
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all disabled:opacity-30"
            >
              <Plus size={16} className="text-blue-400" />
            </button>
          )}
          <button
            onClick={() => openLocations(p)}
            title="Ver ubicaciones"
            className="p-1.5 rounded-lg text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
          >
            <MapPin size={16} />
          </button>
        </div>
      </td>
    );
    return null;
  };

  const updateQuantity = (productId: number, newQty: number) => {
    if (newQty < 1) return;
    setCart((prev) => prev.map((c) => {
      if (c.productId !== productId) return c;
      if (newQty > c.availableStock) {
        toast.error(`Stock máximo: ${c.availableStock}`);
        return { ...c, quantity: c.availableStock };
      }
      return { ...c, quantity: newQty };
    }));
  };

  const changePriceTier = (productId: number, tier: 1 | 2, price1: string, price2: string) => {
    setCart((prev) => prev.map((c) => {
      if (c.productId !== productId) return c;
      const price = tier === 2 && Number(price2) > 0 ? Number(price2) : Number(price1);
      return { ...c, priceTier: tier, unitPrice: price };
    }));
  };

  const removeItem = (productId: number) =>
    setCart((prev) => prev.filter((c) => c.productId !== productId));

  const clearCart = () => setCart([]);

  const cartTotal = cart.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0);
  const cartItemCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  // ==================== PAYMENTS ====================
  const openPayment = () => {
    if (cart.length === 0) { toast.error("Agrega productos al carrito primero"); return; }
    setPayments([{ method: "EFECTIVO", amount: String(cartTotal.toFixed(2)) }]);
    setRequiereFactura(false);
    setCustomerData({ name: "", nit: "", phone: "" });
    setShowPayment(true);
  };

  const addPaymentMethod = () =>
    setPayments((prev) => [...prev, { method: "EFECTIVO", amount: "0" }]);

  const updatePayment = (i: number, field: keyof PaymentEntry, val: string) =>
    setPayments((prev) => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p));

  const removePayment = (i: number) =>
    setPayments((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const pending = cartTotal - totalPaid;

  // ==================== CONFIRM SALE ====================
  const confirmSale = async () => {
    if (cart.length === 0) return;

    if (Math.abs(totalPaid - cartTotal) > 0.01) {
      toast.error(`El total pagado (${formatBs(totalPaid)}) no coincide con el total (${formatBs(cartTotal)})`);
      return;
    }

    if (requiereFactura && !customerData.name.trim()) {
      toast.error("Ingresa el nombre del cliente para la factura");
      return;
    }

    try {
      setProcessing(true);
      const payload: any = {
        items: cart.map((c) => ({
          productId: c.productId,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
        })),
        payments: payments.map((p) => ({
          method: p.method,
          amount: parseFloat(p.amount),
        })),
      };

      if (requiereFactura && customerData.name.trim()) {
        payload.customerData = {
          name: customerData.name.trim(),
          nit: customerData.nit.trim() || null,
          phone: customerData.phone.trim() || null,
        };
      }

      if (selectedLocationId) {
        payload.locationId = selectedLocationId;
      }
      if (selectedSeller) {
        payload.seller = selectedSeller;
      }

      const res = await api.post("/sales", payload);
      const savedItems = (res.data.items || []).map((item: any) => {
        const cartItem = cart.find((entry) => entry.productId === item.productId);
        return {
          ...item,
          product: item.product || { id: item.productId, name: cartItem?.name || "Producto", itemCode: cartItem?.itemCode || "" },
        };
      });
      setLastSale({
        ...res.data,
        saleDate: res.data.saleDate || new Date().toISOString(),
        total: Number(res.data.total) || cartTotal,
        items: savedItems,
        payments: Array.isArray(res.data.payments) ? res.data.payments : [],
      });
      setShowPayment(false);
      setShowConfirmed(true);
      setCart([]);
      setSelectedSeller("");
      toast.success("¡Venta registrada exitosamente!");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al registrar la venta");
    } finally {
      setProcessing(false);
    }
  };

  const downloadSalePDF = async () => {
    if (!lastSale) return;
    const modalRef = document.getElementById("sale-confirm-modal");
    if (!modalRef) return;
    toast.loading("Generando PDF...", { id: "pdf" });
    try {
      const canvas = await html2canvas(modalRef, { scale: 2, backgroundColor: "#1d232e" });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      pdf.addImage(img, "PNG", 0, 0, pageWidth, imgHeight);
      pdf.save(`venta-${lastSale.id}.pdf`);
      toast.success("PDF descargado", { id: "pdf" });
    } catch {
      toast.error("Error al generar PDF", { id: "pdf" });
    }
  };

  // ==================== HISTORY ====================
  const [histSeller, setHistSeller] = useState("");

  const fetchHistory = useCallback(async () => {
    try {
      setHistLoading(true);
      const params = new URLSearchParams({ page: String(histPage), limit: String(PAGE_SIZE) });
      if (histDateFrom) params.set("startDate", histDateFrom);
      if (histDateTo) params.set("endDate", histDateTo);
      if (histSeller) params.set("seller", histSeller);
      if (isTienda && user?.locationId) params.set("locationId", String(user.locationId));

      const res = await api.get(`/sales?${params.toString()}`);
      setSales(res.data.sales);
      setHistTotal(res.data.pagination.total);
      setHistPages(res.data.pagination.pages);
    } catch { toast.error("Error al cargar historial"); }
    finally { setHistLoading(false); }
  }, [histPage, histDateFrom, histDateTo, histSeller, isTienda, user?.locationId]);

  useEffect(() => {
    if (showHistory) fetchHistory();
  }, [showHistory, fetchHistory]);

  useEffect(() => { if (showHistory) setHistPage(1); }, [histDateFrom, histDateTo, histSeller, showHistory]);

  // ==================== RENDER ====================
  const pmLabel: Record<string, string> = { EFECTIVO: "Efectivo", QR: "QR", TRANSFERENCIA: "Transferencia", CREDITO: "Crédito" };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ventas Locales</h1>
          <p className="text-gray-400 text-sm mt-1">
            {showHistory ? `${histTotal} ventas registradas` : `${cart.length} producto(s) en carrito`}
          </p>
        </div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
            showHistory
              ? "bg-primary-600/10 border-primary-600/20 text-primary-400"
              : "bg-dark-800/50 border-dark-700/50 text-gray-400 hover:text-foreground"
          }`}
        >
          {showHistory ? <><ShoppingCart size={16} /> Nueva Venta</> : <><Clock size={16} /> Historial</>}
        </button>
      </div>

      {/* ============ NEW SALE ============ */}
      {!showHistory && (
        <>
          {/* Location + Seller selector */}
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-400 shrink-0">
                <MapPin size={16} className="text-primary-400" />
                <span>Tienda:</span>
              </div>
              {isAdmin ? (
                <div className="relative flex-1">
                  <select value={selectedLocationId} onChange={(e) => setSelectedLocationId(Number(e.target.value) || "")}
                    className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8">
                    <option value="">Seleccionar tienda</option>
                    {locations.filter((l) => l.type === "TIENDA").map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>
              ) : (
                <span className="text-foreground text-sm font-medium">
                  {locations.find((l) => l.id === selectedLocationId)?.name || "Cargando..."}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-400 shrink-0">
                <User size={16} className="text-primary-400" />
                <span>Vendedor:</span>
              </div>
              {isAdmin ? (
                <div className="relative flex-1">
                  <select value={selectedSeller} onChange={(e) => setSelectedSeller(e.target.value)}
                    className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8">
                    <option value="">Seleccionar vendedor</option>
                    {vendedoresDisponibles.map((v) => (
                      <option key={v.id} value={v.name}>{v.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>
              ) : (
                <span className="text-foreground text-sm font-medium">{user?.name || "Cargando..."}</span>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  ref={searchInputRef}
                  type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar producto por código, nombre, marca, modelo, OEM..."
                  aria-label="Buscar producto"
                  className="w-full pl-10 pr-4 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm"
                />
                {search && (
                  <button onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-foreground">
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                    showFilters && hasActiveSearchFilters
                      ? "bg-primary-600/10 border-primary-600/30 text-primary-400"
                      : "bg-dark-900/50 border-dark-600/50 text-gray-400 hover:text-foreground"
                  }`}>
                  <Filter size={16} /> Filtros
                  {hasActiveSearchFilters && <span className="w-2 h-2 rounded-full bg-primary-400" />}
                </button>
                {hasActiveSearchFilters && (
                  <button onClick={clearSearchFilters}
                    className="px-4 py-2.5 text-sm text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl border border-dark-600/50 transition-all">
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-4 pt-4 border-t border-dark-700/50">
                <Autocomplete value={itemCodeFilter} onChange={setItemCodeFilter} suggestions={filters.itemCodes || []}
                  placeholder="Escribe el código..." label="Código (Item)" />
                <Autocomplete value={nameFilter} onChange={setNameFilter} suggestions={filters.names || []}
                  placeholder="Escribe el nombre..." label="Producto (nombre)" />
                <Autocomplete value={manufacturer} onChange={setManufacturer} suggestions={filters.manufacturers}
                  placeholder="Todos los fabricantes" label="Fabricante" />
                <Autocomplete value={categoryName} onChange={(v) => { setCategoryName(v); const found = filters.categories.find((c) => c.name === v); setCategoryId(found ? String(found.id) : ""); }}
                  suggestions={filters.categories.map((c) => c.name)} placeholder="Todas las categorías" label="Categoría" />
                <Autocomplete value={brand} onChange={setBrand} suggestions={filters.brands}
                  placeholder="Todas las marcas" label="Marca" />
                <Autocomplete value={model} onChange={setModel} suggestions={filters.models || []}
                  placeholder="Todos los modelos" label="Modelo" />
                <Autocomplete value={year} onChange={setYear} suggestions={filters.years || []}
                  placeholder="Todos los años (ej. 92)" label="Año / rango" />
                <Autocomplete value={detailFilter} onChange={setDetailFilter} suggestions={filters.detalles || []}
                  placeholder="Detalle, versión, uso..." label="Detalles" />
                <Autocomplete value={oemCode} onChange={setOemCode} suggestions={filters.oemCodes || []}
                  placeholder="Todos los OEM" label="Cód. OEM" />
                <Autocomplete value={factoryCode} onChange={setFactoryCode} suggestions={filters.factoryCodes || []}
                  placeholder="Todos los códigos de fábrica" label="Cód. Fábrica" />
              </div>
            )}

            {/* Results */}
            {searching ? (
              <div className="flex items-center justify-center py-14">
                <RefreshCw size={28} className="text-primary-400 animate-spin" />
              </div>
            ) : searchResults.length === 0 ? (
              <div className="py-10 text-center">
                <Search size={40} className="text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Busca un producto o activa los filtros para ver resultados</p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 border-b border-dark-700/50">
                        {SEARCH_COLUMNS.map((col) => {
                          const align = ["Precio 1", "Precio 2"].includes(col) ? "text-right" : ["Stock", "Acciones"].includes(col) ? "text-center" : "text-left";
                          return <th key={col} className={`${align} px-3 py-2.5 font-medium whitespace-nowrap`}>{col}</th>;
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.map((p) => (
                        <tr key={p.id} className="border-b border-dark-700/30 last:border-0 hover:bg-dark-900/30">
                          {SEARCH_COLUMNS.map((col) => renderSearchCell(p, col))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden mt-4 space-y-1.5">
                  {searchResults.map((p) => (
                    <div key={p.id} className="w-full flex items-center justify-between px-4 py-3 bg-dark-900/50 border border-dark-700/30 rounded-xl">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground font-medium truncate">{p.name}</p>
                        <p className="text-xs text-gray-500 truncate">{p.manufacturer} · {p.brand} · {p.model} · {p.itemCode}</p>
                        <p className="text-xs text-gray-400 mt-0.5">OEM: {p.oemCode || "—"} · Fábrica: {p.factoryCode || "—"}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-medium">{formatBs(Number(p.price1))}</span>
                          {Number(p.price2) > 0 && Number(p.price2) !== Number(p.price1) && (
                            <span className="text-xs text-blue-400">· {formatBs(Number(p.price2))}</span>
                          )}
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.stock === 0 ? "bg-red-500/10 text-red-400" : p.stock <= 5 ? "bg-yellow-500/10 text-yellow-400" : "bg-green-500/10 text-green-400"}`}>Stock: {p.stock}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        <button onClick={() => addToCart(p, 1)} disabled={p.stock <= 0}
                          title={p.stock > 0 ? "Agregar Mayorista" : "Sin stock en esta tienda"}
                          className="p-2 rounded-lg bg-primary-600/10 border border-primary-600/20 text-primary-400 hover:bg-primary-600 hover:text-white transition-all disabled:opacity-30">
                          <Plus size={14} />
                        </button>
                        {Number(p.price2) > 0 && Number(p.price2) !== Number(p.price1) && (
                          <button onClick={() => addToCart(p, 2)} disabled={p.stock <= 0}
                            title={p.stock > 0 ? "Agregar Minorista" : "Sin stock en esta tienda"}
                            className="p-2 rounded-lg bg-blue-600/10 border border-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white transition-all disabled:opacity-30">
                            <Plus size={14} />
                          </button>
                        )}
                        <button onClick={() => openLocations(p)} title="Ver ubicaciones"
                          className="p-2 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-amber-400 transition-all">
                          <MapPin size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {searchPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-dark-700/50">
                    <p className="text-xs text-gray-500">Página {searchPage} de {searchPages} · {searchTotal} productos</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSearchPage((p) => Math.max(1, p - 1))} disabled={searchPage <= 1}
                        className="p-2 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground disabled:opacity-30">
                        <ChevronLeft size={16} />
                      </button>
                      <span className="text-sm text-gray-400">{searchPage} / {searchPages}</span>
                      <button onClick={() => setSearchPage((p) => Math.min(searchPages, p + 1))} disabled={searchPage >= searchPages}
                        className="p-2 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground disabled:opacity-30">
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Cart */}
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-dark-700/50">
              <h2 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <ShoppingCart size={16} className="text-primary-400" /> Carrito de Venta
              </h2>
              <div className="flex items-center gap-2">
                <ColumnManager module="carrito" columns={CART_COLUMNS} onVisibleChange={setCartColumns} />
                {cart.length > 0 && (
                  <button onClick={clearCart} className="text-xs text-red-400 hover:text-red-300">Vaciar</button>
                )}
              </div>
            </div>

            {cart.length === 0 ? (
              <div className="p-10 text-center">
                <ShoppingCart size={48} className="text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Busca un producto arriba para agregarlo al carrito</p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 border-b border-dark-700/50">
                        {cartColumns.map((col) => {
                          const align = ["Precio", "Subtotal"].includes(col) ? "text-right" : ["Cantidad", "Eliminar"].includes(col) ? "text-center" : "text-left";
                          return <th key={col} className={`${align} px-4 py-2.5 font-medium`}>{col}</th>;
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((c) => (
                        <tr key={c.productId} className="border-b border-dark-700/30 last:border-0 hover:bg-dark-900/30">
                          {cartColumns.map((column) => renderCartCell(c, column))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-dark-700/30">
                  {cart.map((c) => (
                    <div key={c.productId} className="p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-foreground font-medium text-sm truncate">{c.name}</p>
                          <p className="text-xs text-gray-500">{c.brand} · {c.itemCode}</p>
                        </div>
                        <button onClick={() => removeItem(c.productId)}
                          className="p-1.5 text-gray-500 hover:text-red-400 shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => updateQuantity(c.productId, c.quantity - 1)}
                            className="p-1 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 active:text-foreground transition-all">
                            <Minus size={14} />
                          </button>
                          <span className="w-10 text-center text-foreground text-sm font-medium">{c.quantity}</span>
                          <button onClick={() => updateQuantity(c.productId, c.quantity + 1)}
                            className="p-1 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 active:text-foreground transition-all">
                            <Plus size={14} />
                          </button>
                          <span className="text-xs text-gray-600 ml-1">máx: {c.availableStock}</span>
                        </div>
                        <p className="text-green-400 font-medium text-sm">{formatBs(c.unitPrice * c.quantity)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="px-5 py-4 border-t border-dark-700/50 bg-dark-900/20">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-400 text-sm">{cartItemCount} unidad(es)</span>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Total</p>
                      <p className="text-xl font-bold text-green-400">{formatBs(cartTotal)}</p>
                    </div>
                  </div>
                  <button onClick={openPayment}
                    className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-600/20">
                    <CreditCard size={18} /> Cobrar · {formatBs(cartTotal)}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ============ HISTORY ============ */}
      {showHistory && (
        <div className="space-y-4">
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-4">
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Desde</label>
                <input type="date" value={histDateFrom} onChange={(e) => setHistDateFrom(e.target.value)}
                  className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Hasta</label>
                <input type="date" value={histDateTo} onChange={(e) => setHistDateTo(e.target.value)}
                  className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Vendedor</label>
                  <div className="relative">
                    <select value={histSeller} onChange={(e) => setHistSeller(e.target.value)}
                      className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8">
                      <option value="">Todos</option>
                      {isTienda
                        ? (user?.name ? <option value={user.name}>{user.name}</option> : null)
                        : vendedores.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>
                </div>
              {(histDateFrom || histDateTo || histSeller) && (
                <button onClick={() => { setHistDateFrom(""); setHistDateTo(""); setHistSeller(""); }}
                  className="px-4 py-2.5 text-sm text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl border border-dark-600/50 transition-all">
                  Limpiar
                </button>
              )}
            </div>
          </div>

          <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-dark-700/50">
              <p className="text-sm text-gray-400">Historial de ventas</p>
              <ColumnManager module="ventas" columns={HISTORY_COLUMNS} onVisibleChange={setHistColumns} />
            </div>
            {histLoading ? (
              <div className="flex items-center justify-center h-64">
                <RefreshCw size={32} className="text-primary-400 animate-spin" />
              </div>
            ) : sales.length === 0 ? (
              <div className="p-10 text-center">
                <Clock size={48} className="text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No se encontraron ventas</p>
              </div>
            ) : (
              <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-500 border-b border-dark-700/50">
                          {histColumns.map((col) => {
                            const cl = col.toLowerCase();
                            const align = cl === "total" ? "text-right" : cl === "tipo" ? "text-center" : "text-left";
                            return <th key={col} className={`${align} px-4 py-3 font-medium`}>{col}</th>;
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {sales.map((s) => (
                          <Fragment key={s.id}>
                          <tr className="border-b border-dark-700/30 last:border-0 hover:bg-dark-900/30">
                            <td className="px-2 py-3">
                              <button onClick={() => setExpandedSale(expandedSale === s.id ? null : s.id)}
                                className="p-1.5 rounded-lg text-gray-500 hover:text-primary-400 hover:bg-dark-700/50 transition-all"
                                title={expandedSale === s.id ? "Ocultar ítems" : "Ver ítems"}>
                                {expandedSale === s.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                              </button>
                            </td>
                            {isHistCol("#") && <td className="px-4 py-3 text-gray-400">{s.id}</td>}
                            {isHistCol("Fecha") && (
                              <td className="px-4 py-3 text-gray-300 text-xs">
                                {new Date(s.saleDate).toLocaleDateString("es-BO")}{" "}
                                <span className="text-gray-500">
                                  {new Date(s.saleDate).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </td>
                            )}
                            {isHistCol("Cliente") && (
                              <td className="px-4 py-3">
                                {s.customer ? (
                                  <div>
                                    <p className="text-gray-200 text-sm">{s.customer.name}</p>
                                    {s.customer.nit && <p className="text-xs text-gray-500">NIT: {s.customer.nit}</p>}
                                  </div>
                                ) : (
                                  <span className="text-gray-600 text-xs">Consumidor final</span>
                                )}
                              </td>
                            )}
                            {isHistCol("Usuario") && <td className="px-4 py-3 text-gray-300 text-xs">{s.user.name}</td>}
                            {isHistCol("Ubicación") && (
                              <td className="px-4 py-3 text-gray-400 text-xs flex items-center gap-1">
                                <MapPin size={12} /> {s.location.name}
                              </td>
                            )}
                            {isHistCol("Vendedor") && <td className="px-4 py-3 text-gray-300 text-xs">{s.seller || "—"}</td>}
                            {isHistCol("Tipo") && (
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                  s.type === "MAYOR" ? "bg-amber-500/10 text-amber-400" : "bg-emerald-500/10 text-emerald-400"
                                }`}>
                                  {s.type === "MAYOR" ? "Mayor" : "Normal"}
                                </span>
                              </td>
                            )}
                            {isHistCol("Total") && (
                              <td className="px-4 py-3 text-right text-green-400 font-medium text-sm">
                                {formatBs(s.total)}
                              </td>
                            )}
                            {isHistCol("Pagos") && (
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {s.payments.map((pay) => (
                                    <span key={pay.id}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-dark-900/50 border border-dark-700/30 rounded-full text-xs text-gray-400">
                                      {pmLabel[pay.method] || pay.method} · {formatBs(pay.amount)}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            )}
                          </tr>
                          {expandedSale === s.id && (
                            <tr className="bg-dark-900/40">
                              <td colSpan={histColumns.length + 1} className="px-4 py-3">
                                <div className="space-y-2">
                                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Detalle de ítems</p>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-gray-500 border-b border-dark-700/50">
                                          <th className="text-left px-2 py-1.5 font-medium">Producto</th>
                                          <th className="text-left px-2 py-1.5 font-medium">Código</th>
                                          <th className="text-right px-2 py-1.5 font-medium">Cantidad</th>
                                          <th className="text-right px-2 py-1.5 font-medium">Precio</th>
                                          <th className="text-right px-2 py-1.5 font-medium">Subtotal</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {s.items.length === 0 ? (
                                          <tr><td colSpan={5} className="px-2 py-3 text-center text-gray-600">Sin ítems</td></tr>
                                        ) : s.items.map((item) => (
                                          <tr key={item.id} className="border-b border-dark-700/20">
                                            <td className="px-2 py-1.5">
                                              <span className="text-foreground">{item.product?.name || "Producto"}</span>
                                              {item.product?.brand && <span className="text-gray-500 ml-2">{item.product.brand}</span>}
                                            </td>
                                            <td className="px-2 py-1.5 text-gray-400 font-mono">{item.product?.itemCode || "—"}</td>
                                            <td className="px-2 py-1.5 text-right text-gray-300">{item.quantity}</td>
                                            <td className="px-2 py-1.5 text-right text-gray-300">{formatBs(Number(item.unitPrice))}</td>
                                            <td className="px-2 py-1.5 text-right text-green-400 font-medium">{formatBs(Number(item.subtotal))}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>

                {histPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700/50">
                    <p className="text-gray-400 text-sm">Página {histPage} de {histPages}</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setHistPage((p) => Math.max(1, p - 1))} disabled={histPage === 1}
                        className="p-2 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground disabled:opacity-30 transition-all">
                        <ChevronLeft size={16} />
                      </button>
                      {Array.from({ length: Math.min(5, histPages) }, (_, i) => {
                        const start = Math.max(1, Math.min(histPage - 2, histPages - 4));
                        const pg = start + i;
                        if (pg > histPages) return null;
                        return (
                          <button key={pg} onClick={() => setHistPage(pg)}
                            className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${
                              pg === histPage ? "bg-primary-600 text-white" : "bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground"
                            }`}>
                            {pg}
                          </button>
                        );
                      })}
                      <button onClick={() => setHistPage((p) => Math.min(histPages, p + 1))} disabled={histPage === histPages}
                        className="p-2 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground disabled:opacity-30 transition-all">
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ============ PAYMENT MODAL ============ */}
      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div ref={paymentPanelRef} role="dialog" aria-modal="true" aria-label="Registrar pago" className="bg-dark-800 border border-dark-700/50 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-dark-700/50">
              <h2 className="text-lg font-bold text-foreground">Registrar Pago</h2>
              <button onClick={() => !processing && setShowPayment(false)} aria-label="Cerrar"
                className="p-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl transition-all">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Resumen */}
              <div className="bg-dark-900/50 border border-dark-700/30 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Total a cobrar</span>
                  <span className="text-xl font-bold text-green-400">{formatBs(cartTotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-xs">Pagado</span>
                  <span className={`text-sm font-medium ${totalPaid >= cartTotal ? "text-green-400" : "text-yellow-400"}`}>
                    {formatBs(totalPaid)}
                  </span>
                </div>
                {pending > 0.01 && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-xs">Pendiente</span>
                    <span className="text-sm font-medium text-red-400">{formatBs(pending)}</span>
                  </div>
                )}
              </div>

              {/* Métodos de pago */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Métodos de Pago</p>
                  <button onClick={addPaymentMethod}
                    className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
                    <Plus size={12} /> Agregar método
                  </button>
                </div>

                <div className="space-y-2.5">
                  {payments.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <select value={p.method}
                          onChange={(e) => updatePayment(i, "method", e.target.value)}
                          className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8">
                          <option value="EFECTIVO">Efectivo</option>
                          <option value="QR">QR</option>
                          <option value="TRANSFERENCIA">Transferencia</option>
                          <option value="CREDITO">Crédito</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                      </div>
                      <input type="number" value={p.amount}
                        onChange={(e) => updatePayment(i, "amount", e.target.value)}
                        placeholder="Monto" min="0" step="0.01" aria-label={`Monto del pago ${i + 1}`}
                        className="w-32 px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                      {payments.length > 1 && (
                        <button onClick={() => removePayment(i)} aria-label="Quitar método de pago"
                          className="p-2 text-gray-500 hover:text-red-400 transition-all">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Facturación */}
              <div className="border-t border-dark-700/50 pt-5">
                <button onClick={() => setRequiereFactura(!requiereFactura)} aria-expanded={requiereFactura}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                    requiereFactura
                      ? "bg-primary-600/10 border-primary-600/30 text-primary-300"
                      : "bg-dark-900/50 border-dark-700/30 text-gray-400 hover:border-primary-500/30"
                  }`}>
                  <div className="flex items-center gap-2">
                    <FileText size={16} />
                    <span className="text-sm font-medium">Requiere Factura</span>
                  </div>
                  <ChevronDown size={16} className={`transition-transform ${requiereFactura ? "rotate-180" : ""}`} />
                </button>

                {requiereFactura && (
                  <div className="mt-3 space-y-3 pl-1">
                    <div>
                      <label htmlFor="venta-nombre" className="block text-xs text-gray-500 mb-1">Nombre / Razón Social *</label>
                      <input id="venta-nombre" type="text" value={customerData.name}
                        onChange={(e) => setCustomerData((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Nombre del cliente"
                        className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none placeholder-gray-600" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="venta-nit" className="block text-xs text-gray-500 mb-1">CI / NIT</label>
                        <input id="venta-nit" type="text" value={customerData.nit}
                          onChange={(e) => setCustomerData((prev) => ({ ...prev, nit: e.target.value }))}
                          placeholder="CI o NIT"
                          className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none placeholder-gray-600" />
                      </div>
                      <div>
                        <label htmlFor="venta-cel" className="block text-xs text-gray-500 mb-1">Celular</label>
                        <input id="venta-cel" type="text" value={customerData.phone}
                          onChange={(e) => setCustomerData((prev) => ({ ...prev, phone: e.target.value }))}
                          placeholder="Celular"
                          className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none placeholder-gray-600" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-dark-700/50">
              <button onClick={() => setShowPayment(false)} disabled={processing}
                className="px-4 py-2.5 text-sm text-gray-400 hover:text-foreground disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={confirmSale} disabled={processing || Math.abs(totalPaid - cartTotal) > 0.01}
                className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  Math.abs(totalPaid - cartTotal) <= 0.01
                    ? "bg-primary-600 hover:bg-primary-700 text-white shadow-lg shadow-primary-600/20"
                    : "bg-dark-700 text-gray-500"
                }`}>
                {processing ? <><RefreshCw size={16} className="animate-spin" /> Procesando...</> : <><Check size={16} /> Confirmar Venta</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ CONFIRMATION MODAL ============ */}
      {showConfirmed && lastSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div ref={confirmedPanelRef} id="sale-confirm-modal" role="dialog" aria-modal="true" aria-label="Venta registrada" className="bg-dark-800 border border-dark-700/50 rounded-2xl w-full max-w-md p-6 text-center">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-green-400" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-1">¡Venta Registrada!</h3>
            <p className="text-gray-400 text-sm mb-2">
              Venta #{lastSale.id} · {new Date(lastSale.saleDate).toLocaleString("es-BO")}
              {lastSale.seller && <span className="ml-2 text-primary-400">· {lastSale.seller}</span>}
            </p>
            <p className="text-2xl font-bold text-green-400 mb-4">{formatBs(lastSale.total)}</p>

            {lastSale.customer && (
              <div className="bg-dark-900/50 border border-dark-700/30 rounded-xl p-3 mb-4 text-left">
                <p className="text-xs text-gray-500 mb-1">Cliente (Factura)</p>
                <p className="text-sm text-foreground">{lastSale.customer.name}</p>
                {lastSale.customer.nit && <p className="text-xs text-gray-400">NIT: {lastSale.customer.nit}</p>}
              </div>
            )}

            <div className="bg-dark-900/50 border border-dark-700/30 rounded-xl p-3 mb-5 text-left">
              <p className="text-xs text-gray-500 mb-2">Productos</p>
              <div className="space-y-1.5">
                {lastSale.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300 truncate flex-1 mr-2">{item.product.name}</span>
                    <span className="text-gray-500 shrink-0">x{item.quantity} · {formatBs(item.subtotal)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-dark-900/50 border border-dark-700/30 rounded-xl p-3 mb-5 text-left">
              <p className="text-xs text-gray-500 mb-2">Pagos</p>
              <div className="flex flex-wrap gap-2">
                {lastSale.payments.map((pay) => (
                  <span key={pay.id}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-dark-800 border border-dark-700/50 rounded-lg text-xs text-gray-300">
                    {pmLabel[pay.method] || pay.method}: {formatBs(pay.amount)}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setShowConfirmed(false); setLastSale(null); }}
                className="flex-1 bg-dark-700 hover:bg-dark-600 text-foreground py-3 rounded-xl text-sm font-medium transition-all">
                Cerrar
              </button>
              <button onClick={downloadSalePDF}
                className="flex-1 bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2">
                <FileText size={16} /> Descargar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ LOCATIONS MODAL (ACCIONES) ============ */}
      {showLocations && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div ref={locationsPanelRef} role="dialog" aria-modal="true" aria-label="Ubicaciones del producto" className="bg-dark-800 border border-dark-700/50 rounded-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700/50">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-foreground truncate">{locationsProduct?.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {locationsProduct?.manufacturer} · {locationsProduct?.brand} · {locationsProduct?.model} · {locationsProduct?.itemCode}
                </p>
              </div>
              <button onClick={() => { setShowLocations(false); setLocationsData(null); setLocationsProduct(null); }}
                className="p-2 rounded-lg text-gray-400 hover:text-foreground hover:bg-dark-700 transition-all shrink-0 ml-3">
                <X size={18} />
              </button>
            </div>

            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Stock por ubicación</span>
                {locationsData && (
                  <span className="text-xs font-medium text-green-400">Total: {locationsData.stockTotal}</span>
                )}
              </div>

              {locationsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <RefreshCw size={28} className="text-primary-400 animate-spin" />
                </div>
              ) : locationsData && locationsData.locations.length > 0 ? (
                <div className="space-y-2">
                  {locationsData.locations.map((loc) => (
                    <div key={loc.locationId} className="flex items-center justify-between px-4 py-3 bg-dark-900/50 border border-dark-700/30 rounded-xl">
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin size={16} className="text-primary-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-foreground font-medium truncate">{loc.locationName}</p>
                          <p className="text-xs text-gray-500 uppercase">{loc.locationType}</p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${loc.stock === 0 ? "bg-red-500/10 text-red-400" : loc.stock <= 5 ? "bg-yellow-500/10 text-yellow-400" : "bg-green-500/10 text-green-400"}`}>
                        {loc.stock}
                      </span>
                    </div>
                  ))}
                </div>
              ) : locationsData ? (
                <div className="py-10 text-center">
                  <MapPin size={40} className="text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">El producto no tiene inventario registrado en ninguna ubicación</p>
                </div>
              ) : null}
            </div>

            <div className="px-5 py-4 border-t border-dark-700/50 flex justify-end">
              <button onClick={() => { setShowLocations(false); setLocationsData(null); setLocationsProduct(null); }}
                className="px-5 py-2.5 bg-dark-700 hover:bg-dark-600 text-foreground rounded-xl text-sm font-medium transition-all">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
