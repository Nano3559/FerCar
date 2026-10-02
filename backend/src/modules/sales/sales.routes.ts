import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, authorize, requireTiendaLocation } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";
import { ensureRestockRequest } from "../../utils/restockRequest";
import { validateAndMergeItems, demandByProduct } from "../../utils/saleItems";
import { planFulfillment, loadStockSnapshot, summarizeFulfillment } from "../../utils/fulfillment";
import { saleCode } from "../../shared/documentCodes";

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
    // El enum no acepta cualquier cadena: sin esto, un type inventado en la
    // URL hace que Prisma rechace la consulta con un 500.
    if (type === "NORMAL" || type === "MAYOR" || type === "DEPARTAMENTAL") where.type = type;
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
      // El filtro de tienda de la URL no puede sacar a un vendedor de su tienda.
      where.locationId = user.locationId;
    } else if (locationId && typeof locationId === "string") {
      const loc = Number(locationId);
      // Number("abc") es NaN y Prisma lo rechaza con un 500.
      if (Number.isInteger(loc) && loc > 0) where.locationId = loc;
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
          items: { include: { product: { select: { id: true, name: true, itemCode: true, brand: true, manufacturer: true } } } },
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
        entrega: summarizeFulfillment(s.items),
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
  <title>Nota de Venta ${saleCode(sale.id, sale.saleDate)}</title>
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
    .totals .pagado { font-weight: bold; font-size: 12px; color: #166534; background: #ecfdf5; padding: 4px 6px; border-radius: 4px; }
    .note { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 6px 8px; border-radius: 4px; margin-top: 8px; font-size: 10px; }
    .payments { background: #f5f5f5; padding: 6px 8px; border-radius: 4px; margin-top: 8px; font-size: 10px; }
    .footer { margin-top: 12px; text-align: center; border-top: 2px dashed #333; padding-top: 8px; font-size: 9px; color: #666; }
    .stamp { display: inline-block; border: 1px solid #999; padding: 4px 15px; margin-top: 10px; color: #999; font-size: 9px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <h2>${sale.location?.name || "Tienda"}</h2>
    <p>Nota de Venta — Sistema de Inventario y Ventas</p>
  </div>

  <div class="info">
    <div><strong>NOTA DE VENTA ${saleCode(sale.id, sale.saleDate)}</strong></div>
    <div class="text-right">${new Date(sale.saleDate).toLocaleDateString("es-BO")} ${new Date(sale.saleDate).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}</div>
  </div>
  <div class="info">
    <div>Tipo: <strong>${sale.type === "MAYOR" ? "VENTA POR MAYOR" : sale.type === "DEPARTAMENTAL" ? "VENTA DEPARTAMENTAL" : "VENTA NORMAL"}</strong></div>
    <div class="text-right">Atendido por: ${sale.user.name}${(sale as any).seller ? ` (${(sale as any).seller})` : ""}</div>
  </div>

  ${sale.customer ? `
  <div class="customer">
    <strong>Cliente:</strong> ${sale.customer.name}
    ${sale.customer.nit ? ` | NIT/CI: ${sale.customer.nit}` : ""}
    ${sale.customer.phone ? ` | Tel: ${sale.customer.phone}` : ""}
  </div>
  ` : ""}

  ${(sale.type === "MAYOR" && (sale.paraQuien || sale.lugarEntrega || sale.formaPago)) ? `
  <div class="customer">
    <strong>Datos de entrega:</strong><br>
    ${sale.paraQuien ? `<span>Para: ${sale.paraQuien}</span><br>` : ""}
    ${sale.lugarEntrega ? `<span>Lugar: ${sale.lugarEntrega}</span><br>` : ""}
    ${sale.formaPago ? `<span>Forma de pago: ${sale.formaPago}</span><br>` : ""}
  </div>
  ` : ""}

  ${(sale.nitName || sale.datosFactura || sale.telefonoFactura) ? `
  <div class="customer">
    <strong>Datos de factura:</strong><br>
    ${sale.nitName ? `<span>Nombre / Razón social: ${sale.nitName}</span><br>` : ""}
    ${sale.datosFactura ? `<span>NIT / Carnet: ${sale.datosFactura}</span><br>` : ""}
    ${sale.telefonoFactura ? `<span>Celular: ${sale.telefonoFactura}</span><br>` : ""}
  </div>
  ` : ""}

  <table>
    <thead>
      <tr>
        <th class="text-center">Cant.</th>
        <th>Cód. Fábrica</th>
        <th>Descripción</th>
        <th class="text-right">Precio 1/2</th>
        <th class="text-right">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${sale.items.map((item) => {
        const p1 = Number(item.product?.price1 || 0);
        const p2 = Number(item.product?.price2 || 0);
        const up = Number(item.unitPrice);
        const tier = p2 > 0 && p2 !== p1 && Math.abs(up - p2) <= Math.abs(up - p1) ? "P2" : "P1";
        const codFab = item.product?.factoryCode || item.product?.itemCode || "—";
        return `
      <tr>
        <td class="text-center">${item.quantity}</td>
        <td><small style="color:#555;font-size:9px">${codFab}</small></td>
        <td>${item.product.name}<br><small style="color:#999">${item.product.brand} · ${item.product.itemCode}</small></td>
        <td class="text-right"><strong>${tier}</strong> Bs. ${up.toFixed(2)}</td>
        <td class="text-right">Bs. ${Number(item.subtotal).toFixed(2)}</td>
      </tr>`;
      }).join("")}
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal:</span><span>Bs. ${Number(sale.total).toFixed(2)}</span></div>
    ${totalReturned > 0 ? `<div class="row" style="color:#dc2626"><span>Devoluciones:</span><span>- Bs. ${totalReturned.toFixed(2)}</span></div>` : ""}
    <div class="row total-final"><span>TOTAL:</span><span>Bs. ${(Number(sale.total) - totalReturned).toFixed(2)}</span></div>
    <div class="row pagado"><span>TOTAL PAGADO:</span><span>Bs. ${totalPaid.toFixed(2)}</span></div>
    ${totalPaid < (Number(sale.total) - totalReturned) ? `<div class="row" style="color:#dc2626"><span>Pendiente:</span><span>Bs. ${((Number(sale.total) - totalReturned) - totalPaid).toFixed(2)}</span></div>` : ""}
  </div>

  <div class="payments">
    <strong>Métodos de pago:</strong> ${paymentMethods || "Sin pagos registrados"}
  </div>

  ${sale.note ? `
  <div class="note">
    <strong>Nota / Recordatorio:</strong> ${sale.note}
  </div>
  ` : ""}

  <div class="footer">
    <p>¡Gracias por su compra!</p>
    <p>Repuestos de calidad — ${sale.location?.name || "Tienda"}</p>
    <div class="stamp">SOLD</div>
  </div>
  <script>
    window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 250); });
  </script>
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
    // El "seller" del body se acepta por compatibilidad con clientes viejos,
    // pero el vendedor real es siempre la cuenta autenticada (ver mas abajo).
    const { items, payments, customerId, customerData, requiereFactura, locationId, note, type, paraQuien, lugarEntrega, datosFactura, nitName, telefono, telefonoFactura } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Debe agregar al menos un producto" });
    }

    // Departamental: la venta se arma durante el dia y se cobra al final, asi que
    // se puede abrir con un pago parcial o solo con credito. Las locales siguen
    // exigiendo pago completo: ahi se cobra en el momento.
    const esDepartamental = type === "DEPARTAMENTAL";

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      if (!esDepartamental) {
        return res.status(400).json({ message: "Debe registrar al menos un pago" });
      }
    }

    if (type && !["NORMAL", "DEPARTAMENTAL"].includes(type)) {
      return res.status(400).json({ message: "Tipo de venta inválido" });
    }
    const saleType = type === "DEPARTAMENTAL" ? "DEPARTAMENTAL" : "NORMAL";

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

    // Vendedor: la venta se registra SIEMPRE a nombre de la cuenta que la
    // realiza. El vendedor viaja en el body del cliente, asi que se ignora por
    // completo: nadie puede registrar una venta a nombre de otro usuario.
    const accountUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { name: true },
    });
    const finalSeller = accountUser?.name ?? null;

    // Cotizacion de origen (opcional). Se valida antes de cobrar para no
    // registrar una venta colgada de un papel que ya se uso o de otra tienda.
    let quoteId: number | null = null;
    if (req.body.quoteId) {
      const id = Number(req.body.quoteId);
      if (Number.isInteger(id) && id > 0) {
        const quote = await prisma.quote.findUnique({ where: { id } });
        if (!quote) return res.status(400).json({ message: "La cotización indicada no existe" });
        if (quote.saleId) {
          return res.status(400).json({ message: "Esa cotización ya se convirtió en una venta" });
        }
        // La venta siempre se registra en userLocationId, asi que la cotizacion
        // tiene que ser de esa misma tienda o el vinculo seria falso.
        if (quote.locationId !== userLocationId) {
          return res.status(403).json({ message: "No puede usar una cotización de otra tienda" });
        }
        quoteId = id;
      }
    }

    const validMethods = ["EFECTIVO", "QR", "TRANSFERENCIA", "CREDITO"];
    for (const p of payments || []) {
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
        // El formulario ya no pide CI/NIT ni celular del cliente, solo el
        // nombre. Sin NIT ni celular hay que buscar por nombre, o cada venta
        // crearia un cliente nuevo de la misma persona. Sin distincion de
        // mayusculas, para que "juan" y "Juan" sean el mismo cliente.
        if (!customer) {
          customer = await prisma.customer.findFirst({
            where: { name: { equals: name, mode: "insensitive" } },
          });
        }
        if (!customer) {
          customer = await prisma.customer.create({
            data: { name, nit: nit || null, phone: phone || null },
          });
        } else if (!customer.phone && phone) {
          // Se completo el celular de un cliente que ya existia.
          customer = await prisma.customer.update({
            where: { id: customer.id },
            data: { phone },
          });
        }
        finalCustomerId = customer.id;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Entrega parcial: se usa primero la tienda donde se cobra, luego las
      // demas tiendas (la mercaderia ya existe, solo esta en otro punto) y lo
      // que no hay en ninguna se pide al almacen y queda pendiente. Si no
      // existe en ninguna parte, la venta se recorta a lo que hay.
      const stock = await loadStockSnapshot(tx, validItems.map((i) => i.productId), userLocationId);
      const plan = planFulfillment(validItems, stock, userLocationId);

      const productos = await tx.product.findMany({
        where: { id: { in: validItems.map((i) => i.productId) } },
        select: { id: true, name: true, itemCode: true },
      });
      const nombrePorId = new Map(productos.map((p) => [p.id, p]));

      for (const productId of new Set(validItems.map((i) => i.productId))) {
        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product) throw new Error(`Producto con ID ${productId} no encontrado`);
      }

      let totalSale = 0;
      const saleItemsData = plan.lines.map((line) => {
        // El precio es el que envio el vendedor para ESA linea.
        const unitPrice = validItems[line.index].unitPrice;
        const subtotal = line.sellable * unitPrice;
        totalSale += subtotal;
        return {
          productId: line.productId,
          quantity: line.sellable,
          deliveredQuantity: line.delivered,
          unitPrice,
          subtotal,
        };
      });

      // Descuenta de la ubicacion que realmente aporto cada unidad: la tienda
      // donde se cobra primero y, si no alcanza, las otras tiendas. Lo que sale
      // del almacen no se descuenta aqui: se descuenta cuando la solicitud se
      // marca recibida, para no contarlo dos veces.
      const stockUpdates = plan.deductions.map((d) => ({
        productId: d.productId,
        locationId: d.locationId,
        quantity: d.units,
      }));

      const totalPaid = (payments || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);

      // Si hubo recorte, el total de la venta bajo respecto a lo que el vendedor
      // iba a cobrar. El dinero no se ajusta solo: el vendedor tiene que cobrar
      // lo que realmente se vendio, asi que el mensaje dice cuanto quedo.
      const ajusteCobro = plan.capped.length
        ? ` Se vendio solo lo existente: ${plan.capped
            .map((c) => {
              const p = nombrePorId.get(c.productId);
              return `${p ? `${p.name} (${p.itemCode})` : `Producto ${c.productId}`} ${c.sellable} de ${c.requested}`;
            })
            .join("; ")}.`
        : "";

      if (!esDepartamental && Math.abs(totalPaid - totalSale) > 0.01) {
        throw new Error(`El total pagado (Bs. ${totalPaid}) no coincide con el total de la venta (Bs. ${totalSale}).${ajusteCobro}`);
      }

      // En departamental el pago puede ir por debajo: la venta queda PENDIENTE
      // y se completa con POST /sales/:id/payments cuando el cliente pague al
      // final del dia. Nunca por encima del total.
      if (esDepartamental && totalPaid - totalSale > 0.01) {
        throw new Error(`El total pagado (Bs. ${totalPaid}) supera el total de la venta (Bs. ${totalSale}).${ajusteCobro}`);
      }

      const paidSinCredito = (payments || [])
        .filter((p: any) => p.method !== "CREDITO")
        .reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      const status = esDepartamental && paidSinCredito < totalSale - 0.01 ? "PENDIENTE" : "PAGADO";

      const sale = await tx.sale.create({
        data: {
          total: totalSale,
          type: saleType,
          userId: user.userId,
          locationId: userLocationId,
          customerId: finalCustomerId,
          seller: finalSeller,
          status,
          note: typeof note === "string" && note.trim() ? note.trim() : null,
          // Las tres personas van separadas: cliente (customer), envio
          // (paraQuien/lugarEntrega/telefono) y factura
          // (datosFactura/nitName/telefonoFactura), que a veces es un tercero.
          // Los datos de factura solo se guardan si se pidio factura: si el
          // vendedor marco que no, no se inventan.
          paraQuien: paraQuien || null,
          lugarEntrega: lugarEntrega || null,
          telefono: telefono || null,
          datosFactura: requiereFactura ? (datosFactura || null) : null,
          nitName: requiereFactura ? (nitName || null) : null,
          telefonoFactura: requiereFactura ? (telefonoFactura || null) : null,
          items: { create: saleItemsData },
          payments: {
            create: (payments || []).map((p: any) => ({
              method: p.method,
              amount: Number(p.amount),
            })),
          },
        },
        include: {
          items: true,
          payments: true,
          // El resumen de venta recien cobrada muestra los datos de factura del
          // cliente. Sin incluirlos nunca se renderizaban, porque el frontend
          // arma ese bloque desde la respuesta de esta misma llamada.
          customer: { select: { id: true, name: true, nit: true, phone: true } },
          location: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
        },
      });

      // Si la venta viene de una cotizacion, se marca como convertida para que
      // el papel y la venta queden unidos en ambos sentidos.
      if (quoteId) {
        await tx.quote.update({
          where: { id: quoteId },
          data: { saleId: sale.id, status: "CONVERTIDA" },
        });
      }

      for (const update of stockUpdates) {
        const inv = await tx.inventory.findUnique({
          where: { productId_locationId: { productId: update.productId, locationId: update.locationId } },
        });

        if (inv) {
          const newStock = inv.stock - update.quantity;
          await tx.inventory.update({
            where: { id: inv.id },
            data: { stock: newStock },
          });

          // La venta dejo el stock en cero o por debajo del minimo: se genera
          // sola la solicitud de reposicion desde el almacen. La solicitud va
          // a la ubicacion que realmente vendio, no a la tienda que cobró.
          await ensureRestockRequest(tx, {
            productId: update.productId,
            destinationId: update.locationId,
            requestedById: user.userId,
            source: "VENTA",
            note: "Reposición automática: la venta dejó el stock bajo el mínimo",
          });
        }
      }

      // Lo que quedo pendiente se pide al almacen. Cada solicitud queda
      // enlazada a la linea de venta que va a completar, para que al llegar la
      // mercaderia se sepa que pedido se cierra.
      for (const line of plan.lines) {
        if (line.pending <= 0) continue;
        const saleItem = sale.items.find((i) => i.productId === line.productId && i.quantity === line.sellable);
        await ensureRestockRequest(tx, {
          productId: line.productId,
          destinationId: userLocationId,
          requestedById: user.userId,
          quantity: line.pending,
          source: "VENTA",
          saleId: sale.id,
          saleItemId: saleItem?.id,
          note: `Venta #${sale.id}: ${line.pending} unidad(es) pendientes de llegar`,
        });
      }

      const etiqueta = (productId: number) => {
        const p = nombrePorId.get(productId);
        return p ? `${p.name} (${p.itemCode})` : `Producto ${productId}`;
      };

      return {
        ...sale,
        total: Number(sale.total),
        items: sale.items.map((i) => ({ ...i, unitPrice: Number(i.unitPrice), subtotal: Number(i.subtotal) })),
        payments: sale.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
        entrega: {
          // Misma forma que devuelve el listado, mas el detalle con nombres y lo
          // que se descarto. Si difieren, el frontend tiene que adivinar.
          ...summarizeFulfillment(sale.items),
          detalle: plan.lines
            .filter((l) => l.pending > 0)
            .map((l) => ({
              productId: l.productId,
              nombre: etiqueta(l.productId),
              entregadas: l.delivered,
              pendientes: l.pending,
            })),
          recortados: plan.capped.map((c) => ({
            productId: c.productId,
            nombre: etiqueta(c.productId),
            pedido: c.requested,
            vendido: c.sellable,
            faltante: c.missing,
          })),
        },
      };
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error("Error al crear venta:", error);
    res.status(400).json({ message: error.message || "Error interno del servidor" });
  }
});

// Ampliar una venta departamental que ya se creo. La venta se arma durante el
// dia: el cliente pide cosas en varias llamadas y el pedido crece hasta que
// pasa a retirar y pagar. Por eso no se exige pago aqui: el total sube y la
// venta queda PENDIENTE.
router.post("/:id/items", async (req: AuthRequest, res: Response) => {
  try {
    const saleId = Number(req.params.id);
    const { items } = req.body;

    if (!Number.isInteger(saleId) || saleId <= 0) {
      return res.status(400).json({ message: "Venta inválida" });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Debe agregar al menos un producto" });
    }

    const user = req.user!;
    const sale = await prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) {
      return res.status(404).json({ message: "Venta no encontrada" });
    }
    if (sale.type !== "DEPARTAMENTAL") {
      return res.status(400).json({ message: "Solo las ventas departamentales se pueden ampliar" });
    }
    // Un vendedor de tienda solo toca ventas de su propia tienda.
    if (user.role === "TIENDA" && sale.locationId !== user.locationId) {
      return res.status(403).json({ message: "No puede modificar una venta de otra tienda" });
    }

    const validItems = validateAndMergeItems(items);

    const result = await prisma.$transaction(async (tx) => {
      // Se vuelve a leer dentro de la transaccion para no trabajar con un
      // total viejo si otra peticion amplió la misma venta al mismo tiempo.
      const fresh = await tx.sale.findUnique({ where: { id: saleId }, include: { items: true } });
      if (!fresh) throw new Error("Venta no encontrada");

      // Ampliar una venta ya registrada es distinto a cobrarla: aqui ya hay dinero
      // registrado y pagos parciales, asi que no se recorta nada en silencio.
      // Se avisa cuanto existe en total (tienda + otras tiendas + almacenes)
      // para que el error no diga "no hay" cuando si hay en otro lado.
      const stockAmpliar = await loadStockSnapshot(
        tx,
        validItems.map((i) => i.productId),
        sale.locationId,
      );
      for (const item of demandByProduct(validItems)) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw new Error(`Producto con ID ${item.productId} no encontrado`);

        const snap = stockAmpliar[item.productId];
        const total =
          (snap?.store ?? 0) + (snap?.otherStores ?? 0) + (snap?.warehouses ?? 0);
        if (total < item.quantity) {
          throw new Error(
            `Stock insuficiente para "${product.name}". Disponible: ${total} (en tienda ${snap?.store ?? 0}, ` +
            `otras tiendas ${snap?.otherStores ?? 0}, almacenes ${snap?.warehouses ?? 0}), solicitado: ${item.quantity}`,
          );
        }
      }
      const stockUpdates: { productId: number; quantity: number }[] =
        demandByProduct(validItems).map((i) => ({ productId: i.productId, quantity: i.quantity }));

      // Cada linea conserva su precio. Si al ampliar se agrega el mismo producto
      // a otro precio (P1 vs P2) se crea una linea nueva: antes se reescribia el
      // precio de las unidades ya vendidas y el total acababa por debajo de lo
      // que ya se habia cobrado.
      const lineKey = (productId: number, unitPrice: number) => `${productId}:${unitPrice}`;
      const byLine = new Map<
        string,
        { id?: number; productId: number; quantity: number; unitPrice: number }
      >();
      for (const existing of fresh.items) {
        const unitPrice = Number(existing.unitPrice);
        byLine.set(lineKey(existing.productId, unitPrice), {
          id: existing.id,
          productId: existing.productId,
          quantity: existing.quantity,
          unitPrice,
        });
      }
      let added = 0;
      for (const item of validItems) {
        const key = lineKey(item.productId, item.unitPrice);
        const prev = byLine.get(key);
        if (prev) {
          prev.quantity += item.quantity;
        } else {
          byLine.set(key, {
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          });
        }
        added += item.quantity * item.unitPrice;
      }

      for (const data of byLine.values()) {
        const subtotal = data.quantity * data.unitPrice;
        if (data.id) {
          await tx.saleItem.update({
            where: { id: data.id },
            data: { quantity: data.quantity, subtotal },
          });
        } else {
          await tx.saleItem.create({
            data: {
              saleId,
              productId: data.productId,
              quantity: data.quantity,
              unitPrice: data.unitPrice,
              subtotal,
            },
          });
        }
      }

      const newTotal = Number(fresh.total) + added;
      await tx.sale.update({ where: { id: saleId }, data: { total: newTotal, status: "PENDIENTE" } });

      for (const update of stockUpdates) {
        const inv = await tx.inventory.findUnique({
          where: { productId_locationId: { productId: update.productId, locationId: sale.locationId } },
        });
        if (inv) {
          await tx.inventory.update({
            where: { id: inv.id },
            data: { stock: inv.stock - update.quantity },
          });
          await ensureRestockRequest(tx, {
            productId: update.productId,
            destinationId: sale.locationId,
            requestedById: user.userId,
            source: "VENTA",
            note: "Reposición automática: la venta dejó el stock bajo el mínimo",
          });
        }
      }

      const updated = await tx.sale.findUnique({
        where: { id: saleId },
        include: {
          user: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          customer: true,
          items: { include: { product: { select: { id: true, name: true, itemCode: true, brand: true, manufacturer: true } } } },
          payments: true,
        },
      });

      return {
        ...updated!,
        total: Number(updated!.total),
        items: updated!.items.map((i) => ({ ...i, unitPrice: Number(i.unitPrice), subtotal: Number(i.subtotal) })),
        payments: updated!.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
        entrega: summarizeFulfillment(updated!.items),
      };
    });

    res.json(result);
  } catch (error: any) {
    console.error("Error al ampliar venta:", error);
    res.status(400).json({ message: error.message || "Error interno del servidor" });
  }
});

// Registrar un pago contra una venta departamental. Los pagos se acumulan:
// mientras lo pagado (sin credito) no llegue al total, la venta queda PENDIENTE.
router.post("/:id/payments", async (req: AuthRequest, res: Response) => {
  try {
    const saleId = Number(req.params.id);
    const { method, amount } = req.body;

    if (!Number.isInteger(saleId) || saleId <= 0) {
      return res.status(400).json({ message: "Venta inválida" });
    }
    if (!method || !["EFECTIVO", "QR", "TRANSFERENCIA", "CREDITO"].includes(method)) {
      return res.status(400).json({ message: "Método de pago inválido" });
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ message: "Debe indicar un monto mayor a 0" });
    }

    const user = req.user!;
    const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: { payments: true } });
    if (!sale) {
      return res.status(404).json({ message: "Venta no encontrada" });
    }
    if (sale.type !== "DEPARTAMENTAL") {
      return res.status(400).json({ message: "Solo las ventas departamentales admiten pagos posteriores" });
    }
    if (user.role === "TIENDA" && sale.locationId !== user.locationId) {
      return res.status(403).json({ message: "No puede modificar una venta de otra tienda" });
    }

    const paidSinCredito = sale.payments
      .filter((p) => p.method !== "CREDITO")
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const balance = Number(sale.total) - paidSinCredito;
    if (balance <= 0.01) {
      return res.status(400).json({ message: "Esta venta ya está pagada por completo" });
    }
    if (value > balance + 0.01) {
      return res.status(400).json({ message: `El monto supera el saldo pendiente (Bs. ${balance.toFixed(2)})` });
    }

    const nextStatus = method === "CREDITO" || paidSinCredito + value < Number(sale.total) - 0.01
      ? "PENDIENTE"
      : "PAGADO";

    await prisma.$transaction([
      prisma.payment.create({ data: { saleId, method, amount: value } }),
      prisma.sale.update({ where: { id: saleId }, data: { status: nextStatus } }),
    ]);

    const result = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        user: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        customer: true,
        items: { include: { product: { select: { id: true, name: true, itemCode: true, brand: true, manufacturer: true } } } },
        payments: true,
      },
    });

    res.json({
      ...result!,
      total: Number(result!.total),
      items: result!.items.map((i) => ({ ...i, unitPrice: Number(i.unitPrice), subtotal: Number(i.subtotal) })),
      payments: result!.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
      entrega: summarizeFulfillment(result!.items),
    });
  } catch (error: any) {
    console.error("Error al registrar pago:", error);
    res.status(500).json({ message: error.message || "Error al registrar el pago" });
  }
});

export default router;
