import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Plus, Filter, ChevronDown, Eye, Pencil, Trash2,
  Package, RefreshCw, X, ChevronLeft, ChevronRight, Upload, FileSpreadsheet,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../services/api";
import ProductImage from "../components/public/ProductImage";
import ImagePreview from "../components/ui/ImagePreview";
import { validateYearRanges } from "../utils/yearRanges";
import Autocomplete from "../components/ui/Autocomplete";
import ColumnManager from "../components/ui/ColumnManager";
import { useAuthStore } from "../stores/authStore";
import { useDialogBehavior } from "../components/ui/useDialog";
import EmptyState from "../components/ui/EmptyState";

interface Product {
  id: number; itemCode: string; manufacturer: string; name: string;
  brand: string; model: string; year: string; detail: string | null;
  detalles: string | null; image: string | null; images?: string[]; oemCode: string | null;
  factoryCode: string | null; price1: string; price2: string;
  wholesalePrice: string | null; cost: string | null;
  categoryId: number | null; category: string | null; supplierName?: string | null; stock: number;
}

interface Filters {
  brands: string[];
  manufacturers: string[];
  categories: { id: number; name: string }[];
  models?: string[];
  years?: string[];
  names?: string[];
  itemCodes?: string[];
  oemCodes?: string[];
  factoryCodes?: string[];
  detalles?: string[];
}

interface Location {
  id: number;
  name: string;
  type: string;
}

interface FormData {
  itemCode: string; manufacturer: string; name: string; brand: string;
  model: string; year: string; detail: string; oemCode: string;
  factoryCode: string; price1: string; price2: string;
  wholesalePrice: string; cost: string; categoryId: string;
  image: string; stock: string; locationId: string;
}

const emptyForm: FormData = {
  itemCode: "", manufacturer: "", name: "", brand: "", model: "", year: "",
  detail: "", oemCode: "", factoryCode: "", price1: "", price2: "",
  wholesalePrice: "", cost: "", categoryId: "",
  image: "", stock: "", locationId: "",
};

const ALL_COLUMNS = [
  "ID", "Fabricante", "Producto", "Marca", "Modelo", "Año", "Detalles",
  "Cód. OEM", "Cód. Fábrica", "Proveedor", "Imagen", "Precio 1", "Precio 2", "Stock", "Acciones",
];

function getStoredColumns(): string[] | null {
  try {
    const raw = localStorage.getItem("columns_inventario");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function InventoryPage() {
  const navigate = useNavigate();
  const { user, columnConfig, allowedCategories } = useAuthStore();
  const canEdit = user?.role === "ADMIN";
  const hasCategoryRestriction = user?.role === "TIENDA" && allowedCategories.length > 0;
  const [products, setProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState<Filters>({ brands: [], manufacturers: [], categories: [] });
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const [search, setSearch] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [itemCodeFilter, setItemCodeFilter] = useState("");
  const [brand, setBrand] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [oemCode, setOemCode] = useState("");
  const [factoryCode, setFactoryCode] = useState("");
  const [detailFilter, setDetailFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const stored = getStoredColumns();
    const roleCols = columnConfig?.inventario;
    const base = stored && stored.length ? stored : roleCols && roleCols.length ? roleCols : ALL_COLUMNS;
    const merged = ALL_COLUMNS.filter((c) => base.includes(c));
    return merged.length ? merged : ALL_COLUMNS;
  });

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);

  const [showStockModal, setShowStockModal] = useState<number | null>(null);
  const [stockData, setStockData] = useState<any>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockEdits, setStockEdits] = useState<Record<number, { stock: string; minStock: string; reasonType: string; reason: string }>>({});
  const [pendingStockId, setPendingStockId] = useState<number | null>(null);
  const [stockPassword, setStockPassword] = useState("");
  const [stockSaving, setStockSaving] = useState(false);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importLocationId, setImportLocationId] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const [imageModal, setImageModal] = useState<Product | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  useEffect(() => { setImageIndex(0); }, [imageModal]);

  const productPanelRef = useDialogBehavior(showModal, () => setShowModal(false));
  const imagePanelRef = useDialogBehavior(imageModal !== null, () => setImageModal(null));
  const deletePanelRef = useDialogBehavior(showDeleteConfirm !== null, () => setShowDeleteConfirm(null));
  const stockPanelRef = useDialogBehavior(showStockModal !== null, () => { setShowStockModal(null); setStockData(null); setPendingStockId(null); setStockPassword(""); });
  const importPanelRef = useDialogBehavior(showImportModal, () => { setShowImportModal(false); setImportResult(null); });

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
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
      params.set("page", String(page));
      params.set("limit", "15");

      const res = await api.get(`/products?${params.toString()}`);
      setProducts(res.data.products);
      setTotal(res.data.pagination.total);
      setPages(res.data.pagination.pages);
    } catch {
      toast.error("Error al cargar productos");
    } finally {
      setLoading(false);
    }
  }, [search, nameFilter, itemCodeFilter, brand, manufacturer, model, year, categoryId, oemCode, factoryCode, detailFilter, page]);

  const fetchFilters = useCallback(async () => {
    try {
      const res = await api.get("/products/filters");
      setFilters(res.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { fetchFilters(); }, [fetchFilters]);
  useEffect(() => { api.get("/locations").then((res) => setLocations(res.data.locations || res.data)).catch(() => {}); }, []);

  useEffect(() => { setPage(1); }, [search, nameFilter, itemCodeFilter, brand, manufacturer, model, year, categoryId, oemCode, factoryCode, detailFilter]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    setForm({
      itemCode: p.itemCode, manufacturer: p.manufacturer, name: p.name,
      brand: p.brand, model: p.model, year: p.year, detail: p.detail || "",
      oemCode: p.oemCode || "", factoryCode: p.factoryCode || "",
      price1: String(p.price1), price2: String(p.price2),
      wholesalePrice: p.wholesalePrice ? String(p.wholesalePrice) : "",
      cost: p.cost ? String(p.cost) : "",
      categoryId: p.categoryId ? String(p.categoryId) : "",
      image: [p.image, ...(p.images || [])].filter(Boolean).join("\n"), stock: "", locationId: "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.itemCode || !form.manufacturer || !form.name || !form.brand || !form.model || !form.year || !form.price1) {
      toast.error("Completa los campos obligatorios");
      return;
    }

    const yearError = validateYearRanges(form.year);
    if (yearError) {
      toast.error(yearError);
      return;
    }
    try {
      setSaving(true);
      const normalizeImageUrl = (u: string) => {
      const m = u.match(/^(.*\/)wiki\/File:(.+)$/i);
      if (m) {
        return `${m[1]}wiki/Special:FilePath/${encodeURIComponent(m[2].split(/[?#]/)[0].replace(/\s+/g, "_"))}`;
      }
      return u;
    };
    const urls = form.image.split(/[,\n]+/).map((u) => u.trim()).filter(Boolean).map(normalizeImageUrl);
      const payload = {
        ...form,
        price1: Number(form.price1),
        price2: form.price2 ? Number(form.price2) : Number(form.price1),
        wholesalePrice: form.wholesalePrice ? Number(form.wholesalePrice) : null,
        cost: form.cost ? Number(form.cost) : null,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        image: urls[0] || null,
        images: urls,
        stock: form.stock ? Number(form.stock) : 0,
        locationId: form.locationId ? Number(form.locationId) : null,
      };

      if (editingId) {
        await api.put(`/products/${editingId}`, payload);
        toast.success("Producto actualizado");
      } else {
        await api.post("/products", payload);
        toast.success("Producto creado");
      }
      setShowModal(false);
      fetchProducts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/products/${id}`);
      toast.success("Producto eliminado");
      setShowDeleteConfirm(null);
      fetchProducts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al eliminar");
    }
  };

  const openStock = async (productId: number) => {
    try {
      setShowStockModal(productId);
      setPendingStockId(null);
      setStockPassword("");
      setStockLoading(true);
      const res = await api.get(`/inventory/product/${productId}`);
      setStockData(res.data);
      const edits: Record<number, { stock: string; minStock: string; reasonType: string; reason: string }> = {};
      (res.data.locations || []).forEach((loc: any) => {
        edits[loc.id] = { stock: String(loc.stock), minStock: String(loc.minStock), reasonType: "", reason: "" };
      });
      setStockEdits(edits);
    } catch {
      toast.error("Error al cargar stock");
      setShowStockModal(null);
    } finally {
      setStockLoading(false);
    }
  };

  const requestStockConfirm = (invId: number) => {
    const edit = stockEdits[invId];
    if (!edit) return;
    const current = stockData?.locations?.find((l: any) => l.id === invId)?.stock;
    const stockChanged = current != null && Number(edit.stock) !== Number(current);
    if (stockChanged && !edit.reasonType) {
      toast.error("Selecciona el motivo del ajuste de stock");
      return;
    }
    setStockPassword("");
    setPendingStockId(invId);
  };

  const saveStockAdjust = async () => {
    if (pendingStockId == null) return;
    const invId = pendingStockId;
    const edit = stockEdits[invId];
    if (!edit) return;
    if (!stockPassword) {
      toast.error("Ingresa la contraseña de administrador");
      return;
    }
    try {
      setStockSaving(true);
      await api.put(`/inventory/${invId}`, {
        stock: Number(edit.stock),
        minStock: Number(edit.minStock),
        reasonType: edit.reasonType,
        reason: edit.reason || null,
        password: stockPassword,
      });
      toast.success("Stock ajustado");
      setPendingStockId(null);
      setStockPassword("");
      const res = await api.get(`/inventory/product/${showStockModal}`);
      setStockData(res.data);
      const edits: Record<number, { stock: string; minStock: string; reasonType: string; reason: string }> = {};
      (res.data.locations || []).forEach((loc: any) => {
        edits[loc.id] = { stock: String(loc.stock), minStock: String(loc.minStock), reasonType: "", reason: "" };
      });
      setStockEdits(edits);
      fetchProducts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al ajustar stock");
      if (err.response?.status === 403) setPendingStockId(null);
    } finally { setStockSaving(false); }
  };

  const formatCurrency = (v: string) => `Bs. ${Number(v).toLocaleString("es-BO", { minimumFractionDigits: 2 })}`;

  const handleImportExcel = async () => {
    if (!importFile) return;
    try {
      setImporting(true);
      setImportResult(null);
      const formData = new FormData();
      formData.append("file", importFile);
      if (importLocationId) formData.append("locationId", importLocationId);
      const res = await api.post("/products/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(res.data);
      toast.success(`Importación completada: ${res.data.imported} creados, ${res.data.updated} actualizados`);
      fetchProducts();
      fetchFilters();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al importar archivo");
    } finally {
      setImporting(false);
    }
  };

  const setField = (field: keyof FormData, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const visibleProducts = hasCategoryRestriction
    ? products.filter((p) => allowedCategories.includes(p.category || "") || !p.category)
    : products;

  const allVisibleCount = total;

  const renderInventoryCell = (p: Product, column: string) => {
    switch (column) {
      case "ID": return <td key={column} className="px-4 py-3 text-gray-400">{p.id}</td>;
      case "Fabricante": return <td key={column} className="px-4 py-3 text-gray-300">{p.manufacturer}</td>;
      case "Producto": return <td key={column} className="px-4 py-3 text-foreground font-medium max-w-[200px] truncate">{p.name}</td>;
      case "Marca": return <td key={column} className="px-4 py-3 text-gray-300">{p.brand}</td>;
      case "Modelo": return <td key={column} className="px-4 py-3 text-gray-300">{p.model}</td>;
      case "Año": return <td key={column} className="px-4 py-3 text-gray-400">{p.year}</td>;
      case "Detalles": return <td key={column} className="px-4 py-3 text-gray-400 text-xs">{p.detalles || p.detail || "—"}</td>;
      case "Cód. OEM": return <td key={column} className="px-4 py-3 text-gray-400 text-xs">{p.oemCode || "—"}</td>;
      case "Cód. Fábrica": return <td key={column} className="px-4 py-3 text-gray-400 text-xs">{p.factoryCode || "—"}</td>;
      case "Proveedor": return <td key={column} className="px-4 py-3 text-gray-300 text-xs">{p.supplierName || "—"}</td>;
      case "Imagen": return (
        <td key={column} className="px-4 py-3">
          <ImagePreview image={p.image} category={p.category} name={p.name} onClick={() => setImageModal(p)} className="mx-auto" />
        </td>
      );
      case "Precio 1": return <td key={column} className="px-4 py-3 text-right text-green-400 font-medium">{formatCurrency(p.price1)}</td>;
      case "Precio 2": return <td key={column} className="px-4 py-3 text-right text-blue-400">{formatCurrency(p.price2)}</td>;
      case "Stock": return <td key={column} className="px-4 py-3 text-center"><span className={`px-2 py-0.5 text-xs font-medium rounded-full ${p.stock === 0 ? "bg-red-500/10 text-red-400" : p.stock <= 5 ? "bg-yellow-500/10 text-yellow-400" : "bg-green-500/10 text-green-400"}`}>{p.stock}</span></td>;
      case "Acciones": return <td key={column} className="px-4 py-3"><div className="flex items-center justify-center gap-1"><button onClick={() => navigate(`/panel/inventario/${p.id}`)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all" title="Ver detalle"><Eye size={16} /></button>{canEdit && <><button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 transition-all" title="Editar"><Pencil size={16} /></button><button onClick={() => setShowDeleteConfirm(p.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Eliminar"><Trash2 size={16} /></button></>}<button onClick={() => openStock(p.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-purple-400 hover:bg-purple-500/10 transition-all" title="Ver stock por ubicación"><Package size={16} /></button></div></td>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventario</h1>
          <p className="text-gray-400 text-sm mt-1">{allVisibleCount} productos registrados</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchProducts} className="p-2.5 bg-dark-800 border border-dark-700/50 rounded-xl text-gray-400 hover:text-foreground hover:border-primary-600/50 transition-all" title="Actualizar">
            <RefreshCw size={18} />
          </button>
          <ColumnManager module="inventario" columns={ALL_COLUMNS} onVisibleChange={setVisibleColumns} />
          {canEdit && (
            <>
              <button onClick={() => { setShowImportModal(true); setImportFile(null); setImportResult(null); }} className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary-600/20">
                <Upload size={18} />
                <span className="hidden sm:inline">Importar Excel</span>
              </button>
              <button onClick={openCreate} className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 shadow-lg shadow-primary-600/20">
                <Plus size={18} />
                Nuevo Producto
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código, nombre, marca, modelo, OEM..."
              aria-label="Buscar producto"
              className="w-full pl-10 pr-4 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Limpiar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-foreground">
                <X size={16} />
              </button>
            )}
          </div>
          <button onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border transition-all ${showFilters ? "bg-primary-600/10 border-primary-600/20 text-primary-400" : "bg-dark-900/50 border-dark-600/50 text-gray-400 hover:text-foreground"}`}>
            <Filter size={16} />
            Filtros
            <ChevronDown size={14} className={`transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 pt-4 border-t border-dark-700/50">
            <Autocomplete
              value={nameFilter}
              onChange={setNameFilter}
              suggestions={filters.names || []}
              placeholder="Escribe el nombre..."
              label="Producto (nombre)"
            />
            <Autocomplete
              value={itemCodeFilter}
              onChange={setItemCodeFilter}
              suggestions={filters.itemCodes || []}
              placeholder="Escribe el código..."
              label="Código (Item)"
            />
            <Autocomplete
              value={brand}
              onChange={setBrand}
              suggestions={filters.brands}
              placeholder="Todas las marcas"
              label="Marca"
            />
            <Autocomplete
              value={manufacturer}
              onChange={setManufacturer}
              suggestions={filters.manufacturers}
              placeholder="Todos los fabricantes"
              label="Fabricante"
            />
            <Autocomplete value={model} onChange={setModel} suggestions={filters.models || []} placeholder="Todos los modelos" label="Modelo" />
            <Autocomplete value={year} onChange={setYear} suggestions={filters.years || []} placeholder="Todos los años (ej. 92)" label="Año / rango" />
            <Autocomplete
              value={categoryName}
              onChange={(v) => {
                setCategoryName(v);
                const found = filters.categories.find((c) => c.name === v);
                setCategoryId(found ? String(found.id) : "");
              }}
              suggestions={filters.categories.map((c) => c.name)}
              placeholder="Todas las categorías"
              label="Categoría"
            />
            <Autocomplete
              value={oemCode}
              onChange={setOemCode}
              suggestions={filters.oemCodes || []}
              placeholder="Todos los OEM"
              label="Cód. OEM"
            />
            <Autocomplete
              value={factoryCode}
              onChange={setFactoryCode}
              suggestions={filters.factoryCodes || []}
              placeholder="Todos los códigos"
              label="Cód. Fábrica"
            />
            <Autocomplete
              value={detailFilter}
              onChange={setDetailFilter}
              suggestions={filters.detalles || []}
              placeholder="Detalle, versión, uso..."
              label="Detalles"
            />
            {(nameFilter || itemCodeFilter || brand || manufacturer || model || year || categoryId || oemCode || factoryCode || detailFilter) && (
              <div className="flex items-end md:col-span-3">
                <button
                  onClick={() => {
                    setNameFilter(""); setItemCodeFilter(""); setBrand(""); setManufacturer("");
                    setModel(""); setYear(""); setCategoryName(""); setCategoryId("");
                    setOemCode(""); setFactoryCode(""); setDetailFilter("");
                  }}
                  className="px-3 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm hover:bg-red-500/20 transition-colors"
                >
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw size={32} className="text-primary-400 animate-spin" />
          </div>
        ) : visibleProducts.length === 0 ? (
          <EmptyState
            title="Sin productos registrados"
            description="Crea un producto o importa un archivo Excel para comenzar."
            icon={Package}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 border-b border-dark-700/50">
                    {visibleColumns.map((col) => {
                      const align = ["Precio 1", "Precio 2"].includes(col) ? "text-right" : ["Imagen", "Stock", "Acciones"].includes(col) ? "text-center" : "text-left";
                      return (
                        <th key={col} className={`${align} px-4 py-3 font-medium`}>{col}</th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((p) => (
                    <tr key={p.id} className="border-b border-dark-700/30 last:border-0 hover:bg-dark-900/30 transition-colors">
                      {visibleColumns.map((column) => renderInventoryCell(p, column))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-dark-700/30">
              {visibleProducts.map((p) => (
                <div key={p.id} className="p-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <ImagePreview image={p.image} category={p.category} name={p.name} onClick={() => setImageModal(p)} className="w-12 h-12 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground font-medium text-sm truncate">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.brand} · {p.model} · {p.year}</p>
                      <p className="text-xs text-gray-600">{p.manufacturer}</p>
                    </div>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full shrink-0 ${p.stock === 0 ? "bg-red-500/10 text-red-400" : p.stock <= 5 ? "bg-yellow-500/10 text-yellow-400" : "bg-green-500/10 text-green-400"}`}>
                      {p.stock}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-green-400 font-medium">{formatCurrency(p.price1)}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => navigate(`/panel/inventario/${p.id}`)} aria-label={`Ver detalle de ${p.name}`} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400 active:bg-blue-500/10 transition-all">
                        <Eye size={16} />
                      </button>
                      {canEdit && (
                        <>
                          <button onClick={() => openEdit(p)} aria-label={`Editar ${p.name}`} className="p-1.5 rounded-lg text-gray-400 hover:text-amber-400 active:bg-amber-500/10 transition-all">
                            <Pencil size={16} />
                          </button>
                          <button onClick={() => setShowDeleteConfirm(p.id)} aria-label={`Eliminar ${p.name}`} className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 active:bg-red-500/10 transition-all">
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                      <button onClick={() => openStock(p.id)} aria-label={`Ver stock de ${p.name}`} className="p-1.5 rounded-lg text-gray-400 hover:text-purple-400 active:bg-purple-500/10 transition-all">
                        <Package size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700/50">
            <p className="text-gray-400 text-sm">Página {page} de {pages}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Página anterior" className="p-2 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, pages - 4));
                const p = start + i;
                if (p > pages) return null;
                return (
                  <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${p === page ? "bg-primary-600 text-white" : "bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground"}`}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} aria-label="Página siguiente" className="p-2 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Crear / Editar Producto */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div ref={productPanelRef} role="dialog" aria-modal="true" aria-label="Nuevo producto" className="bg-dark-800 border border-dark-700/50 rounded-2xl w-full max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-dark-700/50">
              <h2 className="text-lg font-bold text-foreground">{editingId ? "Editar Producto" : "Nuevo Producto"}</h2>
              <button onClick={() => setShowModal(false)} aria-label="Cerrar" className="p-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Código Item *" value={form.itemCode} onChange={(v) => setField("itemCode", v)} disabled={!!editingId} />
                <Field label="Fabricante *" value={form.manufacturer} onChange={(v) => setField("manufacturer", v)} />
                <Field label="Nombre *" value={form.name} onChange={(v) => setField("name", v)} className="col-span-2" />
                <Field label="Marca *" value={form.brand} onChange={(v) => setField("brand", v)} />
                <Field label="Modelo *" value={form.model} onChange={(v) => setField("model", v)} />
                <Field label="Año *" value={form.year} onChange={(v) => setField("year", v)} placeholder="ej: 2020-2024" />
                <Field label="Detalles" value={form.detail} onChange={(v) => setField("detail", v)} placeholder="Detalle opcional" />
                <Field label="Código OEM" value={form.oemCode} onChange={(v) => setField("oemCode", v)} />
                <Field label="Código Fábrica" value={form.factoryCode} onChange={(v) => setField("factoryCode", v)} />
              </div>
              <div className="border-t border-dark-700/50 pt-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Precios (Bs.)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Field label="Precio Mayorista (Bs.) *" value={form.price1} onChange={(v) => setField("price1", v)} type="number" />
                    <Field label="Precio Minorista (Bs.)" value={form.price2} onChange={(v) => setField("price2", v)} type="number" />
                  <Field label="Precio Mayor" value={form.wholesalePrice} onChange={(v) => setField("wholesalePrice", v)} type="number" />
                  <Field label="Costo" value={form.cost} onChange={(v) => setField("cost", v)} type="number" />
                </div>
              </div>
              <div className="relative">
                <label htmlFor="inv-category" className="block text-xs text-gray-400 mb-1.5">Categoría</label>
                <select id="inv-category" value={form.categoryId} onChange={(e) => setField("categoryId", e.target.value)} className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8">
                  <option value="">Sin categoría</option>
                  {filters.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-[38px] text-gray-500 pointer-events-none" />
              </div>
              <div className="border-t border-dark-700/50 pt-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Inventario e Imagen</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                  <label htmlFor="inv-images" className="block text-xs text-gray-400 mb-1.5">URLs de imágenes (una por línea o separadas por coma)</label>
                  <textarea
                    id="inv-images"
                    value={form.image}
                    onChange={(e) => setField("image", e.target.value)}
                    placeholder={"https://...\nhttps://...\nhttps://..."}
                    rows={3}
                    className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none placeholder-gray-600 resize-none"
                  />
                  <p className="text-[11px] text-gray-600 mt-1">La primera URL es la foto principal. El link debe apuntar directamente al archivo (termina en .jpg, .png, .webp...): haz clic derecho sobre la foto → "Copiar dirección de imagen". Los enlaces de tipo "wiki/File:..." se convierten automáticamente.</p>
                  <ImageUrlsPreview text={form.image} />
                </div>
                  {!editingId && (
                    <Field label="Stock inicial" value={form.stock} onChange={(v) => setField("stock", v)} type="number" />
                  )}
                  {!editingId && (
                    <div className="col-span-2">
                      <label htmlFor="inv-location" className="block text-xs text-gray-400 mb-1.5">Ubicación inicial</label>
                      <select id="inv-location" value={form.locationId} onChange={(e) => setField("locationId", e.target.value)} className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8">
                        <option value="">Sin ubicación</option>
                        {locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.type === "ALMACEN" ? "Almacén" : "Tienda"})</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-dark-700/50">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-foreground transition-colors">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50">
                {saving ? "Guardando..." : editingId ? "Actualizar" : "Crear Producto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Vista ampliada de imagen */}
      {imageModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setImageModal(null)}>
          <div ref={imagePanelRef} role="dialog" aria-modal="true" aria-label="Ver imagen" className="bg-dark-800 border border-dark-700/50 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-dark-700/50">
              <div className="min-w-0">
                <p className="text-foreground font-medium truncate">{imageModal.name}</p>
                <p className="text-xs text-gray-500 truncate">{imageModal.brand} · {imageModal.itemCode}</p>
              </div>
              <button onClick={() => setImageModal(null)} aria-label="Cerrar" className="p-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 bg-dark-900/50 flex items-center justify-center min-h-[280px] relative">
              {(() => {
                const photos = (imageModal.images?.some(Boolean) ? imageModal.images : imageModal.image ? [imageModal.image] : []).filter(Boolean) as string[];
                if (photos.length <= 1) {
                  return <ProductImage image={photos[0] || imageModal.image} category={imageModal.category} name={imageModal.name} className="max-h-[60vh] w-auto" />;
                }
                return (
                  <>
                    {photos.map((src, i) => (
                      <div key={i} aria-hidden={i !== imageIndex} className={i === imageIndex ? "block" : "hidden"}>
                        <ProductImage image={src} category={imageModal.category} name={imageModal.name} className="max-h-[60vh] w-auto" />
                      </div>
                    ))}
                    <button
                      onClick={() => setImageIndex((imageIndex - 1 + photos.length) % photos.length)}
                      aria-label="Foto anterior"
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-dark-800/80 hover:bg-dark-700 text-gray-300 hover:text-foreground rounded-full border border-dark-600/50 transition-all"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      onClick={() => setImageIndex((imageIndex + 1) % photos.length)}
                      aria-label="Foto siguiente"
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-dark-800/80 hover:bg-dark-700 text-gray-300 hover:text-foreground rounded-full border border-dark-600/50 transition-all"
                    >
                      <ChevronRight size={18} />
                    </button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {photos.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setImageIndex(i)}
                          aria-label={`Foto ${i + 1}`}
                          aria-current={i === imageIndex}
                          className={`w-2 h-2 rounded-full transition-all ${i === imageIndex ? "bg-primary-400 w-4" : "bg-dark-600 hover:bg-dark-500"}`}
                        />
                      ))}
                    </div>
                    <span className="absolute top-2 right-3 text-xs text-gray-500">{imageIndex + 1} / {photos.length}</span>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Eliminación */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div ref={deletePanelRef} role="dialog" aria-modal="true" aria-label="Confirmar eliminación" className="bg-dark-800 border border-dark-700/50 rounded-2xl p-6 w-full max-w-sm text-center">
            <Trash2 size={40} className="text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground mb-2">¿Eliminar producto?</h3>
            <p className="text-gray-400 text-sm mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-foreground transition-colors">Cancelar</button>
              <button onClick={() => handleDelete(showDeleteConfirm)} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Stock por Ubicación */}
      {showStockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div ref={stockPanelRef} role="dialog" aria-modal="true" aria-label="Stock por ubicación" className="bg-dark-800 border border-dark-700/50 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-dark-700/50">
              <h2 className="text-lg font-bold text-foreground">Stock por Ubicación</h2>
              <button onClick={() => { setShowStockModal(null); setStockData(null); }} aria-label="Cerrar" className="p-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              {stockLoading ? (
                <div className="flex items-center justify-center h-32">
                  <RefreshCw size={24} className="text-primary-400 animate-spin" />
                </div>
              ) : stockData ? (
                <>
                  <div className="mb-4 p-3 bg-dark-900/50 rounded-xl border border-dark-700/30">
                    <p className="text-foreground font-medium">{stockData.stockTotal} unidades totales</p>
                    {canEdit && <p className="text-xs text-gray-500 mt-1">Haz clic en un campo para ajustar el stock de cada ubicación.</p>}
                  </div>
                  <div className="space-y-3">
                    {stockData.locations.map((loc: any) => {
                      const edit = stockEdits[loc.id] || { stock: String(loc.stock), minStock: String(loc.minStock), reasonType: "", reason: "" };
                      return (
                        <div key={loc.id} className="p-3 bg-dark-900/50 rounded-xl border border-dark-700/30">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-sm text-gray-200">{loc.locationName}</p>
                              <p className="text-xs text-gray-500">{loc.locationType === "ALMACEN" ? "Almacén" : "Tienda"}</p>
                            </div>
                            {canEdit && (
                              <button
                                onClick={() => requestStockConfirm(loc.id)}
                                disabled={stockSaving}
                                className="px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-all disabled:opacity-50"
                              >
                                Guardar ajuste
                              </button>
                            )}
                          </div>
                          {canEdit && pendingStockId === loc.id && (
                            <div className="mt-3 p-3 rounded-xl border border-primary-500/40 bg-dark-800/60">
                              <p className="text-xs text-gray-300 mb-2">Para aplicar el cambio introduce la contraseña de administrador:</p>
                              <input
                                type="password"
                                value={stockPassword}
                                onChange={(e) => setStockPassword(e.target.value)}
                                autoComplete="current-password"
                                aria-label="Contraseña de administrador"
                                placeholder="Contraseña de administrador"
                                className="w-full px-2.5 py-1.5 bg-dark-800 border border-dark-600/50 rounded-lg text-foreground text-sm focus:outline-none focus:border-primary-500 placeholder-gray-600"
                              />
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={saveStockAdjust}
                                  disabled={stockSaving || !stockPassword}
                                  className="px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-all disabled:opacity-50"
                                >
                                  {stockSaving ? "Guardando..." : "Confirmar y guardar"}
                                </button>
                                <button
                                  onClick={() => setPendingStockId(null)}
                                  className="px-3 py-1.5 rounded-lg bg-dark-800 border border-dark-600/50 text-gray-300 hover:bg-dark-700 text-xs font-medium transition-all"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label htmlFor={`loc-stock-${loc.id}`} className="block text-xs text-gray-500 mb-0.5">Stock</label>
                              <input
                                id={`loc-stock-${loc.id}`}
                                type="number" min={0} disabled={!canEdit}
                                value={edit.stock}
                                onChange={(e) => setStockEdits((prev) => ({ ...prev, [loc.id]: { ...prev[loc.id], stock: e.target.value } }))}
                                className="w-full px-2.5 py-1.5 bg-dark-800 border border-dark-700 rounded-lg text-foreground text-sm focus:outline-none focus:border-primary-500 disabled:opacity-60"
                              />
                            </div>
                            <div>
                              <label htmlFor={`loc-min-${loc.id}`} className="block text-xs text-gray-500 mb-0.5">Stock mínimo</label>
                              <input
                                id={`loc-min-${loc.id}`}
                                type="number" min={0} disabled={!canEdit}
                                value={edit.minStock}
                                onChange={(e) => setStockEdits((prev) => ({ ...prev, [loc.id]: { ...prev[loc.id], minStock: e.target.value } }))}
                                className="w-full px-2.5 py-1.5 bg-dark-800 border border-dark-700 rounded-lg text-foreground text-sm focus:outline-none focus:border-primary-500 disabled:opacity-60"
                              />
                            </div>
                          </div>
                          {canEdit && (
                            <div className="mt-2 grid grid-cols-1 gap-2">
                              <div>
                                <label htmlFor={`loc-razon-${loc.id}`} className="block text-xs text-gray-500 mb-0.5">Motivo</label>
                                <select
                                  id={`loc-razon-${loc.id}`}
                                  value={edit.reasonType}
                                  onChange={(e) => setStockEdits((prev) => ({ ...prev, [loc.id]: { ...prev[loc.id], reasonType: e.target.value } }))}
                                  className="w-full px-2.5 py-1.5 bg-dark-800 border border-dark-700 rounded-lg text-foreground text-sm focus:outline-none focus:border-primary-500"
                                >
                                  <option value="">Sin motivo</option>
                                  <option value="COMPRA">Compra</option>
                                  <option value="AJUSTE">Ajuste</option>
                                  <option value="DEVOLUCION">Devolución</option>
                                  <option value="MERMA">Merma</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Observación (opcional)</label>
                                <input
                                  type="text"
                                  value={edit.reason}
                                  onChange={(e) => setStockEdits((prev) => ({ ...prev, [loc.id]: { ...prev[loc.id], reason: e.target.value } }))}
                                  placeholder="Detalle del ajuste..."
                                  aria-label="Detalle del ajuste"
                                  className="w-full px-2.5 py-1.5 bg-dark-800 border border-dark-700 rounded-lg text-foreground text-sm focus:outline-none focus:border-primary-500"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Importar Excel */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div ref={importPanelRef} role="dialog" aria-modal="true" aria-label="Importar productos desde Excel" className="bg-dark-800 border border-dark-700/50 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-dark-700/50">
              <h2 className="text-lg font-bold text-foreground">Importar Productos desde Excel</h2>
              <button onClick={() => { setShowImportModal(false); setImportResult(null); }} aria-label="Cerrar" className="p-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                <p className="text-blue-400 text-xs font-medium mb-1">Columnas aceptadas:</p>
       <p className="text-gray-400 text-xs">Codigo fabrica, Descripcion, Fabricante, Marca, Modelo, Años, Detalle, Codigo OEM, Categoría, Precio 1, Precio 2, Precio mayor, Costo, Stock, Detalles</p>
              </div>
                {!importResult ? (
                  <div className="space-y-3">
                  <div>
                    <label htmlFor="import-loc" className="block text-xs text-gray-400 mb-1">Ubicación de los productos</label>
                    <select id="import-loc" value={importLocationId} onChange={(e) => setImportLocationId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                      <option value="">Todas las ubicaciones (stock 0)</option>
                      {locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.type})</option>)}
                    </select>
                    <p className="text-xs text-gray-600 mt-1">Si eliges una ubicación, la columna Stock se asigna allí.</p>
                  </div>
                  <label
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false); }}
                    onDrop={(e) => { e.preventDefault(); setDragActive(false); const file = e.dataTransfer.files?.[0] ?? null; if (file) setImportFile(file); }}
                    className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors bg-dark-900/30 ${dragActive ? "border-primary-400 bg-primary-500/10" : "border-dark-600/50 hover:border-primary-500/50"}`}>
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
                          <span className="text-sm text-gray-400">Arrastra el archivo aquí o haz clic para seleccionar (.xlsx / .xls)</span>
                        </>
                      )}
                    </div>
                    <input type="file" className="sr-only" accept=".xlsx,.xls" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
                  </label>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                      <p className="text-2xl font-bold text-green-400">{importResult.imported}</p>
                      <p className="text-xs text-gray-400">Creados</p>
                    </div>
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                      <p className="text-2xl font-bold text-blue-400">{importResult.updated}</p>
                      <p className="text-xs text-gray-400">Actualizados</p>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                      <p className="text-2xl font-bold text-red-400">{importResult.errors}</p>
                      <p className="text-xs text-gray-400">Errores</p>
                    </div>
                  </div>
                  {importResult.details?.errors?.length > 0 && (
                    <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3 max-h-32 overflow-y-auto">
                      {importResult.details.errors.map((e: string, i: number) => (
                        <p key={i} className="text-xs text-red-400">{e}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-dark-700/50">
              <button onClick={() => { setShowImportModal(false); setImportResult(null); }} className="px-4 py-2.5 text-sm text-gray-400 hover:text-foreground transition-colors">
                {importResult ? "Cerrar" : "Cancelar"}
              </button>
              {!importResult && (
                <button onClick={handleImportExcel} disabled={!importFile || importing} className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2">
                  {importing ? <><RefreshCw size={16} className="animate-spin" /> Importando...</> : <><Upload size={16} /> Importar</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, disabled, className = "" }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; disabled?: boolean; className?: string;
}) {
  const inputId = `inv-field-${label.replace(/[^a-zA-Z0-9]+/g, "-")}`;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="block text-xs text-gray-400 mb-1.5">{label}</label>
      <input
        id={inputId}
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none placeholder-gray-600 disabled:opacity-50"
      />
    </div>
  );
}

function ImageUrlsPreview({ text }: { text: string }) {
  const urls = text.split(/[,\n]+/).map((u) => u.trim()).filter(Boolean);
  if (urls.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2" aria-live="polite">
      {urls.map((u, i) => (
        <div key={i} title={u} className="relative w-12 h-12 rounded-lg overflow-hidden bg-dark-900/50 border border-dark-700">
          <img
            src={u}
            alt={`Vista previa foto ${i + 1}`}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.opacity = "0.2";
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
            }}
          />
          <div className="absolute inset-0 hidden items-center justify-center bg-red-500/20">
            <X size={14} className="text-red-400" />
          </div>
        </div>
      ))}
    </div>
  );
}
