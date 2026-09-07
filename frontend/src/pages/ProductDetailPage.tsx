import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, Edit3, Save, X, Truck, Store,
  ChevronDown, ChevronRight, RefreshCw,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../services/api";
import ProductImage from "../components/public/ProductImage";
import { useAuthStore } from "../stores/authStore";

interface ProductDetail {
  id: number; itemCode: string; manufacturer: string; name: string;
  brand: string; model: string; year: string; detail: string | null;
  detalles: string | null; image: string | null; oemCode: string | null;
  factoryCode: string | null; price1: string; price2: string;
  wholesalePrice: string | null; cost: string | null;
  categoryId: number | null; category: string | null; stock: number;
  supplierName?: string | null;
  stockByLocation: StockItem[];
  importers: { id: number; name: string; phone: string | null; city: string | null }[];
}

interface StockItem {
  locationId: number; locationName: string;
  locationType: "ALMACEN" | "TIENDA"; stock: number; minStock: number;
}

interface Filters {
  brands: string[]; manufacturers: string[];
  categories: { id: number; name: string }[];
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const canEdit = user?.role === "ADMIN";
  const [requesting, setRequesting] = useState(false);

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<Filters>({ brands: [], manufacturers: [], categories: [] });
  const [saving, setSaving] = useState(false);

  const fetchProduct = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/products/${id}`);
      let supplierName: string | null = null;
      try {
        const costs = await api.get(`/costs?productId=${id}&limit=1`);
        supplierName = costs.data.costs?.[0]?.supplierName || null;
      } catch { /* proveedor complementario */ }
      setProduct({ ...res.data, supplierName });
      setForm({
        itemCode: res.data.itemCode, manufacturer: res.data.manufacturer,
        name: res.data.name, brand: res.data.brand, model: res.data.model,
        year: res.data.year, detail: res.data.detail || "",
        oemCode: res.data.oemCode || "", factoryCode: res.data.factoryCode || "",
        price1: String(res.data.price1), price2: String(res.data.price2),
        wholesalePrice: res.data.wholesalePrice ? String(res.data.wholesalePrice) : "",
        cost: res.data.cost ? String(res.data.cost) : "",
        categoryId: res.data.categoryId ? String(res.data.categoryId) : "",
      });
    } catch {
      toast.error("Producto no encontrado");
      navigate("/panel/inventario");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  const fetchFilters = useCallback(async () => {
    try {
      const res = await api.get("/products/filters");
      setFilters(res.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchProduct(); }, [fetchProduct]);
  useEffect(() => { fetchFilters(); }, [fetchFilters]);

  const handleSave = async () => {
    if (!form.itemCode || !form.manufacturer || !form.name || !form.brand || !form.model || !form.year || !form.price1) {
      toast.error("Completa los campos obligatorios");
      return;
    }
    try {
      setSaving(true);
      await api.put(`/products/${id}`, {
        ...form,
        price1: Number(form.price1),
        price2: form.price2 ? Number(form.price2) : Number(form.price1),
        wholesalePrice: form.wholesalePrice ? Number(form.wholesalePrice) : null,
        cost: form.cost ? Number(form.cost) : null,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
      });
      toast.success("Producto actualizado");
      setEditing(false);
      fetchProduct();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al actualizar");
    } finally {
      setSaving(false);
    }
  };

  const setField = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));
  const fc = (v: string) => `Bs. ${Number(v).toLocaleString("es-BO", { minimumFractionDigits: 2 })}`;

  const requestFromWarehouse = async () => {
    if (!product || !user?.locationId) {
      toast.error("Tu usuario no tiene una tienda asignada");
      return;
    }
    try {
      setRequesting(true);
      await api.post("/requests", {
        productId: product.id,
        quantity: 1,
        locationId: user.locationId,
        requestedById: user.id,
        note: `Solicitud desde el detalle de ${product.name}`,
      });
      toast.success("Solicitud enviada al almacén");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "No se pudo crear la solicitud");
    } finally {
      setRequesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw size={32} className="text-primary-400 animate-spin" />
      </div>
    );
  }

  if (!product) return null;

  const almacenes = product.stockByLocation.filter((s) => s.locationType === "ALMACEN");
  const tiendas = product.stockByLocation.filter((s) => s.locationType === "TIENDA");

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav aria-label="Ruta de navegación" className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/panel" className="hover:text-foreground transition-colors">Inicio</Link>
        <ChevronRight size={14} className="text-gray-600" />
        <Link to="/panel/inventario" className="hover:text-foreground transition-colors">Inventario</Link>
        <ChevronRight size={14} className="text-gray-600" />
        <span className="text-foreground">{product.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/panel/inventario")} aria-label="Volver al inventario" className="p-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl transition-all">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{product.name}</h1>
            <p className="text-gray-400 text-sm mt-1">{product.itemCode} · {product.brand} · {product.model}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {product.stock === 0 && (
             <button onClick={requestFromWarehouse} disabled={requesting} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 disabled:opacity-50">
               <Truck size={16} />
               {requesting ? "Enviando..." : "Solicitar a almacén"}
            </button>
          )}
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-foreground transition-colors flex items-center gap-2">
                <X size={16} /> Cancelar
              </button>
              <button onClick={handleSave} disabled={saving} className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 disabled:opacity-50">
                <Save size={16} /> {saving ? "Guardando..." : "Guardar"}
              </button>
            </>
          ) : (
            canEdit && (
              <button onClick={() => setEditing(true)} className="bg-dark-800 border border-dark-700/50 text-gray-300 hover:text-foreground px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2">
                <Edit3 size={16} /> Editar
              </button>
            )
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info principal */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
            <div className="flex items-start gap-6">
              <div className="w-24 h-24 bg-dark-900/50 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
                <ProductImage image={product.image} category={product.category} name={product.name} />
              </div>
              <div className="flex-1 min-w-0">
                {editing ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Nombre *" value={form.name} onChange={(v) => setField("name", v)} className="col-span-2" />
                    <Input label="Marca *" value={form.brand} onChange={(v) => setField("brand", v)} />
                    <Input label="Modelo *" value={form.model} onChange={(v) => setField("model", v)} />
                    <Input label="Año *" value={form.year} onChange={(v) => setField("year", v)} />
                    <Input label="Fabricante *" value={form.manufacturer} onChange={(v) => setField("manufacturer", v)} />
                  </div>
                ) : (
                  <>
                    <p className="text-gray-400 text-sm">Marca: <span className="text-gray-200">{product.brand}</span></p>
                    <p className="text-gray-400 text-sm">Modelo: <span className="text-gray-200">{product.model}</span></p>
                    <p className="text-gray-400 text-sm">Año: <span className="text-gray-200">{product.year}</span></p>
                    <p className="text-gray-400 text-sm">Fabricante: <span className="text-gray-200">{product.manufacturer}</span></p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Códigos */}
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
            <h3 className="text-foreground font-semibold mb-4">Códigos</h3>
            {editing ? (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Código Item *" value={form.itemCode} onChange={(v) => setField("itemCode", v)} disabled />
                <Input label="Código OEM" value={form.oemCode} onChange={(v) => setField("oemCode", v)} />
                <Input label="Código Fábrica" value={form.factoryCode} onChange={(v) => setField("factoryCode", v)} />
                <Input label="Categoría" value={form.categoryId} onChange={(v) => setField("categoryId", v)} type="select" options={filters.categories.map((c) => ({ value: String(c.id), label: c.name }))} />
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoBox label="Código Item" value={product.itemCode} />
                <InfoBox label="Código OEM" value={product.oemCode || "—"} />
                <InfoBox label="Código Fábrica" value={product.factoryCode || "—"} />
                <InfoBox label="Categoría" value={product.category || "Sin categoría"} />
                <InfoBox label="Proveedor" value={(product as any).supplierName || "—"} />
              </div>
            )}
          </div>

          {/* Precios */}
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
            <h3 className="text-foreground font-semibold mb-4">Precios</h3>
            {editing ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Input label="Precio Mayorista (Bs.) *" value={form.price1} onChange={(v) => setField("price1", v)} type="number" />
                <Input label="Precio Minorista (Bs.)" value={form.price2} onChange={(v) => setField("price2", v)} type="number" />
                <Input label="Precio Mayor (Bs.)" value={form.wholesalePrice} onChange={(v) => setField("wholesalePrice", v)} type="number" />
                <Input label="Costo (Bs.)" value={form.cost} onChange={(v) => setField("cost", v)} type="number" />
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoBox label="Precio Mayorista" value={fc(product.price1)} highlight="green" />
                <InfoBox label="Precio Minorista" value={fc(product.price2)} highlight="blue" />
                <InfoBox label="Precio Mayor" value={product.wholesalePrice ? fc(product.wholesalePrice) : "—"} />
                <InfoBox label="Costo" value={product.cost ? fc(product.cost) : "—"} />
              </div>
            )}
          </div>

          {/* Importadores */}
          {product.importers.length > 0 && (
            <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
              <h3 className="text-foreground font-semibold mb-4">Importadores</h3>
              <div className="space-y-2">
                {product.importers.map((imp) => (
                  <div key={imp.id} className="flex items-center justify-between p-3 bg-dark-900/50 rounded-xl border border-dark-700/30">
                    <div>
                      <p className="text-sm text-gray-200">{imp.name}</p>
                      {imp.city && <p className="text-xs text-gray-500">{imp.city}</p>}
                    </div>
                    {imp.phone && <p className="text-sm text-gray-400">{imp.phone}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Stock */}
        <div className="space-y-6">
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-foreground font-semibold">Stock Total</h3>
              <span className={`text-2xl font-bold ${product.stock === 0 ? "text-red-400" : product.stock <= 10 ? "text-yellow-400" : "text-green-400"}`}>
                {product.stock}
              </span>
            </div>

            {almacenes.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Truck size={12} /> Almacenes
                </p>
                <div className="space-y-1.5">
                  {almacenes.map((s) => (
                    <div key={s.locationId} className="flex items-center justify-between p-2.5 bg-dark-900/50 rounded-lg border border-dark-700/30">
                      <span className="text-sm text-gray-300">{s.locationName}</span>
                      <div className="text-right">
                        <span className={`text-sm font-bold ${s.stock === 0 ? "text-red-400" : s.stock <= s.minStock ? "text-yellow-400" : "text-green-400"}`}>
                          {s.stock}
                        </span>
                        <span className="text-xs text-gray-600 ml-1">/ {s.minStock} min</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tiendas.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Store size={12} /> Tiendas
                </p>
                <div className="space-y-1.5">
                  {tiendas.map((s) => (
                    <div key={s.locationId} className="flex items-center justify-between p-2.5 bg-dark-900/50 rounded-lg border border-dark-700/30">
                      <span className="text-sm text-gray-300">{s.locationName}</span>
                      <div className="text-right">
                        <span className={`text-sm font-bold ${s.stock === 0 ? "text-red-400" : s.stock <= s.minStock ? "text-yellow-400" : "text-green-400"}`}>
                          {s.stock}
                        </span>
                        <span className="text-xs text-gray-600 ml-1">/ {s.minStock} min</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {product.stockByLocation.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">Sin stock registrado</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", disabled, className = "", options }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; disabled?: boolean; className?: string;
  options?: { value: string; label: string }[];
}) {
  if (type === "select") {
    return (
      <div className={className}>
        <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
        <div className="relative">
          <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
            className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8 disabled:opacity-50">
            <option value="">Sin categoría</option>
            {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        </div>
      </div>
    );
  }
  return (
    <div className={className}>
      <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className="w-full px-3 py-2.5 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none disabled:opacity-50"
      />
    </div>
  );
}

function InfoBox({ label, value, highlight }: { label: string; value: string; highlight?: "green" | "blue" }) {
  const colors = { green: "text-green-400", blue: "text-blue-400" };
  return (
    <div className="p-3 bg-dark-900/50 rounded-xl border border-dark-700/30">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-sm font-medium ${highlight ? colors[highlight] : "text-gray-200"}`}>{value}</p>
    </div>
  );
}
