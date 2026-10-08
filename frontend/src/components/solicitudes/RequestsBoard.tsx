import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, MapPin, ClipboardList } from "lucide-react";
import api from "../../services/api";
import EmptyState from "../ui/EmptyState";
import { STATUS_CONFIG, SOURCE_CONFIG, REQUEST_STATUSES } from "../../constants/requests";

/**
 * Tablero visual del circuito de solicitudes.
 *
 * Muestra, columna por estado, en qué paso está cada solicitud: si todavía no
 * la tomó nadie, si ya salió, si llegó. Es una lectura, no una acción: los
 * cambios se siguen haciendo en la lista y en Despachos, y este tablero los
 * refleja solo (se refresca cada 30 s mientras la pestaña esté visible).
 */
interface BoardRequest {
  id: number;
  quantity: number;
  status: string;
  date: string;
  note: string | null;
  source: string;
  despatchNote?: { id: number; noteNumber: string; status: string } | null;
  product: { id: number; name: string; itemCode: string };
  location: { id: number; name: string; type: string };
  fromLocation?: { id: number; name: string; type: string } | null;
  requestedBy: { id: number; name: string };
}

const REFRESH_MS = 30000;
const FETCH_LIMIT = 100;

export default function RequestsBoard() {
  const [items, setItems] = useState<BoardRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [showCancelados, setShowCancelados] = useState(false);

  const fetchBoard = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const res = await api.get("/requests", { params: { page: 1, limit: FETCH_LIMIT } });
      setItems(Array.isArray(res.data?.requests) ? res.data.requests : []);
      setTotal(res.data?.pagination?.total ?? 0);
      setUpdatedAt(new Date());
    } catch {
      // Sin toast: el tablero se refresca solo y un fallo puntual no debe
      // pisar lo que el usuario esté mirando en la lista.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoard(true);
    const interval = setInterval(() => {
      if (!document.hidden) fetchBoard();
    }, REFRESH_MS);
    const onVisibility = () => {
      if (!document.hidden) fetchBoard();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchBoard]);

  const porEstado = useMemo(() => {
    const mapa: Record<string, BoardRequest[]> = {};
    for (const r of items) {
      (mapa[r.status] ??= []).push(r);
    }
    for (const lista of Object.values(mapa)) {
      lista.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return mapa;
  }, [items]);

  // Un estado que el tablero no conoce no se tira al piso: se muestra en su
  // propia columna para que se note que algo cambió y hay que mirarlo.
  const columnas = useMemo(() => {
    const conocidas = [...REQUEST_STATUSES];
    const desconocidas = Object.keys(porEstado).filter(
      (s) => !conocidas.includes(s) && s !== "CANCELADO",
    );
    return [...conocidas, ...desconocidas];
  }, [porEstado]);

  const canceladas = porEstado.CANCELADO?.length ?? 0;
  const enCurso = items.length - canceladas;

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16" role="status" aria-label="Cargando tablero">
        <RefreshCw size={22} className="text-gray-500 animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No hay solicitudes en los últimos 30 días"
        description="Cuando una tienda pida un producto aparecerá acá, por el paso en el que esté."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-400">
          <span className="text-foreground font-medium">{enCurso}</span> en curso
          {canceladas > 0 && (
            <>
              {" · "}
              <span className="text-red-400">{canceladas}</span> canceladas
            </>
          )}
        </p>
        <div className="flex items-center gap-3">
          {total > items.length && (
            <p className="text-xs text-yellow-400/80">
              Mostrando {items.length} de {total} solicitudes
            </p>
          )}
          <p className="text-xs text-gray-500">
            {updatedAt ? `Actualizado ${updatedAt.toLocaleTimeString("es-BO")}` : "—"}
          </p>
          <button
            onClick={() => fetchBoard()}
            className="p-2 rounded-lg bg-dark-900/50 border border-dark-600/50 text-gray-400 hover:text-foreground transition-all"
            title="Actualizar ahora"
            aria-label="Actualizar tablero"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {columnas.map((estado) => {
          const cfg = STATUS_CONFIG[estado] || {
            label: estado,
            color: "text-gray-400",
            bg: "bg-dark-700/50 border-dark-600/50",
            icon: ClipboardList,
          };
          const Icon = cfg.icon;
          const lista = porEstado[estado] || [];
          return (
            <section
              key={estado}
              aria-label={`${cfg.label}: ${lista.length} solicitudes`}
              className="flex flex-col rounded-xl border border-dark-700/50 overflow-hidden bg-dark-900/30"
            >
              <div className={`flex items-center gap-2 px-3 py-2.5 border-b ${cfg.bg}`}>
                <Icon size={14} className={cfg.color} />
                <h3 className={`text-xs font-semibold truncate ${cfg.color}`}>{cfg.label}</h3>
                <span className="ml-auto text-[11px] font-bold text-foreground bg-dark-950/60 rounded-full px-2 py-0.5">
                  {lista.length}
                </span>
              </div>
              <ul className="flex-1 space-y-2 p-2.5 min-h-[120px] max-h-[60vh] overflow-y-auto">
                {lista.length === 0 && (
                  <li className="text-[11px] text-gray-600 text-center py-6">Sin solicitudes</li>
                )}
                {lista.map((r) => {
                  const source = SOURCE_CONFIG[r.source] || SOURCE_CONFIG.MANUAL;
                  return (
                    <li
                      key={r.id}
                      className="bg-dark-800/60 border border-dark-700/50 rounded-lg p-2.5 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-foreground leading-snug" title={r.product.name}>
                          {r.product.name}
                        </p>
                        <span className="shrink-0 text-xs font-bold text-foreground bg-dark-950/70 border border-dark-600/60 rounded-md px-1.5 py-0.5">
                          x{r.quantity}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500">{r.product.itemCode}</p>
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <MapPin size={12} className="shrink-0 text-gray-500" />
                        <span className="truncate" title={`${r.fromLocation?.name || "—"} → ${r.location.name}`}>
                          {r.fromLocation?.name || "—"} → {r.location.name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
                        <span className="truncate" title={r.requestedBy.name}>{r.requestedBy.name}</span>
                        <span className="shrink-0">{new Date(r.date).toLocaleDateString("es-BO")}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${source.className}`}>
                          {source.label}
                        </span>
                        {r.despatchNote && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded border border-primary-500/30 bg-primary-500/10 text-primary-400">
                            Nota {r.despatchNote.noteNumber}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {canceladas > 0 && (
        <div className="rounded-xl border border-dark-700/50 bg-dark-900/30 overflow-hidden">
          <button
            onClick={() => setShowCancelados((v) => !v)}
            aria-expanded={showCancelados}
            className="w-full flex items-center gap-2 px-4 py-3 text-left bg-red-500/5 border-b border-red-500/20 hover:bg-red-500/10 transition-colors"
          >
            <span className="text-xs font-semibold text-red-400">Canceladas</span>
            <span className="text-[11px] font-bold text-red-400 bg-red-500/15 rounded-full px-2 py-0.5">
              {canceladas}
            </span>
            <span className="ml-auto text-xs text-gray-500">{showCancelados ? "Ocultar" : "Ver"}</span>
          </button>
          {showCancelados && (
            <ul className="p-2.5 space-y-2">
              {(porEstado.CANCELADO || []).map((r) => {
                const source = SOURCE_CONFIG[r.source] || SOURCE_CONFIG.MANUAL;
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm bg-dark-800/40 border border-dark-700/40 rounded-lg px-3 py-2">
                    <span className="text-foreground">{r.product.name}</span>
                    <span className="text-xs text-gray-500">{r.product.itemCode}</span>
                    <span className="text-xs text-gray-400">x{r.quantity}</span>
                    <span className="text-xs text-gray-500">
                      {r.fromLocation?.name || "—"} → {r.location.name}
                    </span>
                    <span className={`ml-auto px-1.5 py-0.5 text-[10px] font-medium rounded border ${source.className}`}>
                      {source.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
