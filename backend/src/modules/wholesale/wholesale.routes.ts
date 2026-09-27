import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import multer from "multer";
import * as XLSX from "xlsx";
import { authenticate, authorize, requireTiendaLocation } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";
import { ensureRestockRequest } from "../../utils/restockRequest";
import { validateAndMergeItems } from "../../utils/saleItems";

const router = Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate);
router.use(requireTiendaLocation);
router.use(authorize("ADMIN", "TIENDA"));

// POST — Crear venta mayorista
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { items, payments, customerId, customerData, locationId, clienteName, paraQuien, lugarEntrega, datosFactura, formaPago, nitName, origen, envioExterior, quienRecoge, telefono } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Debe agregar al menos un producto" });
    }

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({ message: "Debe registrar al menos un pago" });
    }

    const user = req.user!;
    let userLocationId: number | null = null;

    if (user.role === "TIENDA") {
      userLocationId = user.locationId ?? null;
      if (!userLocationId) {
        return res.status(400).json({ message: "Usuario TIENDA sin ubicación asignada" });
      }
      if (locationId && Number(locationId) !== userLocationId) {
        return res.status(403).json({ message: "No puede vender productos de otra tienda" });
      }
    } else {
      userLocationId = locationId ? Number(locationId) : user.locationId || null;
    }

    if (!userLocationId) {
      const tienda = await prisma.location.findFirst({ where: { type: "TIENDA" } });
      if (!tienda) {
        return res.status(400).json({ message: "No hay tiendas configuradas en el sistema" });
      }
      userLocationId = tienda.id;
    }

    const validMethods = ["EFECTIVO", "QR", "TRANSFERENCIA", "CREDITO"];
    for (const p of payments) {
      if (!validMethods.includes(p.method)) {
        return res.status(400).json({ message: `Método de pago inválido: ${p.method}` });
      }
    }

    // Validar, deduplicar y resolver precio unitario de los ítems
    const validItems = validateAndMergeItems(items);

    // Datos de entrega: usar los enviados explícitamente o inferir del payload
    const entregaParaQuien = paraQuien || clienteName || null;
    const entregaLugar = lugarEntrega || null;
    const entregaFactura = datosFactura || (customerData?.nit ? `NIT/CI: ${customerData.nit}` : null);
    const entregaFormaPago = formaPago || (payments.length > 0 ? payments[0].method : null);

    let finalCustomerId = customerId || null;

    if (customerData && !finalCustomerId) {
      const { name, nit, phone } = customerData;
      if (name) {
        let customer;
        if (nit) {
          customer = await prisma.customer.findFirst({ where: { nit } });
        }
        if (!customer) {
          customer = await prisma.customer.create({
            data: { name, nit: nit || null, phone: phone || null },
          });
        }
        finalCustomerId = customer.id;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Venta mayorista: se registra aunque la mercadería no esté aún en la
      // tienda. Se descuenta solo el stock disponible y se solicita al almacén
      // (o a otra tienda) lo que falte. Si el producto está en la tienda de
      // venta, no se crea solicitud.
      const stockUpdates: { productId: number; quantity: number }[] = [];
      const supplyRequests: { productId: number; quantity: number }[] = [];

      for (const item of validItems) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) {
          throw new Error(`Producto con ID ${item.productId} no encontrado`);
        }

        const inventory = await tx.inventory.findUnique({
          where: { productId_locationId: { productId: item.productId, locationId: userLocationId } },
        });

        const currentStock = inventory?.stock || 0;
        const availableNow = Math.min(currentStock, item.quantity);
        if (availableNow > 0) {
          stockUpdates.push({ productId: item.productId, quantity: availableNow });
        }
        const shortfall = item.quantity - availableNow;
        if (shortfall > 0) {
          supplyRequests.push({ productId: item.productId, quantity: shortfall });
        }
      }

      let totalSale = 0;
      const saleItemsData = validItems.map((item: any) => {
        const unitPrice = item.unitPrice || item.wholesalePrice || 0;
        const subtotal = item.quantity * unitPrice;
        totalSale += subtotal;
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice,
          subtotal,
        };
      });

      const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      if (totalPaid - totalSale > 0.01) {
        throw new Error(`El total pagado (Bs. ${totalPaid}) supera el total de la venta (Bs. ${totalSale})`);
      }

      // Estado automático: PENDIENTE si hay método CRÉDITO o queda saldo por pagar
      const hasCredit = payments.some((p: any) => p.method === "CREDITO");
      const paidNow = payments
        .filter((p: any) => p.method !== "CREDITO")
        .reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      const saleStatus = hasCredit || paidNow < totalSale ? "PENDIENTE" : "PAGADO";

      const sale = await tx.sale.create({
        data: {
          total: totalSale,
          type: "MAYOR",
          status: saleStatus,
          userId: user.userId,
          locationId: userLocationId,
          customerId: finalCustomerId,
          paraQuien: entregaParaQuien,
          lugarEntrega: entregaLugar,
          datosFactura: entregaFactura,
          nitName: nitName || null,
          formaPago: entregaFormaPago,
          origen: origen || null,
          envioExterior: Boolean(envioExterior),
          quienRecoge: quienRecoge || null,
          telefono: telefono || null,
          items: { create: saleItemsData },
          payments: {
            create: payments.map((p: any) => ({
              method: p.method,
              amount: Number(p.amount),
            })),
          },
        },
        include: { items: true, payments: true },
      });

      for (const update of stockUpdates) {
        const inv = await tx.inventory.findUnique({
          where: { productId_locationId: { productId: update.productId, locationId: userLocationId } },
        });

        if (inv) {
          const newStock = inv.stock - update.quantity;
          await tx.inventory.update({
            where: { id: inv.id },
            data: { stock: newStock },
          });
        }
      }

      // Solicitud automática al almacén por lo que falte en la tienda de venta.
      // Si el producto está en la tienda, no se crea solicitud.
      for (const req of supplyRequests) {
        await ensureRestockRequest(tx, {
          productId: req.productId,
          destinationId: userLocationId,
          requestedById: user.userId,
          quantity: req.quantity,
          source: "VENTA",
          note: "Reposición automática: la venta superó el stock disponible",
        });
      }

      return {
        ...sale,
        total: Number(sale.total),
        items: sale.items.map((i) => ({ ...i, unitPrice: Number(i.unitPrice), subtotal: Number(i.subtotal) })),
        payments: sale.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
      };
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error("Error al crear venta mayorista:", error);
    res.status(400).json({ message: error.message || "Error interno del servidor" });
  }
});

// POST /:id/payments — Registrar un pago a una venta mayorista mientras esté
// PENDIENTE (ej. cobro posterior de un crédito). Se marca PAGADA cuando lo
// cobrado (sin crédito) alcanza el total, y no se puede modificar después.
router.post("/:id/payments", async (req: AuthRequest, res: Response) => {
  try {
    const saleId = Number(req.params.id);
    const { method, amount } = req.body;

    if (!method || !["EFECTIVO", "QR", "TRANSFERENCIA", "CREDITO"].includes(method)) {
      return res.status(400).json({ message: "Método de pago inválido" });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "Debe indicar un monto mayor a 0" });
    }

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { payments: true },
    });
    if (!sale || sale.type !== "MAYOR") {
      return res.status(404).json({ message: "Venta mayorista no encontrada" });
    }
    if (sale.status === "PAGADO") {
      return res.status(400).json({ message: "La venta ya fue pagada completamente" });
    }

    const paidWithoutCredit = sale.payments
      .filter((p) => p.method !== "CREDITO")
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const nextStatus = method === "CREDITO" || paidWithoutCredit + Number(amount) < Number(sale.total)
      ? "PENDIENTE"
      : "PAGADO";

    await prisma.$transaction([
      prisma.payment.create({
        data: { saleId, method, amount: Number(amount) },
      }),
      prisma.sale.update({
        where: { id: saleId },
        data: { status: nextStatus },
      }),
    ]);

    const result = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        user: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        customer: true,
        items: { include: { product: { select: { id: true, name: true, itemCode: true } } } },
        payments: true,
      },
    });

    res.json({
      ...result,
      total: Number(result!.total),
      items: result!.items.map((i) => ({ ...i, unitPrice: Number(i.unitPrice), subtotal: Number(i.subtotal) })),
      payments: result!.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    });
  } catch (error: any) {
    console.error("Error al registrar pago:", error);
    res.status(500).json({ message: error.message || "Error al registrar el pago" });
  }
});

// POST /import — Importar productos desde Excel
router.post("/import", authorize("ADMIN"), upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Debe subir un archivo Excel" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      return res.status(400).json({ message: "El archivo está vacío" });
    }

    const imported: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as any;
      const itemCode = row["Codigo fabrica"] || row["codigo fabrica"] || row["itemCode"] || "";
      const name = row["Descripcion"] || row["descripcion"] || row["Producto"] || row["producto"] || "";
      const brand = row["Marca"] || row["marca"] || "";
      const model = row["Modelo"] || row["modelo"] || "";
      const year = row["Anos"] || row["anos"] || row["Años"] || row["años"] || "";
      const detail = row["Detalle"] || row["detalle"] || "";
      const wholesalePrice = parseFloat(row["Precio mayor"] || row["precio mayor"] || row["wholesalePrice"] || "0");

      if (!itemCode || !name) {
        errors.push(`Fila ${i + 1}: Código y nombre son obligatorios`);
        continue;
      }

      try {
        let product = await prisma.product.findUnique({ where: { itemCode } });

        if (!product) {
          product = await prisma.product.create({
            data: {
              itemCode,
              name,
              brand: brand || "Sin marca",
              model: model || "Sin modelo",
              year: year || "",
              detail,
              manufacturer: "Importado",
              price1: wholesalePrice || 0,
              price2: wholesalePrice || 0,
              wholesalePrice: wholesalePrice || undefined,
            },
          });
        } else if (wholesalePrice > 0) {
          product = await prisma.product.update({
            where: { id: product.id },
            data: { wholesalePrice },
          });
        }

        imported.push({ id: product.id, itemCode: product.itemCode, name: product.name });
      } catch (err: any) {
        errors.push(`Fila ${i + 1}: ${err.message}`);
      }
    }

    res.json({
      imported: imported.length,
      errors: errors.length,
      details: { imported, errors },
    });
  } catch (error: any) {
    console.error("Error al importar Excel:", error);
    res.status(500).json({ message: error.message || "Error al procesar el archivo" });
  }
});

// POST /import-order — Importar un pedido mayorista desde Excel
// Columnas: Codigo Item / Codigo OEM / Codigo Fabrica / QTY. Resuelve los productos,
// autocompleta el Precio Mayor y devuelve los ítems listos para la venta.
router.post("/import-order", authorize("ADMIN", "TIENDA"), upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Debe subir un archivo Excel" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      return res.status(400).json({ message: "El archivo está vacío" });
    }

    const items: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as any;
      const itemCode = (row["Codigo Item"] || row["Código Item"] || row["CodigoItem"] || row["Item Code"] || row["Codigo"] || row["Código"] || "").toString().trim();
      const oemCode = (row["Codigo OEM"] || row["Código OEM"] || row["Cod.OEM"] || row["OEM"] || "").toString().trim();
      const factoryCode = (row["Codigo Fabrica"] || row["Código Fabrica"] || row["Cod. Fabrica"] || "").toString().trim();
      const qty = parseInt(row["QTY"] || row["Qty"] || row["Cantidad"] || row["Cant"] || "0", 10) || 0;

      if (!itemCode && !oemCode && !factoryCode) {
        errors.push(`Fila ${i + 2}: Falta el código del producto`);
        continue;
      }
      if (qty <= 0) {
        errors.push(`Fila ${i + 2}: Cantidad inválida para ${itemCode || oemCode || factoryCode}`);
        continue;
      }

      let product: any = null;
      if (itemCode) product = await prisma.product.findUnique({ where: { itemCode } });
      if (!product && oemCode) product = await prisma.product.findFirst({ where: { oemCode } });
      if (!product && factoryCode) product = await prisma.product.findFirst({ where: { factoryCode } });

      if (!product) {
        errors.push(`Fila ${i + 2}: Producto no encontrado (${itemCode || oemCode || factoryCode})`);
        continue;
      }

      const unitPrice = product.wholesalePrice ? Number(product.wholesalePrice) : Number(product.price1) || 0;
      const existingItem = items.find((it) => it.productId === product.id);
      if (existingItem) {
        existingItem.quantity += qty;
        existingItem.subtotal = existingItem.quantity * existingItem.unitPrice;
      } else {
        items.push({
          productId: product.id,
          factoryCode: product.factoryCode || null,
          itemCode: product.itemCode,
          name: product.name,
          brand: product.brand,
          model: product.model,
          year: product.year,
          detail: product.detail,
          quantity: qty,
          unitPrice,
          subtotal: qty * unitPrice,
        });
      }
    }

    const total = items.reduce((s, it) => s + it.subtotal, 0);
    res.json({ totalFiles: rows.length, valid: items.length, errors, items, total });
  } catch (error: any) {
    console.error("Error al importar pedido:", error);
    res.status(500).json({ message: error.message || "Error al procesar el archivo" });
  }
});

// POST /export-excel — Exportar la lista del pedido a Excel (para enviar al cliente)
// Columnas: CODIGO FABRICA, CODIGO ITEM, PRODUCTO, MARCA, CANTIDAD, PRECIO MAYOR, SUBTOTAL
router.post("/export-excel", authorize("ADMIN", "TIENDA"), async (req: AuthRequest, res: Response) => {
  try {
    const { items, clientName } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No hay productos para exportar" });
    }

    const header = ["CODIGO FABRICA", "CODIGO ITEM", "PRODUCTO", "MARCA", "CANTIDAD", "PRECIO MAYOR", "SUBTOTAL"];
    const rows = items.map((it: any) => [
      it.factoryCode || "",
      it.itemCode || "",
      it.name || "",
      it.brand || "",
      Number(it.quantity) || 0,
      Number(it.unitPrice) || 0,
      Number(it.subtotal) || 0,
    ]);
    const total = rows.reduce((s, r) => s + (Number(r[6]) || 0), 0);
    rows.push(["", "", "", "", "", "TOTAL", +total.toFixed(2)]);

    const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    worksheet["!cols"] = header.map(() => ({ wch: 18 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pedido");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const safeName = typeof clientName === "string" && clientName.trim()
      ? clientName.trim().replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "_")
      : "pedido";

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="pedido-mayorista-${safeName}.xlsx"`);
    res.send(buffer);
  } catch (error: any) {
    console.error("Error al exportar Excel:", error);
    res.status(500).json({ message: error.message || "Error al exportar el Excel" });
  }
});

// GET / — Listar ventas mayoristas
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, locationId, page = "1", limit = "20" } = req.query;

    const where: any = { type: "MAYOR" };
    if (req.user?.role === "TIENDA") {
      where.locationId = req.user.locationId;
    } else if (locationId && typeof locationId === "string") {
      where.locationId = Number(locationId);
    }
    if (startDate || endDate) {
      where.saleDate = {};
      if (startDate && typeof startDate === "string") where.saleDate.gte = new Date(startDate);
      if (endDate && typeof endDate === "string") {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.saleDate.lte = end;
      }
    } else {
      // Registro de ventas por mayor: se conservan 15 días por defecto
      where.saleDate = { gte: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) };
    }

    const pg = Math.max(1, Number(page) || 1);
    const take = Math.min(500, Math.max(1, Number(limit) || 20));
    const skip = (pg - 1) * take;

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          customer: true,
          items: { include: { product: { select: { id: true, name: true, itemCode: true } } } },
          payments: true,
        },
        orderBy: { saleDate: "desc" },
        skip,
        take,
      }),
      prisma.sale.count({ where }),
    ]);

    res.json({
      sales: sales.map((s) => ({
        ...s,
        total: Number(s.total),
        items: s.items.map((i) => ({ ...i, unitPrice: Number(i.unitPrice), subtotal: Number(i.subtotal) })),
        payments: s.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
      })),
      pagination: { total, page: pg, limit: take, pages: Math.ceil(total / take) },
    });
  } catch (error) {
    console.error("Error al listar ventas mayoristas:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;
