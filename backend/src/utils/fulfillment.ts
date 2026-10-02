/**
 * Reparte una venta entre lo que hay en la tienda y lo que hay en camino desde
 * los almacenes.
 *
 * Reglas:
 *  - Lo que hay en tienda se entrega de inmediato y descuenta stock.
 *  - Si los almacenes tienen el resto, la linea queda "pendiente": se factura
 *    igual, pero se genera la solicitud para que llegue.
 *  - Si ni la tienda ni ningun almacen tienen el total, la venta se recorta a
 *    lo que existe y se avisa. Vender de mas dejaria una venta que jamas se
 *    podria completar.
 */

export interface StockSnapshot {
  /** Unidades disponibles en la tienda donde se cobra. */
  store: number;
  /** Unidades disponibles sumando todos los almacenes. */
  warehouses: number;
}

export interface FulfillmentLine {
  /** Posicion de la linea en el arreglo original, para recuperar su precio. */
  index: number;
  productId: number;
  /** Lo que el vendedor pidio. */
  requested: number;
  /** Lo que realmente se factura, ya recortado por existencia real. */
  sellable: number;
  /** Lo que se le entrega al cliente ahora. */
  delivered: number;
  /** Lo que queda en camino: se factura pero no se entrega aun. */
  pending: number;
}

export interface CappedProduct {
  productId: number;
  requested: number;
  sellable: number;
  /** Unidades que se pidieron y no existen ni en tienda ni en almacen. */
  missing: number;
}

export interface FulfillmentPlan {
  lines: FulfillmentLine[];
  /** Productos cuya cantidad hubo que recortar, para avisar al vendedor. */
  capped: CappedProduct[];
}

export function planFulfillment(
  items: { productId: number; quantity: number }[],
  stock: Record<number, StockSnapshot>,
): FulfillmentPlan {
  const lines: FulfillmentLine[] = [];

  const pedidoPorProducto = new Map<number, number>();
  for (const it of items) {
    pedidoPorProducto.set(it.productId, (pedidoPorProducto.get(it.productId) ?? 0) + it.quantity);
  }

  // Para un mismo producto la disponibilidad se gasta en el orden en que
  // aparecen sus lineas: si se pido 2 en P1 y 4 en P2 con 3 en tienda, la
  // primera linea se entrega completa y la segunda es la que queda pendiente.
  // Cuanto se puede facturar de cada producto, sin pasar de lo que existe entre
  // la tienda y los almacenes.
  const vendiblePorProducto = new Map<number, number>();
  const capped: CappedProduct[] = [];
  for (const [productId, pedidoTotal] of pedidoPorProducto) {
    const snap = stock[productId];
    const disponible = (snap?.store ?? 0) + (snap?.warehouses ?? 0);
    const vendible = Math.min(pedidoTotal, disponible);
    vendiblePorProducto.set(productId, vendible);
    if (vendible < pedidoTotal) {
      capped.push({
        productId,
        requested: pedidoTotal,
        sellable: vendible,
        missing: pedidoTotal - vendible,
      });
    }
  }

  // El reparto se hace en el orden de las lineas. Como lo vendible ya esta
  // acotado a tienda + almacenes, todo lo que no sale de la tienda proviene
  // necesariamente de un almacen: eso es exactamente lo pendiente.
  const restanteTienda = new Map<number, number>();
  for (const it of items) restanteTienda.set(it.productId, stock[it.productId]?.store ?? 0);
  const vendibleRestante = new Map(vendiblePorProducto);

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const porVender = Math.min(it.quantity, vendibleRestante.get(it.productId) ?? 0);
    vendibleRestante.set(it.productId, (vendibleRestante.get(it.productId) ?? 0) - porVender);
    if (porVender <= 0) continue;

    const disponibles = restanteTienda.get(it.productId) ?? 0;
    const entregado = Math.min(porVender, disponibles);
    restanteTienda.set(it.productId, disponibles - entregado);

    lines.push({
      index: i,
      productId: it.productId,
      requested: it.quantity,
      sellable: porVender,
      delivered: entregado,
      pending: porVender - entregado,
    });
  }

  return { lines, capped };
}

/** Unidades de una linea que todavia no llegaron al cliente. */
export const pendingUnits = (item: { quantity: number; deliveredQuantity: number }) =>
  Math.max(0, item.quantity - item.deliveredQuantity);

/**
 * Fotografia del stock de varios productos: cuanto hay en la tienda donde se
 * cobra y cuanto hay sumando los almacenes. Es lo que decide si una venta se
 * entrega entera, queda pendiente, o hay que recortarla.
 */
export interface FulfillmentSummary {
  pendientes: number;
  pedidas: number;
  entregadas: number;
  completa: boolean;
  lineas: {
    saleItemId: number;
    productId: number;
    quantity: number;
    deliveredQuantity: number;
    pending: number;
  }[];
}

/** Resumen de entrega de una venta ya guardada, para el listado y el historial. */
export function summarizeFulfillment(
  items: { id: number; productId: number; quantity: number; deliveredQuantity: number }[],
): FulfillmentSummary {
  const lineas = items.map((i) => ({
    saleItemId: i.id,
    productId: i.productId,
    quantity: i.quantity,
    deliveredQuantity: i.deliveredQuantity,
    pending: Math.max(i.quantity - i.deliveredQuantity, 0),
  }));

  return {
    pendientes: lineas.reduce((s, l) => s + l.pending, 0),
    pedidas: lineas.reduce((s, l) => s + l.quantity, 0),
    entregadas: lineas.reduce((s, l) => s + l.deliveredQuantity, 0),
    completa: lineas.every((l) => l.pending === 0),
    lineas,
  };
}

export async function loadStockSnapshot(
  db: { inventory: { findMany: (args: any) => Promise<any[]> } },
  productIds: number[],
  storeLocationId: number,
): Promise<Record<number, StockSnapshot>> {
  if (productIds.length === 0) return {};

  const rows = await db.inventory.findMany({
    where: { productId: { in: productIds } },
    select: { productId: true, locationId: true, stock: true, location: { select: { type: true } } },
  });

  const snapshot: Record<number, StockSnapshot> = {};
  for (const id of productIds) snapshot[id] = { store: 0, warehouses: 0 };

  for (const row of rows) {
    const entry = snapshot[row.productId];
    if (!entry) continue;
    const stock = row.stock || 0;
    // Lo de la tienda donde se cobra va primero. Las otras tiendas no cuentan:
    // lo que este en TUMUSLA no se le puede prometer a FALSURI.
    if (row.locationId === storeLocationId) entry.store = stock;
    else if (row.location?.type === "ALMACEN") entry.warehouses += stock;
  }

  return snapshot;
}