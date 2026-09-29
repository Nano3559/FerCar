import { useState, useEffect, useCallback } from "react";
import {
  Plus, Minus, Trash2, X, Search, FileText,
  Check, Upload, RefreshCw, FileSpreadsheet, ShoppingCart,
  Filter, ChevronLeft, ChevronRight, Wallet, Clock,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../services/api";
import { useAuthStore } from "../stores/authStore";
import Autocomplete from "../components/ui/Autocomplete";
import { useDialogBehavior } from "../components/ui/useDialog";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import { saleCode } from "../utils/documentCodes";

interface WholesaleItem {
  productId: number; itemCode: string; name: string; brand: string;
  model: string; year: string; detail: string | null; quantity: number;
  unitPrice: number; subtotal: number; factoryCode: string | null;
  price1: number; price2: number;
}

interface WholesaleSale {
  id: number; saleDate: string; total: number; type: string;
  paraQuien?: string | null; lugarEntrega?: string | null; datosFactura?: string | null; formaPago?: string | null;
  nitName?: string | null; status?: string | null;
  customer: { name: string; nit: string | null } | null;
  location: { name: string } | null;
  user: { name: string } | null;
  payments: { method: string; amount: number }[];
  items: { productId: number; quantity: number; unitPrice: number; subtotal: number; product: { id: number; name: string; itemCode: string; brand: string; model: string } }[];
}

const PAGO_METHODS = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "QR", label: "QR" },
  { value: "CREDITO", label: "Crédito" },
];

const pagoLabel = (m: string) => PAGO_METHODS.find((x) => x.value === m)?.label || m;

interface ProductResult {
  id: number; itemCode: string; manufacturer: string; name: string;
  brand: string; model: string; year: string; detail: string | null;
  detalles: string | null; oemCode: string | null; factoryCode: string | null;
  wholesalePrice: number | null; stock: number; category: string | null;
  price1?: number; price2?: number;
}

interface ProductFilters {
  brands: string[]; manufacturers: string[]; models: string[]; years: string[];
  categories: { id: number; name: string }[]; names: string[]; itemCodes: string[];
  oemCodes: string[]; factoryCodes: string[]; detalles: string[];
}

interface LocationLite {
  id: number; name: string; type: string;
}

const PAGE_SIZE = 10;

export default function WholesalePage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";
  const isTienda = user?.role === "TIENDA";

  const [locations, setLocations] = useState<LocationLite[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<number | "">("");

  useEffect(() => {
    api.get("/locations").then((r) => {
      const list = Array.isArray(r.data) ? r.data : r.data.locations || [];
      setLocations(list);
      if (isAdmin) {
        const tumusla = list.find((l: LocationLite) => l.type === "TIENDA" && l.name.toUpperCase().includes("TUMUSLA"));
        setSelectedStoreId(tumusla?.id ?? list.find((l: LocationLite) => l.type === "TIENDA")?.id ?? "");
      } else {
        setSelectedStoreId(user?.locationId ?? "");
      }
    }).catch(() => {});
  }, [isAdmin, user?.locationId]);
  const [sales, setSales] = useState<WholesaleSale[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"venta" | "carrito" | "historial">("venta");
  const [showConfirm, setShowConfirm] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastWholesaleSale, setLastWholesaleSale] = useState<{ id: number; saleDate: string; total: number; items: WholesaleItem[]; clientName: string; paraDonde: string; nit: string; nitName: string; payments: { method: string; amount: number }[]; status: string } | null>(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const confirmPanelRef = useDialogBehavior(showConfirm, () => setShowConfirm(false));
  const receiptPanelRef = useDialogBehavior(showReceipt && lastWholesaleSale !== null, () => setShowReceipt(false));
  const importPanelRef = useDialogBehavior(showImportModal, () => { setShowImportModal(false); setImportResult(null); });

  const [items, setItems] = useState<WholesaleItem[]>([]);
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
  const [searchResults, setSearchResults] = useState<ProductResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [searchPages, setSearchPages] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0);

  const [clientName, setClientName] = useState("");
  const [paraDonde, setParaDonde] = useState("");
  const [nit, setNit] = useState("");
  const [nitName, setNitName] = useState("");
  const [payments, setPayments] = useState<{ method: string; amount: number }[]>([{ method: "EFECTIVO", amount: 0 }]);

  const [payModalSale, setPayModalSale] = useState<WholesaleSale | null>(null);
  const [payMethod, setPayMethod] = useState("EFECTIVO");
  const [payAmount, setPayAmount] = useState<number>(0);
  const [paying, setPaying] = useState(false);
  const payModalRef = useDialogBehavior(payModalSale !== null, () => { setPayModalSale(null); setPayAmount(0); });

  const formatBs = (v: number) =>
    `Bs. ${v.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const total = items.reduce((sum, i) => sum + i.subtotal, 0);

  const validPayments = payments.filter((p) => Number(p.amount) > 0);
  const paidAmount = validPayments.filter((p) => p.method !== "CREDITO").reduce((s, p) => s + Number(p.amount), 0);
  const balance = Math.max(total - paidAmount, 0);
  const resultingStatus = validPayments.some((p) => p.method === "CREDITO") || paidAmount < total ? "PENDIENTE" : "PAGADO";

  const payModalPaid = payModalSale
    ? payModalSale.payments.filter((p) => p.method !== "CREDITO").reduce((s, p) => s + Number(p.amount), 0)
    : 0;
  const payModalBalance = payModalSale ? Math.max(Number(payModalSale.total) - payModalPaid, 0) : 0;

  const fetchSales = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/wholesale?limit=50");
      setSales(res.data.sales);
    } catch {
      toast.error("Error al cargar ventas mayoristas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  useEffect(() => {
    api.get("/products/filters").then((r) => setFilters(r.data)).catch(() => {});
  }, []);

  // Búsqueda con debounce (mismo patrón que Ventas Locales): filtros por código,
  // nombre, fabricante, categoría, marca, modelo, año, detalles, OEM y código de
  // fábrica. Muestra todos los productos, tengan o no stock (includeZeroStock).
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
      if (selectedStoreId) params.set("locationId", String(selectedStoreId));
      params.set("includeZeroStock", "true");
      params.set("page", String(searchPage));
      params.set("limit", String(PAGE_SIZE));
      api.get(`/products?${params.toString()}`, { signal: controller.signal })
        .then((res) => {
          setSearchResults((res.data.products || []).map((p: any) => ({
            id: p.id, itemCode: p.itemCode, manufacturer: p.manufacturer, name: p.name,
            brand: p.brand, model: p.model, year: p.year, detail: p.detail,
            detalles: p.detalles, oemCode: p.oemCode || null, factoryCode: p.factoryCode || null,
            wholesalePrice: p.wholesalePrice ? Number(p.wholesalePrice) : null,
            stock: Number(p.stock) || 0, category: p.category || null,
          })));
          setSearchTotal(res.data.pagination?.total || 0);
          setSearchPages(res.data.pagination?.pages || 1);
        })
        .catch((err) => { if (err.code !== "ERR_CANCELED") toast.error("Error al buscar productos"); })
        .finally(() => setSearching(false));
    }, 300);
    setSearching(true);
    return () => { controller.abort(); clearTimeout(t); };
  }, [search, nameFilter, itemCodeFilter, brand, manufacturer, model, year, categoryId, oemCode, factoryCode, detailFilter, selectedStoreId, searchPage]);

  useEffect(() => { setSearchPage(1); }, [search, nameFilter, itemCodeFilter, brand, manufacturer, model, year, categoryId, oemCode, factoryCode, detailFilter, selectedStoreId]);

  const clearSearchFilters = () => {
    setNameFilter(""); setItemCodeFilter(""); setManufacturer(""); setBrand(""); setModel(""); setYear("");
    setCategoryName(""); setCategoryId(""); setOemCode(""); setFactoryCode(""); setDetailFilter("");
    setShowFilters(false);
  };

  const hasActiveSearchFilters = !!(nameFilter || itemCodeFilter || manufacturer || brand || model || year || categoryId || oemCode || factoryCode || detailFilter);

  const addItem = (p: ProductResult) => {
    if (items.find((i) => i.productId === p.id)) { toast.error("Producto ya agregado"); return; }
    const price = p.wholesalePrice ?? 0;
    setItems((prev) => [...prev, {
      productId: p.id, itemCode: p.itemCode, name: p.name, brand: p.brand,
      model: p.model, year: p.year, detail: p.detail,
      quantity: 1, unitPrice: price, subtotal: price, factoryCode: p.factoryCode,
      price1: Number(p.price1) || 0, price2: Number(p.price2) || 0,
    }]);
  };

  const updateQuantity = (productId: number, qty: number) => {
    if (qty < 1) return;
    setItems((prev) => prev.map((i) => i.productId === productId ? { ...i, quantity: qty, subtotal: qty * i.unitPrice } : i));
  };

  const updatePrice = (productId: number, price: number) => {
    setItems((prev) => prev.map((i) => i.productId === productId ? { ...i, unitPrice: price, subtotal: i.quantity * price } : i));
  };

  const removeItem = (productId: number) => setItems((prev) => prev.filter((i) => i.productId !== productId));

  const openConfirm = () => {
    if (!items.length) { toast.error("Agrega al menos un producto"); return; }
    if (!clientName.trim()) { toast.error("Ingresa a quién se realiza la venta (A QUIEN)"); return; }
    if (validPayments.length === 0) { toast.error("Registra al menos un pago (QR, Efectivo o Crédito)"); return; }
    setShowConfirm(true);
  };

  const updatePayment = (index: number, patch: Partial<{ method: string; amount: number }>) => {
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };
  const addPaymentRow = () => setPayments((prev) => [...prev, { method: "EFECTIVO", amount: 0 }]);
  const removePaymentRow = (index: number) => setPayments((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const confirmSale = async () => {
    try {
      if (validPayments.reduce((s, p) => s + Number(p.amount), 0) - total > 0.01) {
        toast.error("Los pagos superan el total de la venta");
        return;
      }
      const payload: any = {
        customerData: { name: clientName, nit: nit || null },
        paraQuien: clientName,
        lugarEntrega: paraDonde || null,
        datosFactura: nit || null,
        nitName: nitName || null,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        payments: validPayments.map((p) => ({ method: p.method, amount: Number(p.amount) })),
      };
      if (selectedStoreId) payload.locationId = selectedStoreId;
      const response = await api.post("/wholesale", payload);
      setLastWholesaleSale({ id: response.data.id, saleDate: response.data.createdAt || new Date().toISOString(), total: Number(response.data.total) || total, items: [...items], clientName, paraDonde, nit, nitName, payments: [...validPayments], status: resultingStatus });
      // La venta se registra aunque la tienda no tenga: lo que falto se pidio
      // solo. Se avisa que quedo pendiente para que no parezca que salio todo.
      const faltantes: { nombre: string; cantidad: number }[] = response.data.faltantes || [];
      if (faltantes.length > 0) {
        const detalle = faltantes.map((f) => `${f.cantidad} ud de ${f.nombre}`).join(", ");
        toast(`Venta registrada, pero se pidio al almacen lo que no habia: ${detalle}`, { icon: "⚠️", duration: 8000 });
      } else {
        toast.success("Venta por mayor registrada");
      }
      setShowConfirm(false);
      setShowReceipt(true);
      resetForm();
      setActiveTab("venta");
      fetchSales();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al registrar venta");
    }
  };

  const resetForm = () => {
    setItems([]); setClientName(""); setParaDonde(""); setNit(""); setNitName("");
    setPayments([{ method: "EFECTIVO", amount: 0 }]);
  };

  const registerPayment = async () => {
    if (!payModalSale) return;
    if (!payAmount || payAmount <= 0) { toast.error("Indica el monto del pago"); return; }
    try {
      setPaying(true);
      await api.post(`/wholesale/${payModalSale.id}/payments`, { method: payMethod, amount: payAmount });
      toast.success("Pago registrado");
      setPayModalSale(null);
      setPayAmount(0);
      fetchSales();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al registrar el pago");
    } finally {
      setPaying(false);
    }
  };

  const useImportedItems = () => {
    const importedItems: WholesaleItem[] = (importResult?.items || []).map((it: any) => ({
      productId: it.productId, itemCode: it.itemCode, name: it.name, brand: it.brand,
      model: it.model, year: it.year, detail: it.detail,
      quantity: it.quantity, unitPrice: Number(it.unitPrice), subtotal: Number(it.subtotal),
      factoryCode: it.factoryCode || null,
      price1: Number(it.price1) || 0, price2: Number(it.price2) || 0,
    }));
    if (!importedItems.length) return;
    setItems((prev) => {
      const map = new Map(prev.map((i) => [i.productId, i]));
      for (const it of importedItems) {
        const found = map.get(it.productId);
        if (found) {
          found.quantity += it.quantity;
          found.subtotal = found.quantity * found.unitPrice;
        } else {
          map.set(it.productId, it);
        }
      }
      return Array.from(map.values());
    });
    setShowImportModal(false);
    setImportResult(null);
    setImportFile(null);
    setActiveTab("carrito");
  };

  // Plantilla con el formato de "EJEMPLO VENTA X MAYOR": solo CODIGO FABRICA
  // y CANTIDAD. Se puede escribir con tildes o sin ellas, en mayusculas o no.
  const downloadPlantilla = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["CODIGO FABRICA", "CANTIDAD"],
      ["212-2610N", 10],
      ["AM07012HCR", 2],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedido");
    XLSX.writeFile(wb, "EJEMPLO VENTA X MAYOR.xlsx");
  };

  const handleImportExcel = async () => {
    if (!importFile) return;
    try {
      setImporting(true);
      setImportResult(null);
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await api.post("/wholesale/import-order", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(res.data);
      if (res.data.items?.length) {
        toast.success(`${res.data.items.length} productos leídos del pedido`);
      } else {
        toast.error("No se pudo leer ningún producto del archivo");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al importar archivo");
    } finally {
      setImporting(false);
    }
  };

  const printNota = (sale: WholesaleSale) => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>Nota de Venta #${sale.id}</title>
      <style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f0f0f0}h1{font-size:18px}.total{font-size:16px;font-weight:bold;text-align:right;margin-top:10px}</style></head><body>
      <h1>Shibumi - Nota de Venta Mayorista</h1>
      <p><b>Fecha:</b> ${new Date(sale.saleDate).toLocaleDateString("es-BO")} | <b>ID:</b> ${saleCode(sale.id, sale.saleDate)}</p>
       <p><b>Cliente:</b> ${sale.customer?.name || sale.paraQuien || "N/A"} | <b>Lugar:</b> ${sale.lugarEntrega || sale.location?.name || "N/A"}</p>
       ${sale.paraQuien ? `<p><b>A quién:</b> ${sale.paraQuien}</p>` : ""}
       ${sale.nitName ? `<p><b>Nombre del NIT:</b> ${sale.nitName}</p>` : ""}
       ${sale.datosFactura ? `<p><b>NIT:</b> ${sale.datosFactura}</p>` : ""}
       <p><b>Estado:</b> ${sale.status || "PENDIENTE"} | <b>Vendedor:</b> ${sale.user?.name || "N/A"}</p>
      <table><thead><tr><th>Código</th><th>Producto</th><th>Marca</th><th>Modelo</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>
      ${sale.items.map((i) => `<tr><td>${i.product.itemCode}</td><td>${i.product.name}</td><td>${i.product.brand}</td><td>${i.product.model}</td><td>${i.quantity}</td><td>${formatBs(Number(i.unitPrice))}</td><td>${formatBs(Number(i.subtotal))}</td></tr>`).join("")}
      </tbody></table>
      <p class="total">TOTAL: ${formatBs(Number(sale.total))}</p>
      <p><b>Pagos:</b> ${sale.payments.map((p) => `${p.method}: ${formatBs(Number(p.amount))}`).join(", ")}</p>
      </body></html>`);
    win.document.close(); win.print();
  };

  const salePaid = (s: WholesaleSale) =>
    s.payments.filter((p) => p.method !== "CREDITO").reduce((a, p) => a + Number(p.amount), 0);

  const formatDate = (d: string) => new Date(d).toLocaleDateString("es-BO", { day: "2-digit", month: "short", year: "numeric" });

  const downloadPDF = async () => {
    const modalId = showReceipt ? "wholesale-receipt-modal" : "wholesale-confirm-modal";
    const el = document.getElementById(modalId);
    if (!el) return;
    toast.loading("Generando PDF...", { id: "wpdf" });
    try {
      // El modal del comprobante tiene alto maximo y scroll. html2canvas solo
      // captura lo que se ve, asi que con muchos productos dejaba un bloque
      // negro del alto del fondo donde deberian salir los de abajo. En la copia
      // que se captura se quitan el alto maximo y el scroll para que entre
      // todo el contenido.
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: "#151a22",
        windowHeight: el.scrollHeight,
        onclone: (doc) => {
          const c = doc.getElementById(modalId);
          if (c) {
            c.style.maxHeight = "none";
            c.style.overflow = "visible";
          }
        },
      });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      // Un comprobante con muchos productos no se estira en una sola hoja:
      // se va cortando en varias.
      pdf.addImage(img, "PNG", 0, 0, pageWidth, imgHeight);
      let heightLeft = imgHeight - pageHeight;
      while (heightLeft > 0) {
        pdf.addPage();
        pdf.addImage(img, "PNG", 0, heightLeft - imgHeight, pageWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`venta-mayorista-${lastWholesaleSale?.id || "cotizacion"}.pdf`);
      toast.success("PDF descargado", { id: "wpdf" });
    } catch {
      toast.error("Error al generar PDF", { id: "wpdf" });
    }
  };

  // Exportar la lista actual a Excel (para confirmación del cliente)
  const exportExcel = async () => {
    if (items.length === 0) { toast.error("Agrega productos para exportar"); return; }
    toast.loading("Generando Excel...", { id: "wx" });
    try {
      const res = await api.post("/wholesale/export-excel",
        {
          clientName,
          items: items.map((i) => ({
            factoryCode: i.factoryCode || null,
            itemCode: i.itemCode,
            name: i.name,
            brand: i.brand,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            subtotal: i.subtotal,
          })),
        },
        { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `pedido-mayorista-${clientName.trim() ? clientName.trim().replace(/\s+/g, "_") : "cliente"}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Excel descargado", { id: "wx" });
    } catch {
      toast.error("Error al exportar el Excel", { id: "wx" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ventas por Mayor</h1>
          <p className="text-gray-400 text-sm mt-1">
            {activeTab === "historial"
              ? `${sales.length} ventas registradas (últimos 15 días)`
              : activeTab === "carrito"
                ? `${items.reduce((s, i) => s + i.quantity, 0)} unidad(es) en carrito`
                : `${searchTotal > 0 ? searchTotal + " productos encontrados" : "Busca productos y agrégalos al carrito"}`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setShowImportModal(true); setImportFile(null); setImportResult(null); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary-600/20">
            <Upload size={16} /> Importar Excel
          </button>
          <button onClick={() => { resetForm(); setActiveTab("venta"); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary-600/20">
            <Plus size={16} /> Nueva Venta Mayor
          </button>
        </div>
      </div>

      {/* Tabs (misma lógica que Ventas Locales) */}
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
          {items.length > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-primary-600 text-white">{items.length}</span>
          )}
        </button>
        <button onClick={() => { setActiveTab("historial"); if (activeTab !== "historial") fetchSales(); }}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "historial" ? "bg-primary-600/15 text-primary-400" : "text-gray-400 hover:text-foreground"
          }`}>
          <Clock size={15} /> Historial
        </button>
      </div>

      {/* Historial */}
      {activeTab === "historial" && (
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-700/50 flex items-center justify-between">
            <h3 className="text-foreground font-medium">Historial de Ventas Mayoristas <span className="text-xs text-gray-500 font-normal">(últimos 15 días)</span></h3>
            <button onClick={fetchSales} className="p-1.5 text-gray-400 hover:text-foreground rounded-lg transition-all">
              <RefreshCw size={14} />
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-32"><RefreshCw size={24} className="text-primary-400 animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700/50">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Código</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Fecha</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Cliente</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Para dónde</th>
                    <th className="text-center px-4 py-3 text-gray-400 font-medium">Estado</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Pagado</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Total</th>
                    <th className="text-center px-4 py-3 text-gray-400 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No hay ventas mayoristas en los últimos 15 días</td></tr>
                  ) : sales.map((s) => {
                    const paid = salePaid(s);
                    return (
                    <tr key={s.id} className="border-b border-dark-700/30 hover:bg-dark-700/30 transition-colors">
                      <td className="px-4 py-3 text-amber-400/90 font-mono text-xs whitespace-nowrap">{saleCode(s.id, s.saleDate)}</td>
                      <td className="px-4 py-3 text-gray-300">{formatDate(s.saleDate)}</td>
                      <td className="px-4 py-3 text-foreground font-medium">{s.customer?.name || s.paraQuien || "N/A"}</td>
                      <td className="px-4 py-3 text-gray-300">{s.lugarEntrega || s.location?.name || "N/A"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${s.status === "PAGADO" ? "bg-emerald-500/10 text-emerald-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                          {s.status || "PENDIENTE"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-right">
                        {formatBs(paid)}
                        {s.status !== "PAGADO" && (
                          <span className="block text-xs text-yellow-400">Saldo {formatBs(Math.max(Number(s.total) - paid, 0))}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-emerald-400 font-medium text-right">{formatBs(Number(s.total))}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {s.status !== "PAGADO" && (
                            <button onClick={() => { setPayModalSale(s); setPayAmount(Math.max(Number(s.total) - paid, 0)); setPayMethod("EFECTIVO"); }}
                              className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all" title="Registrar pago">
                              <Wallet size={14} />
                            </button>
                          )}
                          <button onClick={() => printNota(s)} className="p-1.5 text-gray-400 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg transition-all" title="Imprimir nota">
                            <FileText size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============ TAB: PRODUCTOS (búsqueda) ============ */}
      {activeTab === "venta" && (
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-700/50">
            <h3 className="text-foreground font-medium">Buscar Productos</h3>
          </div>

          <div className="p-4 space-y-4">
            {isAdmin && (
              <div>
                <label htmlFor="wholesale-store" className="block text-xs text-gray-400 mb-1">Tienda *</label>
                <select id="wholesale-store" value={selectedStoreId} onChange={(e) => setSelectedStoreId(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500">
                  <option value="">Seleccionar tienda</option>
                  {locations.filter((l) => l.type === "TIENDA").map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            )}
            {!isAdmin && isTienda && selectedStoreId && (
              <div className="text-xs text-gray-400">
                Tienda: <strong className="text-foreground">{locations.find((l) => l.id === selectedStoreId)?.name || "Mi tienda"}</strong>
              </div>
            )}

            {/* Búsqueda y filtros (igual que Ventas Locales) */}
            <div className="bg-dark-900/30 border border-dark-700/50 rounded-2xl p-4">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar producto por código, nombre, marca, modelo, OEM..."
                    aria-label="Buscar producto"
                    className="w-full pl-10 pr-4 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm" />
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

              {/* Resultados: muestra solo el Precio Mayor */}
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
                  <div className="hidden md:block overflow-x-auto mt-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-500 border-b border-dark-700/50">
                          <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Fabricante</th>
                          <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Producto</th>
                          <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Marca</th>
                          <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Modelo</th>
                          <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Año</th>
                          <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Detalles</th>
                          <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Cód. OEM</th>
                          <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Cód. Fábrica</th>
                          <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">Precio Mayor</th>
                          <th className="text-center px-3 py-2.5 font-medium whitespace-nowrap">Stock</th>
                          <th className="text-center px-3 py-2.5 font-medium whitespace-nowrap">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {searchResults.map((p) => (
                          <tr key={p.id} className="border-b border-dark-700/30 last:border-0 hover:bg-dark-900/30">
                            <td className="px-3 py-2 text-gray-300">{p.manufacturer}</td>
                            <td className="px-3 py-2 text-foreground font-medium max-w-[200px] truncate">{p.name}</td>
                            <td className="px-3 py-2 text-gray-300">{p.brand}</td>
                            <td className="px-3 py-2 text-gray-300">{p.model}</td>
                            <td className="px-3 py-2 text-gray-400">{p.year}</td>
                            <td className="px-3 py-2 text-gray-400 text-xs">{p.detalles || p.detail || "—"}</td>
                            <td className="px-3 py-2 text-gray-400 text-xs">{p.oemCode || "—"}</td>
                            <td className="px-3 py-2 text-gray-400 text-xs">{p.factoryCode || "—"}</td>
                            <td className="px-3 py-2 text-right text-emerald-400 font-medium whitespace-nowrap">{p.wholesalePrice ? formatBs(p.wholesalePrice) : "—"}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${p.stock === 0 ? "bg-red-500/10 text-red-400" : p.stock <= 5 ? "bg-yellow-500/10 text-yellow-400" : "bg-green-500/10 text-green-400"}`}>{p.stock}</span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => addItem(p)}
                                title="Agregar al pedido"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary-600/10 border border-primary-600/25 text-primary-400 hover:bg-primary-600 hover:text-white transition-all text-xs font-medium">
                                <ShoppingCart size={14} /> Agregar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="md:hidden mt-4 space-y-1.5">
                    {searchResults.map((p) => (
                      <div key={p.id} className="w-full flex items-center justify-between px-4 py-3 bg-dark-900/50 border border-dark-700/30 rounded-xl">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground font-medium truncate">{p.name}</p>
                          <p className="text-xs text-gray-500 truncate">{p.manufacturer} · {p.brand} · {p.model} · {p.itemCode}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-medium text-emerald-400">{p.wholesalePrice ? formatBs(p.wholesalePrice) : "—"}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.stock === 0 ? "bg-red-500/10 text-red-400" : p.stock <= 5 ? "bg-yellow-500/10 text-yellow-400" : "bg-green-500/10 text-green-400"}`}>Stock: {p.stock}</span>
                          </div>
                        </div>
                        <button onClick={() => addItem(p)} title="Agregar al pedido"
                          className="p-2 rounded-lg bg-primary-600/10 border border-primary-600/20 text-primary-400 hover:bg-primary-600 hover:text-white transition-all ml-2 shrink-0">
                          <ShoppingCart size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

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
          </div>
        </div>
      )}

      {/* ============ TAB: CARRITO ============ */}
      {activeTab === "carrito" && (
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-700/50 flex items-center justify-between">
            <h3 className="text-foreground font-medium">Carrito</h3>
            {items.length > 0 && (
              <button onClick={() => { setItems([]); setPayments([{ method: "EFECTIVO", amount: 0 }]); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                <Trash2 size={14} /> Vaciar
              </button>
            )}
          </div>
          <div className="p-4 space-y-4">
            {items.length === 0 ? (
              <div className="py-12 text-center">
                <ShoppingCart size={40} className="text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">El carrito está vacío</p>
                <button onClick={() => setActiveTab("venta")}
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all">
                  <Search size={15} /> Buscar productos
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Productos del carrito */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dark-700/50">
                        <th className="text-left px-3 py-2 text-gray-400 font-medium">Código</th>
                        <th className="text-left px-3 py-2 text-gray-400 font-medium">Producto</th>
                        <th className="text-left px-3 py-2 text-gray-400 font-medium">Marca</th>
                        <th className="text-left px-3 py-2 text-gray-400 font-medium">Modelo</th>
                        <th className="text-center px-3 py-2 text-gray-400 font-medium">Cant.</th>
                        <th className="text-right px-3 py-2 text-gray-400 font-medium">P. Unit.</th>
                        <th className="text-right px-3 py-2 text-gray-400 font-medium">Subtotal</th>
                        <th className="text-center px-3 py-2 text-gray-400 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.productId} className="border-b border-dark-700/30 hover:bg-dark-700/30 transition-colors">
                          <td className="px-3 py-2 text-gray-300 font-mono text-xs">{item.itemCode}</td>
                          <td className="px-3 py-2 text-foreground font-medium">{item.name}</td>
                          <td className="px-3 py-2 text-gray-300">{item.brand}</td>
                          <td className="px-3 py-2 text-gray-300">{item.model}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                                className="p-1 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded transition-all"><Minus size={12} /></button>
                              <span className="w-8 text-center text-foreground text-sm">{item.quantity}</span>
                              <button onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                                className="p-1 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded transition-all"><Plus size={12} /></button>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <input type="number" value={item.unitPrice} onChange={(e) => updatePrice(item.productId, Number(e.target.value))}
                                className="w-20 px-2 py-1 bg-dark-800 border border-dark-700 rounded-lg text-foreground text-xs text-right focus:outline-none focus:border-primary-500" />
                              {item.price1 > 0 && item.price2 > 0 && item.price1 !== item.price2 && (
                                <div className="inline-flex rounded-md border border-dark-700 overflow-hidden" role="group" aria-label={`Precio de ${item.name}`}>
                                  <button onClick={() => updatePrice(item.productId, item.price1)} title={`Precio 1: ${formatBs(item.price1)}`}
                                    className={`px-1.5 py-0.5 text-[10px] font-semibold transition-all ${
                                      item.unitPrice === item.price1 ? "bg-green-600/20 text-green-400" : "text-gray-500 hover:text-green-400"
                                    }`}>
                                    P1
                                  </button>
                                  <button onClick={() => updatePrice(item.productId, item.price2)} title={`Precio 2: ${formatBs(item.price2)}`}
                                    className={`px-1.5 py-0.5 text-[10px] font-semibold border-l border-dark-700 transition-all ${
                                      item.unitPrice === item.price2 ? "bg-blue-600/20 text-blue-400" : "text-gray-500 hover:text-blue-400"
                                    }`}>
                                    P2
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-emerald-400 font-medium text-right">{formatBs(item.subtotal)}</td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => removeItem(item.productId)}
                              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Datos del cliente */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">A QUIEN *</label>
                    <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Nombre del cliente"
                      className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">PARA DONDE</label>
                    <input value={paraDonde} onChange={(e) => setParaDonde(e.target.value)} placeholder="Ciudad o dirección de entrega"
                      className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                  </div>
                  <div>
                    <label htmlFor="wholesale-nit" className="block text-xs text-gray-400 mb-1">NIT</label>
                    <input id="wholesale-nit" value={nit} onChange={(e) => setNit(e.target.value)} placeholder="Número de NIT"
                      className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                  </div>
                  <div>
                    <label htmlFor="wholesale-nitname" className="block text-xs text-gray-400 mb-1">NOMBRE DEL NIT</label>
                    <input id="wholesale-nitname" value={nitName} onChange={(e) => setNitName(e.target.value)} placeholder="Razón social del NIT"
                      className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                  </div>
                </div>

                {/* Pagos */}
                <div className="border-t border-dark-700/50 pt-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                    <span className="text-sm font-medium text-foreground">Pagos</span>
                    <span className="text-xs text-gray-500">QR · Efectivo · Crédito · puede ser más de un pago</span>
                  </div>
                  <div className="space-y-2">
                    {payments.map((p, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <select value={p.method} onChange={(e) => updatePayment(i, { method: e.target.value })}
                          aria-label={`Método de pago ${i + 1}`}
                          className="w-36 px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500">
                          {PAGO_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                        <input type="number" min={0} value={p.amount === 0 ? "" : p.amount} onChange={(e) => updatePayment(i, { amount: Number(e.target.value) || 0 })}
                          placeholder="Monto"
                          aria-label={`Monto del pago ${i + 1}`}
                          className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                        {payments.length > 1 && (
                          <button onClick={() => removePaymentRow(i)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" aria-label="Quitar pago">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button onClick={addPaymentRow} className="mt-2 text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1 transition-colors">
                    <Plus size={14} /> Agregar otro pago
                  </button>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <span className="text-gray-400">Total: <strong className="text-foreground">{formatBs(total)}</strong></span>
                    <span className="text-gray-400">Pagado: <strong className={paidAmount >= total ? "text-emerald-400" : "text-gray-300"}>{formatBs(balance === 0 ? total : paidAmount)}</strong></span>
                    <span className="text-gray-400">Saldo: <strong className={balance > 0 ? "text-yellow-400" : "text-emerald-400"}>{formatBs(balance)}</strong></span>
                    <span className="text-xs self-center text-gray-500">{resultingStatus === "PENDIENTE" ? "La venta quedará PENDIENTE" : "La venta quedará PAGADA"}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-dark-700/50">
                  <span className="text-lg font-bold text-foreground">Total: <span className="text-emerald-400">{formatBs(total)}</span></span>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <button onClick={exportExcel} disabled={items.length === 0}
                      className="flex items-center gap-2 px-4 py-2.5 bg-dark-700 hover:bg-dark-600 text-gray-200 rounded-xl text-sm font-medium transition-all border border-dark-600 disabled:opacity-50 disabled:cursor-not-allowed">
                      <FileSpreadsheet size={16} /> Exportar Excel
                    </button>
                    <button onClick={openConfirm}
                      className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary-600/20">
                      <Check size={16} /> Confirmar Venta
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div ref={confirmPanelRef} id="wholesale-confirm-modal" role="dialog" aria-modal="true" aria-label="Confirmar venta mayorista" className="bg-dark-900 border border-dark-700/50 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/50">
              <h3 className="text-lg font-bold text-foreground">Confirmar Venta Mayorista</h3>
              <button onClick={() => setShowConfirm(false)} aria-label="Cerrar" className="p-1.5 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-lg transition-all">
                <X size={18} />
              </button>
            </div>
              <div className="p-6 space-y-3">
                <div className="flex justify-between text-sm"><span className="text-gray-400">A quién:</span><span className="text-foreground">{clientName}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-400">Para dónde:</span><span className="text-foreground">{paraDonde || "No especificado"}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-400">NIT:</span><span className="text-foreground">{nit || "No especificado"}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-400">Nombre del NIT:</span><span className="text-foreground">{nitName || "No especificado"}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-400">Productos:</span><span className="text-foreground">{items.length}</span></div>
                <div className="border-t border-dark-700/50 pt-3">
                  <p className="text-xs text-gray-400 font-medium mb-1.5">Pagos</p>
                  {validPayments.length === 0 && <p className="text-xs text-red-400">Registra al menos un pago</p>}
                  <div className="space-y-1">
                    {validPayments.map((p, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-gray-300">{pagoLabel(p.method)}</span>
                        <span className="text-gray-400">{formatBs(Number(p.amount))}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-2 mt-1 border-t border-dark-700/40">
                    <span className="text-sm text-gray-400">Estado de la venta:</span>
                    <span className={`text-sm font-semibold ${resultingStatus === "PAGADO" ? "text-emerald-400" : "text-yellow-400"}`}>
                      {resultingStatus === "PAGADO" ? "PAGADO" : "PENDIENTE"}
                    </span>
                  </div>
                </div>
                <div className="border-t border-dark-700/50 pt-3 space-y-1">
                  {items.map((item) => (
                    <div key={item.productId} className="flex justify-between gap-3 text-xs">
                      <span className="text-gray-300 truncate">{item.name} x{item.quantity}</span>
                      <span className="text-gray-400 shrink-0">{formatBs(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
              <div className="border-t border-dark-700/50 pt-3 flex justify-between">
                <span className="text-foreground font-medium">Total:</span>
                <span className="text-emerald-400 text-lg font-bold">{formatBs(total)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-700/50">
              <button onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl text-sm transition-all">
                Cancelar
              </button>
              <button onClick={downloadPDF}
                className="px-4 py-2 flex items-center gap-2 bg-dark-700 hover:bg-dark-600 text-gray-200 rounded-xl text-sm transition-all">
                <FileText size={14} /> PDF
              </button>
              <button onClick={confirmSale}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary-600/20">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {showReceipt && lastWholesaleSale && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div ref={receiptPanelRef} id="wholesale-receipt-modal" role="dialog" aria-modal="true" aria-label="Venta mayorista registrada" className="bg-dark-900 border border-dark-700/50 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-6 py-5 border-b border-dark-700/50 text-center">
              <h3 className="text-lg font-bold text-foreground">Venta mayorista registrada</h3>
              <p className="text-xs text-gray-500 mt-1">Shibumi · Venta #{lastWholesaleSale.id}</p>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 text-gray-300">
                <span>Cliente: <strong className="text-foreground">{lastWholesaleSale.clientName || "Registrado"}</strong></span>
                <span>Fecha: <strong className="text-foreground">{formatDate(lastWholesaleSale.saleDate)}</strong></span>
                <span>Para dónde: <strong className="text-foreground">{lastWholesaleSale.paraDonde || "No especificado"}</strong></span>
                <span>NIT: <strong className="text-foreground">{lastWholesaleSale.nit || "No especificado"}</strong></span>
                <span>Nombre del NIT: <strong className="text-foreground">{lastWholesaleSale.nitName || "No especificado"}</strong></span>
                <span>Estado: <strong className={`${lastWholesaleSale.status === "PAGADO" ? "text-emerald-400" : "text-yellow-400"}`}>{lastWholesaleSale.status || "PENDIENTE"}</strong></span>
              </div>
              <div className="border-t border-dark-700/50 pt-3 space-y-2">
                {lastWholesaleSale.items.map((item) => (
                  <div key={item.productId} className="flex justify-between gap-3">
                    <span className="text-gray-300">{item.name} x{item.quantity}</span>
                    <span className="text-emerald-400">{formatBs(item.subtotal)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-dark-700/50 pt-3 space-y-1">
                {lastWholesaleSale.payments.map((p, i) => (
                  <div key={i} className="flex justify-between gap-3 text-xs">
                    <span className="text-gray-300">{pagoLabel(p.method)}</span>
                    <span className="text-gray-400">{formatBs(Number(p.amount))}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-dark-700/50 pt-3 flex justify-between text-lg font-bold">
                <span className="text-foreground">Total</span><span className="text-emerald-400">{formatBs(lastWholesaleSale.total)}</span>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-dark-700/50">
              <button onClick={() => setShowReceipt(false)} className="flex-1 px-4 py-2.5 text-gray-300 bg-dark-700 hover:bg-dark-600 rounded-xl text-sm">Cerrar</button>
              <button onClick={downloadPDF} className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2"><FileText size={15} /> Descargar PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Importar pedido Excel */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div ref={importPanelRef} role="dialog" aria-modal="true" aria-label="Importar pedido mayorista por Excel" className="bg-dark-800 border border-dark-700/50 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-dark-700/50">
              <h2 className="text-lg font-bold text-foreground">Importar Pedido desde Excel</h2>
              <button onClick={() => { setShowImportModal(false); setImportResult(null); }} aria-label="Cerrar" className="p-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                <p className="text-blue-400 text-xs font-medium mb-1">El Excel debe contener las columnas: CODIGO FABRICA y CANTIDAD</p>
                <p className="text-gray-400 text-xs">
                  Se puede escribir el encabezado con o sin tildes y en mayusculas o minusculas. Los productos se agregan
                  al pedido con el Precio Mayor autocompletado.
                </p>
                <button type="button" onClick={downloadPlantilla}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2">
                  <FileSpreadsheet size={14} /> Descargar plantilla de ejemplo
                </button>
              </div>
              {!importResult ? (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-dark-600/50 rounded-xl cursor-pointer hover:border-primary-500/50 transition-colors bg-dark-900/30">
                  <div className="flex flex-col items-center gap-2">
                    {importFile ? (
                      <>
                        <FileSpreadsheet size={32} className="text-green-400" />
                        <span className="text-sm text-foreground">{importFile.name}</span>
                        <span className="text-xs text-gray-500">{(importFile.size / 1024).toFixed(1)} KB</span>
                      </>
                    ) : (
                      <>
                        <Upload size={32} className="text-gray-500" />
                        <span className="text-sm text-gray-400">Seleccionar archivo .xlsx o .xls</span>
                      </>
                    )}
                  </div>
                  <input type="file" className="hidden" accept=".xlsx,.xls" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
                </label>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                      <p className="text-2xl font-bold text-green-400">{importResult.valid || 0}</p>
                      <p className="text-xs text-gray-400">Productos leídos</p>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                      <p className="text-2xl font-bold text-red-400">{importResult.errors?.length || 0}</p>
                      <p className="text-xs text-gray-400">Errores</p>
                    </div>
                  </div>
                  <div className="bg-dark-900/50 rounded-xl p-3">
                    <p className="text-xs text-gray-400 mb-1">Total del pedido importado:</p>
                    <p className="text-lg font-bold text-emerald-400">{formatBs(Number(importResult.total) || 0)}</p>
                  </div>
                  {importResult.errors?.length > 0 && (
                    <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3 max-h-32 overflow-y-auto">
                      {importResult.errors.map((e: string, i: number) => (
                        <p key={i} className="text-xs text-red-400">{e}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-dark-700/50">
              <button onClick={() => { setShowImportModal(false); setImportResult(null); }} className="px-4 py-2.5 text-sm text-gray-400 hover:text-foreground transition-colors">
                {importResult ? (importResult.valid ? "Cancelar" : "Cerrar") : "Cancelar"}
              </button>
              {!importResult && (
                <button onClick={handleImportExcel} disabled={!importFile || importing} className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2">
                  {importing ? <><RefreshCw size={16} className="animate-spin" /> Importando...</> : <><Upload size={16} /> Importar</>}
                </button>
              )}
              {importResult && importResult.valid > 0 && (
                <button onClick={useImportedItems} className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2">
                  <Check size={16} /> Usar en la venta
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar pago a venta pendiente */}
      {payModalSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div ref={payModalRef} role="dialog" aria-modal="true" aria-label="Registrar pago" className="bg-dark-900 border border-dark-700/50 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/50">
              <h3 className="text-lg font-bold text-foreground">Registrar pago</h3>
              <button onClick={() => { setPayModalSale(null); setPayAmount(0); }} aria-label="Cerrar" className="p-1.5 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-lg transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between text-sm"><span className="text-gray-400">Venta:</span><span className="text-foreground">#{payModalSale.id}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">Cliente:</span><span className="text-foreground">{payModalSale.customer?.name || payModalSale.paraQuien || "N/A"}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">Fecha:</span><span className="text-foreground">{formatDate(payModalSale.saleDate)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">Total:</span><span className="text-emerald-400 font-medium">{formatBs(Number(payModalSale.total))}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">Pagado:</span><span className="text-gray-300">{formatBs(payModalPaid)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">Saldo pendiente:</span><span className="text-yellow-400 font-medium">{formatBs(payModalBalance)}</span></div>
              <div className="pt-2 border-t border-dark-700/50 space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Método de pago</label>
                  <select value={payMethod} onChange={(e) => { setPayMethod(e.target.value); setPayAmount(payModalBalance); }}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500">
                    {PAGO_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Monto</label>
                  <input type="number" min={0} value={payAmount === 0 ? "" : payAmount} onChange={(e) => setPayAmount(Number(e.target.value) || 0)}
                    placeholder="Monto del pago"
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                </div>
                {payMethod === "CREDITO" && (
                  <p className="text-xs text-yellow-400/80">El crédito deja la venta en estado PENDIENTE hasta cobrar el saldo.</p>
                )}
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-dark-700/50">
              <button onClick={() => { setPayModalSale(null); setPayAmount(0); }} className="flex-1 px-4 py-2.5 text-gray-300 bg-dark-700 hover:bg-dark-600 rounded-xl text-sm">Cancelar</button>
              <button onClick={registerPayment} disabled={paying}
                className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50">
                {paying ? "Registrando..." : "Registrar pago"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
