import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import {
  Search, ShoppingCart, Plus, Minus, Trash2, X, CreditCard,
  FileText, RefreshCw, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Check, Clock, MapPin, User, Filter, Printer, Send, Lock,
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "axios";
import api from "../services/api";
import { useAuthStore } from "../stores/authStore";
import ColumnManager, { migrateCols, withAddedCols } from "../components/ui/ColumnManager";
import Autocomplete from "../components/ui/Autocomplete";
import { useDialogBehavior } from "../components/ui/useDialog";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { saleCode } from "../utils/documentCodes";
import { downloadElementAsPdf } from "../utils/quotePdf";
import QuoteDocument from "../components/quotes/QuoteDocument";

const HISTORY_COLUMNS = ["Código", "Fecha", "Cliente", "Celular", "Usuario", "Ubicación", "Vendedor", "Tipo", "Total", "Pagos", "Nota"];
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

interface Cart {
  id: string;
  label: string;
  items: CartItem[];
}

interface PaymentEntry {
  method: "EFECTIVO" | "QR" | "TRANSFERENCIA" | "CREDITO"; amount: string;
}

interface CustomerData { name: string; nit: string; phone: string; }

interface SaleRecord {
  id: number; saleDate: string; total: number; type: string;
  location: { id: number; name: string }; user: { id: number; name: string };
  seller: string | null;
  customer: { id: number; name: string; nit: string | null; phone: string | null } | null;
  note?: string | null;
  status?: string | null;
  paraQuien?: string | null;
  lugarEntrega?: string | null;
  datosFactura?: string | null;
  nitName?: string | null;
  telefono?: string | null;
  items: { id: number; quantity: number; unitPrice: number; subtotal: number;
    product: { id: number; name: string; itemCode: string; brand?: string } }[];
  payments: { id: number; method: string; amount: number }[];
}

const PAGE_SIZE = 15;

interface SalesPageProps {
  saleType?: "NORMAL" | "DEPARTAMENTAL";
  title?: string;
}

export default function SalesPage({ saleType = "NORMAL", title = "Ventas Locales" }: SalesPageProps = {}) {
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

  // Tiendas donde se puede haber registrado una venta (filtro del historial).
  const histStores = locations.filter((l) => l.type === "TIENDA");

  // --- Seller ---
  // El vendedor de la venta es siempre la cuenta con la que se entro, asi que
  // aqui solo se carga el listado para el filtro del historial.
  const [vendedores, setVendedores] = useState<{ id: number; name: string; locationId: number | null }[]>([]);

  useEffect(() => {
    if (!isTienda && isAdmin) {
      api.get("/users").then((r) => {
        const users = Array.isArray(r.data) ? r.data : r.data.users || [];
        // ADMIN tambien vende: como el vendedor es la cuenta con la que se
        // entra, dejar fuera a los admin escondia sus propias ventas del
        // filtro. Se listan inactivos a proposito: sus ventas son historico.
        setVendedores(
          users
            .filter((u: any) => u.role === "TIENDA" || u.role === "ADMIN")
            .map((u: any) => ({ id: u.id, name: u.name, locationId: u.locationId }))
        );
      }).catch(() => {});
    }
  }, [isAdmin, isTienda]);

  // --- Views (pestañas) ---
  const [activeTab, setActiveTab] = useState<"venta" | "carrito" | "historial">("venta");

  // --- Search (igual que inventario) ---
  const [search, setSearch] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [oemCode, setOemCode] = useState("");
  const [factoryCode, setFactoryCode] = useState("");
  const [detailFilter, setDetailFilter] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([]);
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

  // Sugerencias del filtro de proveedor (mismo origen que Inventario).
  useEffect(() => {
    api.get("/suppliers?limit=100")
      .then((r) => setSuppliers(r.data.suppliers || []))
      .catch(() => setSuppliers([]));
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
    if (activeTab !== "venta") return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (brand) params.set("brand", brand);
      if (manufacturer) params.set("manufacturer", manufacturer);
      if (model) params.set("model", model);
      if (year) params.set("year", year);
      if (categoryId) params.set("categoryId", categoryId);
      if (oemCode) params.set("oemCode", oemCode);
      if (factoryCode) params.set("factoryCode", factoryCode);
      if (detailFilter) params.set("detail", detailFilter);
      if (supplierId) params.set("supplierId", supplierId);
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
  }, [search, brand, manufacturer, model, year, categoryId, oemCode, factoryCode, detailFilter, supplierId, selectedLocationId, searchPage, isVendedor, allowedCategories, activeTab]);

  useEffect(() => { setSearchPage(1); }, [search, brand, manufacturer, model, year, categoryId, oemCode, factoryCode, detailFilter, supplierId, selectedLocationId]);

  const clearSearchFilters = () => {
    setManufacturer(""); setBrand(""); setModel(""); setYear("");
    setCategoryName(""); setCategoryId(""); setOemCode(""); setFactoryCode(""); setDetailFilter("");
    setSupplierName(""); setSupplierId("");
    // No se toca la tienda: es donde se cobra, no un filtro de busqueda.
    setShowFilters(false);
  };

  const hasActiveSearchFilters = !!(manufacturer || brand || model || year || categoryId || oemCode || factoryCode || detailFilter || supplierId);

  // --- Carts (uno por cliente) ---
  const [carts, setCarts] = useState<Cart[]>(() => [{ id: "c1", label: "Carrito 1", items: [] }]);
  const [activeCartId, setActiveCartId] = useState("c1");
  const activeCart = carts.find((c) => c.id === activeCartId) ?? carts[0];
  const cart = activeCart.items;

  const updateActiveCart = (updater: (items: CartItem[]) => CartItem[]) =>
    setCarts((prev) => prev.map((c) => (c.id === activeCartId ? { ...c, items: updater(c.items) } : c)));

  const createNewCart = () => {
    const id = `c${Date.now()}`;
    setCarts((prev) => [...prev, { id, label: `Carrito ${prev.length + 1}`, items: [] }]);
    setActiveCartId(id);
  };

  const switchActiveCart = (id: string) => setActiveCartId(id);

  const renameActiveCart = (label: string) =>
    setCarts((prev) => prev.map((c) => (c.id === activeCartId ? { ...c, label } : c)));

  const removeCart = (id: string) => {
    if (carts.length <= 1) { updateActiveCart(() => []); return; }
    const remaining = carts.filter((c) => c.id !== id);
    setCarts(remaining);
    if (id === activeCartId) setActiveCartId(remaining[0].id);
  };

  const allCartItemCount = carts.reduce((sum, c) => sum + c.items.reduce((s, i) => s + i.quantity, 0), 0);

  // --- Payment modal ---
  const [showPayment, setShowPayment] = useState(false);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [requiereFactura, setRequiereFactura] = useState(false);
  const [customerData, setCustomerData] = useState<CustomerData>({ name: "", nit: "", phone: "" });
  const [saleNote, setSaleNote] = useState("");
  // Departamental: son tres personas distintas y a veces no coinciden.
  //   cliente  = quien compra
  //   envio    = quien recoge, normalmente otra persona
  //   factura  = a quien se emite la factura, a veces un tercero
  // Los campos son los que ya existian en el modelo sin usarse, igual que en
  // Ventas por Mayor: lugarEntrega, paraQuien, datosFactura, nitName y telefono.
  const [paraDonde, setParaDonde] = useState("");
  const [paraQuien, setParaQuien] = useState("");
  const [celularEnvio, setCelularEnvio] = useState("");
  const [nitFactura, setNitFactura] = useState("");
  const [nombreFactura, setNombreFactura] = useState("");
  const [celularFactura, setCelularFactura] = useState("");
  const [processing, setProcessing] = useState(false);

  // --- Add-to-cart modal ---
  const [showAddCart, setShowAddCart] = useState(false);
  const [addTarget, setAddTarget] = useState<Product | null>(null);
  const [addQty, setAddQty] = useState(1);
  const [addTier, setAddTier] = useState<1 | 2>(2);
  const addCartPanelRef = useDialogBehavior(showAddCart, () => { setShowAddCart(false); setAddTarget(null); });

  // --- Solicitar producto al almacén ---
  const [showRequest, setShowRequest] = useState(false);
  const [requestTarget, setRequestTarget] = useState<Product | null>(null);
  const [requestQty, setRequestQty] = useState(1);
  const [requestNote, setRequestNote] = useState("");
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestAlmacenes, setRequestAlmacenes] = useState<{ locationId: number; locationName: string; stock: number }[]>([]);
  const [requestAlmacenesLoading, setRequestAlmacenesLoading] = useState(false);
  const requestPanelRef = useDialogBehavior(showRequest, () => { setShowRequest(false); setRequestTarget(null); });

  // --- Quotation ---
  const [showQuote, setShowQuote] = useState(false);
  // Ultima cotizacion guardada desde este carrito. Si despues se cobra la
  // venta, el backend la marca como CONVERTIDA y las dos quedan trazadas.
  const [savedQuote, setSavedQuote] = useState<{ id: number; code: string; total: number } | null>(null);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histPage, setHistPage] = useState(1);
  const [histPages, setHistPages] = useState(1);
  const [histTotal, setHistTotal] = useState(0);
  const [histDateFrom, setHistDateFrom] = useState("");
  const [histDateTo, setHistDateTo] = useState("");
  const [expandedSale, setExpandedSale] = useState<number | null>(null);

  // ==================== AMPLIAR VENTA DEPARTAMENTAL ====================
  // La venta departamental se construye a lo largo del dia: el cliente llama
  // por un par de cosas, mas tarde por otras, y al final del dia pasa a
  // retirar y pagar. Este modal es para ampliar una venta ya creada y para
  // registrarle pagos, sin tener que rehacer el pedido.
  const [openSale, setOpenSale] = useState<SaleRecord | null>(null);
  const [openSaleSearch, setOpenSaleSearch] = useState("");
  const [openSaleResults, setOpenSaleResults] = useState<Product[]>([]);
  const [openSaleSearching, setOpenSaleSearching] = useState(false);
  const [openSalePending, setOpenSalePending] = useState<{ productId: number; quantity: number; unitPrice: number; priceTier: 1 | 2; name: string; itemCode: string }[]>([]);
  const [openSalePayMethod, setOpenSalePayMethod] = useState("EFECTIVO");
  const [openSalePayAmount, setOpenSalePayAmount] = useState("");
  const [openSaleBusy, setOpenSaleBusy] = useState(false);
  const openSaleRef = useDialogBehavior(openSale !== null, () => {
    setOpenSale(null);
    setOpenSaleSearch(""); setOpenSaleResults([]); setOpenSalePending([]);
    setOpenSalePayAmount(""); setOpenSalePayMethod("EFECTIVO");
  });

  const openSalePaid = openSale
    ? openSale.payments.filter((p) => p.method !== "CREDITO").reduce((s, p) => s + Number(p.amount), 0)
    : 0;
  const openSaleBalance = openSale ? Math.max(openSale.total - openSalePaid, 0) : 0;
  const openSaleAdded = openSalePending.reduce((s, c) => s + c.quantity * c.unitPrice, 0);

  // ==================== AMPLIAR VENTA DEPARTAMENTAL ====================
  const searchForOpenSale = async (term: string) => {
    if (!term.trim()) { setOpenSaleResults([]); return; }
    const params = new URLSearchParams({ search: term.trim(), includeZeroStock: "true", page: "1", limit: "8" });
    if (openSale) params.set("locationId", String(openSale.location.id));
    try {
      setOpenSaleSearching(true);
      const res = await api.get(`/products?${params.toString()}`);
      setOpenSaleResults(res.data.products || []);
    } catch {
      setOpenSaleResults([]);
    } finally {
      setOpenSaleSearching(false);
    }
  };

  const addToOpenSale = (p: Product, tier: 1 | 2) => {
    const precio = Number(tier === 1 ? p.price1 : p.price2);
    if (!precio || precio <= 0) {
      toast.error(`"${p.name}" no tiene precio ${tier === 1 ? "1" : "2"}`);
      return;
    }
    setOpenSalePending((prev) => {
      const found = prev.find((c) => c.productId === p.id && c.priceTier === tier);
      if (found) {
        return prev.map((c) => (c === found ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [...prev, { productId: p.id, quantity: 1, unitPrice: precio, priceTier: tier, name: p.name, itemCode: p.itemCode }];
    });
    setOpenSaleSearch("");
    setOpenSaleResults([]);
  };

  const bumpOpenSaleQty = (productId: number, tier: 1 | 2, delta: number) => {
    setOpenSalePending((prev) => prev
      .map((c) => (c.productId === productId && c.priceTier === tier ? { ...c, quantity: c.quantity + delta } : c))
      .filter((c) => c.quantity > 0));
  };

  const submitOpenSaleItems = async () => {
    if (!openSale || openSalePending.length === 0) return;
    try {
      setOpenSaleBusy(true);
      const res = await api.post(`/sales/${openSale.id}/items`, {
        items: openSalePending.map((c) => ({ productId: c.productId, quantity: c.quantity, unitPrice: c.unitPrice })),
      });
      toast.success(`Venta ${saleCode(openSale.id, openSale.saleDate)} ampliada`);
      setOpenSale({ ...(res.data as SaleRecord), id: openSale.id, saleDate: openSale.saleDate });
      setOpenSalePending([]);
      setSales((prev) => prev.map((s) => (s.id === openSale.id ? { ...s, ...(res.data as SaleRecord) } : s)));
      setHistTotal((t) => t);
      fetchHistory();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "No se pudieron agregar los productos");
    } finally {
      setOpenSaleBusy(false);
    }
  };

  const submitOpenSalePayment = async () => {
    if (!openSale) return;
    const monto = parseFloat(openSalePayAmount);
    if (!monto || monto <= 0) {
      toast.error("Ingresa un monto mayor a 0");
      return;
    }
    try {
      setOpenSaleBusy(true);
      const res = await api.post(`/sales/${openSale.id}/payments`, { method: openSalePayMethod, amount: monto });
      setOpenSale({ ...(res.data as SaleRecord), id: openSale.id, saleDate: openSale.saleDate });
      setOpenSalePayAmount("");
      setSales((prev) => prev.map((s) => (s.id === openSale.id ? { ...s, ...(res.data as SaleRecord) } : s)));
      fetchHistory();
      toast.success("Pago registrado");
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "No se pudo registrar el pago");
    } finally {
      setOpenSaleBusy(false);
    }
  };

  const [histColumns, setHistColumns] = useState<string[]>(() => {    try {
      const raw = localStorage.getItem("columns_ventas");
      const stored = raw ? JSON.parse(raw) : null;
      const roleCols = useAuthStore.getState().columnConfig?.ventas;
      // migrateCols: un "#" guardado se traduce a "Código", si no la columna
      // del código no apareceria en los equipos que ya tenian columnas fijadas.
      // withAddedCols: las columnas nuevas entran solas, porque si faltan en lo
      // guardado es que no existian cuando se guardo, no que esten ocultas.
      const base = withAddedCols("ventas", migrateCols(stored?.length ? stored : roleCols?.length ? roleCols : HISTORY_COLUMNS), HISTORY_COLUMNS);
      const merged = HISTORY_COLUMNS.filter((c) => base.includes(c));
      return merged.length ? merged : HISTORY_COLUMNS;
    } catch {
      return HISTORY_COLUMNS;
    }
  });

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

  /** Cambia el precio de la línea entre Precio 1 y Precio 2. */
  const setCartTier = (productId: number, tier: 1 | 2) => {
    updateActiveCart((prev) =>
      prev.map((c) => {
        if (c.productId !== productId) return c;
        const precio = tier === 2 && Number(c.price2) > 0 ? Number(c.price2) : Number(c.price1);
        if (precio <= 0) return c;
        return { ...c, priceTier: tier, unitPrice: precio };
      })
    );
  };

  const renderCartCell = (c: CartItem, column: string) => {
    if (column === "Producto") return <td key={column} className="px-5 py-3"><p className="text-foreground font-medium text-sm">{c.name}</p><p className="text-xs text-gray-500">{c.brand} · {c.itemCode}</p></td>;
    if (column === "Precio") {
      const p1 = Number(c.price1);
      const p2 = Number(c.price2);
      const puedeElegir = p1 > 0 && p2 > 0 && p1 !== p2;
      if (!puedeElegir) {
        return (
          <td key={column} className="px-4 py-3 text-right">
            <span className="text-gray-300">{formatBs(c.unitPrice)}</span>
            {!p2 || p2 <= 0 ? <p className="text-[10px] text-gray-600 mt-0.5">solo P1</p> : null}
          </td>
        );
      }
      return (
        <td key={column} className="px-4 py-3 text-right">
          <div className="inline-flex rounded-lg border border-dark-600/50 overflow-hidden" role="group" aria-label={`Precio de ${c.name}`}>
            <button
              onClick={() => setCartTier(c.productId, 1)}
              aria-pressed={c.priceTier === 1}
              title={`Precio 1: ${formatBs(p1)}`}
              className={`px-2 py-1 text-[11px] font-semibold transition-all ${
                c.priceTier === 1 ? "bg-green-600/20 text-green-400" : "text-gray-500 hover:text-green-400 hover:bg-dark-700/50"
              }`}
            >
              P1
            </button>
            <button
              onClick={() => setCartTier(c.productId, 2)}
              aria-pressed={c.priceTier === 2}
              title={`Precio 2: ${formatBs(p2)}`}
              className={`px-2 py-1 text-[11px] font-semibold border-l border-dark-600/50 transition-all ${
                c.priceTier === 2 ? "bg-blue-600/20 text-blue-400" : "text-gray-500 hover:text-blue-400 hover:bg-dark-700/50"
              }`}
            >
              P2
            </button>
          </div>
          <p className="text-xs text-gray-300 mt-1">{formatBs(c.unitPrice)}</p>
        </td>
      );
    }
    if (column === "Cantidad") return <td key={column} className="px-4 py-3"><div className="flex items-center justify-center gap-1.5"><button onClick={() => updateQuantity(c.productId, c.quantity - 1)} className="p-1 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400"><Minus size={14} /></button><span className="w-10 text-center text-foreground text-sm font-medium">{c.quantity}</span><button onClick={() => updateQuantity(c.productId, c.quantity + 1)} className="p-1 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400"><Plus size={14} /></button></div><p className="text-center text-xs text-gray-600 mt-0.5">disp: {c.availableStock}</p></td>;
    if (column === "Subtotal") return <td key={column} className="px-4 py-3 text-right text-green-400 font-medium">{formatBs(c.unitPrice * c.quantity)}</td>;
    if (column === "Eliminar") return <td key={column} className="px-5 py-3 text-center"><button onClick={() => removeItem(c.productId)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400"><Trash2 size={14} /></button></td>;
    return null;
  };

  // ==================== CART ====================
  const addToCart = (p: Product, tier: 1 | 2 = 2, qty: number = 1) => {
    const price = tier === 2 && Number(p.price2) > 0 ? Number(p.price2) : Number(p.price1);
    updateActiveCart((prev) => {
      const existing = prev.find((c) => c.productId === p.id);
      if (existing) {
        if (existing.quantity + qty > p.stock) {
          toast.error(`Stock insuficiente (disponible: ${p.stock})`);
          return prev;
        }
        return prev.map((c) =>
          c.productId === p.id ? { ...c, quantity: c.quantity + qty, priceTier: tier, unitPrice: price } : c
        );
      }
return [...prev, {
        productId: p.id, itemCode: p.itemCode, name: p.name, brand: p.brand,
        unitPrice: price, priceTier: tier, price1: Number(p.price1), price2: Number(p.price2),
        quantity: qty, availableStock: p.stock,
      }];
    });
  };

  // ACCIONES: abrir modal para elegir cantidad y precio (1 o 2)
  const openAddToCart = (p: Product) => {
    if (p.stock <= 0) { toast.error("Sin stock en esta tienda"); return; }
    const hasTwoPrices = Number(p.price2) > 0 && Number(p.price2) !== Number(p.price1);
    setAddTarget(p);
    setAddQty(1);
    setAddTier(hasTwoPrices ? 2 : 1);
    setShowAddCart(true);
  };

  const confirmAddToCart = () => {
    if (!addTarget) return;
    addToCart(addTarget, addTier, addQty);
    setShowAddCart(false);
    setAddTarget(null);
  };

  /**
   * Cotizacion imprimible desde el carrito.
   *
   * Primero se guarda en el servidor: el PDF tiene que salir con el codigo
   * (COT-2026-0007) y no con algo que se pierda al cerrar el navegador. Si el
    * guardado falla no se imprime nada, para no entregar un documento que
   * el taller no puede volver a encontrar.
   */
  const downloadQuotePDF = async () => {
    if (cart.length === 0) return;
    toast.loading("Generando cotización...", { id: "quote" });
    try {
      const res = await api.post("/quotes", {
        items: cart.map((c) => ({
          productId: c.productId,
          quantity: c.quantity,
          unitPrice: Number(c.unitPrice),
          priceTier: c.priceTier ?? null,
        })),
        clientName: /^Carrito \d+$/.test(activeCart.label) ? "" : activeCart.label.trim(),
        saleType,
        locationId: quoteLocationId ?? undefined,
      });
      const saved = res.data.quote as { id: number; code: string; total: number };
      setSavedQuote({ id: saved.id, code: saved.code, total: Number(saved.total) });

      setShowQuote(true);
      // Un frame para que el codigo ya este pintado antes de capturar.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await downloadElementAsPdf("sale-quote-doc", `cotizacion-${saved.code}.pdf`);
      toast.success(`Cotización ${saved.code} descargada`, { id: "quote" });
    } catch {
      toast.error("Error al generar la cotización", { id: "quote" });
    } finally {
      setShowQuote(false);
    }
  };

  // La tienda del vendedor tiene prioridad: la cotizacion siempre debe decir
  // de que tienda es, aunque el admin no haya elegido ninguna.
  const quoteLocationId = isTienda ? user?.locationId ?? selectedLocationId : selectedLocationId;
  const quoteStoreName = locations.find((l) => l.id === quoteLocationId)?.name || "";
  const quoteSeller = (user?.name || "").trim();
  const quoteClient = /^Carrito \d+$/.test(activeCart.label) ? "" : activeCart.label.trim();

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
        <div className="flex items-center justify-center gap-1.5">
          {p.stock <= 0 ? (
            <button
              onClick={() => openRequestProduct(p)}
              title="Solicitar al almacén"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600/10 border border-amber-600/25 text-amber-400 hover:bg-amber-600 hover:text-white transition-all text-xs font-medium"
            >
              <Send size={14} /> Solicitar
            </button>
          ) : (
            <button
              onClick={() => openAddToCart(p)}
              title="Agregar al carrito"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary-600/10 border border-primary-600/25 text-primary-400 hover:bg-primary-600 hover:text-white transition-all text-xs font-medium"
            >
              <ShoppingCart size={14} /> Agregar
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
    updateActiveCart((prev) => prev.map((c) => {
      if (c.productId !== productId) return c;
      if (newQty > c.availableStock) {
        toast.error(`Stock máximo: ${c.availableStock}`);
        return { ...c, quantity: c.availableStock };
      }
      return { ...c, quantity: newQty };
    }));
  };

  const removeItem = (productId: number) =>
    updateActiveCart((prev) => prev.filter((c) => c.productId !== productId));

  const clearCart = () => updateActiveCart(() => []);

  const cartTotal = cart.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0);
  const cartItemCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  // ==================== PAYMENTS ====================
  const openPayment = () => {
    if (cart.length === 0) { toast.error("Agrega productos al carrito primero"); return; }
    setPayments([{ method: "EFECTIVO", amount: String(cartTotal.toFixed(2)) }]);
    setRequiereFactura(false);
    setCustomerData({ name: "", nit: "", phone: "" });
    setSaleNote("");
    setParaDonde(""); setParaQuien(""); setCelularEnvio("");
    setNitFactura(""); setNombreFactura(""); setCelularFactura("");
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

    // Departamental: el pedido se arma durante el dia y el cliente paga al
    // final, asi que se admite deudar. Local se cobra en el momento y exige
    // pago completo. El backend valida lo mismo.
    if (saleType === "DEPARTAMENTAL") {
      if (totalPaid - cartTotal > 0.01) {
        toast.error(`El total pagado (${formatBs(totalPaid)}) supera el total (${formatBs(cartTotal)})`);
        return;
      }
    } else if (Math.abs(totalPaid - cartTotal) > 0.01) {
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
        type: saleType,
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

      if (savedQuote) {
        // La cotizacion que salio impresa se cierra como CONVERTIDA y queda
        // enlazada a esta venta. Solo enlaza si el carrito no cambio desde la
        // impresion: si el vendedor toco cantidades o precios, el documento
        // entregado ya no describe esta venta y el vinculo seria falso.
        if (Math.abs(savedQuote.total - cartTotal) < 0.005) {
          payload.quoteId = savedQuote.id;
        }
      }

      if (requiereFactura && customerData.name.trim()) {
        payload.customerData = {
          name: customerData.name.trim(),
          nit: customerData.nit.trim() || null,
          phone: customerData.phone.trim() || null,
        };
      }

      if (saleType === "DEPARTAMENTAL") {
        payload.requiereFactura = requiereFactura;
        // Envio: quien recoge, normalmente distinto al cliente.
        payload.paraQuien = paraQuien.trim() || null;
        payload.lugarEntrega = paraDonde.trim() || null;
        payload.telefono = celularEnvio.trim() || null;
        // Factura: a veces es un tercero. El backend lo ignora si no se pidio
        // factura, asi que se manda igual sin conditionally.
        payload.datosFactura = nitFactura.trim() || null;
        payload.nitName = nombreFactura.trim() || null;
        payload.telefonoFactura = celularFactura.trim() || null;
      }

      if (selectedLocationId) {
        payload.locationId = selectedLocationId;
      }
      if (saleNote.trim()) {
        payload.note = saleNote.trim();
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
      updateActiveCart(() => []);
      setSavedQuote(null);
      setActiveTab("venta");
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
      pdf.save(`venta-${saleCode(lastSale.id, lastSale.saleDate)}.pdf`);
      toast.success("PDF descargado", { id: "pdf" });
    } catch {
      toast.error("Error al generar PDF", { id: "pdf" });
    }
  };

  // Nota de venta imprimible (backend HTML A5: Cód. Fábrica, Precio 1/2, Cantidad, Total pagado, Fecha, Tienda)
  const printSaleNota = async () => {
    if (!lastSale) return;
    toast.loading("Preparando nota de venta...", { id: "nota" });
    try {
      const res = await api.get(`/sales/${lastSale.id}/nota`, { responseType: "text" });
      const html = typeof res.data === "string" ? res.data : (res.data as any)?.data || "";
      const win = window.open("", "_blank", "width=640,height=800");
      if (!win) {
        toast.error("Permite ventanas emergentes para imprimir", { id: "nota" });
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      toast.success("Nota lista para imprimir", { id: "nota" });
    } catch {
      toast.error("Error al generar la nota", { id: "nota" });
    }
  };

  // Solicitar producto al almacén (solo almacén, no otra tienda)
  const openRequestProduct = async (p: Product) => {
    setRequestTarget(p);
    setRequestQty(1);
    setRequestNote("");
    setRequestAlmacenes([]);
    setShowRequest(true);
    setRequestAlmacenesLoading(true);
    try {
      const res = await api.get(`/inventory/product/${p.id}`);
      const data = res.data;
      setRequestAlmacenes((data?.locations || []).filter((l: any) => l.locationType === "ALMACEN"));
    } catch {
      setRequestAlmacenes([]);
    } finally {
      setRequestAlmacenesLoading(false);
    }
  };

  const submitRequest = async () => {
    if (!requestTarget) return;
    const requestedStoreId = isTienda
      ? user?.locationId
      : selectedLocationId
        ? Number(selectedLocationId)
        : locations.find((l) => l.type === "TIENDA")?.id;
    if (!requestedStoreId) {
      toast.error("Selecciona la tienda solicitante");
      return;
    }
    const qty = Number(requestQty) > 0 ? Number(requestQty) : 1;
    setRequestSaving(true);
    try {
      await api.post("/requests", {
        productId: requestTarget.id,
        quantity: qty,
        locationId: requestedStoreId,
        note: requestNote.trim() || null,
      });
      toast.success("Solicitud enviada al almacén");
      setShowRequest(false);
      setRequestTarget(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al solicitar el producto");
    } finally {
      setRequestSaving(false);
    }
  };

  // ==================== HISTORY ====================
  const [histSeller, setHistSeller] = useState("");
  // Filtro de tienda del historial. Es aparte del selector de tienda de la
  // venta: ese elige donde se cobra, este solo acota que ventas se miran.
  const [histLocation, setHistLocation] = useState("");

  const fetchHistory = useCallback(async () => {
    try {
      setHistLoading(true);
      const params = new URLSearchParams({ page: String(histPage), limit: String(PAGE_SIZE) });
      if (histDateFrom) params.set("startDate", histDateFrom);
      if (histDateTo) params.set("endDate", histDateTo);
      if (histSeller) params.set("seller", histSeller);
      // Cada pagina mira solo su propio tipo: Locales (NORMAL) y
      // Departamentales (DEPARTAMENTAL) no deben mezclar historicos. Antes
      // NORMAL no se enviaba y el backend devolvia los tres tipos.
      params.set("type", saleType);
      // El backend ya fuerza la tienda del usuario TIENDA; enviar la suya
      // seria redundante y para ADMIN es justamente el filtro que se pide.
      if (isTienda && user?.locationId) params.set("locationId", String(user.locationId));
      else if (histLocation) params.set("locationId", histLocation);

      const res = await api.get(`/sales?${params.toString()}`);
      setSales(res.data.sales);
      setHistTotal(res.data.pagination.total);
      setHistPages(res.data.pagination.pages);
    } catch { toast.error("Error al cargar historial"); }
    finally { setHistLoading(false); }
  }, [histPage, histDateFrom, histDateTo, histSeller, histLocation, saleType, isTienda, user?.locationId]);

  useEffect(() => {
    if (activeTab === "historial") fetchHistory();
  }, [activeTab, fetchHistory]);

  useEffect(() => { if (activeTab === "historial") setHistPage(1); }, [histDateFrom, histDateTo, histSeller, histLocation, activeTab]);

  // ==================== RENDER ====================
  const pmLabel: Record<string, string> = { EFECTIVO: "Efectivo", QR: "QR", TRANSFERENCIA: "Transferencia", CREDITO: "Crédito" };

  /**
   * Celda del historial para una columna concreta.
   *
   * El cuerpo recorre histColumns en el mismo orden que el encabezado, y no
   * con isHistCol por columna: asi mover una columna en el gestor no deja el
   * titulo desfasado respecto a los datos que tiene debajo.
   */
  const renderHistCell = (col: string, s: SaleRecord) => {
    switch (col) {
      case "Código":
        return <td className="px-4 py-3 text-amber-400/90 font-mono text-xs whitespace-nowrap">{saleCode(s.id, s.saleDate)}</td>;
      case "Fecha":
        return (
          <td className="px-4 py-3 text-gray-300 text-xs">
            {new Date(s.saleDate).toLocaleDateString("es-BO")}{" "}
            <span className="text-gray-500">
              {new Date(s.saleDate).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </td>
        );
      case "Cliente":
        return (
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
        );
      case "Celular":
        return <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">{s.customer?.phone || "—"}</td>;
      case "Usuario":
        return <td className="px-4 py-3 text-gray-300 text-xs">{s.user.name}</td>;
      case "Ubicación":
        return (
          <td className="px-4 py-3 text-gray-400 text-xs">
            <span className="inline-flex items-center gap-1"><MapPin size={12} /> {s.location.name}</span>
          </td>
        );
      case "Vendedor":
        return <td className="px-4 py-3 text-gray-300 text-xs">{s.seller || "—"}</td>;
      case "Tipo":
        return (
          <td className="px-4 py-3 text-center">
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
              s.type === "MAYOR" ? "bg-amber-500/10 text-amber-400" : s.type === "DEPARTAMENTAL" ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"
            }`}>
              {s.type === "MAYOR" ? "Mayor" : s.type === "DEPARTAMENTAL" ? "Departamental" : "Normal"}
            </span>
          </td>
        );
      case "Total":
        return <td className="px-4 py-3 text-right text-green-400 font-medium text-sm">{formatBs(s.total)}</td>;
      case "Pagos":
        return (
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
        );
      case "Nota":
        return (
          <td className="px-4 py-3 text-gray-400 text-xs max-w-[15rem]">
            {s.note ? <span title={s.note} className="line-clamp-2">{s.note}</span> : <span className="text-gray-600">—</span>}
          </td>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-gray-400 text-sm mt-1">
            {activeTab === "historial"
              ? `${histTotal} ventas registradas`
              : activeTab === "carrito"
                ? `${cartItemCount} unidad(es) en carrito`
                : `${searchTotal > 0 ? searchTotal + " productos encontrados" : "Busca productos y agrégalos al carrito"}`}
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-dark-800/50 border border-dark-700/50 rounded-xl">
          <button onClick={() => setActiveTab("venta")}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "venta" ? "bg-primary-600/15 text-primary-400" : "text-gray-400 hover:text-foreground"
            }`}>
            <Search size={15} /> Productos
          </button>
          <button onClick={() => setActiveTab("carrito")}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "carrito" ? "bg-primary-600/15 text-primary-400" : "text-gray-400 hover:text-foreground"
            }`}>
            <ShoppingCart size={15} />
            Carrito
            {allCartItemCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-primary-600 text-white">{allCartItemCount}</span>
            )}
          </button>
          <button onClick={() => setActiveTab("historial")}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "historial" ? "bg-primary-600/15 text-primary-400" : "text-gray-400 hover:text-foreground"
            }`}>
            <Clock size={15} /> Historial
          </button>
        </div>
      </div>

      {/* ============ PRODUCTOS (búsqueda) ============ */}
      {activeTab === "venta" && (
        <>
          {/* Tienda + vendedor fijo (la cuenta con la que se entro) */}
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
              {/* El vendedor es la cuenta con la que se entro: no se puede cambiar. */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-foreground text-sm font-medium truncate">{user?.name || "Cargando..."}</span>
                <span
                  title="La venta se registra a nombre de tu cuenta"
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-dark-900/60 border border-dark-600/50 px-2 py-1 text-[10px] uppercase tracking-wide text-gray-400"
                >
                  <Lock size={10} /> Tu cuenta
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:col-span-2">
              <div className="flex items-center gap-2 text-sm text-gray-400 shrink-0">
                <ShoppingCart size={16} className="text-primary-400" />
                <span>Carrito:</span>
              </div>
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1">
                  <select value={activeCartId} onChange={(e) => switchActiveCart(e.target.value)}
                    aria-label="Carrito activo"
                    className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8">
                    {carts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} ({c.items.reduce((s, i) => s + i.quantity, 0)})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>
                <button onClick={createNewCart} title="Nuevo carrito"
                  className="flex items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-medium bg-primary-600/10 border border-primary-600/25 text-primary-400 hover:bg-primary-600 hover:text-white transition-all shrink-0">
                  <Plus size={14} /> Nuevo
                </button>
              </div>
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
                <Autocomplete value={manufacturer} onChange={setManufacturer} suggestions={filters.manufacturers}
                  placeholder="Todos los fabricantes" label="Fabricante" />
                <Autocomplete value={supplierName} onChange={(v) => {
                  setSupplierName(v);
                  const found = suppliers.find((s) => s.name === v);
                  setSupplierId(found ? String(found.id) : "");
                }}
                  suggestions={suppliers.map((s) => s.name)} placeholder="Todos los proveedores" label="Proveedor" />
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
                <Autocomplete value={categoryName} onChange={(v) => { setCategoryName(v); const found = filters.categories.find((c) => c.name === v); setCategoryId(found ? String(found.id) : ""); }}
                  suggestions={filters.categories.map((c) => c.name)} placeholder="Todas las categorías" label="Categoría" />
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
                <p className="text-gray-400 text-sm">
                  {search || hasActiveSearchFilters ? "No se encontraron productos con esos criterios" : "Cargando productos..."}
                </p>
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
                        <button onClick={() => openAddToCart(p)} disabled={p.stock <= 0}
                          title={p.stock > 0 ? "Agregar al carrito" : "Sin stock en esta tienda"}
                          className="p-2 rounded-lg bg-primary-600/10 border border-primary-600/20 text-primary-400 hover:bg-primary-600 hover:text-white transition-all disabled:opacity-30">
                          <ShoppingCart size={14} />
                        </button>
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

          </>
      )}

      {/* ============ CARRITO (pestaña aparte) ============ */}
      {activeTab === "carrito" && (
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
          {/* Chips de carritos */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-dark-700/50 flex-wrap">
            {carts.map((c) => {
              const count = c.items.reduce((s, i) => s + i.quantity, 0);
              const isActive = c.id === activeCartId;
              return (
                <div key={c.id} className={`flex items-center gap-1 pl-3 pr-1.5 py-1.5 rounded-xl border text-sm transition-all ${isActive ? "bg-primary-600/15 border-primary-600/30 text-primary-400" : "bg-dark-900/50 border-dark-700/50 text-gray-400 hover:text-foreground"}`}>
                  <button onClick={() => switchActiveCart(c.id)} className="flex items-center gap-1.5 font-medium">
                    {c.label}
                    {count > 0 && <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-primary-600 text-white">{count}</span>}
                  </button>
                  <button onClick={() => removeCart(c.id)} title="Eliminar carrito" className="p-0.5 rounded text-gray-500 hover:text-red-400">
                    <X size={13} />
                  </button>
                </div>
              );
            })}
            <button onClick={createNewCart}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-dashed border-dark-600/50 text-gray-500 hover:text-primary-400 hover:border-primary-600/40 text-sm transition-all">
              <Plus size={14} /> Nuevo carrito
            </button>
          </div>

          <div className="flex items-center justify-between px-5 py-3 border-b border-dark-700/50 flex-wrap gap-2">
            <h2 className="text-sm font-medium text-gray-300 flex items-center gap-2 min-w-0 flex-1">
              <ShoppingCart size={16} className="text-primary-400 shrink-0" />
              <input
                value={activeCart.label}
                onChange={(e) => renameActiveCart(e.target.value)}
                placeholder="Nombre del cliente / carrito"
                aria-label="Nombre del carrito"
                className="w-full max-w-[240px] bg-transparent border border-transparent hover:border-dark-600 focus:border-primary-500 focus:bg-dark-900/50 rounded-lg px-2 py-1 text-foreground outline-none transition-all"
              />
            </h2>
            <div className="flex items-center gap-2">
              <ColumnManager module="carrito" columns={CART_COLUMNS} onVisibleChange={setCartColumns} />
              {cart.length > 0 && (
                <>
                  <button onClick={downloadQuotePDF}
                    title="Imprimir cotización de la venta"
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600/10 border border-blue-600/25 text-blue-400 hover:bg-blue-600 hover:text-white rounded-lg transition-all font-medium">
                    <Printer size={14} /> Cotización
                  </button>
                  <button onClick={clearCart} className="text-xs text-red-400 hover:text-red-300">Vaciar</button>
                </>
              )}
            </div>
          </div>

          {cart.length === 0 ? (
            <div className="p-10 text-center">
              <ShoppingCart size={48} className="text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">El carrito está vacío. Agrega productos desde la pestaña Productos.</p>
              <button onClick={() => setActiveTab("venta")}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all">
                <Search size={16} /> Buscar productos
              </button>
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
                    {Number(c.price1) > 0 && Number(c.price2) > 0 && Number(c.price1) !== Number(c.price2) && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Precio:</span>
                        <div className="inline-flex rounded-lg border border-dark-600/50 overflow-hidden" role="group" aria-label={`Precio de ${c.name}`}>
                          <button onClick={() => setCartTier(c.productId, 1)} aria-pressed={c.priceTier === 1}
                            className={`px-2.5 py-1 text-[11px] font-semibold transition-all ${
                              c.priceTier === 1 ? "bg-green-600/20 text-green-400" : "text-gray-500"
                            }`}>
                            P1 {formatBs(Number(c.price1))}
                          </button>
                          <button onClick={() => setCartTier(c.productId, 2)} aria-pressed={c.priceTier === 2}
                            className={`px-2.5 py-1 text-[11px] font-semibold border-l border-dark-600/50 transition-all ${
                              c.priceTier === 2 ? "bg-blue-600/20 text-blue-400" : "text-gray-500"
                            }`}>
                            P2 {formatBs(Number(c.price2))}
                          </button>
                        </div>
                      </div>
                    )}
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
                <div className="flex flex-col sm:flex-row gap-2">
                  <button onClick={downloadQuotePDF}
                    className="flex-1 bg-blue-600/10 border border-blue-600/25 text-blue-400 hover:bg-blue-600 hover:text-white py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2">
                    <Printer size={16} /> Imprimir Cotización
                  </button>
                  <button onClick={openPayment}
                    className="flex-1 bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-600/20">
                    <CreditCard size={18} /> Cobrar · {formatBs(cartTotal)}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============ HISTORY ============ */}
      {activeTab === "historial" && (
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
                  <label className="block text-xs text-gray-500 mb-1" htmlFor="hist-seller">Vendedor</label>
                  <div className="relative">
                    <select id="hist-seller" value={histSeller} onChange={(e) => setHistSeller(e.target.value)}
                      className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8">
                      <option value="">Todos</option>
                      {isTienda
                        ? (user?.name ? <option value={user.name}>{user.name}</option> : null)
                        // El filtro va por nombre, asi que dos cuentas con el
                        // mismo nombre se muestran una sola vez.
                        : [...new Map(vendedores.map((v) => [v.name, v])).values()].map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>
                </div>
              {!isTienda && (
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1" htmlFor="hist-location">Tienda</label>
                  <div className="relative">
                    <select id="hist-location" value={histLocation} onChange={(e) => setHistLocation(e.target.value)}
                      className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8">
                      <option value="">Todas</option>
                      {histStores.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>
                </div>
              )}
              {(histDateFrom || histDateTo || histSeller || histLocation) && (
                <button onClick={() => { setHistDateFrom(""); setHistDateTo(""); setHistSeller(""); setHistLocation(""); }}
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
                          {/* La primera celda es la del botón de expandir, que no
                              tiene encabezado. Sin ella, todos los titulos caen
                              una columna a la izquierda de sus datos. */}
                          <th className="w-10 px-2 py-3" />
                          {histColumns.map((col) => {
                            const cl = col.toLowerCase();
                            const align = cl === "total" ? "text-right" : cl === "tipo" ? "text-center" : "text-left";
                            return <th key={col} className={`${align} px-4 py-3 font-medium whitespace-nowrap`}>{col}</th>;
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
                            {histColumns.map((col) => (
                              <Fragment key={col}>{renderHistCell(col, s)}</Fragment>
                            ))}
                            {saleType === "DEPARTAMENTAL" && (
                              <td className="px-2 py-3 whitespace-nowrap">
                                <button onClick={() => setOpenSale(s)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-primary-400 hover:text-primary-300 hover:bg-primary-500/10 transition-all"
                                  title="Agregar productos y registrar pagos a esta venta">
                                  <Plus size={13} /> Ampliar
                                </button>
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
                    <p className="text-xs text-gray-600">
                      Datos de quien compra. Los de quien recoge van en “Envío”.
                    </p>
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

              {/* Envio y factura (solo departamental) */}
              {saleType === "DEPARTAMENTAL" && (
                <>
                  {/* Quiien recoge: normalmente no es el cliente */}
                  <div className="border-t border-dark-700/50 pt-5 space-y-3">
                    <div>
                      <h4 className="text-xs font-semibold text-primary-400 uppercase tracking-wide">
                        Datos de envío
                      </h4>
                      <p className="text-xs text-gray-600 mt-0.5">
                        De quien va a recoger. Puede ser otra persona.
                      </p>
                    </div>
                    <div>
                      <label htmlFor="venta-paraquien" className="block text-xs text-gray-500 mb-1">Nombre de quien recibe</label>
                      <input id="venta-paraquien" type="text" value={paraQuien}
                        onChange={(e) => setParaQuien(e.target.value)}
                        placeholder="Nombre de quien recoge"
                        className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none placeholder-gray-600" />
                    </div>
                    <div>
                      <label htmlFor="venta-paradone" className="block text-xs text-gray-500 mb-1">A dónde se envía</label>
                      <input id="venta-paradone" type="text" value={paraDonde}
                        onChange={(e) => setParaDonde(e.target.value)}
                        placeholder="Dirección o lugar de entrega"
                        className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none placeholder-gray-600" />
                    </div>
                    <div>
                      <label htmlFor="venta-celenvio" className="block text-xs text-gray-500 mb-1">Celular de quien recibe</label>
                      <input id="venta-celenvio" type="tel" value={celularEnvio}
                        onChange={(e) => setCelularEnvio(e.target.value)}
                        placeholder="Celular"
                        className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none placeholder-gray-600" />
                    </div>
                  </div>

                  {/* A quien se factura: a veces es un tercero distinto */}
                  {requiereFactura && (
                    <div className="border-t border-dark-700/50 pt-5 space-y-3">
                      <div>
                        <h4 className="text-xs font-semibold text-primary-400 uppercase tracking-wide">
                          Datos de factura
                        </h4>
                        <p className="text-xs text-gray-600 mt-0.5">
                          A nombre de quién se emite. Si es el cliente o quien recoge, repite sus datos.
                        </p>
                      </div>
                      <div>
                        <label htmlFor="venta-nombrefact" className="block text-xs text-gray-500 mb-1">Nombre / Razón social</label>
                        <input id="venta-nombrefact" type="text" value={nombreFactura}
                          onChange={(e) => setNombreFactura(e.target.value)}
                          placeholder="Nombre a facturar"
                          className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none placeholder-gray-600" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="venta-nitfact" className="block text-xs text-gray-500 mb-1">NIT / Carnet</label>
                          <input id="venta-nitfact" type="text" value={nitFactura}
                            onChange={(e) => setNitFactura(e.target.value)}
                            placeholder="NIT o CI"
                            className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none placeholder-gray-600" />
                        </div>
                        <div>
                          <label htmlFor="vela-celfact" className="block text-xs text-gray-500 mb-1">Celular</label>
                          <input id="vela-celfact" type="tel" value={celularFactura}
                            onChange={(e) => setCelularFactura(e.target.value)}
                            placeholder="Celular"
                            className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none placeholder-gray-600" />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Nota / Recordatorio */}
              <div className="border-t border-dark-700/50 pt-5">
                <label htmlFor="venta-nota" className="block text-xs text-gray-500 mb-1.5">Nota / Recordatorio (opcional)</label>
                <textarea id="venta-nota" value={saleNote} onChange={(e) => setSaleNote(e.target.value)} rows={2}
                  placeholder="Nota, recordatorio o instrucción para esta venta..."
                  className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none placeholder-gray-600" />
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
              Venta {saleCode(lastSale.id, lastSale.saleDate)} · {new Date(lastSale.saleDate).toLocaleString("es-BO")}
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

            {lastSale.note && (
              <div className="bg-dark-900/50 border border-dark-700/30 rounded-xl p-3 mb-4 text-left">
                <p className="text-xs text-gray-500 mb-1">Nota / Recordatorio</p>
                <p className="text-sm text-yellow-300">{lastSale.note}</p>
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

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <button onClick={printSaleNota}
                  className="bg-dark-700 hover:bg-dark-600 text-foreground py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2">
                  <Printer size={16} /> Imprimir Nota
                </button>
                <button onClick={downloadSalePDF}
                  className="bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2">
                  <FileText size={16} /> Descargar PDF
                </button>
              </div>
              <button onClick={() => { setShowConfirmed(false); setLastSale(null); }}
                className="w-full text-sm text-gray-400 hover:text-foreground transition-all py-1">
                Cerrar
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
    {/* ============ ADD TO CART MODAL ============ */}
      {showAddCart && addTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div ref={addCartPanelRef} role="dialog" aria-modal="true" aria-label="Agregar al carrito" className="bg-dark-800 border border-dark-700/50 rounded-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-start justify-between px-5 py-4 border-b border-dark-700/50">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-foreground truncate">{addTarget.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {addTarget.manufacturer} · {addTarget.brand} · {addTarget.model} · {addTarget.itemCode}
                </p>
              </div>
              <button onClick={() => { setShowAddCart(false); setAddTarget(null); }}
                className="p-2 rounded-lg text-gray-400 hover:text-foreground hover:bg-dark-700 transition-all shrink-0 ml-3">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div>
                <span className="block text-xs text-gray-500 mb-1.5">Selecciona el precio</span>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setAddTier(1)} disabled={Number(addTarget.price1) <= 0}
                    className={`rounded-xl border p-3 text-left transition-all disabled:opacity-30 ${addTier === 1 ? "bg-green-600/10 border-green-600/40" : "bg-dark-900/50 border-dark-600/50 hover:border-green-600/30"}`}>
                    <span className="block text-xs font-medium text-gray-400">Precio 1</span>
                    <span className="block text-base font-bold text-green-400 mt-0.5">{formatBs(Number(addTarget.price1))}</span>
                  </button>
                  <button onClick={() => setAddTier(2)} disabled={Number(addTarget.price2) <= 0}
                    className={`rounded-xl border p-3 text-left transition-all disabled:opacity-30 ${addTier === 2 ? "bg-blue-600/10 border-blue-600/40" : "bg-dark-900/50 border-dark-600/50 hover:border-blue-600/30"}`}>
                    <span className="block text-xs font-medium text-gray-400">Precio 2</span>
                    {Number(addTarget.price2) > 0
                      ? <span className="block text-base font-bold text-blue-400 mt-0.5">{formatBs(Number(addTarget.price2))}</span>
                      : <span className="block text-sm text-gray-600 mt-0.5">No disponible</span>}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500">Cantidad</span>
                  <span className="text-xs text-gray-500">Stock disponible: <b className="text-foreground">{addTarget.stock}</b></span>
                </div>
                <div className="flex items-center justify-center gap-1.5">
                  <button onClick={() => setAddQty(Math.max(1, addQty - 1))} disabled={addQty <= 1}
                    className="p-2.5 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground transition-all disabled:opacity-30">
                    <Minus size={16} />
                  </button>
                  <span className="w-16 text-center text-foreground text-xl font-bold">{addQty}</span>
                  <button onClick={() => setAddQty(Math.min(addTarget.stock, addQty + 1))} disabled={addQty >= addTarget.stock}
                    className="p-2.5 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground transition-all disabled:opacity-30">
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <div className="bg-dark-900/50 border border-dark-700/30 rounded-xl p-3 flex items-center justify-between">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Subtotal</span>
                <span className="text-lg font-bold text-green-400">
                  {formatBs((addTier === 2 && Number(addTarget.price2) > 0 ? Number(addTarget.price2) : Number(addTarget.price1)) * addQty)}
                </span>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-dark-700/50 flex gap-3">
              <button onClick={() => { setShowAddCart(false); setAddTarget(null); }}
                className="flex-1 bg-dark-700 hover:bg-dark-600 text-foreground py-2.5 rounded-xl text-sm font-medium transition-all">
                Cancelar
              </button>
              <button onClick={confirmAddToCart}
                className="flex-1 bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2">
                <ShoppingCart size={16} /> Agregar al carrito
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ REQUEST MODAL (solicitar a otra tienda/almacén) ============ */}
      {showRequest && requestTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div ref={requestPanelRef} role="dialog" aria-modal="true" aria-label="Solicitar producto" className="bg-dark-800 border border-dark-700/50 rounded-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-start justify-between px-5 py-4 border-b border-dark-700/50">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-foreground truncate">Solicitar al almacén</h3>
                <p className="text-xs text-gray-500 mt-2 truncate">{requestTarget.name}</p>
                <p className="text-xs text-gray-500 truncate">
                  {requestTarget.manufacturer} · {requestTarget.brand} · {requestTarget.model} · {requestTarget.itemCode}
                </p>
              </div>
              <button onClick={() => { setShowRequest(false); setRequestTarget(null); }}
                className="p-2 rounded-lg text-gray-400 hover:text-foreground hover:bg-dark-700 transition-all shrink-0 ml-3" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Tienda solicitante</span>
                <span className="text-foreground font-medium">
                  {isTienda
                    ? locations.find((l) => l.id === user?.locationId)?.name || "Mi tienda"
                    : locations.find((l) => l.id === (selectedLocationId ? Number(selectedLocationId) : ""))?.name || "Seleccionada"}
                </span>
              </div>
              <div className="p-3 rounded-xl border text-sm bg-red-500/10 border-red-500/30 text-red-400">
                Sin stock en esta tienda. Se solicitará al almacén.
              </div>

              <div>
                <span className="block text-xs text-gray-500 mb-1.5">Disponible en almacén</span>
                {requestAlmacenesLoading ? (
                  <div className="flex items-center gap-2 text-gray-400 text-sm">
                    <RefreshCw size={14} className="animate-spin text-primary-400" /> Consultando...
                  </div>
                ) : requestAlmacenes.length === 0 ? (
                  <div className="p-3 rounded-xl border border-dark-700/50 bg-dark-900/50 text-gray-400 text-sm">
                    Sin stock en el almacén
                  </div>
                ) : (
                  <div className="space-y-2">
                    {requestAlmacenes.map((a) => (
                      <div key={a.locationId} className="flex items-center justify-between p-2.5 rounded-xl bg-dark-900/50 border border-dark-700/50">
                        <span className="text-sm text-foreground">{a.locationName}</span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          a.stock === 0 ? "bg-red-500/10 text-red-400" : a.stock <= 5 ? "bg-yellow-500/10 text-yellow-400" : "bg-green-500/10 text-green-400"
                        }`}>
                          {a.stock} disp.
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <span className="block text-xs text-gray-500 mb-1.5">Cantidad</span>
                <div className="flex items-center justify-center gap-1.5">
                  <button onClick={() => setRequestQty(Math.max(1, requestQty - 1))} disabled={requestQty <= 1}
                    className="p-2.5 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground transition-all disabled:opacity-30">
                    <Minus size={16} />
                  </button>
                  <span className="w-16 text-center text-foreground text-xl font-bold">{requestQty}</span>
                  <button onClick={() => setRequestQty(requestQty + 1)}
                    className="p-2.5 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground transition-all">
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="req-nota-ventas" className="block text-xs text-gray-500 mb-1.5">Nota / Recordatorio (opcional)</label>
                <textarea id="req-nota-ventas" value={requestNote} onChange={(e) => setRequestNote(e.target.value)} rows={2}
                  placeholder="Observación para la solicitud..."
                  className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none placeholder-gray-600" />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-dark-700/50 flex gap-3">
              <button onClick={() => { setShowRequest(false); setRequestTarget(null); }}
                className="flex-1 bg-dark-700 hover:bg-dark-600 text-foreground py-2.5 rounded-xl text-sm font-medium transition-all">
                Cancelar
              </button>
              <button onClick={submitRequest} disabled={requestSaving}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                <Send size={16} /> {requestSaving ? "Enviando..." : "Enviar Solicitud"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ QUOTE DOCUMENT (oculto, capturado por html2canvas) ============ */}
      {showQuote && (
        <QuoteDocument
          id="sale-quote-doc"
          code={savedQuote?.code ?? null}
          date={new Date()}
          title={title}
          storeName={quoteStoreName}
          sellerName={quoteSeller}
          clientName={quoteClient}
          items={cart.map((c) => ({
            itemCode: c.itemCode,
            name: c.name,
            brand: c.brand,
            quantity: c.quantity,
            unitPrice: Number(c.unitPrice),
            priceTier: c.priceTier ?? null,
          }))}
          total={cartTotal}
        />
      )}

      {/* Ampliar venta departamental + registrar pagos */}
      {openSale && (
        <div ref={openSaleRef} role="dialog" aria-modal="true" aria-label={`Ampliar venta ${saleCode(openSale.id, openSale.saleDate)}`}
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl bg-dark-900 border border-dark-700/50 rounded-2xl shadow-2xl my-auto">
            <div className="flex items-start justify-between px-5 py-4 border-b border-dark-700/50">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Venta {saleCode(openSale.id, openSale.saleDate)}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {openSale.customer?.name || openSale.paraQuien || "Consumidor final"}
                  {openSale.lugarEntrega ? ` · Envia a: ${openSale.lugarEntrega}` : ""}
                </p>
              </div>
              <button onClick={() => setOpenSale(null)} aria-label="Cerrar"
                className="p-1 text-gray-400 hover:text-foreground rounded-lg hover:bg-dark-700 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 grid grid-cols-3 gap-3 border-b border-dark-700/50 text-center">
              <div>
                <p className="text-xs text-gray-500">Total</p>
                <p className="text-lg font-semibold text-foreground">{formatBs(openSale.total)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Pagado</p>
                <p className="text-lg font-semibold text-emerald-400">{formatBs(openSalePaid)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Saldo</p>
                <p className={`text-lg font-semibold ${openSaleBalance > 0.01 ? "text-amber-400" : "text-emerald-400"}`}>
                  {formatBs(openSaleBalance)}
                </p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Buscar productos a agregar */}
              <div>
                <label htmlFor="ampliar-buscar" className="block text-xs text-gray-500 mb-1.5">Agregar productos</label>
                <input id="ampliar-buscar" type="text" value={openSaleSearch}
                  onChange={(e) => { setOpenSaleSearch(e.target.value); searchForOpenSale(e.target.value); }}
                  placeholder="Buscar por código, nombre, marca o modelo..."
                  className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none placeholder-gray-600" />
                {openSaleSearching && <p className="text-xs text-gray-500 mt-1.5">Buscando...</p>}
                {!openSaleSearching && openSaleResults.length > 0 && (
                  <div className="mt-2 border border-dark-700/50 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {openSaleResults.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 border-b border-dark-700/30 last:border-0 hover:bg-dark-800/50">
                        <div className="min-w-0">
                          <p className="text-xs text-foreground truncate">{p.name}</p>
                          <p className="text-xs text-gray-500">{p.itemCode} · stock {p.stock}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => addToOpenSale(p, 1)} className="px-2 py-1 rounded-lg text-xs bg-primary-600/15 text-primary-400 hover:bg-primary-600/25 transition-colors">
                            P1 {formatBs(Number(p.price1))}
                          </button>
                          <button onClick={() => addToOpenSale(p, 2)} className="px-2 py-1 rounded-lg text-xs bg-dark-700/60 text-gray-300 hover:bg-dark-700 transition-colors">
                            P2 {formatBs(Number(p.price2))}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Productos por agregar */}
              {openSalePending.length > 0 && (
                <div className="border border-dark-700/50 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-dark-800/50 border-b border-dark-700/50">
                    <span className="text-xs font-medium text-gray-300">Por agregar a la venta</span>
                    <span className="text-xs text-gray-400">{formatBs(openSaleAdded)}</span>
                  </div>
                  {openSalePending.map((c) => (
                    <div key={`${c.productId}-${c.priceTier}`} className="flex items-center justify-between gap-2 px-3 py-2 border-b border-dark-700/30 last:border-0">
                      <div className="min-w-0">
                        <p className="text-xs text-foreground truncate">{c.name}</p>
                        <p className="text-xs text-gray-500">P{c.priceTier} · {formatBs(c.unitPrice)} c/u</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => bumpOpenSaleQty(c.productId, c.priceTier, -1)} aria-label="Quitar uno"
                          className="p-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                          <Minus size={13} />
                        </button>
                        <span className="text-xs text-foreground w-6 text-center">{c.quantity}</span>
                        <button onClick={() => bumpOpenSaleQty(c.productId, c.priceTier, 1)} aria-label="Agregar uno"
                          className="p-1 rounded-lg text-gray-400 hover:text-primary-400 hover:bg-primary-600/10 transition-colors">
                          <Plus size={13} />
                        </button>
                        <span className="text-xs text-gray-300 w-20 text-right">{formatBs(c.quantity * c.unitPrice)}</span>
                      </div>
                    </div>
                  ))}
                  <div className="px-3 py-2.5 bg-dark-800/30 flex justify-end">
                    <button onClick={submitOpenSaleItems} disabled={openSaleBusy}
                      className="px-4 py-2 rounded-xl text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white transition-all disabled:opacity-50">
                      {openSaleBusy ? "Guardando..." : `Agregar ${formatBs(openSaleAdded)} a la venta`}
                    </button>
                  </div>
                </div>
              )}

              {/* Registrar pago */}
              <div className="border-t border-dark-700/50 pt-4">
                <label htmlFor="ampliar-pago" className="block text-xs text-gray-500 mb-1.5">Registrar pago</label>
                {openSaleBalance <= 0.01 ? (
                  <p className="text-xs text-emerald-400">Esta venta esta pagada por completo.</p>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <select value={openSalePayMethod} onChange={(e) => setOpenSalePayMethod(e.target.value)}
                        className="px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="QR">QR</option>
                        <option value="TRANSFERENCIA">Transferencia</option>
                        <option value="CREDITO">Crédito</option>
                      </select>
                      <input id="ampliar-pago" type="number" min="0" step="0.01" value={openSalePayAmount}
                        onChange={(e) => setOpenSalePayAmount(e.target.value)}
                        placeholder={String(openSaleBalance.toFixed(2))}
                        className="flex-1 px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none placeholder-gray-600" />
                      <button onClick={submitOpenSalePayment} disabled={openSaleBusy}
                        className="px-4 py-2.5 rounded-xl text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white transition-all disabled:opacity-50 shrink-0">
                        Cobrar
                      </button>
                    </div>
                    {openSale.payments.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {openSale.payments.map((p) => (
                          <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-dark-900/50 border border-dark-700/30 rounded-full text-xs text-gray-400">
                            {pmLabel[p.method] || p.method} · {formatBs(p.amount)}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
