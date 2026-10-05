import { Prisma, PrismaClient, RequestStatus } from "@prisma/client";
import { nextDayAt8 } from "./replenish";

type Db = Prisma.TransactionClient | PrismaClient;

// Una solicitud sigue abierta si inventario ya la tomo o si el producto aun
// esta en camino. Mientras exista una abierta no se genera otra para el mismo
// producto y destino.
const OPEN_STATUSES: RequestStatus[] = [
  "PENDIENTE", "RECIBIDO_POR_INVENTARIO", "PREPARANDO", "ENTREGADO",
];

export type RestockSource = "VENTA" | "STOCK_MINIMO";

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

  // Origen: de donde sale la mercaderia. Si la venta eligio una ubicacion se
  // respeta esa eleccion; si no, se cae al primer almacen.
  let originId = args.fromLocationId ?? null;
  if (originId !== null) {
    const elegido = await db.location.findUnique({ where: { id: originId }, select: { id: true } });
    if (!elegido) throw new Error(`La ubicación de origen ${originId} no existe`);
    if (originId === destinationId) {
      throw new Error("El origen y el destino de la solicitud no pueden ser la misma ubicación");
    }
  } else {
    const origin = await db.location.findFirst({
      where: { type: "ALMACEN" },
      orderBy: { id: "asc" },
    });
    originId = origin?.id ?? null;
  }

  const [product, destination] = await Promise.all([
    db.product.findUnique({ where: { id: productId }, select: { name: true } }),
    db.location.findUnique({ where: { id: destinationId }, select: { name: true } }),
  ]);

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
