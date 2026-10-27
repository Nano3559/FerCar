import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /delivery-board - Ventas MAYOR y DEPARTAMENTAL con deliveryStatus
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { status = "PENDIENTE", limit = "100" } = req.query;

    const where: any = {
      type: { in: ["MAYOR", "DEPARTAMENTAL"] },
    };

    if (status === "PENDIENTE" || status === "ENTREGADO") {
      where.deliveryStatus = status;
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
        deliveredBy: { select: { id: true, name: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                brand: true,
                model: true,
                itemCode: true,
                factoryCode: true,
              },
            },
          },
        },
      },
      orderBy: [{ saleDate: "asc" }, { id: "asc" }],
      take: Number(limit) || 100,
    });

    res.json({ sales });
  } catch (error) {
    console.error("Error en pizarra de entregas:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST /delivery-board/:id/deliver - Marcar como ENTREGADO
router.post("/:id/deliver", async (req: AuthRequest, res: Response) => {
  try {
    const saleId = Number(req.params.id);
    if (Number.isNaN(saleId)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, type: true, deliveryStatus: true },
    });

    if (!sale) {
      return res.status(404).json({ message: "Venta no encontrada" });
    }

    if (!["MAYOR", "DEPARTAMENTAL"].includes(sale.type)) {
      return res.status(400).json({ message: "Solo aplica a Ventas por Mayor y Departamentales" });
    }

    const updated = await prisma.sale.update({
      where: { id: saleId },
      data: {
        deliveryStatus: "ENTREGADO",
        deliveredAt: new Date(),
        deliveredById: req.user?.id || null,
      },
      include: {
        user: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
        deliveredBy: { select: { id: true, name: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                brand: true,
                model: true,
                itemCode: true,
                factoryCode: true,
              },
            },
          },
        },
      },
    });

    res.json({ message: "Venta marcada como entregada", sale: updated });
  } catch (error) {
    console.error("Error al marcar entrega:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST /delivery-board/:id/pendiente - Volver a PENDIENTE
router.post("/:id/pendiente", async (req: AuthRequest, res: Response) => {
  try {
    const saleId = Number(req.params.id);
    if (Number.isNaN(saleId)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, type: true },
    });

    if (!sale) {
      return res.status(404).json({ message: "Venta no encontrada" });
    }

    if (!["MAYOR", "DEPARTAMENTAL"].includes(sale.type)) {
      return res.status(400).json({ message: "Solo aplica a Ventas por Mayor y Departamentales" });
    }

    const updated = await prisma.sale.update({
      where: { id: saleId },
      data: {
        deliveryStatus: "PENDIENTE",
        deliveredAt: null,
        deliveredById: null,
      },
      include: {
        user: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
        deliveredBy: { select: { id: true, name: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                brand: true,
                model: true,
                itemCode: true,
                factoryCode: true,
              },
            },
          },
        },
      },
    });

    res.json({ message: "Venta vuelta a pendiente", sale: updated });
  } catch (error) {
    console.error("Error al volver a pendiente:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;
