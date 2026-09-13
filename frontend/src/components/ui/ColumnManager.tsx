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

export default function ColumnManager({ module, columns, onVisibleChange }: ColumnManagerProps) {
  const { columnConfig } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("visible");
  const [visible, setVisible] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadPreferences = async () => {
      const roleCols = columnConfig?.[module];
      const allowed = roleCols && roleCols.length ? columns.filter((c) => roleCols.includes(c)) : columns;
      let stored = getStored(module) || [];
      try {
        const response = await api.get("/users/me/preferences");
        const remote = response.data.columnPrefs?.[module];
        // Lo guardado en el navegador es la fuente de verdad más reciente:
        // las preferencias remotas solo se usan si no existe configuración local.
        if ((!stored || stored.length === 0) && Array.isArray(remote) && remote.length) stored = remote;
      } catch {
        // La preferencia local permite continuar si el endpoint no está disponible.
      }
      if (cancelled) return;
      const storedAllowed = stored?.filter((c) => allowed.includes(c)) || [];
      const next = storedAllowed.length ? storedAllowed : allowed;
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
      localStorage.setItem(`columns_${module}`, JSON.stringify(visible));
      onVisibleChange(visible);
      const currentPrefs = JSON.parse(localStorage.getItem("columnPrefs") || "{}");
      currentPrefs[module] = visible;
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
    const roleCols = columnConfig?.[module];
    setVisible(roleCols && roleCols.length ? roleCols : columns);
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
                  const isVis = visible.includes(col);
                  return (
                    <button
                      key={col}
                      onClick={() => toggle(col)}
                      className={`flex items-center justify-between w-full px-3 py-1.5 rounded-lg text-sm transition-all ${
                        isVis ? "text-gray-200 hover:bg-dark-800/50" : "text-gray-500 hover:bg-dark-800/50"
                      }`}
                    >
                      <span className="truncate">{col}</span>
                      <span className={`flex items-center gap-1 text-xs ${isVis ? "text-primary-400" : "text-gray-500"}`}>
                        {isVis ? <><Eye size={12} /> Visible</> : <><EyeOff size={12} /> Oculto</>}
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
