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

// El nombre que el usuario escribe en la columna TIENDA/UBICACION de cada fila
// no siempre coincide con el de la base: "FALSURY", "FAL SURI" o "TIENDA
// FALSURY" son formas comunes de referirse a FALSURI. Antes solo se aceptaba
// el nombre exacto y la fila caia en CHIQUICOLLO sin que el resumen lo dijera.
const ALIAS_VALOR_UBICACION: Record<string, string> = {
  falsury: "falsuri",
  falsur: "falsuri",
  falsuris: "falsuri",
  chikicollo: "chiquicollo",
  chiquicolo: "chiquicollo",
  quijaro: "quijarro",
};

const soloAlfanumerico = (s: string): string =>
  normalizeHeader(s).replace(/[^a-z0-9]/g, "");

/** Distancia de Levenshtein, para tolerar errores de una o dos letras. */
const distancia = (a: string, b: string): number => {
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const viejo = fila[j];
      fila[j] = Math.min(
        fila[j] + 1,
        fila[j - 1] + 1,
        anterior + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      anterior = viejo;
    }
  }
  return fila[b.length];
};

/**
 * Resuelve el VALOR escrito en una celda de ubicacion por fila. Primero intenta
 * el criterio estricto de las columnas y despues tolera alias y errores de
 * tipeo. Solo adivina si hay un unico candidato razonable; si hay ambiguedad
 * devuelve null para no mandar el stock al lugar equivocado.
 */
export const resolverValorUbicacion = (
  valor: string,
  locations: LocationRef[],
): ColumnaResuelta | null => {
  const directa = resolverColumnaUbicacion(valor, locations);
  if (directa) return directa;

  const n = soloAlfanumerico(valor);
  if (!n) return null;
  const sinRotulo = n
    .replace(/^(tienda|almacen|sucursal|local|deposito|puntodeventa)/, "")
    .replace(/(tienda|almacen|sucursal|local|deposito|puntodeventa)$/, "");
  const objetivo = ALIAS_VALOR_UBICACION[sinRotulo] || ALIAS_VALOR_UBICACION[n] || sinRotulo || n;

  const porNombre = new Map<string, LocationRef>();
  for (const l of locations) porNombre.set(soloAlfanumerico(l.name), l);

  const exacta = porNombre.get(objetivo);
  if (exacta) {
    return { locationId: exacta.id, como: `valor "${valor.trim()}" -> ${exacta.name}` };
  }

  if (objetivo.length >= 5) {
    const candidatos = [...porNombre.entries()]
      .map(([nombre, loc]) => ({ loc, d: distancia(objetivo, nombre) }))
      .filter((c) => c.d <= 2)
      .sort((a, b) => a.d - b.d);
    if (candidatos.length === 1) {
      return {
        locationId: candidatos[0].loc.id,
        como: `valor "${valor.trim()}" -> ${candidatos[0].loc.name} (similar)`,
      };
    }
  }
  return null;
};

/** Encabezados que son una cantidad global, no una ubicacion. */
export const esColumnaCantidad = (encabezado: string): boolean =>
  ["stock", "cantidad", "existencia", "quantity", "existencia actual", "stock actual"].includes(
    normalizeHeader(encabezado),
  );

// Nombres que puede tener la columna donde cada fila dice a que tienda o
// almacen pertenece el producto ("TIENDA", "UBICACION", "ALMACEN"...). No son
// columnas de cantidad: su valor es el nombre de la ubicacion, no un numero.
const ALIAS_UBICACION_FILA = [
  "tienda", "ubicacion", "almacen", "sucursal", "local",
  "deposito", "punto de venta",
];

/** true si el encabezado es exactamente el nombre de la ubicacion por fila. */
export const esColumnaUbicacionPorFila = (encabezado: string): boolean =>
  ALIAS_UBICACION_FILA.includes(normalizeHeader(encabezado));

/**
 * true si el encabezado parece traer el nombre de la ubicacion por fila, aunque
 * venga compuesto ("UBICACIÓN / TIENDA", "TIENDA DE DESPACHO"). Quien llama
 * debe descartar antes las columnas que ya se resolvieron como cantidad.
 */
export const pareceColumnaUbicacionPorFila = (encabezado: string): boolean => {
  const n = normalizeHeader(encabezado);
  return ALIAS_UBICACION_FILA.some((a) => n.includes(a));
};

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
