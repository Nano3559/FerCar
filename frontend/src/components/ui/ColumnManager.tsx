import { useEffect, useState } from "react";
import { Settings2, GripVertical, Eye, EyeOff, Check, X, ChevronUp, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../services/api";
import { useAuthStore } from "../../stores/authStore";

interface ColumnManagerProps {
  module: string;
  columns: string[];
  onVisibleChange: (visible: string[]) => void;
}

type Tab = "visible" | "all";

// Renombra columnas cuyo encabezado cambio. Sin esto, quien ya habia
// configurado sus columnas se quedaria sin la nueva: su lista guardada
// tiene el nombre viejo y la columna desapareceria en silencio.
const RENAMED_COLUMNS: Record<string, string> = {
  "Unit Price": "Precio USD",
  Hermana: "Costo Tiendas",
  "#": "Código",
  ID: "Código",
  Tienda: "Ubicación",
};

// Aplica los renombres y descarta los nombres que ya no existen. Sin el
// recorte, una columna eliminada (ej. "Celular", que paso dentro de "Datos de
// factura") seguia guardada para siempre: ocupaba un hueco invisible en la
// lista y el usuario veia menos columnas de las que creia tener, sin aviso.
export const migrateCols = (cols: string[], valid?: string[]): string[] => {
  const mapped = cols.map((c) => RENAMED_COLUMNS[c] || c);
  const validSet = valid ? new Set(valid) : null;
  return validSet ? mapped.filter((c) => validSet.has(c)) : mapped;
};

// Columnas incorporadas despues de que un equipo guardara su lista. Si no
// estan en lo guardado es porque no existian todavia, no porque ese usuario
// las haya ocultado a proposito: se agregan visibles una unica vez.
//
// Al agregar o renombrar una columna hay que sumar aqui su nombre y subir el
// `version`.
//
// El numero de version es lo que hace que esto no sea un bug permanente:
// antes esta lista se re-aplicaba en cada carga y era imposible ocultar una
// columna de aqui para siempre, se ocultaba, se guardaba, y al recargar
// aparecia sola otra vez. Al usuario le parecia que el ajuste no se guardaba.
// Con la version, la migracion corre una vez y despues manda lo que el usuario
// dejo elegido.
const COLUMN_MIGRATIONS: Record<string, { version: number; columns: string[] }> = {
  ventas: { version: 2, columns: ["Datos de envío", "Usuario", "Estado", "Nota"] },
};

export type ColumnMigration = { version: number; columns: string[] };

/** Version de migracion ya aplicada a la preferencia de este modulo. */
export const readMigrationVersion = (module: string): number => {
  try {
    const raw = Number(localStorage.getItem(`columns_v_${module}`));
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  } catch {
    return 0;
  }
};

/**
 * Agrega las columnas nuevas a una preferencia guardada, pero solo la primera
 * vez. Devuelve las columnas a mostrar y si hubo que migrar, para que quien
 * llama persista el resultado junto con la version: si se marcara la version
 * sin guardar la lista, al recargar las columnas nuevas desaparecerian.
 */
export const applyColumnMigration = (
  module: string,
  stored: string[],
  allowed: string[],
  appliedVersion: number
): { columns: string[]; migrated: boolean; version: number } => {
  const migration = COLUMN_MIGRATIONS[module];
  if (!migration) return { columns: stored, migrated: false, version: appliedVersion };
  if (appliedVersion >= migration.version) return { columns: stored, migrated: false, version: appliedVersion };

  const missing = migration.columns.filter((c) => allowed.includes(c) && !stored.includes(c));
  return {
    columns: missing.length ? [...stored, ...missing] : stored,
    migrated: missing.length > 0,
    version: migration.version,
  };
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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadPreferences = async () => {
      const roleCols = columnConfig?.[module] ? migrateCols(columnConfig[module], columns) : undefined;
      const allowed = roleCols && roleCols.length ? columns.filter((c) => roleCols.includes(c)) : columns;
      let stored = migrateCols(getStored(module) || [], columns);
      try {
        const response = await api.get("/users/me/preferences");
        const remote = migrateCols(response.data.columnPrefs?.[module] || [], columns);
        // Lo guardado en el navegador es la fuente de verdad más reciente:
        // las preferencias remotas solo se usan si no existe configuración local.
        if ((!stored || stored.length === 0) && Array.isArray(remote) && remote.length) stored = remote;
      } catch {
        // La preferencia local permite continuar si el endpoint no está disponible.
      }
      if (cancelled) return;
      const storedAllowed = stored?.filter((c) => allowed.includes(c)) || [];
      // Sin preferencia guardada se muestra todo lo permitido. Con preferencia
      // guardada se respeta tal cual, y solo se le suma lo nuevo una vez: si el
      // usuario oculto "Nota", tiene que seguir oculta en cada recarga.
      const { columns: next, migrated, version } = storedAllowed.length
        ? applyColumnMigration(module, storedAllowed, allowed, readMigrationVersion(module))
        : { columns: allowed, migrated: false, version: readMigrationVersion(module) };

      if (migrated || version !== readMigrationVersion(module)) {
        // La version se marca junto con la lista ya migrada. Marcarla sin
        // guardar la lista haria que al recargar las columnas nuevas desaparecieran.
        localStorage.setItem(`columns_v_${module}`, String(version));
        if (migrated) {
          localStorage.setItem(`columns_${module}`, JSON.stringify(next));
          const prefs = JSON.parse(localStorage.getItem("columnPrefs") || "{}");
          prefs[module] = next;
          localStorage.setItem("columnPrefs", JSON.stringify(prefs));
          api.put("/users/me/preferences", { columnPrefs: prefs }).catch(() => {});
        }
      }

      setAllowedCols(allowed);
      setVisible(next);
      onVisibleChange(next);
    };
    loadPreferences();
    return () => { cancelled = true; };
  }, [open, module, columnConfig, columns]);

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= visible.length) return;
    const next = [...visible];
    [next[idx], next[target]] = [next[target], next[idx]];
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
      setVisible(visible.filter((c) => c !== col));
    } else {
      setVisible([...visible, col]);
    }
  };

  const getStored = (m: string): string[] | null => {
    try {
      const raw = localStorage.getItem(`columns_${m}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      // Se guarda intersection con lo permitido, no lo que haya en pantalla:
      // si el rol cambio despues, lo guardado no debe arrastrar columnas vetadas.
      const permitted = visible.filter((c) => allowedCols.includes(c));
      localStorage.setItem(`columns_${module}`, JSON.stringify(permitted));
      onVisibleChange(permitted);
      const currentPrefs = JSON.parse(localStorage.getItem("columnPrefs") || "{}");
      currentPrefs[module] = permitted;
      localStorage.setItem("columnPrefs", JSON.stringify(currentPrefs));
      try {
        await api.put("/users/me/preferences", { columnPrefs: currentPrefs });
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
    onVisibleChange(permitted);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`p-2.5 rounded-xl border transition-all flex items-center gap-2 text-sm ${
          open
            ? "bg-primary-600/10 border-primary-600/20 text-primary-400"
            : "bg-dark-800 border-dark-700/50 text-gray-400 hover:text-foreground hover:border-primary-600/50"
        }`}
        title="Configurar columnas"
      >
        <Settings2 size={18} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 bg-dark-900 border border-dark-700/50 rounded-2xl shadow-2xl w-80 overflow-hidden">
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

            <div className="p-2 max-h-64 overflow-y-auto">
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
        </>
      )}
    </div>
  );
}
