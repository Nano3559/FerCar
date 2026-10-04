import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Settings2, GripVertical, Eye, EyeOff, Check, X, ChevronUp, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../services/api";
import { useAuthStore } from "../../stores/authStore";

interface ColumnManagerProps {
  module: string;
  columns: string[];
  onVisibleChange: (visible: string[]) => void;
}

import {
  applyColumnMigration,
  resolveVisibleColumns as resolveColumns,
  migrateCols,
  latestMigrationVersion,
  insertAtPreferredIndex,
  swapAt,
  indexHints,
} from "./columnMigration";

// La logica de preferencia (renombres, migraciones de columnas nuevas) vive en
// columnMigration.ts para poder probarla sin montar React ni localStorage.

export { migrateCols, applyColumnMigration, insertAtPreferredIndex, swapAt, indexHints };

type Tab = "visible" | "all";

/** Version de migracion ya aplicada a la preferencia de este modulo. */
export const readMigrationVersion = (module: string): number => {
  try {
    const raw = Number(localStorage.getItem(`columns_v_${module}`));
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  } catch {
    return 0;
  }
};

const STORAGE_KEY = (m: string) => `columns_${m}`;
const VERSION_KEY = (m: string) => `columns_v_${m}`;

/** Escribe lista y version juntas. */
const persistColumns = (module: string, cols: string[], version: number) => {
  try {
    localStorage.setItem(STORAGE_KEY(module), JSON.stringify(cols));
    localStorage.setItem(VERSION_KEY(module), String(version));
    const prefs = JSON.parse(localStorage.getItem("columnPrefs") || "{}");
    prefs[module] = cols;
    localStorage.setItem("columnPrefs", JSON.stringify(prefs));
  } catch {
    // Sin localStorage la app sigue funcionando, solo no se recuerda la eleccion.
  }
};

/**
 * Resuelve que columnas mostrar y deja el resultado YA PERSISTIDO.
 *
 * Que persista es lo importante y lo que faltaba: la version se marcaba solo al
 * abrir el gestor de columnas, pero la tabla se arma al montar la pagina, que
 * pasa antes. Resultado: el usuario ocultaba "Nota", guardaba, y al recargar la
 * pagina la migracion volvia a correr (version sin marcar) y la re-agregaba sola.
 * Persistir aqui cierra ese ciclo: la migracion corre una vez y despues la
 * lista guardada manda, este o no el gestor abierto.
 */
export const resolveVisibleColumns = (module: string, available: string[]): string[] => {
  let stored: string[] | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY(module));
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    stored = null;
  }

  const { columns, version } = resolveColumns(module, stored, available, readMigrationVersion(module));
  persistColumns(module, columns, version);
  return columns;
};

/**
 * Si el navegador tiene algo guardado para este modulo.
 *
 * La lista de columnas viene del servidor por rol y la eleccion del usuario es
 * local. Cuando la eleccion local no existe todavia (otro equipo, navegador
 * nuevo, o la lista se perdio), lo que hay en el navegador manda, y solo si no
 * hay nada se recurre a lo del servidor. Al revés, lo del servidor pisaria lo
 * que el usuario acaba de ocultar y las columnas volverian a aparecer.
 */
export const resolveVisibleColumnsWithFallback = (
  module: string,
  available: string[],
  serverColumns: string[] | null | undefined
): string[] => {
  let stored: string[] | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY(module));
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    stored = null;
  }

  const source = Array.isArray(stored) && stored.length ? stored : serverColumns;
  const { columns, version } = resolveColumns(module, source ?? null, available, readMigrationVersion(module));
  persistColumns(module, columns, version);
  return columns;
};

export default function ColumnManager({ module, columns, onVisibleChange }: ColumnManagerProps) {
  const { columnConfig } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("visible");
  const [visible, setVisible] = useState<string[]>([]);
  // Columnas que el rol del usuario permite ver. Lo que este fuera de aqui se
  // puede mostrar, pero no activar: si no, el usuario marca una columna, le
  // aplica, y al recargar desaparece sin explicacion.
  const [allowedCols, setAllowedCols] = useState<string[]>(columns);
  const [saving, setSaving] = useState(false);
  // Posicion que tenia cada columna antes de ocultarla, para devolverla a su
  // lugar en vez de mandarla al final.
  const hintsRef = useRef<Record<string, number>>({});

  // El panel se dibuja en un portal pegado a <body>, con posicion fija.
  //
  // Antes vivia dentro del arbol normal, con position absolute. Los tres usos
  // (historial, carrito, inventario) estan dentro de tarjetas con
  // overflow-hidden, y eso recortaba el panel contra el borde de la tarjeta: se
  // veia la mitad y las pestañas de abajo quedaban inaccesibles, sin aviso de
  // que faltaba contenido. Un z-index alto no sirve: el recorte lo produce el
  // ancestro con overflow, no el apilamiento.
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const PANEL_W = 320;
  const PANEL_MAX_H = 420;

  const place = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const margin = 8;
    // Alineado a la derecha del boton, como antes, pero si no cabe a la
    // derecha se recorre a la izquierda antes de salirse de la pantalla.
    let left = r.right - PANEL_W;
    left = Math.max(margin, Math.min(left, window.innerWidth - PANEL_W - margin));
    // Debajo del boton; si no hay espacio, arriba.
    let top = r.bottom + 8;
    const estimated = 360;
    if (top + estimated > window.innerHeight - margin) {
      const above = r.top - 8 - Math.min(estimated, window.innerHeight - margin * 2);
      top = above > margin ? above : Math.max(margin, window.innerHeight - PANEL_MAX_H - margin);
    }
    setPos({ top, left });
  }, []);

  // Al abrir se mide el boton y se recalcula en scroll o resize: si no, el
  // panel queda donde estaba y se desalinea al mover la pagina.
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
    const onReflow = () => place();
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, place]);

  // Escape cierra, como cualquier panel emergente.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadPreferences = async () => {
      const roleCols = columnConfig?.[module] ? migrateCols(columnConfig[module], columns) : undefined;
      const allowed = roleCols && roleCols.length ? columns.filter((c) => roleCols.includes(c)) : columns;

      let stored: string[] | null = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEY(module));
        stored = raw ? migrateCols(JSON.parse(raw), columns) : null;
      } catch {
        stored = null;
      }
      if (!stored || !stored.length) {
        // Sin lista local se prueba con la del servidor, para que el ajuste hecho
        // en otra maquina no se pierda.
        try {
          const response = await api.get("/users/me/preferences");
          const remote = migrateCols(response.data.columnPrefs?.[module] || [], columns);
          if (Array.isArray(remote) && remote.length) stored = remote;
        } catch {
          // La preferencia local permite continuar si el endpoint no está disponible.
        }
      }
      if (cancelled) return;

      const storedAllowed = (stored || []).filter((c) => allowed.includes(c));
      // Sin preferencia guardada se muestra todo lo permitido. Con preferencia
      // guardada se respeta tal cual, y solo se le suma lo nuevo una vez.
      const { columns: next, version } = storedAllowed.length
        ? applyColumnMigration(module, storedAllowed, allowed, readMigrationVersion(module))
        : { columns: allowed, version: readMigrationVersion(module) };
      // Se persiste lista y version juntas. La tabla ya se armo al montar la
      // pagina con resolveVisibleColumns; si aqui no se escribiera la version,
      // esa lectura volveria a migrar en la proxima recarga.
      persistColumns(module, next, version);

      setAllowedCols(allowed);
      setVisible(next);
      hintsRef.current = indexHints(next);
      onVisibleChange(next);
    };
    loadPreferences();
    return () => { cancelled = true; };
  }, [open, module, columnConfig, columns]);

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= visible.length) return;
    const next = swapAt(visible, idx, target);
    // El reordenamiento manual es la nueva referencia: si despues se oculta y
    // se vuelve a mostrar una columna, tiene que volver aqui y no al final.
    hintsRef.current = indexHints(next);
    setVisible(next);
  };

  const toggle = (col: string) => {
    // Una columna fuera del rol no se activa: si se guardara, al recargar se
    // filtraria y el usuario creeria que el ajuste se perdio. Antes de
    // devolver en silencio habia que explicar por que: el clic parecia roto.
    if (!allowedCols.includes(col)) {
      toast.error(
        `Tu rol no tiene "${col}". Un administrador puede habilitarla en Ajustes → Roles y columnas.`,
        { duration: 6000 }
      );
      return;
    }
    if (visible.includes(col)) {
      // Se recuerda donde estaba antes de ocultarla.
      hintsRef.current = { ...hintsRef.current, [col]: visible.indexOf(col) };
      setVisible(visible.filter((c) => c !== col));
    } else {
      // Vuelve a su posicion original. Antes se hacia [...visible, col], que
      // mandaba la columna al final y perdia el orden elegido con las flechas.
      setVisible(insertAtPreferredIndex(visible, col, hintsRef.current[col]));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      // Se guarda intersection con lo permitido, no lo que haya en pantalla:
      // si el rol cambio despues, lo guardado no debe arrastrar columnas vetadas.
      const permitted = visible.filter((c) => allowedCols.includes(c));
      // La version se escribe ACÁ, al guardar, en la version vigente de las
      // migraciones. Antes solo se marcaba al cargar el gestor y la tabla se arma
      // antes, asi que en la recarga la migracion volvia a correr y re-agregaba
      // lo recien oculto.
      persistColumns(module, permitted, latestMigrationVersion(module));
      // Las pistas de posicion se tomas de lo aplicado: si no, recargar el
      // gestor devolveria las columnas a donde estaban antes de guardar.
      hintsRef.current = indexHints(permitted);
      onVisibleChange(permitted);
      try {
        const prefs = JSON.parse(localStorage.getItem("columnPrefs") || "{}");
        await api.put("/users/me/preferences", { columnPrefs: prefs });
      } catch {
        // Sin token/permission aún guardamos en localStorage
      }
      toast.success("Columnas actualizadas");
      setOpen(false);
    } catch {
      toast.error("Error al guardar columnas");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    const roleCols = columnConfig?.[module] ? migrateCols(columnConfig[module]) : undefined;
    const permitted = roleCols && roleCols.length ? columns.filter((c) => roleCols.includes(c)) : columns;
    setVisible(permitted);
    hintsRef.current = indexHints(permitted);
    onVisibleChange(permitted);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`p-2.5 rounded-xl border transition-all flex items-center gap-2 text-sm ${
          open
            ? "bg-primary-600/10 border-primary-600/20 text-primary-400"
            : "bg-dark-800 border-dark-700/50 text-gray-400 hover:text-foreground hover:border-primary-600/50"
        }`}
        title="Configurar columnas"
      >
        <Settings2 size={18} />
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Configurar columnas"
              style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: PANEL_W }}
              className="fixed z-[70] max-h-[min(420px,calc(100vh-1rem))] flex flex-col bg-dark-900 border border-dark-700/50 rounded-2xl shadow-2xl overflow-hidden"
            >
            <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700/50">
              <h3 className="text-sm font-bold text-foreground">Columnas visibles</h3>
              <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-foreground rounded-lg hover:bg-dark-700 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex gap-1 px-4 pt-3">
              <button
                onClick={() => setTab("visible")}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  tab === "visible" ? "bg-primary-600/20 text-primary-400" : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <span className="flex items-center justify-center gap-1"><Eye size={12} /> Visibles ({visible.length})</span>
              </button>
              <button
                onClick={() => setTab("all")}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  tab === "all" ? "bg-primary-600/20 text-primary-400" : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <span className="flex items-center justify-center gap-1"><EyeOff size={12} /> Todas ({columns.length})</span>
              </button>
            </div>

            {/* El scroll va en esta zona interna, no en el panel: asi el encabezado y los
                botones de abajo quedan fijos y siempre alcanzables. */}
            <div className="p-2 overflow-y-auto min-h-0">
              {tab === "visible" ? (
                visible.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-4">Sin columnas visibles</p>
                ) : (
                  visible.map((col, idx) => (
                    <div key={col} className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-dark-800/50 group">
                      <GripVertical size={14} className="text-gray-600 shrink-0" />
                      <div className="flex flex-col">
                        <button onClick={() => move(idx, -1)} className="text-gray-600 hover:text-gray-300" disabled={idx === 0}>
                          <ChevronUp size={12} />
                        </button>
                        <button onClick={() => move(idx, 1)} className="text-gray-600 hover:text-gray-300" disabled={idx === visible.length - 1}>
                          <ChevronDown size={12} />
                        </button>
                      </div>
                      <span className="flex-1 text-sm text-gray-200 truncate">{col}</span>
                      <button onClick={() => toggle(col)} className="p-1 text-gray-400 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors" title="Ocultar">
                        <EyeOff size={14} />
                      </button>
                    </div>
                  ))
                )
              ) : (
                columns.map((col) => {
                  const bloqueada = !allowedCols.includes(col);
                  const isVis = visible.includes(col);
                  return (
                    <button
                      key={col}
                      onClick={() => toggle(col)}
                      className={`flex items-center justify-between gap-2 w-full px-3 py-1.5 rounded-lg text-sm transition-all text-left ${
                        bloqueada
                          ? "text-gray-600 hover:bg-dark-800/40"
                          : isVis
                            ? "text-gray-200 hover:bg-dark-800/50"
                            : "text-gray-500 hover:bg-dark-800/50"
                      }`}
                    >
                      <span className="truncate">{col}</span>
                      <span className={`flex items-center gap-1 text-xs shrink-0 ${isVis && !bloqueada ? "text-primary-400" : "text-gray-500"}`}>
                        {bloqueada ? (
                          <span className="underline decoration-dotted underline-offset-2">
                            No disponible para tu rol
                          </span>
                        ) : isVis ? <><Eye size={12} /> Visible</> : <><EyeOff size={12} /> Oculto</>}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-dark-700/50">
              <button onClick={reset} className="px-3 py-1.5 text-xs text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-lg transition-colors">
                Restablecer
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-medium transition-all disabled:opacity-50"
              >
                <Check size={14} /> {saving ? "Guardando..." : "Aplicar"}
              </button>
            </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
