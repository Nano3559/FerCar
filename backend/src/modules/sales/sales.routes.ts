import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, authorize, requireTiendaLocation } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";
import { nextDayAt8 } from "../../utils/replenish";
import { validateAndMergeItems } from "../../utils/saleItems";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
router.use(requireTiendaLocation);
router.use(authorize("ADMIN", "TIENDA"));

// GET / — Listar ventas con filtros
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { type, locationId, seller, startDate, endDate, page = "1", limit = "20" } = req.query;

    const where: any = {};
    if (type && typeof type === "string") where.type = type;
    if (seller && typeof seller === "string") where.seller = seller;
    if (startDate || endDate) {
      where.saleDate = {};
      if (startDate && typeof startDate === "string") where.saleDate.gte = new Date(startDate);
      if (endDate && typeof endDate === "string") {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.saleDate.lte = end;
      }
    }

    const user = req.user!;
    if (user.role === "TIENDA") {
      where.locationId = user.locationId;
    } else if (locationId && typeof locationId === "string") {
      where.locationId = Number(locationId);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          customer: true,
          items: { include: { product: { select: { id: true, name: true, itemCode: true, brand: true } } } },
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
      pagination: { total, page: Number(page), limit: take, pages: Math.ceil(total / take) },
    });
  } catch (error) {
    console.error("Error al listar ventas:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /:id/nota — Generar nota de venta (HTML imprimible)
router.get("/:id/nota", async (req: AuthRequest, res: Response) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        user: { select: { id: true, name: true } },
        location: { select: { id: true, name: true, address: true } },
        customer: true,
        items: { include: { product: true } },
        payments: true,
        returns: true,
      },
    });

    if (!sale) {
      return res.status(404).json({ message: "Venta no encontrada" });
    }

    const noteUser = req.user!;
    if (noteUser.role === "TIENDA" && noteUser.locationId && sale.locationId !== noteUser.locationId) {
      return res.status(403).json({ message: "No tiene acceso a la nota de esta venta" });
    }

    const totalReturned = sale.returns.reduce((sum, r) => sum + Number(r.amount), 0);
    const totalPaid = sale.payments.reduce((sum, p) => sum + Number(p.amount), 0);

    const paymentMethods = sale.payments.map((p) => `${p.method}: Bs. ${Number(p.amount).toFixed(2)}`).join(" | ");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Nota de Venta #${sale.id}</title>
  <style>
    @page { size: A5; margin: 10mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 11px; color: #333; padding: 15px; max-width: 148mm; margin: 0 auto; }
    .header { text-align: center; border-bottom: 2px dashed #333; padding-bottom: 8px; margin-bottom: 8px; }
    .header h2 { font-size: 14px; margin-bottom: 2px; }
    .header p { font-size: 10px; color: #666; }
    .info { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 10px; }
    .info div { flex: 1; }
    .customer { background: #f5f5f5; padding: 6px 8px; border-radius: 4px; margin-bottom: 8px; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { padding: 3px 5px; text-align: left; border-bottom: 1px solid #ddd; font-size: 10px; }
    th { background: #f0f0f0; font-weight: bold; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .totals { margin-top: 5px; }
    .totals .row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 10px; }
    .totals .total-final { font-weight: bold; font-size: 12px; border-top: 2px solid #333; padding-top: 4px; margin-top: 4px; }
    .payments { background: #f5f5f5; padding: 6px 8px; border-radius: 4px; margin-top: 8px; font-size: 10px; }
    .footer { margin-top: 12px; text-align: center; border-top: 2px dashed #333; padding-top: 8px; font-size: 9px; color: #666; }
    .stamp { display: inline-block; border: 1px solid #999; padding: 4px 15px; margin-top: 10px; color: #999; font-size: 9px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <h2>Shibumi</h2>
    <p>Sistema de Inventario y Ventas</p>
    <p>${sale.location?.name || "Tienda"}</p>
  </div>

  <div class="info">
    <div><strong>NOTA DE VENTA #${sale.id}</strong></div>
    <div class="text-right">${new Date(sale.saleDate).toLocaleDateString("es-BO")} ${new Date(sale.saleDate).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}</div>
  </div>
  <div class="info">
    <div>Tipo: <strong>${sale.type === "MAYOR" ? "VENTA POR MAYOR" : "VENTA NORMAL"}</strong></div>
    <div class="text-right">Atendido por: ${sale.user.name}${(sale as any).seller ? ` (${(sale as any).seller})` : ""}</div>
  </div>

  ${sale.customer ? `
  <div class="customer">
    <strong>Cliente:</strong> ${sale.customer.name}
    ${sale.customer.nit ? ` | NIT/CI: ${sale.customer.nit}` : ""}
    ${sale.customer.phone ? ` | Tel: ${sale.customer.phone}` : ""}
  </div>
  ` : ""}

  ${(sale.type === "MAYOR" && (sale.paraQuien || sale.lugarEntrega || sale.datosFactura || sale.formaPago)) ? `
  <div class="customer">
    <strong>Datos de entrega:</strong><br>
    ${sale.paraQuien ? `<span>Para: ${sale.paraQuien}</span><br>` : ""}
    ${sale.lugarEntrega ? `<span>Lugar: ${sale.lugarEntrega}</span><br>` : ""}
    ${sale.datosFactura ? `<span>Factura: ${sale.datosFactura}</span><br>` : ""}
    ${sale.formaPago ? `<span>Forma de pago: ${sale.formaPago}</span><br>` : ""}
  </div>
  ` : ""}

  <table>
    <thead>
      <tr>
        <th>Cant.</th>
        <th>Descripción</th>
        <th class="text-right">P. Unit.</th>
        <th class="text-right">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${sale.items.map((item) => `
      <tr>
        <td class="text-center">${item.quantity}</td>
        <td>${item.product.name}<br><small style="color:#999">${item.product.brand} · ${item.product.itemCode}</small></td>
        <td class="text-right">Bs. ${Number(item.unitPrice).toFixed(2)}</td>
        <td class="text-right">Bs. ${Number(item.subtotal).toFixed(2)}</td>
      </tr>
      `).join("")}
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal:</span><span>Bs. ${Number(sale.total).toFixed(2)}</span></div>
    ${totalReturned > 0 ? `<div class="row" style="color:#dc2626"><span>Devoluciones:</span><span>- Bs. ${totalReturned.toFixed(2)}</span></div>` : ""}
    <div class="row total-final"><span>TOTAL:</span><span>Bs. ${(Number(sale.total) - totalReturned).toFixed(2)}</span></div>
    <div class="row"><span>Pagado:</span><span>Bs. ${totalPaid.toFixed(2)}</span></div>
    ${totalPaid < (Number(sale.total) - totalReturned) ? `<div class="row" style="color:#dc2626"><span>Pendiente:</span><span>Bs. ${((Number(sale.total) - totalReturned) - totalPaid).toFixed(2)}</span></div>` : ""}
  </div>

  <div class="payments">
    <strong>Métodos de pago:</strong> ${paymentMethods || "Sin pagos registrados"}
  </div>

  <div class="footer">
    <p>¡Gracias por su compra!</p>
    <p>Shibumi — Repuestos de calidad para tu vehículo</p>
    <div class="stamp">SOLD</div>
  </div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error) {
    console.error("Error al generar nota de venta:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /:id — Detalle de venta
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        user: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        customer: true,
        items: { include: { product: true } },
        payments: true,
        returns: true,
      },
    });

    if (!sale) {
      return res.status(404).json({ message: "Venta no encontrada" });
    }

    const detailUser = req.user!;
    if (detailUser.role === "TIENDA" && detailUser.locationId && sale.locationId !== detailUser.locationId) {
      return res.status(403).json({ message: "No tiene acceso a esta venta" });
    }

    res.json({
      ...sale,
      total: Number(sale.total),
      items: sale.items.map((i) => ({ ...i, unitPrice: Number(i.unitPrice), subtotal: Number(i.subtotal) })),
      payments: sale.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
      returns: sale.returns.map((r) => ({ ...r, amount: Number(r.amount) })),
    });
  } catch (error) {
    console.error("Error al obtener venta:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST — Crear venta con items, pagos y facturación
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { items, payments, customerId, customerData, requiereFactura, locationId, seller } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Debe agregar al menos un producto" });
    }

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({ message: "Debe registrar al menos un pago" });
    }

    if (seller && typeof seller === "string" && !["Vendedor 1", "Vendedor 2", "Vendedor 3"].includes(seller)) {
      return res.status(400).json({ message: "Vendedor inválido. Use: Vendedor 1, Vendedor 2 o Vendedor 3" });
    }

    // Validar y deduplicar ítems (evita sobreventa con productos repetidos)
    const validItems = validateAndMergeItems(items);

    const user = req.user!;
    let userLocationId: number;

    if (user.role === "TIENDA") {
      userLocationId = user.locationId!;
      if (!userLocationId) {
        return res.status(400).json({ message: "Usuario TIENDA sin ubicación asignada" });
      }
      if (locationId && Number(locationId) !== userLocationId) {
        return res.status(403).json({ message: "No puede vender productos de otra tienda" });
      }
    } else {
      userLocationId = locationId ? Number(locationId) : user.locationId!;
      if (!userLocationId) {
        const tienda = await prisma.location.findFirst({ where: { type: "TIENDA" } });
        if (!tienda) {
          return res.status(400).json({ message: "No hay tiendas configuradas en el sistema" });
        }
        userLocationId = tienda.id;
      }
    }

    // C2: validar que el vendedor pertenezca a la tienda, solo si es un usuario registrado.
    // Los vendedores genéricos ("Vendedor 1/2/3") o libres se aceptan como texto.
    if (seller && typeof seller === "string") {
      const sellerUser = await prisma.user.findFirst({ where: { name: seller } });
      if (sellerUser) {
        if (sellerUser.locationId !== userLocationId) {
          return res.status(400).json({ message: `El vendedor "${seller}" no pertenece a esta tienda` });
        }
      }
    }

    const validMethods = ["EFECTIVO", "QR", "TRANSFERENCIA", "CREDITO"];
    for (const p of payments) {
      if (!validMethods.includes(p.method)) {
        return res.status(400).json({ message: `Método de pago inválido: ${p.method}` });
      }
    }

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
      const stockUpdates: { productId: number; quantity: number }[] = [];

      for (const item of validItems) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) {
          throw new Error(`Producto con ID ${item.productId} no encontrado`);
        }

        const inventory = await tx.inventory.findUnique({
          where: { productId_locationId: { productId: item.productId, locationId: userLocationId } },
        });

        const currentStock = inventory?.stock || 0;
        if (currentStock < item.quantity) {
          throw new Error(`Stock insuficiente para "${product.name}". Disponible: ${currentStock}, solicitado: ${item.quantity}`);
        }

        stockUpdates.push({ productId: item.productId, quantity: item.quantity });
      }

      let totalSale = 0;
      const saleItemsData = validItems.map((item: any) => {
        const subtotal = item.quantity * item.unitPrice;
        totalSale += subtotal;
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal,
        };
      });

      const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      if (Math.abs(totalPaid - totalSale) > 0.01) {
        throw new Error(`El total pagado (Bs. ${totalPaid}) no coincide con el total de la venta (Bs. ${totalSale})`);
      }

      const sale = await tx.sale.create({
        data: {
          total: totalSale,
          type: "NORMAL",
          userId: user.userId,
          locationId: userLocationId,
          customerId: finalCustomerId,
          seller: seller || null,
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

          if (newStock === 0) {
            const existing = await tx.productRequest.findFirst({
              where: {
                productId: update.productId,
                locationId: userLocationId,
                status: { in: ["PENDIENTE", "RECIBIDO_POR_INVENTARIO", "PREPARANDO"] },
              },
            });
            if (!existing) {
              const almacen = await tx.location.findFirst({ where: { type: "ALMACEN" } });
              if (almacen) {
                const almacenInv = await tx.inventory.findUnique({
                  where: { productId_locationId: { productId: update.productId, locationId: almacen.id } },
                });
                const requestQty = Math.max(update.quantity, 5);
                if (almacenInv && almacenInv.stock >= requestQty) {
                  await tx.productRequest.create({
                    data: {
                      productId: update.productId,
                      quantity: requestQty,
                      requestedById: user.userId,
                      locationId: userLocationId,
                      status: "PENDIENTE",
                      expectedDate: nextDayAt8(),
                    },
                  });
                }
              }
            }
          }
        }
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
    console.error("Error al crear venta:", error);
    res.status(400).json({ message: error.message || "Error interno del servidor" });
  }
});

export default router;
