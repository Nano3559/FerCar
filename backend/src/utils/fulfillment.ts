/**
 * Reparte una venta entre las unidades que ya existen y las que hay en camino
 * desde los almacenes.
 *
 * Reglas:
 *  - Se usa primero el stock de la tienda donde se cobra.
 *  - Si esa tienda no alcanza, se completa con el stock de las otras tiendas y
 *    se descuenta de ellas: la mercaderia ya existe, solo esta en otro punto.
 *  - Solo lo que no hay en ninguna tienda se pide a los almacenes: eso queda
 *    "pendiente", se factura igual y se genera la solicitud para que llegue.
 *  - Si no hay en ninguna parte, la venta se recorta a lo que existe y se
 *    avisa. Vender de mas dejaria una venta que jamas se podria completar.
 */

export interface OtherStoreStock {
  locationId: number;
  stock: number;
}

export interface StockSnapshot {
  /** Unidades disponibles en la tienda donde se cobra. */
  store: number;
  /** Unidades disponibles sumando las otras tiendas. */
  otherStores: number;
  /** Detalle por tienda, necesario para descontar de la fila correcta. */
  otherStoreStock: OtherStoreStock[];
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
  /** Lo que queda en camino desde el almacen: se factura pero no se entrega. */
  pending: number;
  /** De donde sale lo entregado, para poder descontarlo. */
  desDeTienda: number;
  desDeOtrasTiendas: number;
}

/** Unidades que hay que restar de una ubicacion concreta al confirmar la venta. */
export interface FulfillmentDeduction {
  productId: number;
  locationId: number;
  units: number;
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
  /** Descuentos por ubicacion: tienda propia primero, luego las otras. */
  deductions: FulfillmentDeduction[];
}

export function planFulfillment(
  items: { productId: number; quantity: number }[],
  stock: Record<number, StockSnapshot>,
  storeLocationId: number,
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
  // las tiendas y los almacenes.
  const vendiblePorProducto = new Map<number, number>();
  const capped: CappedProduct[] = [];
  for (const [productId, pedidoTotal] of pedidoPorProducto) {
    const snap = stock[productId];
    const disponible =
      (snap?.store ?? 0) + (snap?.otherStores ?? 0) + (snap?.warehouses ?? 0);
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

  // El reparto se hace en el orden de las lineas y por ubicacion: primero la
  // tienda donde se cobra, luego las demas tiendas, y lo que no exista en
  // ninguna tienda sale del almacen, que es exactamente lo pendiente.
  const restanteTienda = new Map<number, number>();
  const restanteOtras = new Map<number, Map<number, number>>();
  // Se arma por producto pedido, no con Object.entries: las claves de un objeto
  // son texto y un Map<number,...> las guardaria como "1", que ya no coincide
  // con el productId numerico de la linea.
  for (const it of items) {
    const snap = stock[it.productId];
    restanteTienda.set(it.productId, snap?.store ?? 0);
    const porTienda = new Map<number, number>();
    for (const t of snap?.otherStoreStock || []) porTienda.set(t.locationId, t.stock || 0);
    restanteOtras.set(it.productId, porTienda);
  }
  const vendibleRestante = new Map(vendiblePorProducto);
  const deductions: FulfillmentDeduction[] = [];

  const descontar = (productId: number, locationId: number, units: number) => {
    if (units <= 0) return;
    const previo = deductions.find((d) => d.productId === productId && d.locationId === locationId);
    if (previo) previo.units += units;
    else deductions.push({ productId, locationId, units });
  };

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const porVender = Math.min(it.quantity, vendibleRestante.get(it.productId) ?? 0);
    vendibleRestante.set(it.productId, (vendibleRestante.get(it.productId) ?? 0) - porVender);
    if (porVender <= 0) continue;

    const disponiblesTienda = restanteTienda.get(it.productId) ?? 0;
    const desDeTienda = Math.min(porVender, disponiblesTienda);
    restanteTienda.set(it.productId, disponiblesTienda - desDeTienda);
    descontar(it.productId, storeLocationId, desDeTienda);

    let faltanPorEntregar = porVender - desDeTienda;
    let desDeOtrasTiendas = 0;
    const porTienda = restanteOtras.get(it.productId);
    if (porTienda && faltanPorEntregar > 0) {
      // Orden estable por ubicacion para que dos ventas simultaneas no elijan
      // destinos distintos por casualidad.
      for (const locationId of [...porTienda.keys()].sort((a, b) => a - b)) {
        if (faltanPorEntregar <= 0) break;
        const hay = porTienda.get(locationId) ?? 0;
        const tomar = Math.min(faltanPorEntregar, hay);
        if (tomar <= 0) continue;
        porTienda.set(locationId, hay - tomar);
        descontar(it.productId, locationId, tomar);
        faltanPorEntregar -= tomar;
        desDeOtrasTiendas += tomar;
      }
    }

    lines.push({
      index: i,
      productId: it.productId,
      requested: it.quantity,
      sellable: porVender,
      delivered: desDeTienda + desDeOtrasTiendas,
      pending: faltanPorEntregar,
      desDeTienda,
      desDeOtrasTiendas,
    });
  }

  return { lines, capped, deductions };
}

/** Unidades de una linea que todavia no llegaron al cliente. */
export const pendingUnits = (item: { quantity: number; deliveredQuantity: number }) =>
  Math.max(0, item.quantity - item.deliveredQuantity);

/**
 * Fotografia del stock de varios productos: cuanto hay en la tienda donde se
 * cobra, cuanto en las demas tiendas y cuanto en los almacenes. Es lo que decide
 * si una venta se entrega entera, queda pendiente, o hay que recortarla.
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
  for (const id of productIds) snapshot[id] = { store: 0, otherStores: 0, otherStoreStock: [], warehouses: 0 };

  for (const row of rows) {
    const entry = snapshot[row.productId];
    if (!entry) continue;
    const stock = row.stock || 0;
    // Primero la tienda donde se cobra. Si ahi no alcanza, se usa el stock de
    // las otras tiendas y se descuenta de ellas: la unidad ya existe en la
    // empresa, solo esta en otro punto de venta. Lo que no hay en ninguna
    // tienda se pide al almacen, y ahi si es una entrega en el tiempo.
    if (row.locationId === storeLocationId) {
      entry.store = stock;
    } else if (row.location?.type === "ALMACEN") {
      entry.warehouses += stock;
    } else if (row.location?.type === "TIENDA") {
      entry.otherStores += stock;
      entry.otherStoreStock.push({ locationId: row.locationId, stock });
    }
  }

  return snapshot;
}