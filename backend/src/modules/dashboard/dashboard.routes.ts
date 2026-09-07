import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";

const router = Router();
const prisma = new PrismaClient();

const toNum = (v: any) =>
  v !== undefined && v !== null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null;

const MONTH_NAMES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const toMonthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const toMonthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} '${String(y).slice(2)}`;
};
const shiftMonths = (d: Date, n: number) => {
  const c = new Date(d);
  c.setMonth(c.getMonth() + n);
  return c;
};

// Analíticas de ventas con filtros por ubicación (tienda o almacén), vendedor y rango.
router.get("/analytics", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const isTiendaUser = req.user?.role === "TIENDA";
    const userLoc = isTiendaUser ? req.user?.locationId ?? null : null;

    const locationId = toNum(req.query.locationId);
    const locWhere: any = isTiendaUser
      ? { locationId: userLoc }
      : locationId
        ? { locationId }
        : {};

    const userId = toNum(req.query.userId);
    const userWhere: any = userId ? { userId } : {};
    const scope = { ...locWhere, ...userWhere };

    let from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : now;
    if (isNaN(to.getTime())) return res.status(400).json({ message: "'to' inválido" });
    if (from && isNaN(from.getTime())) return res.status(400).json({ message: "'from' inválido" });

    const dateWhere: any = { lte: to };
    if (from) dateWhere.gte = from;
    const where: any = { ...scope, saleDate: dateWhere };

    const locations = await prisma.location.findMany({
      select: { id: true, name: true, type: true },
    });

    // Vendedores con actividad en la ubicación seleccionada (sin filtro de fechas).
    const sellerSales = await prisma.sale.findMany({
      where: locWhere,
      distinct: ["userId"],
      select: { userId: true },
    });
    const sellerIds = sellerSales.map((s) => s.userId);
    const sellers = sellerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: sellerIds } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [];

    const sellerNameMap = new Map(sellers.map((s) => [s.id, s.name]));

    const [sales, items, payments] = await Promise.all([
      prisma.sale.findMany({
        where,
        select: { id: true, saleDate: true, total: true, userId: true, type: true, locationId: true },
      }),
      prisma.saleItem.findMany({
        where: { sale: where },
        select: {
          quantity: true,
          subtotal: true,
          saleId: true,
          product: { select: { id: true, name: true, itemCode: true, brand: true, model: true } },
        },
      }),
      prisma.payment.groupBy({
        by: ["method"],
        where: { sale: where },
        _count: true,
        _sum: { amount: true },
      }),
    ]);

    const unitsBySale = new Map<number, number>();
    for (const it of items) {
      unitsBySale.set(it.saleId, (unitsBySale.get(it.saleId) || 0) + it.quantity);
    }

    // Totales
    const total = sales.reduce((s, x) => s + Number(x.total), 0);
    const count = sales.length;
    const units = items.reduce((s, x) => s + x.quantity, 0);
    const avgTicket = count ? total / count : 0;

    // Ventas por mes (ceros para los meses sin ventas, máximo 24)
    let monthStart = from ? new Date(from) : now;
    if (!from) {
      const earliest = sales.length
        ? new Date(Math.min(...sales.map((s) => s.saleDate.getTime())))
        : now;
      monthStart = new Date(Math.max(earliest.getTime(), shiftMonths(now, -24).getTime()));
    }
    const monthMap = new Map<string, { key: string; label: string; count: number; total: number; units: number }>();
    {
      const key = toMonthKey(monthStart);
      const endKey = toMonthKey(to);
      let cursor = monthStart;
      while (toMonthKey(cursor) <= endKey && monthMap.size < 24) {
        const k = toMonthKey(cursor);
        monthMap.set(k, { key: k, label: toMonthLabel(k), count: 0, total: 0, units: 0 });
        cursor = shiftMonths(cursor, 1);
      }
      if (!monthMap.has(key)) monthMap.set(key, { key, label: toMonthLabel(key), count: 0, total: 0, units: 0 });
    }
    for (const s of sales) {
      const k = toMonthKey(s.saleDate);
      const m = monthMap.get(k) || { key: k, label: toMonthLabel(k), count: 0, total: 0, units: 0 };
      m.count += 1;
      m.total += Number(s.total);
      m.units += unitsBySale.get(s.id) || 0;
      monthMap.set(k, m);
    }
    const salesByMonth = Array.from(monthMap.values()).sort((a, b) => a.key.localeCompare(b.key));

    const bestMonth = [...salesByMonth].sort((a, b) => b.total - a.total)[0] || null;
    const bestMonthShown = bestMonth && bestMonth.count > 0 ? bestMonth : null;

    // Por vendedor / tipo / ubicación
    const sellerMap = new Map<number, { userId: number; name: string; count: number; total: number; units: number }>();
    const typeMap = new Map<string, { type: string; count: number; total: number }>();
    const locMap = new Map<number, { locationId: number; name: string; type: string | null; count: number; total: number }>();
    for (const s of sales) {
      const seller = sellerMap.get(s.userId) || { userId: s.userId, name: sellerNameMap.get(s.userId) || "Desconocido", count: 0, total: 0, units: 0 };
      seller.count += 1;
      seller.total += Number(s.total);
      seller.units += unitsBySale.get(s.id) || 0;
      sellerMap.set(s.userId, seller);

      const t = typeMap.get(s.type) || { type: s.type, count: 0, total: 0 };
      t.count += 1;
      t.total += Number(s.total);
      typeMap.set(s.type, t);

      const lc = locMap.get(s.locationId) || {
        locationId: s.locationId,
        name: locations.find((l) => l.id === s.locationId)?.name || "Desconocido",
        type: locations.find((l) => l.id === s.locationId)?.type || null,
        count: 0,
        total: 0,
      };
      lc.count += 1;
      lc.total += Number(s.total);
      locMap.set(s.locationId, lc);
    }
    const salesBySeller = Array.from(sellerMap.values()).sort((a, b) => b.total - a.total);
    const salesByType = Array.from(typeMap.values()).sort((a, b) => b.total - a.total);
    const salesByLocation = Array.from(locMap.values())
      .filter((l) => l.type === "TIENDA")
      .sort((a, b) => b.total - a.total);

    const bestSeller = salesBySeller.length ? { ...salesBySeller[0] } : null;

    // Top productos y marcas
    const productMap = new Map<
      number,
      { productId: number; name: string; itemCode: string; brand: string; model: string; quantity: number; total: number }
    >();
    const brandMap = new Map<string, { brand: string; quantity: number; total: number }>();
    for (const it of items) {
      const p = productMap.get(it.product.id) || {
        productId: it.product.id,
        name: it.product.name,
        itemCode: it.product.itemCode,
        brand: it.product.brand,
        model: it.product.model,
        quantity: 0,
        total: 0,
      };
      p.quantity += it.quantity;
      p.total += Number(it.subtotal);
      productMap.set(it.product.id, p);

      const b = brandMap.get(it.product.brand) || { brand: it.product.brand, quantity: 0, total: 0 };
      b.quantity += it.quantity;
      b.total += Number(it.subtotal);
      brandMap.set(it.product.brand, b);
    }
    const salesByProduct = Array.from(productMap.values()).sort((a, b) => b.total - a.total).slice(0, 10);
    const salesByBrand = Array.from(brandMap.values()).sort((a, b) => b.total - a.total).slice(0, 10);

    // Formas de pago
    const salesByPayment = payments
      .map((p) => ({ method: p.method, count: p._count, total: Number(p._sum.amount || 0) }))
      .sort((a, b) => b.total - a.total);

    // Últimas ventas
    const recentSales = await prisma.sale.findMany({
      where,
      take: 10,
      orderBy: { saleDate: "desc" },
      include: {
        location: { select: { name: true } },
        user: { select: { name: true } },
        customer: { select: { name: true } },
        items: true,
      },
    });

    res.json({
      sellers,
      kpis: { total, count, units, avgTicket },
      best: {
        month: bestMonthShown,
        seller: bestSeller && bestSeller.total > 0 ? bestSeller : null,
      },
      salesByMonth,
      salesBySeller,
      salesByLocation,
      salesByType,
      salesByPayment,
      salesByProduct,
      salesByBrand,
      recentSales: recentSales.map((sale) => ({
        id: sale.id,
        date: sale.saleDate,
        total: Number(sale.total),
        type: sale.type,
        location: sale.location.name,
        user: sale.user.name,
        customer: sale.customer?.name || "Cliente general",
        itemCount: sale.items.length,
      })),
    });
  } catch (error) {
    console.error("Error en analíticas:", error);
    res.status(500).json({ message: "Error al obtener analíticas" });
  }
});

router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Un usuario TIENDA solo ve los datos de su propia tienda.
    // Un ADMIN/ALMACEN puede filtrar por ?locationId=N para ver el resumen de una tienda.
    const userLoc = req.user?.locationId ?? null;
    const isTienda = req.user?.role === "TIENDA";
    const queryLocationId =
      req.query.locationId && !Number.isNaN(Number(req.query.locationId))
        ? Number(req.query.locationId)
        : null;
    const scopeId = isTienda ? userLoc : queryLocationId;
    const locWhere: any = scopeId ? { locationId: scopeId } : {};
    const invWhere = scopeId ? { locationId: scopeId } : {};
    const movementWhere = scopeId
      ? { OR: [{ fromLocationId: scopeId }, { toLocationId: scopeId }] }
      : {};
    const sellerId = toNum(req.query.userId);
    const userWhere: any = sellerId ? { userId: sellerId } : {};

    const totalProducts = await prisma.product.count();

    const productsWithInventory = await prisma.product.findMany({
      where: scopeId ? { inventories: { some: invWhere } } : { inventories: { some: {} } },
      select: { id: true, inventories: { where: invWhere, select: { stock: true } } },
    });
    const productsWithoutStock = productsWithInventory.filter((p) =>
      p.inventories.every((inv) => inv.stock === 0)
    ).length;

    const lowStockItems = await prisma.inventory.findMany({
      where: { stock: { gt: 0 }, minStock: { gt: 0 }, ...locWhere },
    });
    const criticalStockItems = lowStockItems.filter((item) => item.stock <= item.minStock);
    const productsWithLowStock = criticalStockItems.length;

    const locations = await prisma.location.findMany({ select: { id: true, name: true, type: true } });

    const stockAgg = await prisma.inventory.groupBy({
      by: ["locationId"],
      ...(scopeId ? { where: locWhere } : {}),
      _sum: { stock: true },
    });
    const stockByLocation = stockAgg.map((agg) => {
      const loc = locations.find((l) => l.id === agg.locationId);
      return {
        locationId: agg.locationId,
        name: loc?.name || "Desconocido",
        type: loc?.type || "TIENDA",
        totalStock: Number(agg._sum.stock || 0),
      };
    });

    const salesToday = await prisma.sale.aggregate({
      where: { saleDate: { gte: startOfDay }, ...locWhere, ...userWhere },
      _count: true,
      _sum: { total: true },
    });

    const salesMonth = await prisma.sale.aggregate({
      where: { saleDate: { gte: startOfMonth }, ...locWhere, ...userWhere },
      _count: true,
      _sum: { total: true },
    });

    const salesByLocationAgg = await prisma.sale.groupBy({
      by: ["locationId"],
      where: { saleDate: { gte: startOfMonth }, ...locWhere, ...userWhere },
      _count: true,
      _sum: { total: true },
    });
    const salesByLocation = salesByLocationAgg
      .map((agg) => {
        const loc = locations.find((l) => l.id === agg.locationId);
        return {
          locationId: agg.locationId,
          name: loc?.name || "Desconocido",
          type: loc?.type || "TIENDA",
          count: agg._count,
          total: Number(agg._sum.total || 0),
        };
      })
      .filter((l) => l.type === "TIENDA");

    const saleItems = await prisma.saleItem.findMany({
      where: { sale: { saleDate: { gte: startOfMonth }, ...locWhere, ...userWhere } },
      include: { product: { select: { brand: true, model: true } } },
    });

    const brandMap = new Map<string, { totalQuantity: number; totalAmount: number }>();
    const vehicleMap = new Map<string, { totalQuantity: number; totalAmount: number }>();
    for (const item of saleItems) {
      const brand = item.product.brand;
      const brandExisting = brandMap.get(brand) || { totalQuantity: 0, totalAmount: 0 };
      brandExisting.totalQuantity += item.quantity;
      brandExisting.totalAmount += Number(item.subtotal);
      brandMap.set(brand, brandExisting);

      const model = item.product.model;
      const vehicleExisting = vehicleMap.get(model) || { totalQuantity: 0, totalAmount: 0 };
      vehicleExisting.totalQuantity += item.quantity;
      vehicleExisting.totalAmount += Number(item.subtotal);
      vehicleMap.set(model, vehicleExisting);
    }
    const salesByBrand = Array.from(brandMap.entries())
      .map(([brand, v]) => ({ brand, ...v }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
    const salesByVehicle = Array.from(vehicleMap.entries())
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const recentSales = await prisma.sale.findMany({
      where: { ...locWhere, ...userWhere },
      take: 10,
      orderBy: { saleDate: "desc" },
      include: {
        location: { select: { name: true } },
        user: { select: { name: true } },
        customer: { select: { name: true } },
        items: true,
      },
    });

    const recentMovements = await prisma.movement.findMany({
      where: movementWhere,
      take: 10,
      orderBy: { date: "desc" },
      include: {
        product: { select: { name: true, itemCode: true } },
        fromLocation: { select: { name: true } },
        toLocation: { select: { name: true } },
        user: { select: { name: true } },
      },
    });

    const pendingRequests = await prisma.productRequest.findMany({
      where: { status: "PENDIENTE", ...locWhere },
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { name: true, itemCode: true } },
        location: { select: { name: true } },
        requestedBy: { select: { name: true } },
      },
    });

    const criticalStock = criticalStockItems.map((item) => ({
      product: "",
      itemCode: "",
      locationId: item.locationId,
      location: "",
      stock: item.stock,
      minStock: item.minStock,
      productId: item.productId,
    }));

    const productIds = [...new Set(criticalStock.map((c) => c.productId))];
    const locationIds = [...new Set(criticalStock.map((c) => c.locationId))];
    const [products, locs] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, itemCode: true },
      }),
      prisma.location.findMany({
        where: { id: { in: locationIds } },
        select: { id: true, name: true },
      }),
    ]);
    const criticalStockFormatted = criticalStock.map((c) => ({
      product: products.find((p) => p.id === c.productId)?.name || "",
      itemCode: products.find((p) => p.id === c.productId)?.itemCode || "",
      location: locs.find((l) => l.id === c.locationId)?.name || "",
      stock: c.stock,
      minStock: c.minStock,
    }));

    res.json({
      summary: {
        totalProducts,
        productsWithoutStock,
        productsWithLowStock,
        salesToday: salesToday._count,
        salesTodayTotal: Number(salesToday._sum.total || 0),
        salesMonth: salesMonth._count,
        salesMonthTotal: Number(salesMonth._sum.total || 0),
        pendingRequests: pendingRequests.length,
        criticalStock: criticalStockFormatted.length,
      },
      stockByLocation,
      salesByLocation,
      salesByBrand,
      salesByVehicle,
      recentSales: recentSales.map((sale) => ({
        id: sale.id,
        date: sale.saleDate,
        total: Number(sale.total),
        type: sale.type,
        location: sale.location.name,
        user: sale.user.name,
        customer: sale.customer?.name || "Cliente general",
        itemCount: sale.items.length,
      })),
      recentMovements: recentMovements.map((m) => ({
        id: m.id,
        date: m.date,
        product: m.product.name,
        itemCode: m.product.itemCode,
        from: m.fromLocation.name,
        to: m.toLocation.name,
        quantity: m.quantity,
        user: m.user.name,
      })),
      pendingRequests: pendingRequests.map((r) => ({
        id: r.id,
        product: r.product.name,
        itemCode: r.product.itemCode,
        quantity: r.quantity,
        location: r.location.name,
        requestedBy: r.requestedBy.name,
        date: r.createdAt,
      })),
      criticalStock: criticalStockFormatted,
    });
  } catch (error) {
    console.error("Error en dashboard:", error);
    res.status(500).json({ message: "Error al obtener datos del dashboard" });
  }
});

export default router;
