import { Router, Response } from "express";
import { PrismaClient, QuoteStatus, SaleType } from "@prisma/client";
import { authenticate, authorize, requireTiendaLocation } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";
import { parseId, parseString } from "../../shared/middlewares/validate";
import { quoteCode, parseSaleCode } from "../../shared/documentCodes";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
router.use(requireTiendaLocation);
router.use(authorize("ADMIN", "TIENDA"));

const VALID_STATUS: QuoteStatus[] = ["PENDIENTE", "CONVERTIDA", "ANULADA"];

const escapeLike = (text: string) => text.replace(/[%_\\]/g, (c) => `\\${c}`);

/** Sin filtros de fecha solo se mira una ventana reciente, para no traer la
 *  tabla entera. El frontend siempre manda from/to explicitos. */
const DEFAULT_WINDOW_DAYS = 90;

interface QuoteLine {
  productId: number;
  quantity: number;
  unitPrice: number;
  priceTier: number | null;
}

/**
 * Valida las lineas de la cotizacion y combina solo las que son realmente
 * iguales (mismo producto, mismo precio y mismo nivel P1/P2).
 *
 * No se puede reutilizar la deduplicacion de ventas: alla sumar dos lineas del
 * mismo producto es correcto, pero en una cotizacion implicaria quedarse con
 * el precio de la primera y cambiar lo que se le cotizo al cliente. Si el
 * mismo producto aparece a P1 y a P2, se conservan las dos lineas.
 */
const normalizeQuoteItems = (rawItems: unknown): QuoteLine[] => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("Debe enviar al menos un ítem (items)");
  }

  const totals = new Map<string, QuoteLine>();
  for (const it of rawItems as any[]) {
    const productId = Number(it?.productId);
    const quantity = Number(it?.quantity);
    const unitPrice = Number(it?.unitPrice ?? it?.wholesalePrice ?? 0);
    const tierNum = Number(it?.priceTier);
    const priceTier: number | null = tierNum === 1 || tierNum === 2 ? tierNum : null;

    if (!Number.isInteger(productId) || productId < 1) {
      throw new Error("Cada ítem debe tener un productId válido");
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error(`La cantidad del producto ${productId} debe ser un entero mayor a 0`);
    }
    if (isNaN(unitPrice) || unitPrice <= 0) {
      throw new Error(`El precio unitario del producto ${productId} debe ser mayor a 0`);
    }

    const key = `${productId}|${unitPrice}|${priceTier ?? "L"}`;
    const prev = totals.get(key);
    if (prev) prev.quantity += quantity;
    else totals.set(key, { productId, quantity, unitPrice, priceTier });
  }

  return Array.from(totals.values());
};

// POST — Registrar una cotizacion (no descuenta stock, no es una venta)
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const clientName = parseString(req.body.clientName, "Cliente", { max: 120 });
    const note = parseString(req.body.note, "Nota", { max: 500 });
    const type: SaleType = req.body.type === "DEPARTAMENTAL" ? "DEPARTAMENTAL" : "NORMAL";

    // El precio por linea (P1/P2/libre) lo elige el vendedor en el carrito: la
    // cotizacion guarda esa misma foto para que el documento sea reproducible.
    const validItems = normalizeQuoteItems(req.body.items);

    let locationId: number;
    if (user.role === "TIENDA") {
      locationId = user.locationId!;
      if (req.body.locationId && Number(req.body.locationId) !== locationId) {
        return res.status(403).json({ message: "No puede cotizar productos de otra tienda" });
      }
    } else {
      locationId = req.body.locationId ? Number(req.body.locationId) : user.locationId!;
      if (!locationId) {
        const tienda = await prisma.location.findFirst({ where: { type: "TIENDA" } });
        if (!tienda) return res.status(400).json({ message: "No hay tiendas configuradas en el sistema" });
        locationId = tienda.id;
      }
    }

    const products = await prisma.product.findMany({
      where: { id: { in: validItems.map((i) => i.productId) } },
      select: { id: true, itemCode: true, name: true, brand: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const missing = validItems.filter((i) => !byId.has(i.productId));
    if (missing.length > 0) {
      return res.status(400).json({
        message: `Producto(s) no encontrado(s): ${missing.map((i) => i.productId).join(", ")}`,
      });
    }

    const sellerUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { name: true },
    });

    const items = validItems.map((i) => {
      const p = byId.get(i.productId)!;
      return {
        productId: i.productId,
        itemCode: p.itemCode,
        name: p.name,
        brand: p.brand,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        priceTier: i.priceTier,
        subtotal: i.unitPrice * i.quantity,
      };
    });
    const total = items.reduce((sum, i) => sum + i.subtotal, 0);

    const quote = await prisma.quote.create({
      data: {
        total,
        type,
        clientName,
        note,
        seller: sellerUser?.name ?? null,
        userId: user.userId,
        locationId,
        items: { create: items },
      },
      include: { items: true },
    });

    res.status(201).json({ quote, code: quoteCode(quote.id, quote.date) });
  } catch (error: any) {
    if (error.message && !error.message.includes("Prisma")) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error al registrar cotización:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET — Listar cotizaciones
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const where: any = {};

    if (user.role === "TIENDA") {
      where.locationId = user.locationId!;
    } else if (req.query.locationId) {
      const loc = Number(req.query.locationId);
      if (Number.isInteger(loc) && loc > 0) where.locationId = loc;
    }

    if (req.query.status) {
      const status = String(req.query.status) as QuoteStatus;
      if (!VALID_STATUS.includes(status)) {
        return res.status(400).json({ message: `Estado inválido. Valores válidos: ${VALID_STATUS.join(", ")}` });
      }
      where.status = status;
    }

    if (req.query.from || req.query.to) {
      where.date = {};
      if (req.query.from) {
        const d = new Date(String(req.query.from));
        if (isNaN(d.getTime())) return res.status(400).json({ message: "Fecha inicial inválida" });
        where.date.gte = d;
      }
      if (req.query.to) {
        const d = new Date(String(req.query.to));
        if (isNaN(d.getTime())) return res.status(400).json({ message: "Fecha final inválida" });
        where.date.lte = d;
      }
    } else {
      const from = new Date();
      from.setDate(from.getDate() - DEFAULT_WINDOW_DAYS);
      where.date = { gte: from };
    }

    // "q" acepta el codigo impreso (COT-2026-0007 -> id 7) o texto del cliente.
    const q = parseString(req.query.q, "Búsqueda", { max: 120 });
    if (q) {
      const idFromCode = parseSaleCode(q) ?? 0;
      const text = escapeLike(q);
      where.OR = [
        ...(idFromCode > 0 ? [{ id: idFromCode }] : []),
        { clientName: { contains: text, mode: "insensitive" } },
        { seller: { contains: text, mode: "insensitive" } },
        { note: { contains: text, mode: "insensitive" } },
      ];
    }

    const [total, quotes] = await Promise.all([
      prisma.quote.count({ where }),
      prisma.quote.findMany({
        where,
        orderBy: [{ date: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          location: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
          sale: { select: { id: true, saleDate: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);

    res.json({
      quotes: quotes.map((qt) => ({ ...qt, code: quoteCode(qt.id, qt.date) })),
      pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error("Error al listar cotizaciones:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /:id — Detalle de una cotizacion
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const user = req.user!;
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: {
        items: true,
        location: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        sale: { select: { id: true, saleDate: true } },
      },
    });
    if (!quote) return res.status(404).json({ message: "Cotización no encontrada" });
    if (user.role === "TIENDA" && quote.locationId !== user.locationId) {
      return res.status(403).json({ message: "No tiene acceso a esta cotización" });
    }
    res.json({ quote: { ...quote, code: quoteCode(quote.id, quote.date) } });
  } catch (error: any) {
    if (error.message === "ID inválido") return res.status(400).json({ message: error.message });
    console.error("Error al obtener cotización:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

/**
 * GET /:id/carrito — Lineas de la cotizacion listas para cargar en el carrito
 * de Ventas, para no tener que elegir producto por producto otra vez.
 *
 * Los precios que vuelven son los de hoy, no los cotizados: si el precio cambio
 * entre la cotizacion y la venta, el carrito arranca con el precio actual y el
 * vendedor ve la diferencia antes de cobrar. El stock tambien es el actual, para
 * poder avisar de lineas que ya no se pueden vender en esa tienda.
 */
router.get("/:id/carrito", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const user = req.user!;
    const quote = await prisma.quote.findUnique({ where: { id }, include: { items: true } });
    if (!quote) return res.status(404).json({ message: "Cotización no encontrada" });
    if (user.role === "TIENDA" && quote.locationId !== user.locationId) {
      return res.status(403).json({ message: "No tiene acceso a esta cotización" });
    }

    const ids = Array.from(new Set(quote.items.map((i) => i.productId)));
    const [products, stocks, location] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, itemCode: true, name: true, brand: true, price1: true, price2: true },
      }),
      prisma.inventory.findMany({
        where: { productId: { in: ids }, locationId: quote.locationId },
        select: { productId: true, stock: true },
      }),
      prisma.location.findUnique({ where: { id: quote.locationId }, select: { id: true, name: true } }),
    ]);

    const byId = new Map(products.map((p) => [p.id, p]));
    const stockById = new Map(stocks.map((s) => [s.productId, s.stock]));

    const lines = quote.items.map((i) => {
      const p = byId.get(i.productId);
      if (!p) {
        // El producto se borro despues de cotizarlo: no hay precio ni stock.
        return {
          productId: i.productId,
          itemCode: i.itemCode,
          name: i.name,
          brand: i.brand ?? "",
          quantity: i.quantity,
          priceTier: i.priceTier,
          quotedUnitPrice: Number(i.unitPrice),
          unitPrice: null,
          price1: null,
          price2: null,
          availableStock: 0,
          sinStock: true,
          noDisponible: true,
        };
      }

      const availableStock = stockById.get(p.id) ?? 0;
      const price1 = Number(p.price1);
      const price2 = Number(p.price2);
      // Si el producto hoy solo tiene un precio, se vuelve a P1 aunque se haya
      // cotizado a P2: en el carrito el vendedor puede cambiarlo otra vez.
      const priceTier = i.priceTier === 2 && price2 > 0 ? 2 : 1;

      return {
        productId: p.id,
        itemCode: p.itemCode,
        name: p.name,
        brand: p.brand ?? "",
        quantity: i.quantity,
        priceTier,
        quotedUnitPrice: Number(i.unitPrice),
        unitPrice: priceTier === 2 ? price2 : price1,
        price1,
        price2,
        availableStock,
        sinStock: availableStock < i.quantity,
        noDisponible: false,
      };
    });

    res.json({
      quoteId: quote.id,
      type: quote.type,
      clientName: quote.clientName,
      note: quote.note,
      locationId: quote.locationId,
      locationName: location?.name ?? null,
      lines,
    });
  } catch (error: any) {
    if (error.message === "ID inválido") return res.status(400).json({ message: error.message });
    console.error("Error al preparar el carrito desde la cotización:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// PATCH /:id — Anular una cotizacion (no se borra: es el registro de lo que se ofrecio)
router.patch("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const user = req.user!;
    const quote = await prisma.quote.findUnique({ where: { id } });
    if (!quote) return res.status(404).json({ message: "Cotización no encontrada" });
    if (user.role === "TIENDA" && quote.locationId !== user.locationId) {
      return res.status(403).json({ message: "No tiene acceso a esta cotización" });
    }
    if (quote.status === "CONVERTIDA") {
      return res.status(400).json({ message: "La cotización ya se convirtió en venta y no se puede anular" });
    }

    const status = String(req.body.status) as QuoteStatus;
    if (status !== "ANULADA") {
      return res.status(400).json({ message: "Solo se permite anular la cotización" });
    }

    const updated = await prisma.quote.update({ where: { id }, data: { status } });
    res.json({ quote: { ...updated, code: quoteCode(updated.id, updated.date) } });
  } catch (error: any) {
    if (error.message === "ID inválido") return res.status(400).json({ message: error.message });
    console.error("Error al anular cotización:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;
