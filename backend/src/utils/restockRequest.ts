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
  if (open) return null;

  // Origen: el almacen desde donde se envia la mercaderia.
  const origin = await db.location.findFirst({
    where: { type: "ALMACEN" },
    orderBy: { id: "asc" },
  });

  const [product, destination] = await Promise.all([
    db.product.findUnique({ where: { id: productId }, select: { name: true } }),
    db.location.findUnique({ where: { id: destinationId }, select: { name: true } }),
  ]);

  const request = await db.productRequest.create({
    data: {
      productId,
      quantity,
      locationId: destinationId,
      fromLocationId: origin?.id ?? null,
      requestedById,
      source,
      status: "PENDIENTE",
      expectedDate: nextDayAt8(),
      note: args.note ?? null,
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
