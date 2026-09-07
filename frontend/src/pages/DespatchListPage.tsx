import { useEffect, useMemo, useRef, useState } from "react";
import {
  ListChecks, Plus, Trash2, Printer, Image as ImageIcon, FileDown, X,
  AlertTriangle, PackageOpen,
} from "lucide-react";
import toast from "react-hot-toast";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import api from "../services/api";
import Autocomplete from "../components/ui/Autocomplete";
import { useAuthStore } from "../stores/authStore";

interface ProductLite {
  id: number; itemCode: string; name: string; brand: string;
  model: string; manufacturer: string;
}

interface LocationLite {
  id: number; name: string; type: string;
}

interface LineItem {
  uid: string; productId: number; itemCode: string; name: string;
  brand: string; model: string; manufacturer: string;
  locationId: number; locationName: string; quantity: number;
}

const STORAGE_KEY = "repuesto_despacho_list";
const SEQ_KEY = "repuesto_despacho_seq";

export default function DespatchListPage() {
  const { user } = useAuthStore();
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [locations, setLocations] = useState<LocationLite[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  const [items, setItems] = useState<LineItem[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProductLite | null>(null);
  const [locationId, setLocationId] = useState("");
  const [qty, setQty] = useState("1");
  const [confirmClear, setConfirmClear] = useState(false);

  const [showPreview, setShowPreview] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "png" | null>(null);
  const [docSeq, setDocSeq] = useState(1);
  const docRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setDocSeq(Number(localStorage.getItem(SEQ_KEY) || "1") || 1);
    } catch { /* ignore */ }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setItems(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    const load = async () => {
      try {
        const [pRes, lRes, iRes] = await Promise.all([
          api.get("/products", { params: { page: 1, limit: 1000 } }),
          api.get("/locations"),
          api.get("/inventory"),
        ]);
        const list = (pRes.data.products || []).map((p: any) => ({
          id: p.id, itemCode: p.itemCode, name: p.name,
          brand: p.brand, model: p.model, manufacturer: p.manufacturer,
        }));
        setProducts(list);
        setLocations(lRes.data.locations || []);
        const map: Record<string, number> = {};
        (Array.isArray(iRes.data) ? iRes.data : []).forEach((inv: any) => {
          map[`${inv.productId}:${inv.locationId}`] = inv.stock;
        });
        setStockMap(map);
      } catch {
        toast.error("Error al cargar productos");
      }
    };
    load();
  }, []);

  const suggestions = useMemo(
    () => products.map((p) => `${p.name} — ${p.itemCode}`),
    [products]
  );

  const availableOf = (productId: number, locId: number): number | null => {
    const s = stockMap[`${productId}:${locId}`];
    return s == null ? null : s;
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    const match = products.find((p) => `${p.name} — ${p.itemCode}` === value);
    setSelected(match || null);
  };

  const addItem = () => {
    if (!selected) { toast.error("Busca y selecciona un producto de la lista"); return; }
    const loc = locations.find((l) => l.id === Number(locationId));
    if (!loc) { toast.error("Selecciona la tienda o almacén de origen"); return; }
    const q = Number(qty);
    if (!Number.isInteger(q) || q <= 0) { toast.error("Ingresa una cantidad entera mayor a 0"); return; }

    const avail = availableOf(selected.id, loc.id);
    const warn = (newQty: number) => {
      if (avail != null && newQty > avail) toast.error(`Solo hay ${avail} disp. en ${loc.name}`);
    };

    setItems((prev) => {
      const idx = prev.findIndex((it) => it.productId === selected.id && it.locationId === loc.id);
      if (idx >= 0) {
        const current = prev[idx].quantity + q;
        warn(current);
        return prev.map((it) => (it.uid === prev[idx].uid ? { ...it, quantity: current } : it));
      }
      return [
        ...prev,
        { uid: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, productId: selected.id, itemCode: selected.itemCode, name: selected.name, brand: selected.brand, model: selected.model, manufacturer: selected.manufacturer, locationId: loc.id, locationName: loc.name, quantity: q },
      ];
    });

    setSearch(""); setSelected(null); setLocationId(""); setQty("1");
  };

  const updateQty = (uid: string, value: string) => {
    const q = Number(value);
    if (!Number.isInteger(q) || q <= 0) {
      setItems((prev) => prev.map((it) => (it.uid === uid ? { ...it, quantity: 0 } : it)));
      return;
    }
    setItems((prev) => prev.map((it) => (it.uid === uid ? { ...it, quantity: q } : it)));
  };

  const removeItem = (uid: string) => setItems((prev) => prev.filter((it) => it.uid !== uid));

  const clearAll = () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    setItems([]);
    setConfirmClear(false);
    toast.success("Lista vaciada");
  };

  const totalUnits = items.reduce((sum, it) => sum + (isNaN(it.quantity) ? 0 : it.quantity), 0);
  const today = new Date().toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const userDisplay = user?.name || user?.email || "";

  const selectedAvail = selected ? availableOf(selected.id, Number(locationId)) : null;

  const buildCanvas = () =>
    html2canvas(docRef.current!, { scale: 2, backgroundColor: "#ffffff", useCORS: true });

  const exportPdf = async () => {
    setExporting("pdf");
    try {
      const canvas = await buildCanvas();
      const img = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF("p", "mm", "a4");
      const w = 210; const h = 297;
      const ratio = canvas.width / canvas.height;
      let pw = w; let ph = w / ratio;
      if (ph > h - 12) { ph = h - 12; pw = ph * ratio; }
      pdf.addImage(img, "JPEG", (w - pw) / 2, 8, pw, ph);
      pdf.save(`despacho_${new Date().getTime()}.pdf`);
      toast.success("PDF descargado");
    } catch {
      toast.error("Error al generar el PDF");
    } finally {
      setExporting(null);
    }
  };

  const exportPng = async () => {
    setExporting("png");
    try {
      const canvas = await buildCanvas();
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `despacho_${new Date().getTime()}.png`;
      a.click();
      toast.success("Imagen descargada");
    } catch {
      toast.error("Error al generar la imagen");
    } finally {
      setExporting(null);
    }
  };

  const openPreview = () => {
    if (items.length === 0) return;
    setShowPreview(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lista de Despacho</h1>
          <p className="text-gray-400 text-sm mt-1">Arma la lista de productos a sacar, elige la tienda o almacén de origen y la cantidad, luego imprímela como PDF o imagen.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={clearAll}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
              confirmClear
                ? "bg-red-600 hover:bg-red-700 text-white border-red-600/30"
                : "text-gray-400 hover:text-red-400 hover:bg-red-500/10 border-dark-700/50 hover:border-red-500/30"
            }`}>
            <Trash2 size={14} /> {confirmClear ? "¿Vaciar lista?" : "Vaciar"}
          </button>
        </div>
      </div>

      {/* Añadir producto */}
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-4 md:p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <Autocomplete
              value={search}
              onChange={handleSearchChange}
              suggestions={suggestions}
              placeholder="Buscar producto..."
              label="Producto"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5" htmlFor="desp-origen">Sacar desde</label>
            <select id="desp-origen" value={locationId} onChange={(e) => setLocationId(e.target.value)}
              className="w-full px-3 py-2 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none">
              <option value="">Seleccionar...</option>
              {locations.map((l) => {
                const avail = selected ? availableOf(selected.id, l.id) : null;
                return (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.type === "ALMACEN" ? "Almacén" : "Tienda"}){avail != null ? ` — ${avail} disp.` : ""}
                  </option>
                );
              })}
            </select>
            {selected && locationId && (
              <p className={`text-xs mt-1 ${selectedAvail != null ? (selectedAvail > 0 ? "text-gray-500" : "text-red-400") : "text-gray-600"}`}>
                {selectedAvail != null
                  ? `Disponible: ${selectedAvail} en ${locations.find((l) => l.id === Number(locationId))?.name}`
                  : "Sin stock registrado en esa ubicación"}
              </p>
            )}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1.5" htmlFor="desp-cant">Cantidad</label>
              <input id="desp-cant" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)}
                className="w-full px-3 py-2 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
            </div>
            <button onClick={addItem}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all shrink-0">
              <Plus size={16} /> Agregar
            </button>
          </div>
        </div>
      </div>

      {/* Tabla de items */}
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-700/50 flex items-center justify-between">
          <h3 className="text-foreground font-medium">Productos a despachar ({items.length})</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{totalUnits} unidades</span>
            <button onClick={openPreview} disabled={items.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-all">
              <ListChecks size={14} /> Ver / Imprimir
            </button>
          </div>
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <PackageOpen size={40} className="text-gray-600 mb-3" />
            <p className="text-gray-500 text-sm">La lista está vacía</p>
            <p className="text-gray-600 text-xs mt-1">Agrega productos arriba para comenzar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700/50">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium w-10">N°</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Producto</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Desde</th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium w-28">Cantidad</th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium w-24">Disp.</th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium w-12"> </th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const avail = availableOf(it.productId, it.locationId);
                  const over = avail != null && it.quantity > avail;
                  return (
                    <tr key={it.uid} className="border-b border-dark-700/30 hover:bg-dark-700/30 transition-colors">
                      <td className="px-4 py-2.5 text-gray-500">{idx + 1}</td>
                      <td className="px-4 py-2.5">
                        <p className="text-foreground font-medium">{it.name}</p>
                        <p className="text-xs text-gray-500">{it.manufacturer} · {it.brand} {it.model} · {it.itemCode}</p>
                      </td>
                      <td className="px-4 py-2.5 text-gray-300 text-xs">{it.locationName}</td>
                      <td className="px-4 py-2.5">
                        <input type="number" min={1} value={it.quantity || ""}
                          onChange={(e) => updateQty(it.uid, e.target.value)}
                          className={`w-full px-2 py-1.5 text-center bg-dark-900/50 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none ${
                            over ? "border-red-500/60 text-red-400" : "border-dark-600/50 text-foreground"
                          }`} />
                      </td>
                      <td className={`px-4 py-2.5 text-center text-xs ${over ? "text-red-400 font-medium" : "text-gray-500"}`}>
                        {avail != null ? avail : "—"}
                        {over && <span className="flex items-center justify-center gap-1 mt-0.5"><AlertTriangle size={11} /> sobre stock</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => removeItem(it.uid)} title="Quitar" aria-label="Quitar producto"
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Vista previa / impresión */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="min-h-full flex items-start justify-center py-6">
            <div className="w-full max-w-3xl">
              <div className="no-print flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-foreground font-bold text-lg">Vista previa</h2>
                <div className="flex items-center gap-2">
                  <button onClick={doPrint}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm bg-dark-800 hover:bg-dark-700 text-foreground font-medium border border-dark-700/50 transition-all">
                    <Printer size={15} /> Imprimir
                  </button>
                  <button onClick={() => exportPng()} disabled={exporting !== null}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm bg-dark-800 hover:bg-dark-700 text-foreground font-medium border border-dark-700/50 transition-all disabled:opacity-50">
                    <ImageIcon size={15} /> {exporting === "png" ? "..." : "Imagen"}
                  </button>
                  <button onClick={() => exportPdf()} disabled={exporting !== null}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm bg-primary-600 hover:bg-primary-700 text-white font-medium transition-all disabled:opacity-50">
                    <FileDown size={15} /> {exporting === "pdf" ? "..." : "PDF"}
                  </button>
                  <button onClick={() => setShowPreview(false)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm bg-dark-700 hover:bg-red-500/10 text-gray-200 hover:text-red-400 font-medium border border-dark-700/50 transition-all">
                    <X size={15} /> Cerrar
                  </button>
                </div>
              </div>

              <div ref={docRef} className="despacho-doc bg-white text-black rounded-2xl shadow-2xl p-8 md:p-10">
                {/* Cabecera */}
                <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-4">
                  <div>
                    <p className="text-2xl font-bold tracking-tight">REPUESTO PRO</p>
                    <p className="text-xs text-gray-600 mt-1">Inventario y Autopartes</p>
                    <p className="text-xs text-gray-600">Av. Principal · Cochabamba - Bolivia</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold uppercase">Nota de Despacho</p>
                    <p className="text-xs text-gray-600 mt-1">N° {String(docSeq).padStart(4, "0")}</p>
                    <p className="text-xs text-gray-600">{today}</p>
                  </div>
                </div>

                {/* Datos */}
                <div className="flex flex-wrap gap-x-8 gap-y-1 py-3 text-sm border-b border-gray-300">
                  <p className="font-medium">Elaborado por: <span className="font-normal text-gray-700">{userDisplay || "—"}</span></p>
                  <p className="font-medium">Ítems: <span className="font-normal text-gray-700">{items.length}</span></p>
                  <p className="font-medium">Total unidades: <span className="font-normal text-gray-700">{totalUnits}</span></p>
                </div>

                {/* Tabla */}
                <table className="w-full border-collapse text-sm mt-4">
                  <thead>
                    <tr>
                      <th className="border border-gray-400 px-2 py-2 text-left w-8">N°</th>
                      <th className="border border-gray-400 px-2 py-2 text-left">Producto</th>
                      <th className="border border-gray-400 px-2 py-2 text-left">Código</th>
                      <th className="border border-gray-400 px-2 py-2 text-center w-40">Sacar desde</th>
                      <th className="border border-gray-400 px-2 py-2 text-center w-16">Cant.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={it.uid}>
                        <td className="border border-gray-400 px-2 py-1.5 text-center">{idx + 1}</td>
                        <td className="border border-gray-400 px-2 py-1.5">
                          <p className="font-medium">{it.name}</p>
                          <p className="text-xs text-gray-600">{it.manufacturer} · {it.brand} {it.model}</p>
                        </td>
                        <td className="border border-gray-400 px-2 py-1.5 text-xs">{it.itemCode}</td>
                        <td className="border border-gray-400 px-2 py-1.5 text-center text-xs">{it.locationName}</td>
                        <td className="border border-gray-400 px-2 py-1.5 text-center font-bold">{it.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Firmas */}
                <div className="flex justify-between gap-8 mt-16 text-sm">
                  <div className="text-center flex-1">
                    <div className="border-t border-black pt-1">Responsable de despacho</div>
                  </div>
                  <div className="text-center flex-1">
                    <div className="border-t border-black pt-1">Recibido por</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function doPrint() {
  window.print();
}