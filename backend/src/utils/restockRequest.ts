import { Prisma, PrismaClient, RequestStatus } from "@prisma/client";
import { nextDayAt8 } from "./replenish";
import { calcularDisponibilidad, retieneStockEnOrigen } from "./requestAvailability";

type Db = Prisma.TransactionClient | PrismaClient;

// Una solicitud sigue abierta si inventario ya la tomo o si el producto aun
// esta en camino. Mientras exista una abierta no se genera otra para el mismo
// producto y destino.
const OPEN_STATUSES: RequestStatus[] = [
  "PENDIENTE", "RECIBIDO_POR_INVENTARIO", "PREPARANDO", "ENTREGADO",
];

export type RestockSource = "VENTA" | "STOCK_MINIMO";

// Cuanto queda en una ubicacion origen: su stock menos las solicitudes abiertas
// que todavia no lo descontaron. Es el techo de una solicitud nueva o de lo que
// se sume a una existente.
async function disponibleEnOrigen(
  db: Db,
  productId: number,
  originId: number,
  excluirRequestId: number | null,
): Promise<number> {
  const [inv, abiertas] = await Promise.all([
    db.inventory.findUnique({
      where: { productId_locationId: { productId, locationId: originId } },
      select: { stock: true },
    }),
    db.productRequest.findMany({
      where: {
        productId,
        fromLocationId: originId,
        status: { in: OPEN_STATUSES },
        ...(excluirRequestId ? { id: { not: excluirRequestId } } : {}),
      },
      select: { quantity: true, saleItemId: true },
    }),
  ]);
  return calcularDisponibilidad([{ stock: inv?.stock ?? 0 }], abiertas).disponible;
}

export interface RestockArgs {
  productId: number;
  /** Tienda (o ubicacion) que necesita el producto. */
  destinationId: number;
  /** Usuario que figura como solicitante de la solicitud. */
  requestedById: number;
  source: RestockSource;
  /**
   * Cantidad explicita. Si se omite, se deriva del stock minimo de la
   * ubicacion destino y solo se crea cuando el stock quedo por debajo.
   */
  quantity?: number;
  note?: string;
  /**
   * De donde sale la mercaderia: una tienda o un almacen. Cuando la venta lo
   * elige el vendedor se pasa aqui; si se omite se usa el primer almacen, que es
   * lo que corresponde al job de stock minimo.
   */
  fromLocationId?: number | null;
  /** Venta que origino la solicitud, si fue por stock faltante al vender. */
  saleId?: number | null;
  /** Linea de venta que esta solicitud va a completar. */
  saleItemId?: number | null;
}

/**
 * Crea una solicitud de reposicion desde el almacen hacia la tienda que se
 * quedo sin stock. Se usa en dos casos:
 *  - al registrar una venta que dejo el stock en cero o por debajo del minimo
 *  - en el job diario, para cualquier tienda bajo minimo
 *
 * Devuelve el id de la solicitud creada o null si no correspondia crear una.
 */
export async function ensureRestockRequest(db: Db, args: RestockArgs): Promise<number | null> {
  const { productId, destinationId, requestedById, source } = args;

  let quantity = args.quantity ?? 0;

  if (!args.quantity) {
    const inv = await db.inventory.findUnique({
      where: { productId_locationId: { productId, locationId: destinationId } },
    });
    // Sin registro de inventario no hay minimo contra el cual comparar.
    if (!inv) return null;
    const belowMin = inv.stock === 0 || (inv.minStock > 0 && inv.stock < inv.minStock);
    if (!belowMin) return null;
    quantity = inv.minStock > 0 ? inv.minStock - inv.stock : 1;
  }

  quantity = Math.max(1, Math.round(quantity));

  const open = await db.productRequest.findFirst({
    where: { productId, locationId: destinationId, status: { in: OPEN_STATUSES } },
  });

// Una solicitud atada a una linea de venta nunca se fusiona con otra abierta:
  // al llegar la mercaderia hay que poder saber que pedido cierra cada unidad.
  if (open && !args.saleItemId) {
    // Ya hay una solicitud abierta porque el producto esta en camino. Si el
    // motivo es una venta, la cantidad nueva se SUMA a la de esa solicitud: si
    // no, se perdia en silencio y el almacen llevaba de menos. Por ejemplo,
    // si se venden 1 y luego 3 con stock 0, la solicitud queda 1 y 4, no 1 y 1.
    //
    // El job de stock minimo NO suma: corre todos los dias y sin este tope
    // inflaria la cantidad sin limite.
    if (source !== "VENTA") return null;

    // El origen todavia tiene la mercaderia (no es una solicitud de venta ya
    // descontada): lo que se sume tiene que caber en lo que queda ahi.
    const origenExistente = open.fromLocationId ?? open.locationId;
    const disponible = await disponibleEnOrigen(db, productId, origenExistente, open.id);
    const ocupado = retieneStockEnOrigen(open) ? open.quantity : 0;
    const margen = disponible - ocupado;
    if (margen <= 0) {
      console.warn(
        `[replenish] ${productId}: el origen ${origenExistente} no tiene margen para sumar a la solicitud #${open.id}`,
      );
      return open.id;
    }
    quantity = Math.min(quantity, margen);

    const nuevaCantidad = open.quantity + quantity;
    const [product, destination] = await Promise.all([
      db.product.findUnique({ where: { id: productId }, select: { name: true } }),
      db.location.findUnique({ where: { id: destinationId }, select: { name: true } }),
    ]);

    await db.productRequest.update({
      where: { id: open.id },
      data: {
        quantity: nuevaCantidad,
        history: {
          create: {
            previousStatus: open.status,
            newStatus: open.status,
            userId: requestedById,
            userRole: "AUTOMATICO",
          },
        },
      },
    });

    const nombre = product?.name || "Producto";
    const destinoNombre = destination?.name || "la tienda";
    const inventarioUsers = await db.user.findMany({ where: { role: { name: "INVENTARIO" } } });
    const recipients = inventarioUsers.length > 0 ? inventarioUsers : [{ id: requestedById }];

    for (const u of recipients) {
      await db.notification.create({
        data: {
          userId: u.id,
          title: "Reposición automática",
          message: `La solicitud #${open.id} de "${nombre}" para ${destinoNombre} subió de ${open.quantity} a ${nuevaCantidad} unidades: otra venta volvió a consumir lo que había.`,
          type: "WARNING",
          linkUrl: "/panel/solicitudes",
        },
      });
    }

    console.log(
      `[replenish] Solicitud #${open.id} (${source}) ${product?.name} -> ${destination?.name}: ${open.quantity} + ${quantity} = ${nuevaCantidad}`
    );

    return open.id;
  }

  // Origen: SOLO desde ALMACÉN. No se crean solicitudes si solo hay stock en otras tiendas.
  let originId: number | null = null;

  const almacenes = await db.location.findMany({
    where: { type: "ALMACEN" },
    orderBy: { id: "asc" },
    select: { id: true },
  });

  if (almacenes.length === 0) {
    return null;
  }

  for (const alm of almacenes) {
    const disp = await disponibleEnOrigen(db, productId, alm.id, null);
    if (disp > 0) {
      originId = alm.id;
      break;
    }
  }

  if (originId === null) {
    console.warn(
      `[replenish] ${productId}: no hay stock disponible en ningún ALMACÉN. No se crea solicitud para destino ${destinationId}`,
    );
    return null;
  }

  if (originId === destinationId) {
    return null;
  }

  const [product, destination] = await Promise.all([
    db.product.findUnique({ where: { id: productId }, select: { name: true } }),
    db.location.findUnique({ where: { id: destinationId }, select: { name: true } }),
  ]);

  // Lo que no nace de una linea de venta (reposicion automatica de una venta,
  // stock minimo) todavia tiene la mercaderia en el origen: la solicitud no
  // puede prometer mas de lo que queda ahi.
  if (!args.saleItemId && originId !== null) {
    const disponible = await disponibleEnOrigen(db, productId, originId, null);
    if (disponible <= 0) {
      console.warn(
        `[replenish] ${productId}: el origen ${originId} no tiene stock; no se crea la solicitud para ${destinationId}`,
      );
      return null;
    }
    quantity = Math.min(quantity, disponible);
  }

  const request = await db.productRequest.create({
    data: {
      productId,
      quantity,
      locationId: destinationId,
      fromLocationId: originId,
      requestedById,
      source,
      status: "PENDIENTE",
      expectedDate: nextDayAt8(),
      note: args.note ?? null,
      saleId: args.saleId ?? null,
      saleItemId: args.saleItemId ?? null,
      history: {
        create: {
          newStatus: "PENDIENTE",
          userId: requestedById,
          userRole: "AUTOMATICO",
        },
      },
    },
    select: { id: true },
  });

  const motivo =
    source === "VENTA"
      ? "se generó al registrar una venta"
      : "el stock quedó por debajo del mínimo";

  const inventarioUsers = await db.user.findMany({ where: { role: { name: "INVENTARIO" } } });
  const recipients = inventarioUsers.length > 0 ? inventarioUsers : [{ id: requestedById }];

  for (const u of recipients) {
    await db.notification.create({
      data: {
        userId: u.id,
        title: "Reposición automática",
        message: `"${product?.name || "Producto"}" en ${destination?.name || "la tienda"} ${motivo}. Solicitud #${request.id} por ${quantity} unidad(es).`,
        type: "WARNING",
        linkUrl: "/panel/solicitudes",
      },
    });
  }

  console.log(
    `[replenish] Solicitud #${request.id} (${source}) ${product?.name} -> ${destination?.name}`
  );

  return request.id;
}
