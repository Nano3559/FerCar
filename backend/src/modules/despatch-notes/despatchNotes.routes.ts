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

// POST / — Crear una nota de despacho.
// Recibe items: [{ productId, quantity, locationId }]; duplica/une por
// producto+ubicación y guarda una foto de producto/origen.
// Opcionalmente recibe destinationId (tienda que recibe) y requestIds
// (solicitudes que cumple esta nota).
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const entregadoA = parseString(req.body.entregadoA, "Entregado a", { max: 120 });
    const observacion = parseString(req.body.observacion, "Observación", { max: 300 });
    const rawItems: DespatchItemInput[] = req.body.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return res.status(400).json({ message: "La nota debe tener al menos un ítem" });
    }

    // Tienda destino: donde se entrega la mercadería. Si la nota viene de
    // solicitudes se deduce de ellas.
    let destinationId: number | null = null;
    if (req.body.destinationId) {
      destinationId = parsePositiveInt(req.body.destinationId, "Tienda destino");
    }

    // Solicitudes que cumple esta nota
    const requestIds: number[] = Array.isArray(req.body.requestIds)
      ? req.body.requestIds.map((r: any) => parsePositiveInt(r, "Solicitud"))
      : [];

    const linkedRequests = requestIds.length
      ? await prisma.productRequest.findMany({
          where: { id: { in: requestIds } },
          include: { product: { select: { id: true, name: true, itemCode: true } }, location: true },
        })
      : [];

    if (linkedRequests.length !== requestIds.length) {
      return res.status(404).json({ message: "Alguna de las solicitudes no existe" });
    }

    if (!destinationId && linkedRequests.length > 0) {
      const destinos = new Set(linkedRequests.map((r) => r.locationId));
      if (destinos.size > 1) {
        return res.status(400).json({
          message: "Las solicitudes de esta nota pertenecen a tiendas distintas. Genera una nota por tienda.",
        });
      }
      destinationId = linkedRequests[0].locationId;
    }

    if (destinationId) {
      const destino = await prisma.location.findUnique({ where: { id: destinationId } });
      if (!destino) return res.status(404).json({ message: "Tienda destino no encontrada" });
      if (destino.type !== "TIENDA") {
        return res.status(400).json({ message: "El destino del despacho debe ser una tienda" });
      }
    }

    // Una solicitud no puede quedar vinculada a dos notas a la vez.
    for (const r of linkedRequests) {
      if (r.despatchNoteId) {
        return res.status(400).json({
          message: `La solicitud #${r.id} ya está vinculada a otra nota de despacho`,
        });
      }
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
      const note = await tx.despatchNote.create({
        data: {
          noteNumber,
          date: new Date(),
          userId: req.user!.userId,
          totalUnits,
          destinationId,
          entregadoA: entregadoA || null,
          observacion: observacion || null,
          items: { create: rows },
        },
        include: { items: true },
      });

      if (linkedRequests.length > 0) {
        await tx.productRequest.updateMany({
          where: { id: { in: requestIds } },
          data: { despatchNoteId: note.id },
        });
      }

      return note;
    }, { timeout: 20000, maxWait: 10000 });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: "CREATE_DESPATCH_NOTE",
        targetType: "DESPATCH_NOTE",
        targetId: result.id,
        newValue: { noteNumber: result.noteNumber, totalUnits, entregadoA, destinationId, solicitudes: requestIds },
      },
    });

    res.status(201).json({
      note: {
        id: result.id,
        noteNumber: result.noteNumber,
        date: result.date,
        totalUnits: result.totalUnits,
        destinationId,
        solicitudes: requestIds,
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
          destination: { select: { id: true, name: true } },
          requests: {
            select: {
              id: true, status: true, quantity: true,
              product: { select: { name: true, itemCode: true } },
            },
          },
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
        destinationId: n.destinationId,
        destinationName: n.destination?.name ?? null,
        requests: n.requests,
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

// GET /pending-requests — Solicitudes listas para despachar, agrupadas por
// tienda de destino. Alimenta la carga de la nota de despacho desde Solicitudes.
router.get("/pending-requests", async (req: AuthRequest, res: Response) => {
  try {
    const { destinationId } = req.query;
    const where: any = {
      status: { in: ["PENDIENTE", "RECIBIDO_POR_INVENTARIO", "PREPARANDO"] },
      despatchNoteId: null,
    };
    if (destinationId && typeof destinationId === "string") {
      where.locationId = Number(destinationId);
    }

    const requests = await prisma.productRequest.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, itemCode: true, brand: true, model: true } },
        location: { select: { id: true, name: true, type: true } },
        fromLocation: { select: { id: true, name: true, type: true } },
        requestedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ locationId: "asc" }, { date: "asc" }],
    });

    // Stock disponible en el origen de cada solicitud, para avisar antes de
    // armar la nota.
    const result = await Promise.all(
      requests.map(async (r) => {
        const originId = r.fromLocationId ?? r.locationId;
        const inv = originId
          ? await prisma.inventory.findUnique({
              where: { productId_locationId: { productId: r.productId, locationId: originId } },
              select: { stock: true },
            })
          : null;
        const origen = r.fromLocationId
          ? r.fromLocation
          : await prisma.location.findUnique({ where: { id: r.locationId }, select: { id: true, name: true, type: true } });

        return {
          id: r.id,
          quantity: r.quantity,
          status: r.status,
          date: r.date,
          note: r.note,
          source: r.source,
          product: r.product,
          destino: r.location,
          origen: origen ?? null,
          originId,
          disponible: inv?.stock ?? 0,
          suficiente: (inv?.stock ?? 0) >= r.quantity,
          solicitadoPor: r.requestedBy,
        };
      })
    );

    res.json({ requests: result });
  } catch (error) {
    console.error("Error al listar solicitudes para despacho:", error);
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

// PATCH /:id — Marcar como ENTREGADA. Al entregar la merchadería:
//  1) mueve el stock del origen a la tienda destino de la nota,
//  2) registra un movimiento por ítem,
//  3) pasa las solicitudes vinculadas a ENTREGADO para que las confirme
//     quien las pidió.
router.patch("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const note = await prisma.despatchNote.findUnique({
      where: { id },
      include: { items: true, requests: { include: { requestedBy: true } } },
    });
    if (!note) return res.status(404).json({ message: "Nota de despacho no encontrada" });
    if (note.status !== "EMITIDA") {
      return res.status(400).json({ message: "Solo se puede entregar una nota emitida" });
    }

    const entregadoA = parseString(req.body.entregadoA, "Entregado a", { max: 120 });
    if (!entregadoA) return res.status(400).json({ message: "Indica a quién se entregó" });

    // La tienda destino puede venir en el cuerpo o quedar fijada al emitir.
    let destinationId = note.destinationId;
    if (req.body.destinationId) {
      destinationId = parsePositiveInt(req.body.destinationId, "Tienda destino");
    }
    if (!destinationId) {
      return res.status(400).json({
        message: "Indica la tienda destino: sin ella no se puede descontar el stock",
      });
    }

    const destino = await prisma.location.findUnique({ where: { id: destinationId } });
    if (!destino) return res.status(404).json({ message: "Tienda destino no encontrada" });
    if (destino.type !== "TIENDA") {
      return res.status(400).json({ message: "El destino del despacho debe ser una tienda" });
    }

    // Solicitud vinculada por producto, para colgarle el movimiento.
    const requestByProduct = new Map<number, number>();
    for (const r of note.requests) requestByProduct.set(r.productId, r.id);

    // Solicitudes que nacieron de una venta: el origen YA se descontó cuando se
    // creó la solicitud, para que dos ventas no pudieran pedir la misma unidad.
    // Si aquí también se descontara, la mercadería se contaría dos veces y del
    // origen desaparecerían más unidades de las que salieron.
    const origenYaDescontado = new Set<string>();
    for (const r of note.requests) {
      if (!r.saleItemId) continue;
      const origen = r.fromLocationId ?? r.locationId;
      origenYaDescontado.add(`${r.productId}:${origen}`);
    }

    const faltantes: string[] = [];
    for (const item of note.items) {
      if (item.locationId === destinationId) {
        faltantes.push(`${item.name}: el origen y el destino son la misma ubicación`);
        continue;
      }
      // El origen ya bajó al crear la solicitud: no se vuelve a descontar.
      if (origenYaDescontado.has(`${item.productId}:${item.locationId}`)) continue;

      const origen = await prisma.inventory.findUnique({
        where: { productId_locationId: { productId: item.productId, locationId: item.locationId } },
      });
      const disponible = origen?.stock ?? 0;
      if (disponible < item.quantity) {
        faltantes.push(`${item.name} (${item.itemCode}): hay ${disponible} en ${item.locationName} y se piden ${item.quantity}`);
      }
    }
    if (faltantes.length > 0) {
      return res.status(400).json({
        message: `No hay stock suficiente para entregar la nota: ${faltantes.join("; ")}`,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const item of note.items) {
        // Si el origen ya se descontó al crear la solicitud de la venta, aquí no
        // se toca: la mercadería ya salió de ahí. Lo que sí falta es que llegue a
        // la tienda destino.
        const yaDescontado = origenYaDescontado.has(`${item.productId}:${item.locationId}`);

        if (!yaDescontado) {
          // Bloqueo pesimista del origen para no sobregirar stock.
          const locked = await tx.$queryRaw<{ id: number; stock: number }[]>`
            SELECT id, stock FROM "Inventory"
            WHERE "productId" = ${item.productId} AND "locationId" = ${item.locationId}
            FOR UPDATE`;

          if (!locked.length || locked[0].stock < item.quantity) {
            throw new Error(
              `Stock insuficiente en ${item.locationName} para ${item.name} (${item.itemCode})`
            );
          }

          await tx.inventory.update({
            where: { id: locked[0].id },
            data: { stock: { decrement: item.quantity } },
          });
        }

        const invDest = await tx.inventory.findUnique({
          where: { productId_locationId: { productId: item.productId, locationId: destinationId } },
        });
        if (invDest) {
          await tx.inventory.update({
            where: { id: invDest.id },
            data: { stock: { increment: item.quantity } },
          });
        } else {
          await tx.inventory.create({
            data: { productId: item.productId, locationId: destinationId, stock: item.quantity, minStock: 0 },
          });
        }

        const linkedRequest = requestByProduct.get(item.productId);
        const linked = linkedRequest
          ? note.requests.find((r) => r.id === linkedRequest)
          : undefined;

        await tx.movement.create({
          data: {
            productId: item.productId,
            fromLocationId: item.locationId,
            toLocationId: destinationId,
            quantity: item.quantity,
            userId: req.user!.userId,
            requestId: linkedRequest ?? null,
            requester: linked?.requestedBy?.name ?? null,
            observation: `Despacho ${note.noteNumber}`,
          },
        });
      }

      const nota = await tx.despatchNote.update({
        where: { id },
        data: { status: "ENTREGADA", destinationId, entregadoA, entregadoAt: new Date() },
      });

      // Cierra el ciclo: las solicitudes quedan listas para que las confirme
      // quien las pidió.
      for (const r of note.requests) {
        if (r.status === "ENTREGADO" || r.status === "RECIBIDO_POR_TIENDA") continue;
        await tx.productRequest.update({
          where: { id: r.id },
          data: { status: "ENTREGADO" },
        });
        await tx.requestHistory.create({
          data: {
            requestId: r.id,
            previousStatus: r.status,
            newStatus: "ENTREGADO",
            userId: req.user!.userId,
            userRole: req.user!.role || "ADMIN",
          },
        });
        await tx.notification.create({
          data: {
            userId: r.requestedById,
            title: `Solicitud #${r.id} - Entregado`,
            message: `La mercadería de la solicitud #${r.id} fue despachada en la nota ${note.noteNumber} hacia ${destino.name}. Confirmá la recepción cuando llegue.`,
            type: "INFO",
            linkUrl: "/panel/solicitudes",
          },
        });
      }

      return nota;
    }, { timeout: 30000, maxWait: 15000 });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: "DELIVER_DESPATCH_NOTE",
        targetType: "DESPATCH_NOTE",
        targetId: updated.id,
        newValue: {
          noteNumber: updated.noteNumber,
          entregadoA,
          destinationId,
          solicitudesCerradas: note.requests.map((r) => r.id),
        },
      },
    });

    res.json({
      id: updated.id,
      noteNumber: updated.noteNumber,
      status: updated.status,
      entregadoA: updated.entregadoA,
      entregadoAt: updated.entregadoAt,
      destinationId,
      solicitudesCerradas: note.requests.map((r) => r.id),
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

    const updated = await prisma.$transaction(async (tx) => {
      const nota = await tx.despatchNote.update({
        where: { id },
        data: {
          status: "ANULADA",
          cancelledAt: new Date(),
          cancelledReason: reason,
          cancelledBy: req.user!.userId,
        },
      });

      // Libera las solicitudes para que puedan volver a despacharse.
      await tx.productRequest.updateMany({
        where: { despatchNoteId: id },
        data: { despatchNoteId: null },
      });

      return nota;
    }, { timeout: 15000, maxWait: 10000 });

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