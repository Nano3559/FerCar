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

    try {
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

      return res.json({ sales });
    } catch (prismaErr: any) {
      console.error("Error con Prisma en delivery-board, usando fallback:", prismaErr?.message);
      // Fallback: si aún no existe la columna en prod
      const salesRaw = await prisma.$queryRawUnsafe<any[]>(
        `
        SELECT 
          s."id", s."saleDate", s."total", s."type", s."seller",
          s."locationId", s."userId", s."customerId",
          COALESCE(s."deliveryStatus", 'PENDIENTE') as "deliveryStatus",
          s."deliveredAt", s."deliveredById",
          json_build_object('id', l."id", 'name', l."name") as location,
          json_build_object('id', u."id", 'name', u."name") as "user",
          CASE WHEN c."id" IS NULL THEN NULL ELSE json_build_object('id', c."id", 'name', c."name", 'phone', c."phone") END as customer,
          CASE WHEN db."id" IS NULL THEN NULL ELSE json_build_object('id', db."id", 'name', db."name") END as "deliveredBy",
          COALESCE((
            SELECT json_agg(json_build_object(
              'id', si."id",
              'quantity', si."quantity",
              'unitPrice', si."unitPrice",
              'product', json_build_object(
                'id', p."id",
                'name', p."name",
                'brand', p."brand",
                'model', p."model",
                'itemCode', p."itemCode",
                'factoryCode', p."factoryCode"
              )
            )) FROM "SaleItem" si LEFT JOIN "Product" p ON p."id" = si."productId" WHERE si."saleId" = s."id"
          ), '[]'::json) as items
        FROM "Sale" s
        LEFT JOIN "Location" l ON l."id" = s."locationId"
        LEFT JOIN "User" u ON u."id" = s."userId"
        LEFT JOIN "Customer" c ON c."id" = s."customerId"
        LEFT JOIN "User" db ON db."id" = s."deliveredById"
        WHERE s."type" IN ('MAYOR', 'DEPARTAMENTAL')
          AND COALESCE(s."deliveryStatus", 'PENDIENTE') = $1
        ORDER BY s."saleDate" ASC, s."id" ASC
        LIMIT $2
        `,
        status,
        Number(limit) || 100
      );

      const sales = salesRaw.map((row: any) => ({
        ...row,
        items: typeof row.items === "string" ? JSON.parse(row.items) : row.items || [],
      }));

      return res.json({ sales });
    }
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

    try {
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

      return res.json({ message: "Venta marcada como entregada", sale: updated });
    } catch (prismaErr) {
      console.error("Fallback deliver con SQL:", prismaErr);
      await prisma.$executeRawUnsafe(
        `UPDATE "Sale" SET "deliveryStatus" = 'ENTREGADO', "deliveredAt" = NOW(), "deliveredById" = $1 WHERE "id" = $2`,
        req.user?.id || null,
        saleId
      );
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `
        SELECT 
          s."id", s."saleDate", s."total", s."type", s."seller",
          json_build_object('id', l."id", 'name', l."name") as location,
          json_build_object('id', u."id", 'name', u."name") as "user",
          CASE WHEN c."id" IS NULL THEN NULL ELSE json_build_object('id', c."id", 'name', c."name", 'phone', c."phone") END as customer,
          CASE WHEN db."id" IS NULL THEN NULL ELSE json_build_object('id', db."id", 'name', db."name") END as "deliveredBy",
          COALESCE((
            SELECT json_agg(json_build_object(
              'id', si."id",
              'quantity', si."quantity",
              'unitPrice', si."unitPrice",
              'product', json_build_object(
                'id', p."id",
                'name', p."name",
                'brand', p."brand",
                'model', p."model",
                'itemCode', p."itemCode",
                'factoryCode', p."factoryCode"
              )
            )) FROM "SaleItem" si LEFT JOIN "Product" p ON p."id" = si."productId" WHERE si."saleId" = s."id"
          ), '[]'::json) as items,
          'ENTREGADO' as "deliveryStatus"
        FROM "Sale" s
        LEFT JOIN "Location" l ON l."id" = s."locationId"
        LEFT JOIN "User" u ON u."id" = s."userId"
        LEFT JOIN "Customer" c ON c."id" = s."customerId"
        LEFT JOIN "User" db ON db."id" = s."deliveredById"
        WHERE s."id" = $1
        `,
        saleId
      );
      const saleOut = rows[0] ? { ...rows[0], items: typeof rows[0].items === "string" ? JSON.parse(rows[0].items) : rows[0].items || [] } : null;
      return res.json({ message: "Venta marcada como entregada", sale: saleOut });
    }
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

    try {
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

      return res.json({ message: "Venta vuelta a pendiente", sale: updated });
    } catch (prismaErr) {
      console.error("Fallback pendiente con SQL:", prismaErr);
      await prisma.$executeRawUnsafe(
        `UPDATE "Sale" SET "deliveryStatus" = 'PENDIENTE', "deliveredAt" = NULL, "deliveredById" = NULL WHERE "id" = $1`,
        saleId
      );
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `
        SELECT 
          s."id", s."saleDate", s."total", s."type", s."seller",
          json_build_object('id', l."id", 'name', l."name") as location,
          json_build_object('id', u."id", 'name', u."name") as "user",
          CASE WHEN c."id" IS NULL THEN NULL ELSE json_build_object('id', c."id", 'name', c."name", 'phone', c."phone") END as customer,
          NULL as "deliveredBy",
          COALESCE((
            SELECT json_agg(json_build_object(
              'id', si."id",
              'quantity', si."quantity",
              'unitPrice', si."unitPrice",
              'product', json_build_object(
                'id', p."id",
                'name', p."name",
                'brand', p."brand",
                'model', p."model",
                'itemCode', p."itemCode",
                'factoryCode', p."factoryCode"
              )
            )) FROM "SaleItem" si LEFT JOIN "Product" p ON p."id" = si."productId" WHERE si."saleId" = s."id"
          ), '[]'::json) as items,
          'PENDIENTE' as "deliveryStatus"
        FROM "Sale" s
        LEFT JOIN "Location" l ON l."id" = s."locationId"
        LEFT JOIN "User" u ON u."id" = s."userId"
        LEFT JOIN "Customer" c ON c."id" = s."customerId"
        WHERE s."id" = $1
        `,
        saleId
      );
      const saleOut = rows[0] ? { ...rows[0], items: typeof rows[0].items === "string" ? JSON.parse(rows[0].items) : rows[0].items || [] } : null;
      return res.json({ message: "Venta vuelta a pendiente", sale: saleOut });
    }
  } catch (error) {
    console.error("Error al volver a pendiente:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;
