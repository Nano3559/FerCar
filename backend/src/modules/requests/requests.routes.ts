import { Router, Response } from "express";
import { PrismaClient, RequestStatus } from "@prisma/client";
import { authenticate, authorize, requireTiendaLocation } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";
import { parseId, parsePositiveInt } from "../../shared/middlewares/validate";
import {
  calcularDisponibilidad,
  errorSiExcede,
  ESTADOS_ABIERTOS,
} from "../../utils/requestAvailability";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
router.use(requireTiendaLocation);

const VALID_STATUSES: RequestStatus[] = [
  "PENDIENTE", "RECIBIDO_POR_INVENTARIO", "PREPARANDO",
  "ENTREGADO", "RECIBIDO_POR_TIENDA", "CANCELADO",
];

const VALID_TRANSITIONS: Record<string, RequestStatus[]> = {
  PENDIENTE: ["RECIBIDO_POR_INVENTARIO", "CANCELADO"],
  RECIBIDO_POR_INVENTARIO: ["PREPARANDO", "CANCELADO"],
  PREPARANDO: ["ENTREGADO", "CANCELADO"],
  ENTREGADO: ["RECIBIDO_POR_TIENDA"],
  RECIBIDO_POR_TIENDA: [],
  CANCELADO: [],
};

const INVENTARIO_STATUSES: RequestStatus[] = ["RECIBIDO_POR_INVENTARIO", "PREPARANDO", "ENTREGADO"];

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

// GET / — Listar solicitudes con filtros + historial
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { status, locationId, startDate, endDate, page = "1", limit = "20" } = req.query;

    const where: any = {};
    if (status && typeof status === "string") where.status = status as RequestStatus;
    if (locationId && typeof locationId === "string") where.locationId = Number(locationId);

    // El registro se conserva siempre; la lista muestra por defecto los
    // últimos 30 días, igual que el historial de devoluciones.
    const from = startDate ? new Date(String(startDate)) : daysAgo(30);
    const to = endDate ? new Date(String(endDate)) : endOfDay(new Date());
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ message: "Rango de fechas inválido" });
    }
    where.date = { gte: startOfDay(from), lte: endOfDay(to) };

    if (req.user?.role === "TIENDA") {
      where.locationId = req.user.locationId;
    }

    const pg = Math.max(1, Number(page) || 1);
    const take = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (pg - 1) * take;

    const [requests, total] = await Promise.all([
      prisma.productRequest.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, itemCode: true, brand: true, model: true } },
          location: { select: { id: true, name: true, type: true } },
          fromLocation: { select: { id: true, name: true, type: true } },
          requestedBy: { select: { id: true, name: true, email: true } },
          confirmedBy: { select: { id: true, name: true } },
          despatchNote: { select: { id: true, noteNumber: true, status: true } },
          history: { orderBy: { createdAt: "asc" } },
        },
        skip,
        take,
        orderBy: { date: "desc" },
      }),
      prisma.productRequest.count({ where }),
    ]);

    res.json({
      requests,
      pagination: { total, page: pg, limit: take, pages: Math.ceil(total / take) },
    });
  } catch (error) {
    console.error("Error al listar solicitudes:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /:id — Detalle de solicitud con historial
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const request = await prisma.productRequest.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true, itemCode: true, brand: true, model: true } },
        location: { select: { id: true, name: true, type: true } },
        fromLocation: { select: { id: true, name: true, type: true } },
        requestedBy: { select: { id: true, name: true, email: true } },
        confirmedBy: { select: { id: true, name: true } },
        despatchNote: { select: { id: true, noteNumber: true, status: true } },
        history: {
          include: { request: false },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!request) return res.status(404).json({ message: "Solicitud no encontrada" });
    if (req.user?.role === "TIENDA" && req.user.locationId && request.locationId !== req.user.locationId) {
      return res.status(403).json({ message: "No tiene acceso a esta solicitud" });
    }
    res.json(request);
  } catch (error: any) {
    if (error.message === "ID inválido") return res.status(400).json({ message: error.message });
    console.error("Error al obtener solicitud:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST — Crear solicitud manual (vendedor o administrador)
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const requesterRole = req.user!.role;
    // Las solicitudes las crean los vendedores (tienda) o los administradores.
    if (requesterRole !== "ADMIN" && requesterRole !== "TIENDA") {
      return res.status(403).json({ message: "Solo vendedores o administradores pueden crear solicitudes" });
    }

    const productId = parsePositiveInt(req.body.productId, "Producto");
    const quantity = parsePositiveInt(req.body.quantity, "Cantidad");
    const note = req.body.note || null;

    if (quantity <= 0) return res.status(400).json({ message: "La cantidad debe ser mayor a 0" });

    // El solicitante y su rol salen del token, no del body
    const requestedById = req.user!.userId;

    // Destino: la tienda del vendedor o la que elija el administrador.
    let locationId: number;
    if (requesterRole === "TIENDA") {
      if (!req.user!.locationId) {
        return res.status(400).json({ message: "Usuario TIENDA sin ubicación asignada" });
      }
      locationId = req.user!.locationId;
    } else {
      locationId = parsePositiveInt(req.body.locationId, "Ubicación");
    }

    // Origen: de dónde requieren el producto (tienda o almacén). Si no se
    // indica, se toma el primer almacén registrado.
    let fromLocationId: number | null = null;
    if (req.body.fromLocationId) {
      fromLocationId = parsePositiveInt(req.body.fromLocationId, "Ubicación de origen");
    } else {
      const almacen = await prisma.location.findFirst({ where: { type: "ALMACEN" }, orderBy: { id: "asc" } });
      fromLocationId = almacen?.id ?? null;
    }
    if (fromLocationId === locationId) {
      return res.status(400).json({ message: "El origen y el destino no pueden ser la misma ubicación" });
    }

    const [product, location, fromLocation] = await Promise.all([
      prisma.product.findUnique({ where: { id: productId } }),
      prisma.location.findUnique({ where: { id: locationId } }),
      fromLocationId
        ? prisma.location.findUnique({ where: { id: fromLocationId } })
        : Promise.resolve(null),
    ]);

    if (!product) return res.status(404).json({ message: "Producto no encontrado" });
    if (!location) return res.status(404).json({ message: "Ubicación no encontrada" });
    if (fromLocationId && !fromLocation) return res.status(404).json({ message: "Ubicación de origen no encontrada" });

    // Una solicitud manual no reserva stock: sigue en su ubicacion hasta que se
    // despacha. Sin este control se podian pedir mas unidades de las que hay en
    // toda la cadena (37 de un producto que tenia 20) y el faltante se descubria
    // recien cuando inventario no encontraba la mercaderia.
    const [inventario, abiertas] = await Promise.all([
      prisma.inventory.findMany({ where: { productId }, select: { stock: true } }),
      prisma.productRequest.findMany({
        where: { productId, status: { in: [...ESTADOS_ABIERTOS] } },
        select: { quantity: true, source: true },
      }),
    ]);
    const disponibilidad = calcularDisponibilidad(inventario, abiertas);
    const error = errorSiExcede(quantity, disponibilidad, product.name);
    if (error) return res.status(400).json({ message: error });

    const request = await prisma.productRequest.create({
      data: {
        productId,
        quantity,
        locationId,
        fromLocationId,
        requestedById,
        source: "MANUAL",
        note,
        history: {
          create: {
            newStatus: "PENDIENTE",
            userId: requestedById,
            userRole: requesterRole,
          },
        },
      },
      include: {
        product: { select: { name: true, itemCode: true } },
        location: { select: { name: true } },
        fromLocation: { select: { name: true } },
        history: true,
      },
    });

    res.status(201).json(request);
  } catch (error: any) {
    if (error.message && !error.message.includes("Prisma")) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error al crear solicitud:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// PUT /:id — Cambiar estado de solicitud con historial
router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const { status } = req.body;

    if (!status) return res.status(400).json({ message: "Campo obligatorio: status" });
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Estado inválido. Valores válidos: ${VALID_STATUSES.join(", ")}` });
    }

    const existing = await prisma.productRequest.findUnique({
      where: { id },
      include: { despatchNote: { select: { id: true, noteNumber: true, status: true } } },
    });
    if (!existing) return res.status(404).json({ message: "Solicitud no encontrada" });

    const allowedTransitions = VALID_TRANSITIONS[existing.status] || [];
    if (!allowedTransitions.includes(status)) {
      return res.status(400).json({
        message: `No se puede cambiar de "${existing.status}" a "${status}"`,
      });
    }

    // El stock solo se mueve al entregar la nota de despacho: es la que descuenta
    // el origen, suma a la tienda destino y crea la fila de Movement. Marcar
    // "Entregado" a mano dejaba solicitudes cerradas con el inventario intacto,
    // sin documento ni movimiento que explicara el traslado.
    if (status === "ENTREGADO") {
      return res.status(400).json({
        message: existing.despatchNoteId
          ? `Esta solicitud se entrega con la nota ${existing.despatchNote?.noteNumber}. Entrega la nota para mover el stock.`
          : "Esta solicitud no tiene nota de despacho: genera la nota en Despachos y entregala para mover el stock.",
      });
    }
    // "Recibido por Tienda" solo confirma una entrega que ya hizo la nota.
    if (status === "RECIBIDO_POR_TIENDA" && !existing.despatchNoteId) {
      return res.status(400).json({
        message: "Esta solicitud no tiene nota de despacho: genera la nota en Despachos y entregala para mover el stock.",
      });
    }

    // Una solicitud de venta ya descontó su origen al cobrar. Al cancelarla esa
    // mercadería tiene que volver al origen: si no, sale del inventario y no se
    // la lleva nadie.
    //
    // Si ya está dentro de una nota de despacho no se puede cancelar así: la nota
    // entregaría igual las unidades de esa solicitud. Hay que anular la nota
    // primero.
    if (status === "CANCELADO" && existing.despatchNoteId) {
      return res.status(400).json({
        message:
          `No se puede cancelar: esta solicitud ya está dentro de la nota ` +
          `${existing.despatchNote?.noteNumber}. Anulá la nota primero.`,
      });
    }

    const role = req.user?.role || "";
    if (INVENTARIO_STATUSES.includes(status) && role !== "ADMIN" && role !== "INVENTARIO") {
      return res.status(403).json({ message: "Solo INVENTARIO o ADMIN pueden realizar esta acción" });
    }
    if (status === "RECIBIDO_POR_TIENDA" && role !== "ADMIN" && role !== "TIENDA") {
      return res.status(403).json({ message: "Solo TIENDA o ADMIN pueden confirmar recepción" });
    }
    // La llegada del producto la confirma quien pidió el producto.
    if (
      status === "RECIBIDO_POR_TIENDA" &&
      role !== "ADMIN" &&
      existing.requestedById !== req.user?.userId
    ) {
      return res.status(403).json({
        message: "Solo quien creó la solicitud puede confirmar la recepción del producto",
      });
    }
    if (role === "TIENDA" && existing.locationId !== req.user?.locationId) {
      return res.status(403).json({ message: "No puede modificar solicitudes de otra tienda" });
    }

    const STATUS_LABELS: Record<string, string> = {
      PENDIENTE: "Pendiente",
      RECIBIDO_POR_INVENTARIO: "Recibido por Inventario",
      PREPARANDO: "Preparando",
      ENTREGADO: "Entregado",
      RECIBIDO_POR_TIENDA: "Recibido por Tienda",
      CANCELADO: "Cancelado",
    };

    const updated = await prisma.$transaction(async (tx) => {
      const solicitud = await tx.productRequest.update({
        where: { id },
        data: {
          status,
          ...(status === "RECIBIDO_POR_TIENDA"
            ? { confirmedById: req.user?.userId ?? null, confirmedAt: new Date() }
            : {}),
        },
        include: {
          product: { select: { name: true, itemCode: true } },
          location: { select: { name: true } },
          fromLocation: { select: { name: true } },
          requestedBy: { select: { name: true } },
          confirmedBy: { select: { name: true } },
        },
      });

      await tx.requestHistory.create({
        data: {
          requestId: id,
          previousStatus: existing.status,
          newStatus: status,
          userId: req.user?.userId || 0,
          userRole: role,
        },
      });

      // Si la solicitud nació de una venta, la mercadería que acaba de llegar
      // ES la parte de esa venta que estaba pendiente. Se suma a lo entregado
      // para que el pedido figure completo, sin tocar el estado de pago: una
      // venta pagada y aun no entregada sigue pagada.
      if (status === "RECIBIDO_POR_TIENDA" && existing.saleItemId) {
        const item = await tx.saleItem.findUnique({ where: { id: existing.saleItemId } });
        if (item) {
          const porEntregar = Math.max(item.quantity - item.deliveredQuantity, 0);
          const ahoraEntregado = Math.min(existing.quantity, porEntregar);
          if (ahoraEntregado > 0) {
            await tx.saleItem.update({
              where: { id: item.id },
              data: { deliveredQuantity: item.deliveredQuantity + ahoraEntregado },
            });

            const completa = item.deliveredQuantity + ahoraEntregado >= item.quantity;
            await tx.notification.create({
              data: {
                userId: existing.requestedById,
                title: `Venta #${existing.saleId} ${completa ? "completada" : "avanzada"}`,
                message: completa
                  ? `Llegó todo lo pendiente de "${solicitud.product?.name}". La venta #${existing.saleId} queda completa.`
                  : `Llegaron ${ahoraEntregado} de las ${item.quantity - item.deliveredQuantity} unidades que faltaban de "${solicitud.product?.name}" (venta #${existing.saleId}).`,
                type: "INFO",
                linkUrl: "/panel/ventas",
              },
            });
          }
        }
      }

      // Cancelar una solicitud de venta devuelve su mercadería al origen: al
      // vender, el origen ya fue descontado, así que si no se la devolvemos esa
      // unidad sale del inventario y no se la lleva nadie. La línea de la venta
      // queda corta en esa cantidad y queda avisada a quien la cobró.
      if (status === "CANCELADO" && existing.saleItemId) {
        const origenId = existing.fromLocationId ?? existing.locationId;
        // Igual que una devolución: si la fila de inventario del origen no
        // existe la creamos, porque tirar la unidad la perdería igual que antes.
        await tx.inventory.upsert({
          where: { productId_locationId: { productId: existing.productId, locationId: origenId } },
          update: { stock: { increment: existing.quantity } },
          create: { productId: existing.productId, locationId: origenId, stock: existing.quantity, minStock: 1 },
        });

        await tx.notification.create({
          data: {
            userId: existing.requestedById,
            title: `Venta #${existing.saleId}: solicitud cancelada`,
            message:
              `Se cancelaron ${existing.quantity} de "${solicitud.product?.name}" que iban ` +
              `de ${solicitud.fromLocation?.name} a ${solicitud.location?.name}. Esas unidades volvieron ` +
              `al inventario del origen y la venta #${existing.saleId} queda corta en ${existing.quantity}.`,
            type: "WARNING",
            linkUrl: "/panel/ventas",
          },
        });
      }

      return solicitud;
    });

    // Notify the requester about status change. En una cancelación de solicitud de
    // venta ya se mandó la que explica el stock devuelto: no mandar dos.
    if (
      existing.requestedById &&
      existing.requestedById !== req.user?.userId &&
      !(status === "CANCELADO" && existing.saleItemId)
    ) {
      const actor = await prisma.user.findUnique({
        where: { id: req.user?.userId || 0 },
        select: { name: true },
      });
      await prisma.notification.create({
        data: {
          userId: existing.requestedById,
          title: `Solicitud #${id} - ${STATUS_LABELS[status] || status}`,
          message: `La solicitud del producto "${updated.product?.name}" fue cambiada a "${STATUS_LABELS[status] || status}" por ${actor?.name || "Sistema"}.`,
          type: status === "CANCELADO" ? "WARNING" : "INFO",
          linkUrl: "/panel/solicitudes",
        },
      });
    }

    res.json(updated);
  } catch (error: any) {
    if (error.message === "ID inválido") return res.status(400).json({ message: error.message });
    console.error("Error al actualizar solicitud:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// DELETE /:id — Cancelar solicitud
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const existing = await prisma.productRequest.findUnique({
      where: { id },
      include: {
        product: { select: { name: true } },
        fromLocation: { select: { name: true } },
        location: { select: { name: true } },
        despatchNote: { select: { noteNumber: true } },
      },
    });
    if (!existing) return res.status(404).json({ message: "Solicitud no encontrada" });

    if (existing.status === "RECIBIDO_POR_TIENDA" || existing.status === "CANCELADO") {
      return res.status(400).json({ message: "No se puede cancelar una solicitud ya recibida o cancelada" });
    }

    // Mismo criterio que el PUT: la nota es la que mueve el stock, cancelar a
    // mano dejaría la nota entregando unidades que ya no corresponden.
    if (existing.despatchNoteId) {
      return res.status(400).json({
        message:
          `No se puede cancelar: esta solicitud ya está dentro de la nota ` +
          `${existing.despatchNote?.noteNumber}. Anulá la nota primero.`,
      });
    }

    // Solo ADMIN/INVENTARIO o la tienda propietaria pueden cancelar
    const delRole = req.user?.role || "";
    if (delRole !== "ADMIN" && delRole !== "INVENTARIO") {
      if (delRole !== "TIENDA" || existing.locationId !== req.user?.locationId) {
        return res.status(403).json({ message: "No tiene permisos para cancelar esta solicitud" });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.productRequest.update({ where: { id }, data: { status: "CANCELADO" } });
      await tx.requestHistory.create({
        data: {
          requestId: id,
          previousStatus: existing.status,
          newStatus: "CANCELADO",
          userId: req.user?.userId || 0,
          userRole: req.user?.role || "ADMIN",
        },
      });

      // Igual que el PUT: si la solicitud surte de una venta, su origen ya fue
      // descontado al cobrar, así que cancelarla tiene que devolverle la unidad.
      if (existing.saleItemId) {
        const origenId = existing.fromLocationId ?? existing.locationId;
        await tx.inventory.upsert({
          where: { productId_locationId: { productId: existing.productId, locationId: origenId } },
          update: { stock: { increment: existing.quantity } },
          create: { productId: existing.productId, locationId: origenId, stock: existing.quantity, minStock: 1 },
        });

        if (existing.requestedById) {
          await tx.notification.create({
            data: {
              userId: existing.requestedById,
              title: `Venta #${existing.saleId}: solicitud cancelada`,
              message:
                `Se cancelaron ${existing.quantity} de "${existing.product?.name}" que iban ` +
                `de ${existing.fromLocation?.name} a ${existing.location?.name}. Esas unidades volvieron ` +
                `al inventario del origen y la venta #${existing.saleId} queda corta en ${existing.quantity}.`,
              type: "WARNING",
              linkUrl: "/panel/ventas",
            },
          });
        }
      }
    });

    // Notify the requester about cancellation. En una solicitud de venta ya se
    // mandó la que explica el stock devuelto.
    if (existing.requestedById && !existing.saleItemId) {
      await prisma.notification.create({
        data: {
          userId: existing.requestedById,
          title: `Solicitud #${id} - Cancelada`,
          message: `La solicitud fue cancelada por ${req.user?.role || "Sistema"}.`,
          type: "WARNING",
          linkUrl: "/panel/solicitudes",
        },
      });
    }

    res.json({ message: "Solicitud cancelada" });
  } catch (error: any) {
    if (error.message === "ID inválido") return res.status(400).json({ message: error.message });
    console.error("Error al cancelar solicitud:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;
