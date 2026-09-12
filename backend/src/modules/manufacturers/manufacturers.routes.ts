import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, authorize } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";
import { parseId, parseString } from "../../shared/middlewares/validate";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET / — Listar fabricantes
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { search } = req.query;
    const where: any = {};
    if (search && typeof search === "string") {
      where.name = { contains: search, mode: "insensitive" };
    }
    const manufacturers = await prisma.manufacturer.findMany({
      where,
      orderBy: { name: "asc" },
    });
    res.json({
      manufacturers: manufacturers.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error al listar fabricantes:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST / — Crear fabricante (solo ADMIN)
router.post("/", authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const name = parseString(req.body.name, "Nombre", { required: true, max: 255 });
    const description = parseString(req.body.description, "Descripción", { max: 500 });

    const normalized = name!.trim().toUpperCase();
    const existing = await prisma.manufacturer.findFirst({
      where: { name: { equals: normalized, mode: "insensitive" } },
    });
    if (existing) {
      return res.status(400).json({ message: `Ya existe el fabricante "${existing.name}"` });
    }

    const manufacturer = await prisma.manufacturer.create({
      data: { name: normalized, description },
    });
    res.status(201).json(manufacturer);
  } catch (error: any) {
    if (error.message && !error.message.includes("Prisma")) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error al crear fabricante:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST /sync — Registrar fabricantes existentes en productos (solo ADMIN)
router.post("/sync", authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.manufacturer.findMany();
    const byKey = new Map(existing.map((m) => [m.name.toUpperCase(), m.name]));
    const distinct = await prisma.product.findMany({
      distinct: ["manufacturer"],
      select: { manufacturer: true },
    });
    let created = 0;
    for (const d of distinct) {
      const key = d.manufacturer.trim().toUpperCase();
      if (!key || byKey.has(key)) continue;
      await prisma.manufacturer.create({ data: { name: d.manufacturer.trim() } });
      byKey.set(key, d.manufacturer.trim());
      created++;
    }
    res.json({ created, total: byKey.size });
  } catch (error) {
    console.error("Error al sincronizar fabricantes:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// PUT /:id — Editar fabricante (solo ADMIN)
router.put("/:id", authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const existing = await prisma.manufacturer.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Fabricante no encontrado" });

    const name = parseString(req.body.name, "Nombre", { max: 255 });
    const description = parseString(req.body.description, "Descripción", { max: 500 });

    if (name !== null && name!.trim().length === 0) {
      return res.status(400).json({ message: "El nombre no puede estar vacío" });
    }

    if (name !== null && name !== existing.name) {
      const normalized = name!.trim().toUpperCase();
      const dup = await prisma.manufacturer.findFirst({
        where: { name: { equals: normalized, mode: "insensitive" }, id: { not: id } },
      });
      if (dup) return res.status(400).json({ message: `Ya existe el fabricante "${dup.name}"` });
    }

    const manufacturer = await prisma.manufacturer.update({
      where: { id },
      data: {
        ...(name !== null && name !== undefined && { name: name!.trim().toUpperCase() }),
        ...(req.body.description !== undefined && { description }),
      },
    });
    res.json(manufacturer);
  } catch (error: any) {
    if (error.message === "ID inválido") return res.status(400).json({ message: error.message });
    if (error.message && !error.message.includes("Prisma")) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error al editar fabricante:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// DELETE /:id — Eliminar fabricante (solo ADMIN)
router.delete("/:id", authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const existing = await prisma.manufacturer.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Fabricante no encontrado" });
    await prisma.manufacturer.delete({ where: { id } });
    res.json({ message: "Fabricante eliminado" });
  } catch (error: any) {
    if (error.message === "ID inválido") return res.status(400).json({ message: error.message });
    console.error("Error al eliminar fabricante:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;