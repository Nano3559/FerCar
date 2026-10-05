/**
 * Reparte una venta entre lo que hay en la tienda donde se cobra y lo que el
 * vendedor decide pedir a otras tiendas o a los almacenes.
 *
 * Reglas:
 *  - El stock de la tienda donde se cobra se consume solo: la mercaderia ya esta
 *    en el mostrador y no tiene sentido pedirla a otro lado.
 *  - El faltante NO se decide solo. El vendedor elige, unidad por unidad, de que
 *    tienda o de que almacen sale, y puede repartirlo entre varios (3 de SILES y
 *    4 de CHIQUICOLLO, por ejemplo). Cada origen elegido genera su propia
 *    solicitud.
 *  - Si el faltante no queda cubierto por completo, la venta no se guarda: es
 *    mejor avisarle al vendedor que dejar una venta que nadie va a poder
 *    completar.
 *  - El origen se descuenta al crear la solicitud, para que dos ventas no
 *    puedan pedir las mismas unidades. Cuando la mercaderia llega, la nota de
 *    despacho la suma a la tienda destino sin volver a descontar el origen.
 */

export interface OtherStoreStock {
  locationId: number;
  stock: number;
}

export interface LocationStock {
  locationId: number;
  name: string;
  type: "TIENDA" | "ALMACEN";
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
  /** Desglose de TODAS las ubicaciones: permite validar de donde se puede pedir. */
  byLocation: LocationStock[];
}

export interface OriginAllocation {
  productId: number;
  /** Tienda o almacen de donde sale la mercaderia. */
  fromLocationId: number;
  quantity: number;
}

export interface FulfillmentLine {
  /** Posicion de la linea en el arreglo original, para recuperar su precio. */
  index: number;
  productId: number;
  /** Lo que el vendedor pidio. */
  requested: number;
  /** Lo que realmente se factura. Con el faltante obligatorio, es todo lo pedido. */
  sellable: number;
  /** Lo que se le entrega al cliente ahora. */
  delivered: number;
  /** Lo que queda en camino: se factura pero no se entrega. */
  pending: number;
  /** Lo que sale de la tienda donde se cobra. */
  desDeTienda: number;
  /** Lo que sale de otras tiendas. */
  desDeOtrasTiendas: number;
  /** Reparto del pendiente por ubicacion de origen, una fila por solicitud. */
  origenesPendientes: { locationId: number; quantity: number }[];
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
  /** Productos cuya cantidad hubo que recortar. ConOrigins es obligatorio, queda vacio. */
  capped: CappedProduct[];
  /** Descuentos por ubicacion: tienda propia primero, luego las otras. */
  deductions: FulfillmentDeduction[];
}

/**
 * Error de planificacion con el detalle de que falta asignar. La ruta lo
 * devuelve como 400 para que la pantalla muestre el problema concreto en vez de
 * un "error interno".
 */
export class FulfillmentError extends Error {
  problemas: string[];

  constructor(problemas: string[]) {
    super(problemas.join("; "));
    this.name = "FulfillmentError";
    this.problemas = problemas;
  }
}

const nombreUbicacion = (snap: StockSnapshot | undefined, locationId: number) =>
  snap?.byLocation.find((l) => l.locationId === locationId)?.name || `ubicación ${locationId}`;

export function planFulfillment(
  items: { productId: number; quantity: number }[],
  stock: Record<number, StockSnapshot>,
  storeLocationId: number,
  allocations: OriginAllocation[] = [],
  nombres: Record<number, string> = {},
): FulfillmentPlan {
  const problemas: string[] = [];
  const etiqueta = (productId: number) => nombres[productId] || `producto ${productId}`;

  // --- 1. Lo que sale de la tienda donde se cobra, sin preguntar. ---
  const pedidoPorProducto = new Map<number, number>();
  for (const it of items) {
    pedidoPorProducto.set(it.productId, (pedidoPorProducto.get(it.productId) ?? 0) + it.quantity);
  }

  const desdeTienda = new Map<number, number>();
  const faltante = new Map<number, number>();
  for (const [productId, pedido] of pedidoPorProducto) {
    const propio = Math.min(pedido, stock[productId]?.store ?? 0);
    desdeTienda.set(productId, propio);
    faltante.set(productId, pedido - propio);
  }

  // --- 2. Origenes que eligio el vendedor, acumulados por producto y por ubicacion. ---
  const asignadoPorProducto = new Map<number, number>();
  const porProductoOrigen = new Map<number, Map<number, number>>();
  for (const a of allocations) {
    const cantidad = Math.round(Number(a.quantity));
    const fromLocationId = Number(a.fromLocationId);
    const productId = Number(a.productId);

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      problemas.push(`La cantidad asignada a "${etiqueta(a.productId)}" debe ser un número mayor que cero.`);
      continue;
    }
    if (!Number.isFinite(fromLocationId) || fromLocationId <= 0) {
      problemas.push(`Indicá de qué ubicación sale la mercadería de "${etiqueta(a.productId)}".`);
      continue;
    }
    if (!pedidoPorProducto.has(productId)) {
      problemas.push(`Asignaste mercadería a "${etiqueta(productId)}" pero ese producto no está en la venta.`);
      continue;
    }
    if (fromLocationId === storeLocationId) {
      problemas.push(`"${etiqueta(productId)}" no se pide a tu propia tienda: eso se usa directo del stock que ya tenés.`);
      continue;
    }

    asignadoPorProducto.set(productId, (asignadoPorProducto.get(productId) ?? 0) + cantidad);
    if (!porProductoOrigen.has(productId)) porProductoOrigen.set(productId, new Map());
    const porOrigen = porProductoOrigen.get(productId)!;
    porOrigen.set(fromLocationId, (porOrigen.get(fromLocationId) ?? 0) + cantidad);
  }

  // --- 3. El faltante tiene que quedar cubierto por completo. ---
  for (const [productId, falta] of faltante) {
    const asignado = asignadoPorProducto.get(productId) ?? 0;
    const pedido = pedidoPorProducto.get(productId) ?? 0;
    const propio = desdeTienda.get(productId) ?? 0;
    if (asignado === falta) continue;

    if (falta === 0) {
      problemas.push(
        `Asignaste ${asignado} unidad(es) de "${etiqueta(productId)}" de más: ya hay ${propio} en tu tienda y con eso alcanza.`,
      );
    } else {
      problemas.push(
        `Falta elegir de dónde sale ${falta - asignado > 0 ? falta - asignado : 0} unidad(es) de "${etiqueta(productId)}": ` +
          `pediste ${pedido}, tenés ${propio} en tu tienda y asignaste ${asignado} de las ${falta} que faltaban.`,
      );
    }
  }

  // --- 4. Cada origen tiene que tener stock suficiente. ---
  // Se descuenta lo ya asignado en este mismo producto para que dos lineas del
  // mismo producto no se coman la misma unidad.
  const consumoPorOrigen = new Map<number, Map<number, number>>();
  for (const [productId, porOrigen] of porProductoOrigen) {
    const snap = stock[productId];
    for (const [locationId, cantidad] of porOrigen) {
      const fila = snap?.byLocation.find((l) => l.locationId === locationId);
      if (!fila) {
        problemas.push(
          `"${etiqueta(productId)}" no tiene stock registrado en ${nombreUbicacion(snap, locationId)}.`,
        );
        continue;
      }
      if (!consumoPorOrigen.has(productId)) consumoPorOrigen.set(productId, new Map());
      const gastado = consumoPorOrigen.get(productId)!;
      const yaPedido = gastado.get(locationId) ?? 0;
      const disponible = fila.stock - yaPedido;
      if (cantidad > disponible) {
        problemas.push(
          `"${etiqueta(productId)}" no alcanza en ${fila.name}: pediste ${cantidad} y quedan ${disponible}.`,
        );
      }
      gastado.set(locationId, yaPedido + cantidad);
    }
  }

  if (problemas.length > 0) throw new FulfillmentError(problemas);

  // --- 5. Descuentos: tienda propia y cada origen elegido. ---
  const deductions: FulfillmentDeduction[] = [];
  const descontar = (productId: number, locationId: number, units: number) => {
    if (units <= 0) return;
    const previo = deductions.find((d) => d.productId === productId && d.locationId === locationId);
    if (previo) previo.units += units;
    else deductions.push({ productId, locationId, units });
  };

  for (const [productId, propio] of desdeTienda) descontar(productId, storeLocationId, propio);
  for (const [productId, porOrigen] of porProductoOrigen) {
    for (const [locationId, cantidad] of porOrigen) descontar(productId, locationId, cantidad);
  }

  // --- 6. Reparto en las lineas, en el orden en que las escribio el vendedor. ---
  // Si el mismo producto aparece dos veces, la primera linea se come primero la
  // mercaderia de la tienda y de los orígenes, en ese orden.
  const restanteTienda = new Map(desdeTienda);
  const restanteOrigen = new Map<string, number>();
  for (const [productId, porOrigen] of porProductoOrigen) {
    for (const [locationId, cantidad] of porOrigen) {
      restanteOrigen.set(`${productId}:${locationId}`, cantidad);
    }
  }

  const lines: FulfillmentLine[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const propio = Math.min(it.quantity, restanteTienda.get(it.productId) ?? 0);
    restanteTienda.set(it.productId, (restanteTienda.get(it.productId) ?? 0) - propio);

    let porEntregar = it.quantity - propio;
    const origenesPendientes: { locationId: number; quantity: number }[] = [];
    let desDeOtrasTiendas = 0;
    const porOrigen = porProductoOrigen.get(it.productId);
    if (porOrigen) {
      // Orden estable por ubicacion: dos carritos con la misma asignacion tienen
      // que producir el mismo plan.
      for (const locationId of [...porOrigen.keys()].sort((a, b) => a - b)) {
        if (porEntregar <= 0) break;
        const clave = `${it.productId}:${locationId}`;
        const disponible = restanteOrigen.get(clave) ?? 0;
        const tomar = Math.min(porEntregar, disponible);
        if (tomar <= 0) continue;
        restanteOrigen.set(clave, disponible - tomar);
        porEntregar -= tomar;
        desDeOtrasTiendas += tomar;
        origenesPendientes.push({ locationId, quantity: tomar });
      }
    }

    lines.push({
      index: i,
      productId: it.productId,
      requested: it.quantity,
      sellable: it.quantity,
      delivered: propio,
      pending: it.quantity - propio,
      desDeTienda: propio,
      desDeOtrasTiendas,
      origenesPendientes,
    });
  }

  return { lines, capped: [], deductions };
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
    select: {
      productId: true,
      locationId: true,
      stock: true,
      location: { select: { type: true, name: true } },
    },
  });

  const snapshot: Record<number, StockSnapshot> = {};
  for (const id of productIds) {
    snapshot[id] = { store: 0, otherStores: 0, otherStoreStock: [], warehouses: 0, byLocation: [] };
  }

  for (const row of rows) {
    const entry = snapshot[row.productId];
    if (!entry) continue;
    const stock = row.stock || 0;
    // Primero la tienda donde se cobra. Si ahi no alcanza, el faltante lo elige
    // el vendedor: otra tienda o un almacen. Lo que no hay en ninguna parte no
    // se puede vender y el planificador lo rechaza.
    if (row.locationId === storeLocationId) {
      entry.store = stock;
    } else if (row.location?.type === "ALMACEN") {
      entry.warehouses += stock;
    } else if (row.location?.type === "TIENDA") {
      entry.otherStores += stock;
      entry.otherStoreStock.push({ locationId: row.locationId, stock });
    }
    entry.byLocation.push({
      locationId: row.locationId,
      name: row.location?.name || `Ubicación ${row.locationId}`,
      type: row.location?.type === "ALMACEN" ? "ALMACEN" : "TIENDA",
      stock,
    });
  }

  return snapshot;
}