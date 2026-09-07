import { Router, Request, Response } from "express";
import { PrismaClient, LocationType } from "@prisma/client";
import { authenticate, authorize } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET / — Listar ubicaciones
router.get("/", async (_req: Request, res: Response) => {
  try {
    const locations = await prisma.location.findMany({
      orderBy: { name: "asc" },
    });
    res.json({ locations });
  } catch (error) {
    console.error("Error al listar ubicaciones:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST / — Crear ubicación (solo ADMIN)
router.post("/", authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, address } = req.body;
    const trimmed = String(name || "").trim();
    if (!trimmed) {
      return res.status(400).json({ message: "El nombre es obligatorio" });
    }
    if (!["ALMACEN", "TIENDA"].includes(type)) {
      return res.status(400).json({ message: "El tipo debe ser ALMACEN o TIENDA" });
    }

    const existing = await prisma.location.findFirst({ where: { name: trimmed } });
    if (existing) {
      return res.status(400).json({ message: "Ya existe una ubicación con ese nombre" });
    }

    const location = await prisma.location.create({
      data: {
        name: trimmed,
        type: type as LocationType,
        address: address ? String(address) : null,
      },
    });

    res.status(201).json({ location });
  } catch (error: any) {
    console.error("Error al crear ubicación:", error);
    res.status(500).json({ message: error.message || "Error interno del servidor" });
  }
});

// PUT /:id — Actualizar ubicación (solo ADMIN)
router.put("/:id", authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "ID inválido" });

    const existing = await prisma.location.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Ubicación no encontrada" });

    const { name, type, address } = req.body;
    const data: any = {};

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return res.status(400).json({ message: "El nombre no puede estar vacío" });
      const dup = await prisma.location.findFirst({ where: { name: trimmed, id: { not: id } } });
      if (dup) return res.status(400).json({ message: "Ya existe una ubicación con ese nombre" });
      data.name = trimmed;
    }

    if (type !== undefined) {
      if (!["ALMACEN", "TIENDA"].includes(type)) {
        return res.status(400).json({ message: "El tipo debe ser ALMACEN o TIENDA" });
      }
      data.type = type;
    }

    if (address !== undefined) data.address = address ? String(address) : null;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: "No hay datos para actualizar" });
    }

    const location = await prisma.location.update({ where: { id }, data });
    res.json({ location });
  } catch (error: any) {
    console.error("Error al actualizar ubicación:", error);
    res.status(500).json({ message: error.message || "Error interno del servidor" });
  }
});

// DELETE /:id — Eliminar ubicación (solo ADMIN, solo sin datos asociados)
router.delete("/:id", authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "ID inválido" });

    const location = await prisma.location.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, inventories: true, salesFrom: true, requests: true, movementsTo: true, movementsFrom: true } },
      },
    });
    if (!location) return res.status(404).json({ message: "Ubicación no encontrada" });

    const hasData =
      location._count.users > 0 ||
      location._count.salesFrom > 0 ||
      location._count.requests > 0 ||
      location._count.movementsTo > 0 ||
      location._count.movementsFrom > 0 ||
      location._count.inventories > 0;

    if (hasData) {
      return res.status(400).json({
        message: "No se puede eliminar: tiene usuarios, stock, ventas o movimientos asociados",
      });
    }

    await prisma.location.delete({ where: { id } });
    res.json({ message: "Ubicación eliminada" });
  } catch (error: any) {
    console.error("Error al eliminar ubicación:", error);
    res.status(500).json({ message: error.message || "Error interno del servidor" });
  }
});

export default router;