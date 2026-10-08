import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ListChecks, Plus, Trash2, Printer, Image as ImageIcon, FileDown, X,
  AlertTriangle, PackageOpen, History, Save, CheckCircle2, Ban, Eye,
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
  /** true cuando la solicitud ya descontó su origen: no vuelve a restarse. */
  origenDescontado?: boolean;
}

interface NoteItemDto {
  id: number; itemCode: string; name: string;
  manufacturer: string; brand: string; model: string;
  locationName: string; locationType: string; quantity: number;
}

interface DespatchNoteRow {
  id: number; noteNumber: string; date: string;
  userName: string; totalUnits: number; status: "EMITIDA" | "ENTREGADA" | "ANULADA";
  destinationId: number | null; destinationName: string | null;
  requests: Array<{ id: number; status: string; quantity: number; product: { name: string; itemCode: string } }>;
  entregadoA: string | null; entregadoAt: string | null;
  observacion: string | null; cancelledReason: string | null;
  createdAt: string; items: NoteItemDto[];
}

/** Solicitud que se puede cumplir con un despacho. */
interface PendingRequest {
  id: number; quantity: number; status: string; date: string;
  note: string | null; source: string | null;
  product: { id: number; name: string; itemCode: string; brand: string; model: string };
  destino: { id: number; name: string; type: string };
  origen: { id: number; name: string; type: string } | null;
  originId: number | null;
  disponible: number; suficiente: boolean; yaDescontado: boolean;
  solicitadoPor: { id: number; name: string } | null;
}

interface DocData {
  number: string;
  dateLabel: string;
  elaboradoPor: string;
  entregadoA: string | null;
  items: Array<Pick<LineItem, "name" | "manufacturer" | "brand" | "model" | "itemCode" | "locationName" | "quantity">>;
}

const STORAGE_KEY = "repuesto_despacho_list";
const SEQ_KEY = "repuesto_despacho_seq";

const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

const fmtShort = (d: string | Date) =>
  new Date(d).toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric" });

const StatusBadge = ({ status }: { status: DespatchNoteRow["status"] }) => {
  const styles = {
    EMITIDA: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    ENTREGADA: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    ANULADA: "bg-red-500/10 text-red-400 border-red-500/30",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${styles[status]}`}>
      {status === "ENTREGADA" && <CheckCircle2 size={11} />}
      {status === "ANULADA" && <Ban size={11} />}
      {status}
    </span>
  );
};

export default function DespatchListPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";

  const [products, setProducts] = useState<ProductLite[]>([]);
  const [locations, setLocations] = useState<LocationLite[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  const [items, setItems] = useState<LineItem[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProductLite | null>(null);
  const [locationId, setLocationId] = useState("");
  const [qty, setQty] = useState("1");
  const [confirmClear, setConfirmClear] = useState(false);
  const [observacion, setObservacion] = useState("");
  const [saving, setSaving] = useState(false);

  // Tienda destino de la nota y solicitudes que cumple.
  const [destinationId, setDestinationId] = useState("");
  const [requestIds, setRequestIds] = useState<number[]>([]);
  const [showFromRequests, setShowFromRequests] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [filterDestination, setFilterDestination] = useState("");
  const [pickedRequests, setPickedRequests] = useState<number[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  const [tab, setTab] = useState<"nueva" | "historial">("nueva");
  const [notes, setNotes] = useState<DespatchNoteRow[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("TODOS");
  const [loadingNotes, setLoadingNotes] = useState(false);

  const [preview, setPreview] = useState<DocData | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "png" | null>(null);
  const [docSeq, setDocSeq] = useState(1);
  const docRef = useRef<HTMLDivElement>(null);

  const [deliverTo, setDeliverTo] = useState("");
  const [deliverDestination, setDeliverDestination] = useState("");
  const [delivering, setDelivering] = useState(false);
  const [deliverNote, setDeliverNote] = useState<DespatchNoteRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelNote, setCancelNote] = useState<DespatchNoteRow | null>(null);

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

  const refreshStock = useCallback(async () => {
    try {
      const iRes = await api.get("/inventory");
      const map: Record<string, number> = {};
      (Array.isArray(iRes.data) ? iRes.data : []).forEach((inv: any) => {
        map[`${inv.productId}:${inv.locationId}`] = inv.stock;
      });
      setStockMap(map);
    } catch {
      toast.error("Error al refrescar stock");
    }
  }, []);

  const loadNotes = useCallback(async () => {
    setLoadingNotes(true);
    try {
      const params: any = { limit: 200 };
      if (historyStatus !== "TODOS") params.status = historyStatus;
      const res = await api.get("/despatch-notes", { params });
      setNotes(res.data.notes || []);
    } catch {
      toast.error("Error al cargar el historial");
    } finally {
      setLoadingNotes(false);
    }
  }, [historyStatus]);

  useEffect(() => {
    if (isAdmin) loadNotes();
  }, [loadNotes, isAdmin]);

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
    const avisa = (newQty: number, origenYaDescontado = false) => {
      // Aca fuera del setState: un updater no debe tener efectos secundarios,
      // React lo puede ejecutar dos veces y se duplicaria el toast.
      if (origenYaDescontado) return;
      if (avail != null && newQty > avail) toast.error(`Solo hay ${avail} disp. en ${loc.name}`);
    };

    const idx = items.findIndex((it) => it.productId === selected.id && it.locationId === loc.id);
    if (idx >= 0) {
      const current = items[idx].quantity + q;
      avisa(current, items[idx].origenDescontado);
      setItems((prev) => prev.map((it) => (it.uid === items[idx].uid ? { ...it, quantity: current } : it)));
    } else {
      avisa(q);
      setItems((prev) => [
        ...prev,
        { uid: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, productId: selected.id, itemCode: selected.itemCode, name: selected.name, brand: selected.brand, model: selected.model, manufacturer: selected.manufacturer, locationId: loc.id, locationName: loc.name, quantity: q },
      ]);
    }

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
  const activeItems = items.filter((it) => it.quantity > 0);

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
      pdf.save(`despacho_${preview?.number || ""}.pdf`);
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
      a.download = `despacho_${preview?.number || ""}.png`;
      a.click();
      toast.success("Imagen descargada");
    } catch {
      toast.error("Error al generar la imagen");
    } finally {
      setExporting(null);
    }
  };

  const openPreview = async () => {
    if (activeItems.length === 0) return;
    await refreshStock();
    setPreview({
      number: String(docSeq).padStart(4, "0"),
      dateLabel: fmtDate(new Date()),
      elaboradoPor: userDisplay,
      entregadoA: null,
      items: activeItems,
    });
    const next = docSeq + 1;
    setDocSeq(next);
    try { localStorage.setItem(SEQ_KEY, String(next)); } catch { /* ignore */ }
  };

  const openNotePreview = (note: DespatchNoteRow) => {
    setPreview({
      number: note.noteNumber,
      dateLabel: fmtDate(note.date),
      elaboradoPor: note.userName,
      entregadoA: note.entregadoA,
      items: note.items,
    });
  };

  const tiendas = useMemo(() => locations.filter((l) => l.type === "TIENDA"), [locations]);

  const saveNote = async () => {
    if (activeItems.length === 0) return;
    if (requestIds.length > 0 && !destinationId) {
      toast.error("Indica la tienda destino de la nota");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post("/despatch-notes", {
        items: activeItems.map((it) => ({ productId: it.productId, quantity: it.quantity, locationId: it.locationId })),
        destinationId: destinationId ? Number(destinationId) : undefined,
        requestIds: requestIds.length ? requestIds : undefined,
        observacion: observacion.trim() || undefined,
      });
      toast.success(`Nota ${res.data.note.noteNumber} guardada (${res.data.note.totalUnits} unidades)`);
      setItems([]);
      setObservacion("");
      setDestinationId("");
      setRequestIds([]);
      if (isAdmin) loadNotes();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Error al guardar la nota");
    } finally {
      setSaving(false);
    }
  };

  /** Carga las solicitudes elegidas como ítems de la nota, agrupadas por tienda destino. */
  const loadFromRequests = async (open = true) => {
    setShowFromRequests(open);
    if (!open) return;
    setLoadingRequests(true);
    setPickedRequests([]);
    try {
      const res = await api.get("/despatch-notes/pending-requests", {
        params: filterDestination ? { destinationId: filterDestination } : undefined,
      });
      setPendingRequests(res.data.requests || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Error al cargar las solicitudes");
    } finally {
      setLoadingRequests(false);
    }
  };

  const togglePickedRequest = (id: number) => {
    setPickedRequests((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const applyRequestsToNote = () => {
    const elegidas = pendingRequests.filter((r) => pickedRequests.includes(r.id));
    if (elegidas.length === 0) return;

    // Una nota por tienda: no se puede mezclar destinos.
    const destinos = new Set(elegidas.map((r) => r.destino.id));
    if (destinos.size > 1) {
      toast.error("Elegí solicitudes de una sola tienda por nota");
      return;
    }
    const sinStock = elegidas.filter((r) => !r.suficiente);
    if (sinStock.length > 0) {
      toast.error(
        `Sin stock en origen para: ${sinStock.map((r) => r.product.name).join(", ")}. quitá esas solicitudes o cargá el stock.`
      );
      return;
    }

    setDestinationId(String(elegidas[0].destino.id));
    setRequestIds(elegidas.map((r) => r.id));
    setItems(
      elegidas.map((r) => ({
        uid: `req-${r.id}`,
        productId: r.product.id,
        itemCode: r.product.itemCode,
        name: r.product.name,
        brand: r.product.brand,
        model: r.product.model,
        manufacturer: "",
        locationId: r.originId as number,
        locationName: r.origen?.name ?? "",
        quantity: r.quantity,
        origenDescontado: r.yaDescontado,
      }))
    );
    setObservacion(
      (prev) => prev.trim() || `Satisfacción de ${elegidas.length} solicitud(es): #${elegidas.map((r) => r.id).join(", #")}`
    );
    setShowFromRequests(false);
    setTab("nueva");
    toast.success(`${elegidas.length} solicitud(es) cargadas a la nota`);
  };

  const submitDeliver = async () => {
    if (!deliverNote) return;
    if (!deliverTo.trim()) { toast.error("Indica a quién se entregó"); return; }
    if (!deliverDestination) { toast.error("Indica la tienda destino"); return; }
    setDelivering(true);
    try {
      const res = await api.patch(`/despatch-notes/${deliverNote.id}`, {
        entregadoA: deliverTo.trim(),
        destinationId: Number(deliverDestination),
      });
      const cerradas = res.data.solicitudesCerradas as number[] | undefined;
      toast.success(
        cerradas?.length
          ? `${res.data.noteNumber} entregada a ${res.data.entregadoA}. Solicitudes #${cerradas.join(", #")} a la espera de confirmación.`
          : `${res.data.noteNumber} entregada a ${res.data.entregadoA}`
      );
      setDeliverNote(null);
      setDeliverTo("");
      setDeliverDestination("");
      loadNotes();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Error al marcar entregada");
    } finally {
      setDelivering(false);
    }
  };

  const submitCancel = async () => {
    if (!cancelNote) return;
    setCancelling(true);
    try {
      const res = await api.post(`/despatch-notes/${cancelNote.id}/cancel`, {
        reason: cancelReason.trim() || undefined,
      });
      toast.success(`${res.data.noteNumber} anulada`);
      setCancelNote(null);
      setCancelReason("");
      loadNotes();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Error al anular la nota");
    } finally {
      setCancelling(false);
    }
  };

  const filteredNotes = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.noteNumber.toLowerCase().includes(q) ||
        n.userName.toLowerCase().includes(q) ||
        (n.entregadoA ?? "").toLowerCase().includes(q) ||
        n.items.some(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            i.itemCode.toLowerCase().includes(q) ||
            i.brand.toLowerCase().includes(q)
        )
    );
  }, [notes, historySearch]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          {!embedded && <h1 className="text-2xl font-bold text-foreground">Lista de Despacho</h1>}
          <p className="text-gray-400 text-sm mt-1">Carga las solicitudes que vas a despachar o arma la lista a mano. Al entregarla, el stock sale del origen y entra a la tienda destino.</p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "nueva" && (
            <>
              <button onClick={() => loadFromRequests(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-primary-400 hover:bg-primary-500/10 border border-primary-500/30 transition-all">
                <ListChecks size={14} /> Cargar desde Solicitudes
              </button>
              <button onClick={clearAll}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                  confirmClear
                    ? "bg-red-600 hover:bg-red-700 text-white border-red-600/30"
                    : "text-gray-400 hover:text-red-400 hover:bg-red-500/10 border-dark-700/50 hover:border-red-500/30"
                }`}>
                <Trash2 size={14} /> {confirmClear ? "¿Vaciar lista?" : "Vaciar"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 border border-dark-700/50 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("nueva")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "nueva" ? "bg-dark-700/70 text-foreground" : "text-gray-400 hover:text-foreground"}`}>
          <ListChecks size={15} /> Nueva lista
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab("historial")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "historial" ? "bg-dark-700/70 text-foreground" : "text-gray-400 hover:text-foreground"}`}>
            <History size={15} /> Historial
          </button>
        )}
      </div>

      {tab === "nueva" ? (
        <>
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
            <div className="px-4 py-3 border-b border-dark-700/50 flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-foreground font-medium">Productos a despachar ({activeItems.length})</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{totalUnits} unidades</span>
                <button onClick={openPreview} disabled={activeItems.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-all">
                  <ListChecks size={14} /> Ver / Imprimir
                </button>
              </div>
            </div>
            {isAdmin && (
              <div className="px-4 py-2.5 border-b border-dark-700/50 flex items-center gap-2 flex-wrap bg-dark-900/30">
                <div className="min-w-[190px]">
                  <select
                    value={destinationId}
                    onChange={(e) => setDestinationId(e.target.value)}
                    className={`w-full px-3 py-1.5 bg-dark-900/50 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none ${
                      requestIds.length > 0 && !destinationId ? "border-amber-500/50 text-amber-400" : "border-dark-600/50 text-foreground"
                    }`}
                    aria-label="Tienda destino de la nota"
                  >
                    <option value="">Tienda destino (opcional)</option>
                    {tiendas.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                {requestIds.length > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary-500/10 text-primary-400 border border-primary-500/30 rounded-lg text-xs font-medium whitespace-nowrap">
                    <ListChecks size={13} /> {requestIds.length} solicitud(es): #{requestIds.join(", #")}
                  </span>
                )}
                <input value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={300}
                  placeholder="Observación de la nota (opcional)"
                  className="flex-1 min-w-[200px] px-3 py-1.5 bg-dark-900/50 border border-dark-600/50 rounded-lg text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                <button onClick={saveNote} disabled={activeItems.length === 0 || saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-all">
                  <Save size={14} /> {saving ? "Guardando..." : "Guardar Nota"}
                </button>
              </div>
            )}
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
                      // Si la solicitud ya descontó su origen, esa mercadería ya
                      // salió de ahí: el stock actual no dice nada y marcarla
                      // "sobre stock" sería un aviso falso.
                      const over = !it.origenDescontado && avail != null && it.quantity > avail;
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
                            {it.origenDescontado ? (
                              <span className="text-gray-500" title="El origen ya fue descontado al cobrar la venta; la mercadería ya salió">ya salió</span>
                            ) : avail != null ? avail : "—"}
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
        </>
      ) : (
        /* ---------- Historial ---------- */
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-700/50 flex items-center justify-between gap-2 flex-wrap">
            <input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Buscar por N°, producto, entregado a..."
              className="flex-1 min-w-[220px] px-3 py-2 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
            <select value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value)}
              className="px-3 py-2 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none">
              <option value="TODOS">Todos los estados</option>
              <option value="EMITIDA">Emitidas</option>
              <option value="ENTREGADA">Entregadas</option>
              <option value="ANULADA">Anuladas</option>
            </select>
          </div>

          {loadingNotes ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <p className="text-gray-500 text-sm">Cargando historial...</p>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <History size={40} className="text-gray-600 mb-3" />
              <p className="text-gray-500 text-sm">No hay notas de despacho</p>
              <p className="text-gray-600 text-xs mt-1">Guarda una nota desde la pestaña "Nueva lista"</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700/50">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">N°</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Fecha</th>
                    <th className="text-center px-4 py-3 text-gray-400 font-medium">Ítems</th>
                    <th className="text-center px-4 py-3 text-gray-400 font-medium">Unidades</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Tienda destino</th>
                    <th className="text-center px-4 py-3 text-gray-400 font-medium">Estado</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Elaborado por</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Entregado a</th>
                    <th className="text-center px-4 py-3 text-gray-400 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNotes.map((n) => (
                    <tr key={n.id} className={`border-b border-dark-700/30 hover:bg-dark-700/30 transition-colors ${n.status === "ANULADA" ? "opacity-60" : ""}`}>
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {n.noteNumber}
                        {n.requests.length > 0 && (
                          <span className="block text-[11px] text-primary-400">
                            Solicitudes #{n.requests.map((r) => r.id).join(", #")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-300">{fmtShort(n.date)}</td>
                      <td className="px-4 py-2.5 text-center text-gray-300">{n.items.length}</td>
                      <td className="px-4 py-2.5 text-center text-gray-300">{n.totalUnits}</td>
                      <td className="px-4 py-2.5 text-gray-300">{n.destinationName ?? "—"}</td>
                      <td className="px-4 py-2.5 text-center"><StatusBadge status={n.status} /></td>
                      <td className="px-4 py-2.5 text-gray-300">{n.userName}</td>
                      <td className="px-4 py-2.5 text-gray-300">{n.entregadoA ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openNotePreview(n)} title="Ver / Imprimir" aria-label="Ver nota"
                            className="p-1.5 text-gray-400 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg transition-all">
                            <Eye size={15} />
                          </button>
                          {n.status === "EMITIDA" && (
                            <button
                              onClick={() => {
                                setDeliverNote(n);
                                setDeliverDestination(n.destinationId ? String(n.destinationId) : "");
                              }}
                              title="Marcar entregada" aria-label="Marcar entregada"
                              className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all">
                              <CheckCircle2 size={15} />
                            </button>
                          )}
                          {n.status !== "ANULADA" && (
                            <button onClick={() => setCancelNote(n)} title="Anular" aria-label="Anular nota"
                              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                              <Ban size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: cargar solicitudes a la nota */}
      {showFromRequests && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="min-h-full flex items-center justify-center py-6">
            <div className="w-full max-w-3xl bg-dark-800 border border-dark-700 rounded-2xl shadow-2xl">
              <div className="flex items-start justify-between gap-3 p-6 pb-4">
                <div>
                  <h3 className="text-foreground font-bold text-lg">Cargar desde Solicitudes</h3>
                  <p className="text-gray-400 text-sm mt-1">
                    Elegí las solicitudes a cumplir. La nota se arma sola con el producto, la cantidad y el origen.
                  </p>
                </div>
                <button onClick={() => setShowFromRequests(false)} aria-label="Cerrar"
                  className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg transition-all">
                  <X size={16} />
                </button>
              </div>

              <div className="px-6 pb-4 flex items-center gap-2 flex-wrap">
                <select
                  value={filterDestination}
                  onChange={(e) => { setFilterDestination(e.target.value); setPickedRequests([]); }}
                  aria-label="Filtrar por tienda destino"
                  className="px-3 py-1.5 bg-dark-900/50 border border-dark-600/50 rounded-lg text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  <option value="">Todas las tiendas</option>
                  {tiendas.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button onClick={() => loadFromRequests(true)} disabled={loadingRequests}
                  className="px-3 py-1.5 bg-dark-700 hover:bg-dark-600 disabled:opacity-50 text-foreground border border-dark-700 rounded-lg text-xs font-medium transition-all">
                  {loadingRequests ? "Actualizando..." : "Actualizar"}
                </button>
                {pickedRequests.length > 0 && (
                  <button onClick={() => setPickedRequests([])}
                    className="px-3 py-1.5 text-gray-400 hover:text-foreground text-xs font-medium transition-all">
                    Quitar selección
                  </button>
                )}
                <span className="text-xs text-gray-500 ml-auto">
                  {pickedRequests.length} seleccionada(s) · una nota por tienda
                </span>
              </div>

              <div className="px-6 pb-6 max-h-[50vh] overflow-y-auto border-t border-dark-700/50">
                {loadingRequests ? (
                  <div className="flex items-center justify-center py-10 text-gray-400 text-sm">Cargando solicitudes...</div>
                ) : pendingRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <PackageOpen size={28} className="text-gray-600 mb-2" />
                    <p className="text-gray-400 text-sm">No hay solicitudes pendientes de despacho.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm mt-2">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-dark-700/50">
                        <th className="w-10 py-2"></th>
                        <th className="py-2">#</th>
                        <th className="py-2">Producto</th>
                        <th className="py-2 text-right">Cant.</th>
                        <th className="py-2">Origen</th>
                        <th className="py-2 text-right">Disponible</th>
                        <th className="py-2">Tienda destino</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingRequests.map((r) => (
                        <tr
                          key={r.id}
                          className={`border-b border-dark-700/30 cursor-pointer transition-colors ${
                            pickedRequests.includes(r.id) ? "bg-primary-500/10" : "hover:bg-dark-700/20"
                          }`}
                          onClick={() => togglePickedRequest(r.id)}
                        >
                          <td className="py-2">
                            <input type="checkbox" checked={pickedRequests.includes(r.id)} readOnly
                              aria-label={`Seleccionar solicitud ${r.id}`} className="accent-primary-600" />
                          </td>
                          <td className="py-2 text-gray-400">{r.id}</td>
                          <td className="py-2 text-foreground">
                            {r.product.name}
                            <span className="block text-xs text-gray-500">{r.product.itemCode}</span>
                          </td>
                          <td className="py-2 text-right text-foreground">{r.quantity}</td>
                          <td className="py-2 text-gray-400">{r.origen?.name ?? "—"}</td>
                          <td className={`py-2 text-right ${r.yaDescontado ? "text-gray-500" : r.suficiente ? "text-emerald-400" : "text-red-400"}`}>
                            {r.yaDescontado ? "ya salió" : r.disponible}
                          </td>
                          <td className="py-2 text-gray-400">{r.destino.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="flex justify-end gap-2 px-6 py-4 border-t border-dark-700/50">
                <button onClick={() => setShowFromRequests(false)}
                  className="px-4 py-2 rounded-xl text-sm bg-dark-700 hover:bg-dark-600 text-foreground border border-dark-700 transition-all">
                  Cancelar
                </button>
                <button onClick={applyRequestsToNote} disabled={pickedRequests.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium transition-all">
                  <ListChecks size={15} /> Cargar a la nota
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: marcar entregada */}
      {deliverNote && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="min-h-full flex items-center justify-center py-6">
            <div className="w-full max-w-md bg-dark-800 border border-dark-700 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-foreground font-bold text-lg">Marcar entregada</h3>
                  <p className="text-gray-400 text-sm mt-1">Nota {deliverNote.noteNumber} · {deliverNote.totalUnits} unidades</p>
                </div>
                <button onClick={() => setDeliverNote(null)} className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg transition-all">
                  <X size={16} />
                </button>
              </div>
              <label className="block text-xs text-gray-400 mt-4 mb-1.5" htmlFor="entregado-destino">Tienda destino del stock (obligatorio)</label>
              <select id="entregado-destino" value={deliverDestination} onChange={(e) => setDeliverDestination(e.target.value)}
                className="w-full px-3 py-2 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                <option value="">Selecciona la tienda que recibe...</option>
                {tiendas.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1.5">
                Las solicitudes que nacieron de una venta ya salieron de su origen al cobrarse,
así que acá solo se suma al destino. Las demás se descuentan del origen de cada
ítem. Si no hay stock suficiente, la entrega se rechaza.
              </p>
              {deliverNote.requests.length > 0 && (
                <div className="mt-3 px-3 py-2 bg-primary-500/10 border border-primary-500/30 rounded-xl">
                  <p className="text-xs text-primary-400">
                    Al entregar, las solicitudes #{deliverNote.requests.map((r) => r.id).join(", #")} pasan a
                    ENTREGADO y quien las pidió recibe el aviso para confirmar la recepción.
                  </p>
                </div>
              )}
              <label className="block text-xs text-gray-400 mt-4 mb-1.5" htmlFor="entregado-a">¿A quién se entregó? (obligatorio)</label>
              <input id="entregado-a" value={deliverTo} onChange={(e) => setDeliverTo(e.target.value)} autoFocus
                placeholder="Nombre del que recibe"
                className="w-full px-3 py-2 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setDeliverNote(null)}
                  className="px-4 py-2 rounded-xl text-sm bg-dark-700 hover:bg-dark-600 text-foreground border border-dark-700 transition-all">
                  Cancelar
                </button>
                <button onClick={submitDeliver} disabled={delivering}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium transition-all">
                  <CheckCircle2 size={15} /> {delivering ? "Guardando..." : "Confirmar entrega"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: anular */}
      {cancelNote && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="min-h-full flex items-center justify-center py-6">
            <div className="w-full max-w-md bg-dark-800 border border-dark-700 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-foreground font-bold text-lg">Anular nota {cancelNote.noteNumber}</h3>
                  <p className="text-gray-400 text-sm mt-1">La nota quedará anulada en el historial.</p>
                </div>
                <button onClick={() => setCancelNote(null)} className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg transition-all">
                  <X size={16} />
                </button>
              </div>
              <label className="block text-xs text-gray-400 mt-4 mb-1.5" htmlFor="cancel-reason">Motivo (opcional)</label>
              <textarea id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3}
                placeholder="Ej.: lista mal armada, cliente canceló..."
                className="w-full px-3 py-2 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none" />
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setCancelNote(null)}
                  className="px-4 py-2 rounded-xl text-sm bg-dark-700 hover:bg-dark-600 text-foreground border border-dark-700 transition-all">
                  Cancelar
                </button>
                <button onClick={submitCancel} disabled={cancelling}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium transition-all">
                  <Ban size={15} /> {cancelling ? "Anulando..." : "Anular nota"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vista previa / impresión */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="min-h-full flex items-start justify-center py-6">
            <div className="w-full max-w-3xl">
              <div className="no-print flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-foreground font-bold text-lg">Vista previa · {preview.number}</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => window.print()}
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
                  <button onClick={() => setPreview(null)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm bg-dark-700 hover:bg-red-500/10 text-gray-200 hover:text-red-400 font-medium border border-dark-700/50 transition-all">
                    <X size={15} /> Cerrar
                  </button>
                </div>
              </div>

              <div ref={docRef} className="despacho-doc bg-white text-black rounded-2xl shadow-2xl p-8 md:p-10">
                {/* Cabecera */}
                <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-4">
                  <div>
                    <p className="text-2xl font-bold tracking-tight">SHIBUMI</p>
                    <p className="text-xs text-gray-600 mt-1">Inventario y Autopartes</p>
                    <p className="text-xs text-gray-600">Av. Principal · Cochabamba - Bolivia</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold uppercase">Nota de Despacho</p>
                    <p className="text-xs text-gray-600 mt-1">N° {preview.number}</p>
                    <p className="text-xs text-gray-600">{preview.dateLabel}</p>
                  </div>
                </div>

                {/* Datos */}
                <div className="flex flex-wrap gap-x-8 gap-y-1 py-3 text-sm border-b border-gray-300">
                  <p className="font-medium">Elaborado por: <span className="font-normal text-gray-700">{preview.elaboradoPor || "—"}</span></p>
                  <p className="font-medium">Ítems: <span className="font-normal text-gray-700">{preview.items.length}</span></p>
                  <p className="font-medium">Total unidades: <span className="font-normal text-gray-700">{preview.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)}</span></p>
                  {preview.entregadoA && (
                    <p className="font-medium">Recibido por: <span className="font-normal text-gray-700">{preview.entregadoA}</span></p>
                  )}
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
                    {preview.items.map((it, idx) => (
                      <tr key={idx}>
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