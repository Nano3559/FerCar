// Logica de preferencia de columnas, sin React ni localStorage.
//
// Vive aparte de ColumnManager.tsx para poder probarla: el gestor necesita
// localStorage y el store de auth, que en un test obligan a montar la app
// entera. Aqui solo entra el calculo.
const MIGRATIONS: Record<string, { version: number; columns: string[] }> = {
  ventas: { version: 2, columns: ["Datos de envío", "Usuario", "Estado", "Nota"] },
};

// Renombra columnas cuyo encabezado cambio. Sin esto, quien ya habia
// configurado sus columnas se quedaria sin la nueva: su lista guardada tiene el
// nombre viejo y la columna desapareceria en silencio.
const RENAMED_COLUMNS: Record<string, string> = {
  "Unit Price": "Precio USD",
  Hermana: "Costo Tiendas",
  "#": "Código",
  ID: "Código",
  Tienda: "Ubicación",
};

export const migrateCols = (cols: string[], valid?: string[]): string[] => {
  const mapped = cols.map((c) => RENAMED_COLUMNS[c] || c);
  const validSet = valid ? new Set(valid) : null;
  return validSet ? mapped.filter((c) => validSet.has(c)) : mapped;
};

/**
 * Agrega las columnas nuevas a una preferencia guardada, pero solo la primera
 * vez.
 *
 * El numero de version es lo que hace que esto no sea un bug permanente. Antes
 * la lista de columnas nuevas se re-aplicaba en cada carga: el usuario ocultaba
 * "Nota", se guardaba, y al recargar aparecia sola otra vez, como si el ajuste
 * no se hubiera guardado.
 *
 * Al agregar o renombrar una columna hay que sumar aqui su nombre y subir el
 * `version` de ese modulo.
 */
/** Version vigente de las migraciones de un modulo: la que hay que dejar marcada. */
export const latestMigrationVersion = (module: string): number => MIGRATIONS[module]?.version ?? 0;

export const applyColumnMigration = (
  module: string,
  stored: string[],
  allowed: string[],
  appliedVersion: number
): { columns: string[]; version: number } => {
  const migration = MIGRATIONS[module];
  if (!migration) return { columns: stored, version: appliedVersion };
  if (appliedVersion >= migration.version) return { columns: stored, version: appliedVersion };

  const missing = migration.columns.filter((c) => allowed.includes(c) && !stored.includes(c));
  return {
    columns: missing.length ? [...stored, ...missing] : stored,
    version: migration.version,
  };
};

/**
 * Reinserta una columna en la posicion que tenia antes de ocultarla.
 *
 * Sin esto, volver a mostrar una columna la mandaba al final de la lista
 * (setVisible([...visible, col])). El usuario la ocultaba, la volvia a mostrar y
 * aparecia reorderada al final, ya que el orden elegido a mano con las flechas
 * se perdia.
 *
 * `hint` es la posicion remembered de la columna. Si no hay dato, o no cabe en
 * la lista actual, se recurre a insertarla al final, que es lo unico razonable.
 */
export const insertAtPreferredIndex = (visible: string[], col: string, hint?: number): string[] => {
  if (visible.includes(col)) return visible;
  if (typeof hint !== "number" || !Number.isFinite(hint)) return [...visible, col];
  const at = Math.max(0, Math.min(Math.trunc(hint), visible.length));
  const next = [...visible];
  next.splice(at, 0, col);
  return next;
};

/** Intercambia dos posiciones y devuelve el orden nuevo, sin mutar el original. */
export const swapAt = (list: string[], a: number, b: number): string[] => {
  const next = [...list];
  if (a < 0 || b < 0 || a >= next.length || b >= next.length) return next;
  [next[a], next[b]] = [next[b], next[a]];
  return next;
};

/** Posiciones de cada columna en un orden dado, para usar como pista al reinsertar. */
export const indexHints = (order: string[]): Record<string, number> => {
  const hints: Record<string, number> = {};
  order.forEach((col, i) => { hints[col] = i; });
  return hints;
};

/**
 * Resuelve que columnas mostrar a partir de lo que hay guardado, y devuelve
 * tambien la version a persistir.
 *
 * Sin lista guardada se devuelve todo lo disponible: es la primera vez que se
 * abre, no hay nada que el usuario haya ocultado todavia.
 */
export const resolveVisibleColumns = (
  module: string,
  stored: string[] | null,
  available: string[],
  appliedVersion: number
): { columns: string[]; version: number } => {
  const base = Array.isArray(stored) ? migrateCols(stored, available) : [];
  if (!base.length) {
    // Sin lista guardada se muestra todo, y la version queda en la actual. Si
    // se dejara en la anterior, la migracion correria despues, sobre la lista
    // que el usuario guardara al ocultar columnas, y volveria a agregar
    // precisamente las que habia ocultado.
    return { columns: available, version: Math.max(appliedVersion, latestMigrationVersion(module)) };
  }
  return applyColumnMigration(module, base, available, appliedVersion);
};