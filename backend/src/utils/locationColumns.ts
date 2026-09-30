// Reconocimiento de columnas de ubicacion en los Excel de inventario.
//
// Cada archivo del proveedor viene con su propio formato: unos traen una
// columna por tienda con el nombre tal cual, otros la llevan escondida dentro
// del encabezado ("STOCK TUMUSLA", "TUMUSLA (TIENDA)"), otros numeran
// ("TIENDA 1", "ALMACEN 2"). Antes solo se aceptaba el nombre exacto, y lo
// demas se descartaba sin avisar, por eso seemed que no reconnaia las
// columnas de tienda ni de almacen.

export interface LocationRef {
  id: number;
  name: string;
  type: string;
}

/** Minusculas, sin tildes y sin espacios sobrantes. */
export const normalizeHeader = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

export interface ColumnaResuelta {
  locationId: number;
  como: string;
}

/**
 * Devuelve la ubicacion a la que pertenece una columna, o null si la columna
 * no es de inventario. Se acepta el nombre exacto, el nombre contenido en el
 * encabezado, o el numero que siga a TIENDA/ALMACEN.
 */
export const resolverColumnaUbicacion = (
  encabezado: string,
  locations: LocationRef[],
): ColumnaResuelta | null => {
  const n = normalizeHeader(encabezado);
  if (!n) return null;

  const porNombre = new Map<string, LocationRef>();
  for (const l of locations) porNombre.set(normalizeHeader(l.name), l);

  const exacto = porNombre.get(n);
  if (exacto) return { locationId: exacto.id, como: "nombre exacto" };

  // El nombre de la ubicacion puede venir con texto alrededor. Se busca el
  // nombre mas largo primero para que "SANTA CRUZ" gane sobre "CRUZ".
  const contenidas = [...porNombre.entries()]
    .filter(([nombre]) => nombre.length > 0 && n.includes(nombre))
    .sort((a, b) => b[0].length - a[0].length);
  if (contenidas.length > 0) {
    return { locationId: contenidas[0][1].id, como: `contiene "${contenidas[0][0]}"` };
  }

  // "TIENDA 1", "ALMACEN 2": se toma por el orden en que estan guardadas.
  const ordinal = n.match(/(tienda|almacen)\s*(\d+)/);
  if (ordinal) {
    const lista = locations.filter((l) => l.type.toLowerCase() === (ordinal[1] === "tienda" ? "tienda" : "almacen"));
    const elegido = lista[Number(ordinal[2]) - 1];
    if (elegido) return { locationId: elegido.id, como: `número ${ordinal[2]} (${elegido.name})` };
  }

  return null;
};

/** Encabezados que son una cantidad global, no una ubicacion. */
export const esColumnaCantidad = (encabezado: string): boolean =>
  ["stock", "cantidad", "existencia", "quantity", "existencia actual", "stock actual"].includes(
    normalizeHeader(encabezado),
  );

export interface CantidadLeida {
  valor: number;
  /** true si la celda no traia un numero usable (vacia, "?", "a confirmar"). */
  sinDato: boolean;
}

/**
 * Lee una cantidad aceptando "12", " 12 " y "12,00". Lo que no sea un numero
 * limpio (vacia, "?", "a confirmar") se marca como sin dato en vez de volverse
 * 0, para poder avisar en vez de perder la celda.
 *
 * "1,50" y "1.234" quedan marcados como sin dato a proposito: son ambiguos
 * (decimales o millares) y una diferencia de 1 contra 1.234 unidades es justo
 * el tipo de error que no se debe adivinar en silencio. Se cuentan a mano.
 */
export const leerCantidad = (valor: unknown): CantidadLeida => {
  const s = String(valor ?? "")
    .trim()
    .replace(/\s/g, "");
  if (s === "") return { valor: 0, sinDato: true };
  if (!/^-?\d+([.,]\d+)?$/.test(s)) return { valor: 0, sinDato: true };
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n)) return { valor: 0, sinDato: true };
  if (n % 1 !== 0) return { valor: 0, sinDato: true };
  return { valor: Math.trunc(n), sinDato: false };
};
