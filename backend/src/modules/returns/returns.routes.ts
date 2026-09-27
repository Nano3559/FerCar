import { Router, Response } from "express";
import { PrismaClient, PaymentMethod } from "@prisma/client";
import { authenticate, authorize, requireTiendaLocation } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";
import { parseId, parsePositiveInt, parseString } from "../../shared/middlewares/validate";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
router.use(requireTiendaLocation);
router.use(authorize("ADMIN", "TIENDA"));

const VALID_METHODS: PaymentMethod[] = ["EFECTIVO", "QR", "TRANSFERENCIA", "CREDITO"];

// GET / — Listar devoluciones con filtros
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { saleId, productId, locationId, seller, startDate, endDate, page = "1", limit = "20" } = req.query;

    const where: any = {};
    if (saleId && typeof saleId === "string") where.saleId = Number(saleId);
    if (productId && typeof productId === "string") where.productId = Number(productId);

    // Retención: por defecto solo los últimos 30 días
    const DAY_MS = 24 * 60 * 60 * 1000;
    const dateFilter: any = {};
    if (startDate && typeof startDate === "string") dateFilter.gte = new Date(startDate);
    if (endDate && typeof endDate === "string") dateFilter.lte = new Date(endDate);
    if (Object.keys(dateFilter).length === 0) {
      dateFilter.gte = new Date(Date.now() - 30 * DAY_MS);
    }
    where.date = dateFilter;

    const user = req.user!;
    const saleFilters: any = {};
    if (user.role === "TIENDA") {
      saleFilters.locationId = user.locationId;
    } else if (locationId && typeof locationId === "string") {
      saleFilters.locationId = Number(locationId);
    }
    if (seller && typeof seller === "string") {
      saleFilters.seller = seller;
    }
    if (Object.keys(saleFilters).length > 0) {
      where.sale = saleFilters;
    }

    const pg = Math.max(1, Number(page) || 1);
    const take = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (pg - 1) * take;

    const [returns, total] = await Promise.all([
      prisma.return.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, itemCode: true, brand: true } },
          sale: { select: { id: true, saleDate: true, total: true, type: true, locationId: true, seller: true } },
        },
        skip,
        take,
        orderBy: { date: "desc" },
      }),
      prisma.return.count({ where }),
    ]);

    res.json({
      returns,
      pagination: { total, page: pg, limit: take, pages: Math.ceil(total / take) },
    });
  } catch (error) {
    console.error("Error al listar devoluciones:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /recent-sales — Ventas recientes (últimos 10 días) filtradas por ubicación/rol
router.get("/recent-sales", async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const where: any = {
      saleDate: { gte: new Date(Date.now() - 10 * DAY_MS) },
    };
    if (user.role === "TIENDA" && user.locationId) {
      where.locationId = user.locationId;
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        location: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, nit: true } },
        items: { include: { product: { select: { id: true, name: true, itemCode: true } } } },
        returns: true,
      },
      orderBy: { saleDate: "desc" },
      take: 20,
    });

    res.json({ sales });
  } catch (error) {
    console.error("Error al obtener ventas recientes:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /sale/:saleId — Buscar venta por ID para ver sus items
router.get("/sale/:saleId", async (req: AuthRequest, res: Response) => {
  try {
    const saleId = parseId(req.params.saleId);
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: { include: { product: true } },
        customer: true,
        payments: true,
        returns: true,
        location: true,
      },
    });
    if (!sale) return res.status(404).json({ message: "Venta no encontrada" });

    const lookupUser = req.user!;
    if (lookupUser.role === "TIENDA" && lookupUser.locationId && sale.locationId !== lookupUser.locationId) {
      return res.status(403).json({ message: "No tiene acceso a esta venta" });
    }

    const DAY_MS = 24 * 60 * 60 * 1000;
    const daysOld = Math.round(((Date.now() - new Date(sale.saleDate).getTime()) / DAY_MS) * 10) / 10;
    res.json({ ...sale, daysOld: Math.max(0, daysOld), returnable: daysOld <= 10 });
  } catch (error: any) {
    if (error.message === "ID inválido") return res.status(400).json({ message: error.message });
    console.error("Error al buscar venta:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST — Registrar devoluciones (una o varias en lote)
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const saleId = parsePositiveInt(req.body.saleId, "Venta");
    const reason = parseString(req.body.reason, "Motivo", { required: true, max: 500 });
    const method = req.body.method as PaymentMethod;

    if (!VALID_METHODS.includes(method)) {
      return res.status(400).json({ message: `Método inválido. Valores válidos: ${VALID_METHODS.join(", ")}` });
    }

    let payloadItems: { productId: number; quantity: number }[];
    if (Array.isArray(req.body.items) && req.body.items.length > 0) {
      payloadItems = req.body.items.map((it: any) => ({
        productId: parsePositiveInt(it?.productId, "Producto"),
        quantity: parsePositiveInt(it?.quantity, "Cantidad"),
      }));
    } else if (req.body.productId !== undefined) {
      payloadItems = [{
        productId: parsePositiveInt(req.body.productId, "Producto"),
        quantity: parsePositiveInt(req.body.quantity, "Cantidad"),
      }];
    } else {
      return res.status(400).json({ message: "Selecciona al menos un producto a devolver" });
    }

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true, location: true },
    });
    if (!sale) return res.status(404).json({ message: "Venta no encontrada" });

    const returnUser = req.user!;
    if (returnUser.role === "TIENDA" && returnUser.locationId && sale.locationId !== returnUser.locationId) {
      return res.status(403).json({ message: "No puede devolver productos de una venta de otra tienda" });
    }

    // Regla: solo se pueden devolver ventas dentro de los últimos 10 días
    const DAY_MS = 24 * 60 * 60 * 1000;
    const daysOld = (Date.now() - new Date(sale.saleDate).getTime()) / DAY_MS;
    if (daysOld > 10) {
      return res.status(400).json({
        message: `No se puede devolver una venta con más de 10 días (venta del ${new Date(sale.saleDate).toLocaleDateString("es-BO")})`,
      });
    }

    const previousReturns = await prisma.return.findMany({
      where: { saleId, productId: { in: payloadItems.map((i) => i.productId) } },
    });

    // Validar cantidades y calcular montos (precio vendido × cantidad)
    const pending: { productId: number; quantity: number; amount: number }[] = [];
    for (const it of payloadItems) {
      const saleItem = sale.items.find((i) => i.productId === it.productId);
      if (!saleItem) return res.status(400).json({ message: `El producto con ID ${it.productId} no pertenece a esta venta` });
      if (it.quantity <= 0) return res.status(400).json({ message: "La cantidad a devolver debe ser mayor a 0" });

      const alreadyReturned = previousReturns
        .filter((r) => r.productId === it.productId)
        .reduce((sum, r) => sum + r.quantity, 0);
      if (alreadyReturned + it.quantity > saleItem.quantity) {
        const remaining = saleItem.quantity - alreadyReturned;
        return res.status(400).json({
          message: `Ya se devolvieron ${alreadyReturned} de ${saleItem.quantity} unidades de un producto. Máximo adicional: ${Math.max(remaining, 0)}.`,
        });
      }

      pending.push({ productId: it.productId, quantity: it.quantity, amount: Number(saleItem.unitPrice) * it.quantity });
    }

    const created = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const p of pending) {
        const ret = await tx.return.create({
          data: { saleId, productId: p.productId, reason: reason!, quantity: p.quantity, amount: p.amount, method },
        });
        await tx.inventory.upsert({
          where: { productId_locationId: { productId: p.productId, locationId: sale.locationId } },
          update: { stock: { increment: p.quantity } },
          create: { productId: p.productId, locationId: sale.locationId, stock: p.quantity, minStock: 1 },
        });
        results.push(ret);
      }
      return results;
    });

    res.status(201).json({
      returns: created,
      total: pending.reduce((sum, p) => sum + Number(p.amount), 0),
    });
  } catch (error: any) {
    if (error.message && !error.message.includes("Prisma")) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error al registrar devolución:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;
