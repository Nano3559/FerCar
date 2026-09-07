import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { authenticate, authorize, requireTiendaLocation } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
router.use(requireTiendaLocation);

// GET / — Listar todo el inventario con información de producto y ubicación
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { locationId, lowStock } = req.query;

    const where: any = {};

    if (req.user?.role === "TIENDA") {
      where.locationId = req.user.locationId;
    } else if (locationId && typeof locationId === "string") {
      where.locationId = Number(locationId);
    }

    const inventories = await prisma.inventory.findMany({
      where,
      include: {
        product: true,
        location: true,
      },
      orderBy: { product: { name: "asc" } },
    });

    let result = inventories.map((inv) => ({
      id: inv.id,
      productId: inv.productId,
      locationId: inv.locationId,
      stock: inv.stock,
      minStock: inv.minStock,
      productName: inv.product.name,
      itemCode: inv.product.itemCode,
      brand: inv.product.brand,
      model: inv.product.model,
      locationName: inv.location.name,
      locationType: inv.location.type,
    }));

    if (lowStock === "true") {
      result = result.filter((r) => r.stock <= r.minStock);
    }

    res.json(result);
  } catch (error) {
    console.error("Error al listar inventario:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /product/:productId — Stock por ubicación de un producto
router.get("/product/:productId", async (req: AuthRequest, res: Response) => {
  try {
    const productId = Number(req.params.productId);
    const inventoryWhere: any = { productId };
    if (req.user?.role === "TIENDA") inventoryWhere.locationId = req.user.locationId;
    const inventories = await prisma.inventory.findMany({
      where: inventoryWhere,
      include: { location: true },
      orderBy: { location: { name: "asc" } },
    });

    const stockTotal = inventories.reduce((sum, inv) => sum + inv.stock, 0);

    res.json({
      productId,
      stockTotal,
      locations: inventories.map((inv) => ({
        id: inv.id,
        locationId: inv.location.id,
        locationName: inv.location.name,
        locationType: inv.location.type,
        stock: inv.stock,
        minStock: inv.minStock,
      })),
    });
  } catch (error) {
    console.error("Error al obtener stock:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// PUT /:id — Actualizar stock manualmente con motivo (solo ADMIN + contraseña)
router.put("/:id", authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { stock, minStock, reasonType, reason, password } = req.body;

    if (!password || typeof password !== "string") {
      return res.status(400).json({ message: "Ingresa la contraseña de administrador para modificar el stock" });
    }

    const admin = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    const passwordOk = admin ? await bcrypt.compare(password, admin.password) : false;
    if (!passwordOk) {
      return res.status(403).json({ message: "Contraseña de administrador incorrecta" });
    }

    const existing = await prisma.inventory.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Registro de inventario no encontrado" });
    }

    const data: any = {};
    let stockChanged = false;
    if (stock != null) {
      const s = Number(stock);
      if (!Number.isInteger(s) || s < 0) {
        return res.status(400).json({ message: "El stock debe ser un entero mayor o igual a 0" });
      }
      data.stock = s;
      stockChanged = s !== existing.stock;
    }
    if (minStock != null) {
      const m = Number(minStock);
      if (!Number.isInteger(m) || m < 0) {
        return res.status(400).json({ message: "El stock mínimo debe ser un entero mayor o igual a 0" });
      }
      data.minStock = m;
    }

    const validReasons = ["COMPRA", "AJUSTE", "DEVOLUCION", "MERMA"];
    if (reasonType != null && reasonType !== "" && !validReasons.includes(reasonType)) {
      return res.status(400).json({ message: "El motivo debe ser COMPRA, AJUSTE, DEVOLUCION o MERMA" });
    }
    if (stockChanged && (!reasonType || reasonType === "")) {
      return res.status(400).json({ message: "Selecciona el motivo del ajuste de stock (COMPRA, AJUSTE, DEVOLUCION o MERMA)" });
    }

    const updated = await prisma.inventory.update({
      where: { id },
      data,
      include: { product: true, location: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: "UPDATE_INVENTORY",
        targetType: "INVENTORY",
        targetId: id,
        oldValue: { stock: existing.stock, minStock: existing.minStock },
        newValue: { stock: updated.stock, minStock: updated.minStock, reasonType: reasonType || null, reason: reason || null },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error al actualizar inventario:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;
