import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, authorizeModule } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";
import { parsePositiveInt, parseString } from "../../shared/middlewares/validate";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET / — Historial de movimientos con filtros (requiere permiso del módulo "movimientos")
router.get("/", authorizeModule("movimientos"), async (req: AuthRequest, res: Response) => {
  try {
    const { productId, fromLocationId, toLocationId, search, startDate, endDate, page = "1", limit = "20" } = req.query;

    const where: any = {};
    if (productId && typeof productId === "string") where.productId = Number(productId);
    if (fromLocationId && typeof fromLocationId === "string") where.fromLocationId = Number(fromLocationId);
    if (toLocationId && typeof toLocationId === "string") where.toLocationId = Number(toLocationId);
    if (search && typeof search === "string" && search.trim()) {
      const q = search.trim();
      where.product = {
        OR: [
          { factoryCode: { contains: q, mode: "insensitive" } },
          { itemCode: { contains: q, mode: "insensitive" } },
          { oemCode: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      };
    }
    if (startDate || endDate) {
      where.date = {};
      if (startDate && typeof startDate === "string") where.date.gte = new Date(startDate);
      if (endDate && typeof endDate === "string") {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.date.lte = end;
      }
    }

    const pg = Math.max(1, Number(page) || 1);
    const take = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (pg - 1) * take;

    const [movements, total] = await Promise.all([
      prisma.movement.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, itemCode: true, brand: true, factoryCode: true } },
          fromLocation: { select: { id: true, name: true, type: true } },
          toLocation: { select: { id: true, name: true, type: true } },
          user: { select: { id: true, name: true } },
          request: { select: { id: true, status: true } },
        },
        orderBy: { date: "desc" },
        skip,
        take,
      }),
      prisma.movement.count({ where }),
    ]);

    res.json({
      movements,
      pagination: { total, page: pg, limit: take, pages: Math.ceil(total / take) },
    });
  } catch (error) {
    console.error("Error al listar movimientos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST / — Registrar movimiento (requiere permiso del módulo "movimientos")
router.post("/", authorizeModule("movimientos"), async (req: AuthRequest, res: Response) => {
  try {
    const productId = parsePositiveInt(req.body.productId, "Producto");
    const fromLocationId = parsePositiveInt(req.body.fromLocationId, "Ubicación origen");
    const toLocationId = parsePositiveInt(req.body.toLocationId, "Ubicación destino");
    const quantity = parsePositiveInt(req.body.quantity, "Cantidad");
    const observation = parseString(req.body.observation, "Observación", { max: 500 });
    const requester = parseString(req.body.requester, "Solicitado por", { max: 200 });
    const requestId = req.body.requestId ? Number(req.body.requestId) : null;

    if (fromLocationId === toLocationId) {
      return res.status(400).json({ message: "La ubicación de origen y destino no pueden ser la misma" });
    }

    const user = req.user!;

    const [product, fromLocation, toLocation] = await Promise.all([
      prisma.product.findUnique({ where: { id: productId } }),
      prisma.location.findUnique({ where: { id: fromLocationId } }),
      prisma.location.findUnique({ where: { id: toLocationId } }),
    ]);

    if (!product) return res.status(404).json({ message: "Producto no encontrado" });
    if (!fromLocation) return res.status(404).json({ message: "Ubicación de origen no encontrada" });
    if (!toLocation) return res.status(404).json({ message: "Ubicación de destino no encontrada" });

    if (fromLocation.type !== "ALMACEN") {
      return res.status(400).json({ message: "El movimiento solo puede originarse desde un almacén" });
    }
    if (toLocation.type !== "TIENDA") {
      return res.status(400).json({ message: "El destino del movimiento debe ser una tienda" });
    }

    // Si el movimiento está ligado a una solicitud, el solicitante sale de la misma
    let requesterName = requester || null;
    if (requestId && !requesterName) {
      const linkedRequest = await prisma.productRequest.findUnique({
        where: { id: requestId },
        include: { requestedBy: { select: { name: true } } },
      });
      if (!linkedRequest) return res.status(404).json({ message: "Solicitud no encontrada" });
      requesterName = linkedRequest.requestedBy?.name || null;
    }

    const inventoryOrigin = await prisma.inventory.findUnique({
      where: { productId_locationId: { productId, locationId: fromLocationId } },
    });

    if (!inventoryOrigin || inventoryOrigin.stock < quantity) {
      const available = inventoryOrigin?.stock || 0;
      return res.status(400).json({ message: `Stock insuficiente en origen. Disponible: ${available}, solicitado: ${quantity}` });
    }

    const movement = await prisma.$transaction(async (tx) => {
      // Bloqueo pesimista: re-leer stock dentro de la transacción
      const lockedOrigin = await tx.$queryRaw<{ id: number; stock: number }[]>`
        SELECT id, stock FROM "Inventory"
        WHERE "productId" = ${productId} AND "locationId" = ${fromLocationId}
        FOR UPDATE`;

      if (!lockedOrigin.length || lockedOrigin[0].stock < quantity) {
        throw new Error(`Stock insuficiente en origen. Disponible: ${lockedOrigin[0]?.stock || 0}, solicitado: ${quantity}`);
      }

      await tx.inventory.update({
        where: { id: lockedOrigin[0].id },
        data: { stock: { decrement: quantity } },
      });

      const inventoryDest = await tx.inventory.findUnique({
        where: { productId_locationId: { productId, locationId: toLocationId } },
      });

      if (inventoryDest) {
        await tx.inventory.update({
          where: { id: inventoryDest.id },
          data: { stock: { increment: quantity } },
        });
      } else {
        await tx.inventory.create({
          data: { productId, locationId: toLocationId, stock: quantity, minStock: 0 },
        });
      }

      return tx.movement.create({
        data: { productId, fromLocationId, toLocationId, quantity, userId: user.userId, observation, requestId, requester: requesterName },
        include: {
          product: { select: { name: true, itemCode: true, factoryCode: true } },
          fromLocation: { select: { name: true } },
          toLocation: { select: { name: true } },
          user: { select: { name: true } },
          request: { select: { id: true, status: true } },
        },
      });
    });

    res.status(201).json(movement);
  } catch (error: any) {
    if (error.message && !error.message.includes("Prisma")) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error al registrar movimiento:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;
