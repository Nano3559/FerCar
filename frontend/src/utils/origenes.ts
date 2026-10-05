/**
 * Reparto del faltante de una venta entre tiendas y almacenes.
 *
 * El stock de la tienda donde se cobra se consume solo: la mercadería ya está en
 * el mostrador. Lo que falta lo elige el vendedor, y puede repartirlo entre
 * varias ubicaciones (3 de SILES y 4 de CHIQUICOLLO, por ejemplo). Cada origen
 * elegido genera su propia solicitud.
 *
 * Son funciones puras a propósito: la lógica de "cuánto falta y de dónde sale"
 * es la que más se va a romper, y así se prueba sin montar la pantalla.
 */

export interface StockByLocation {
  locationId: number;
  locationName: string;
  locationType: "TIENDA" | "ALMACEN";
  stock: number;
}

/** Una unidad asignada a un origen: "3 de SILES". */
export interface OriginAllocation {
  productId: number;
  fromLocationId: number;
  quantity: number;
}

export interface AllocateableItem {
  productId: number;
  quantity: number;
  /** Stock por ubicación del producto, para proponer orígenes. */
  stockByLocation?: StockByLocation[];
}

const stockEnMiTienda = (item: AllocateableItem, storeLocationId: number) =>
  item.stockByLocation?.find((s) => s.locationId === storeLocationId)?.stock ?? 0;

/** Lo que sale del stock de la tienda donde se cobra, sin preguntar. */
export const desdeMiTienda = (item: AllocateableItem, storeLocationId: number) =>
  Math.min(item.quantity, stockEnMiTienda(item, storeLocationId));

/** Cuántas unidades no están en mi tienda y hay que pedir a otro lado. */
export const faltanteDe = (item: AllocateableItem, storeLocationId: number) =>
  Math.max(0, item.quantity - desdeMiTienda(item, storeLocationId));

/** Suma de lo asignado a un producto, sin importar el origen. */
export const totalAsignado = (allocations: OriginAllocation[], productId: number) =>
  allocations
    .filter((a) => a.productId === productId)
    .reduce((sum, a) => sum + (a.quantity || 0), 0);

/**
 * Cuánto se puede pedir a una ubicación sin pasarse: lo que tiene menos lo que ya
 * se le pidió en el resto del carrito. Si dos productos se piden al mismo lugar,
 * el segundo ve el stock que quedó después del primero.
 */
export const disponibleEn = (
  item: AllocateableItem,
  locationId: number,
  allocations: OriginAllocation[],
  storeLocationId: number,
) => {
  const stock = item.stockByLocation?.find((s) => s.locationId === locationId)?.stock ?? 0;
  const yaPedido = allocations
    .filter((a) => a.productId === item.productId && a.fromLocationId === locationId)
    .reduce((sum, a) => sum + (a.quantity || 0), 0);
  const pedidoPorMiTienda = allocations.some(
    (a) => a.productId === item.productId && a.fromLocationId === storeLocationId,
  )
    ? 1
    : 0;
  return Math.max(0, stock - yaPedido - pedidoPorMiTienda);
};

/** Propuesta de reparto automático: primero otras tiendas, después almacenes. */
export const sugerirReparto = (
  item: AllocateableItem,
  allocations: OriginAllocation[],
  storeLocationId: number,
): OriginAllocation[] => {
  let restante = faltanteDe(item, storeLocationId);
  if (restante <= 0) return [];

  const candidatos = (item.stockByLocation || [])
    .filter((s) => s.locationId !== storeLocationId && disponibleEn(item, s.locationId, allocations, storeLocationId) > 0)
    // Orden estable: primero otras tiendas por id, después almacenes por id. Dos
    // carritos con la misma falta proposes lo mismo.
    .sort((a, b) => {
      if (a.locationType !== b.locationType) return a.locationType === "TIENDA" ? -1 : 1;
      return a.locationId - b.locationId;
    });

  const propuesta: OriginAllocation[] = [];
  for (const cand of candidatos) {
    if (restante <= 0) break;
    const hay = disponibleEn(item, cand.locationId, allocations, storeLocationId);
    const tomar = Math.min(restante, hay);
    if (tomar <= 0) continue;
    propuesta.push({ productId: item.productId, fromLocationId: cand.locationId, quantity: tomar });
    restante -= tomar;
  }
  return propuesta;
};

/** Devuelve las asignaciones para TODOS los ítems del carrito, completadas con lo que falte. */
export const completarAllocations = (
  items: AllocateableItem[],
  allocations: OriginAllocation[],
  storeLocationId: number,
): OriginAllocation[] => {
  const resultado: OriginAllocation[] = [];
  for (const item of items) {
    const yaHecho = allocations.filter((a) => a.productId === item.productId);
    const restante = faltanteDe(item, storeLocationId) - yaHecho.reduce((s, a) => s + (a.quantity || 0), 0);
    // Lo que el vendedor eligió a mano se conserva tal cual, incluso si se pasó:
    // es mejor que el backend le diga "asignaste de más" a que se lo borremos
    // debajo de la manga.
    resultado.push(...yaHecho);
    if (restante <= 0) continue;

    // La sugerencia cubre como mucho lo que falta. Sin este tope, un producto
    // con 10 ya asignados y 10 por pedir se completaría con 10 más de los
    // necesarios y el backend rechazaría la venta por exceso.
    let tomado = 0;
    for (const s of sugerirReparto(item, resultado, storeLocationId)) {
      if (tomado >= restante) break;
      const usar = Math.min(s.quantity, restante - tomado);
      if (usar > 0) {
        resultado.push({ ...s, quantity: usar });
        tomado += usar;
      }
    }
  }
  return deduplicar(resultado);
};

/** Junta asignaciones del mismo producto y origen. */
export const deduplicar = (allocations: OriginAllocation[]): OriginAllocation[] => {
  const porClave = new Map<string, OriginAllocation>();
  for (const a of allocations) {
    const clave = `${a.productId}:${a.fromLocationId}`;
    const previo = porClave.get(clave);
    if (previo) previo.quantity += a.quantity || 0;
    else porClave.set(clave, { ...a });
  }
  return [...porClave.values()].filter((a) => a.quantity > 0);
};

/** Lista de ubicaciones donde el producto tiene stock, para el selector. */
export const origenesDisponibles = (
  item: AllocateableItem,
  allocations: OriginAllocation[],
  storeLocationId: number,
) =>
  (item.stockByLocation || [])
    .filter((s) => s.locationId !== storeLocationId)
    .map((s) => ({ ...s, disponible: disponibleEn(item, s.locationId, allocations, storeLocationId) }))
    .sort((a, b) => {
      if (a.locationType !== b.locationType) return a.locationType === "TIENDA" ? -1 : 1;
      return a.locationId - b.locationId;
    });

export interface PendingSummary {
  productId: number;
  /** Unidades que salen del stock de mi tienda. */
  desdeTienda: number;
  /** Unidades que hay que pedir a otro lado. */
  faltante: number;
  /** Unidades que ya tienen origen elegido. */
  asignado: number;
  /** Unidades que todavía no tienen origen. */
  sinAsignar: number;
  completo: boolean;
}

export const resumenDeFaltantes = (
  items: AllocateableItem[],
  allocations: OriginAllocation[],
  storeLocationId: number,
): PendingSummary[] =>
  items.map((item) => {
    const desdeTienda = desdeMiTienda(item, storeLocationId);
    const faltante = faltanteDe(item, storeLocationId);
    const asignado = totalAsignado(allocations, item.productId);
    const sinAsignar = Math.max(0, faltante - asignado);
    return {
      productId: item.productId,
      desdeTienda,
      faltante,
      asignado,
      sinAsignar,
      completo: sinAsignar === 0,
    };
  });

/** Si algo quedo sin origen, la venta no se puede guardar. */
export const hayFaltantesSinAsignar = (items: AllocateableItem[], allocations: OriginAllocation[], storeLocationId: number) =>
  resumenDeFaltantes(items, allocations, storeLocationId).some((r) => !r.completo);