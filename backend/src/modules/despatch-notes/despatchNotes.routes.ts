import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, authorize } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";
import { parseId, parsePositiveInt, parseString } from "../../shared/middlewares/validate";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
router.use(authorize("ADMIN"));

type DespatchItemInput = {
  productId?: any;
  quantity?: any;
  locationId?: any;
};

// POST / — Crear una nota de despacho (documental: no afecta stock).
// Recibe items: [{ productId, quantity, locationId }]; duplica/une por
// producto+ubicación y guarda una foto de producto/origen.
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const entregadoA = parseString(req.body.entregadoA, "Entregado a", { max: 120 });
    const observacion = parseString(req.body.observacion, "Observación", { max: 300 });
    const rawItems: DespatchItemInput[] = req.body.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return res.status(400).json({ message: "La nota debe tener al menos un ítem" });
    }

    const grouped = new Map<number, { productId: number; locationId: number; quantity: number }>();
    for (const raw of rawItems) {
      if (!raw) throw new Error("Línea inválida en items");
      const productId = parsePositiveInt(raw.productId, "productId");
      const locationId = parsePositiveInt(raw.locationId, "Ubicación");
      const quantity = parsePositiveInt(raw.quantity, "Cantidad");
      const key = productId * 100000 + locationId;
      const prev = grouped.get(key);
      grouped.set(key, {
        productId,
        locationId,
        quantity: (prev?.quantity ?? 0) + quantity,
      });
    }

    const entries = [...grouped.values()];
    const productIds = entries.map((e) => e.productId);
    const locationIds = entries.map((e) => e.locationId);

    const [products, locations] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, itemCode: true, name: true, manufacturer: true, brand: true, model: true },
      }),
      prisma.location.findMany({
        where: { id: { in: locationIds } },
        select: { id: true, name: true, type: true },
      }),
    ]);
    const prodMap = new Map(products.map((p) => [p.id, p]));
    const locMap = new Map(locations.map((l) => [l.id, l]));

    const rows = entries.map((e) => {
      const p = prodMap.get(e.productId);
      const l = locMap.get(e.locationId);
      if (!p) throw new Error(`Producto ${e.productId} no existe`);
      if (!l) throw new Error(`Ubicación ${e.locationId} no existe`);
      return {
        productId: p.id,
        itemCode: p.itemCode,
        name: p.name,
        manufacturer: p.manufacturer,
        brand: p.brand,
        model: p.model,
        locationId: l.id,
        locationName: l.name,
        locationType: l.type,
        quantity: e.quantity,
      };
    });

    const totalUnits = rows.reduce((s, r) => s + r.quantity, 0);

    const result = await prisma.$transaction(async (tx) => {
      const count = await tx.despatchNote.count();
      const noteNumber = `ND-${String(count + 1).padStart(4, "0")}`;
      return tx.despatchNote.create({
        data: {
          noteNumber,
          date: new Date(),
          userId: req.user!.userId,
          totalUnits,
          entregadoA,
          observacion,
          items: { create: rows },
        },
        include: { items: true },
      });
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: "CREATE_DESPATCH_NOTE",
        targetType: "DESPATCH_NOTE",
        targetId: result.id,
        newValue: { noteNumber: result.noteNumber, totalUnits, entregadoA },
      },
    });

    res.status(201).json({
      note: {
        id: result.id,
        noteNumber: result.noteNumber,
        date: result.date,
        totalUnits,
      },
    });
  } catch (error: any) {
    if (error.message && !error.message.includes("Prisma")) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error al crear nota de despacho:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET / — Listar notas de despacho
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { search, status, page = "1", limit = "20" } = req.query;
    const pg = Math.max(1, Number(page) || 1);
    const take = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (pg - 1) * take;

    const where: any = {};
    if (search && typeof search === "string") {
      where.OR = [
        { noteNumber: { contains: search, mode: "insensitive" } },
        { items: { some: { name: { contains: search, mode: "insensitive" } } } },
      ];
    }
    if (status && typeof status === "string") {
      const s = status.toUpperCase();
      if (["EMITIDA", "ENTREGADA", "ANULADA"].includes(s)) where.status = s;
    }

    const [notes, total] = await Promise.all([
      prisma.despatchNote.findMany({
        where,
        include: {
          user: { select: { name: true, email: true } },
          items: { select: { id: true, itemCode: true, name: true, manufacturer: true, brand: true, model: true, locationName: true, locationType: true, quantity: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.despatchNote.count({ where }),
    ]);

    res.json({
      notes: notes.map((n) => ({
        id: n.id,
        noteNumber: n.noteNumber,
        date: n.date,
        userId: n.userId,
        userName: n.user.name || n.user.email,
        totalUnits: n.totalUnits,
        status: n.status,
        entregadoA: n.entregadoA,
        entregadoAt: n.entregadoAt,
        observacion: n.observacion,
        cancelledAt: n.cancelledAt,
        cancelledReason: n.cancelledReason,
        createdAt: n.createdAt,
        items: n.items.map((i) => ({
          id: i.id,
          itemCode: i.itemCode,
          name: i.name,
          manufacturer: i.manufacturer,
          brand: i.brand,
          model: i.model,
          locationName: i.locationName,
          locationType: i.locationType,
          quantity: i.quantity,
        })),
      })),
      pagination: { total, page: pg, limit: take, pages: Math.ceil(total / take) },
    });
  } catch (error) {
    console.error("Error al listar notas de despacho:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /:id — Detalle de una nota (incluye ítems completos con producto/origen)
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const note = await prisma.despatchNote.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true } },
        items: { orderBy: { id: "asc" } },
      },
    });
    if (!note) return res.status(404).json({ message: "Nota de despacho no encontrada" });
    res.json({
      id: note.id,
      noteNumber: note.noteNumber,
      date: note.date,
      userId: note.userId,
      userName: note.user.name || note.user.email,
      totalUnits: note.totalUnits,
      status: note.status,
      entregadoA: note.entregadoA,
      entregadoAt: note.entregadoAt,
      observacion: note.observacion,
      cancelledAt: note.cancelledAt,
      cancelledReason: note.cancelledReason,
      createdAt: note.createdAt,
      items: note.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        itemCode: i.itemCode,
        name: i.name,
        manufacturer: i.manufacturer,
        brand: i.brand,
        model: i.model,
        locationId: i.locationId,
        locationName: i.locationName,
        locationType: i.locationType,
        quantity: i.quantity,
      })),
    });
  } catch (error: any) {
    if (error.message && !error.message.includes("Prisma")) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error al obtener nota de despacho:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// PATCH /:id — Marcar como ENTREGADA (con quién recibió)
router.patch("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const note = await prisma.despatchNote.findUnique({ where: { id } });
    if (!note) return res.status(404).json({ message: "Nota de despacho no encontrada" });
    if (note.status !== "EMITIDA") {
      return res.status(400).json({ message: "Solo se puede entregar una nota emitida" });
    }

    const entregadoA = parseString(req.body.entregadoA, "Entregado a", { max: 120 });
    if (!entregadoA) return res.status(400).json({ message: "Indica a quién se entregó" });

    const updated = await prisma.despatchNote.update({
      where: { id },
      data: { status: "ENTREGADA", entregadoA, entregadoAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: "DELIVER_DESPATCH_NOTE",
        targetType: "DESPATCH_NOTE",
        targetId: updated.id,
        newValue: { noteNumber: updated.noteNumber, entregadoA },
      },
    });

    res.json({
      id: updated.id,
      noteNumber: updated.noteNumber,
      status: updated.status,
      entregadoA: updated.entregadoA,
      entregadoAt: updated.entregadoAt,
    });
  } catch (error: any) {
    if (error.message && !error.message.includes("Prisma")) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error al entregar nota de despacho:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST /:id/cancel — Anular una nota (no anulada ni anulada; requiere motivo)
router.post("/:id/cancel", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const note = await prisma.despatchNote.findUnique({ where: { id } });
    if (!note) return res.status(404).json({ message: "Nota de despacho no encontrada" });
    if (note.status === "ANULADA") return res.status(400).json({ message: "La nota ya está anulada" });

    const reason = parseString(req.body.reason, "Motivo de anulación", { max: 300 });

    const updated = await prisma.despatchNote.update({
      where: { id },
      data: {
        status: "ANULADA",
        cancelledAt: new Date(),
        cancelledReason: reason,
        cancelledBy: req.user!.userId,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: "CANCEL_DESPATCH_NOTE",
        targetType: "DESPATCH_NOTE",
        targetId: updated.id,
        newValue: { noteNumber: updated.noteNumber, reason },
      },
    });

    res.json({
      id: updated.id,
      noteNumber: updated.noteNumber,
      status: updated.status,
      cancelledAt: updated.cancelledAt,
      cancelledReason: updated.cancelledReason,
    });
  } catch (error: any) {
    if (error.message && !error.message.includes("Prisma")) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error al anular nota de despacho:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;