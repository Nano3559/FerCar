import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /sales — Ventas filtradas
router.get("/sales", async (req: AuthRequest, res: Response) => {
  try {
    const { brand, model, month, locationId, supplierId, seller, type, startDate, endDate, noInvoice, product, page = "1", limit = "50" } = req.query;

    const where: any = {};

    let effectiveLocationId: number | null = null;
    if (locationId && typeof locationId === "string") effectiveLocationId = Number(locationId);
    if (effectiveLocationId) where.locationId = effectiveLocationId;

    if (req.user?.role === "TIENDA") {
      if (!req.user.locationId) {
        return res.status(403).json({ message: "Usuario TIENDA sin ubicación asignada" });
      }
      where.locationId = req.user.locationId;
    }

    if (noInvoice === "true") where.customerId = null;

    if (startDate || endDate) {
      where.saleDate = {};
      if (startDate && typeof startDate === "string") where.saleDate.gte = new Date(startDate);
      if (endDate && typeof endDate === "string") {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.saleDate.lte = end;
      }
    }

    if (month && typeof month === "string") {
      const [year, mon] = month.split("-").map(Number);
      const start = new Date(year, mon - 1, 1);
      const end = new Date(year, mon, 0, 23, 59, 59, 999);
      where.saleDate = { gte: start, lte: end };
    }

    // Filtros por vendedor y tipo de venta
    if (seller && typeof seller === "string" && seller.trim()) where.seller = { contains: seller.trim(), mode: "insensitive" };
    if (type && typeof type === "string" && ["NORMAL", "MAYOR", "DEPARTAMENTAL"].includes(type)) where.type = type as any;

    // Filtros por marca/modelo/proveedor/producto se aplican a los productos de las ventas
    if (brand || model || (supplierId && supplierId !== "all") || product) {
      const productFilter: any = {};
      if (brand && typeof brand === "string") productFilter.brand = { contains: brand, mode: "insensitive" };
      if (model && typeof model === "string") productFilter.model = { contains: model, mode: "insensitive" };
      if (product && typeof product === "string") productFilter.name = { contains: product, mode: "insensitive" };
      if (supplierId && supplierId !== "all" && typeof supplierId === "string") {
        const sid = Number(supplierId);
        if (!Number.isNaN(sid) && sid >= 1) productFilter.costs = { some: { supplierId: sid } };
      }
      where.items = { some: { product: productFilter } };
    }

    const pg = Math.max(1, Number(page) || 1);
    const take = Math.min(500, Math.max(1, Number(limit) || 50));
    const skip = (pg - 1) * take;

    const [sales, total, summary] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
          items: { include: { product: { select: { id: true, name: true, brand: true, model: true, itemCode: true } } } },
          payments: true,
        },
        orderBy: { saleDate: "desc" },
        skip,
        take,
      }),
      prisma.sale.count({ where }),
      prisma.sale.aggregate({ where, _sum: { total: true }, _count: true }),
    ]);

    res.json({
      sales: sales.map((s) => ({
        id: s.id,
        date: s.saleDate,
        type: s.type,
        total: Number(s.total),
        location: s.location,
        customer: s.customer,
        user: s.user,
        seller: s.seller,
        itemCount: s.items.length,
        payments: s.payments.map((p) => ({ method: p.method, amount: Number(p.amount) })),
      })),
      summary: {
        totalSales: Number(summary._sum.total) || 0,
        count: summary._count,
        average: summary._count > 0 ? Number((Number(summary._sum.total) / summary._count).toFixed(2)) : 0,
      },
      pagination: { total, page: pg, limit: take, pages: Math.ceil(total / take) },
    });
  } catch (error) {
    console.error("Error en reporte de ventas:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /inventory — Stock por ubicación
router.get("/inventory", async (req: AuthRequest, res: Response) => {
  try {
    const { brand, model, locationId, lowStock } = req.query;

    const where: any = {};
    if (locationId && typeof locationId === "string") where.locationId = Number(locationId);

    if (req.user?.role === "TIENDA") {
      if (!req.user.locationId) {
        return res.status(403).json({ message: "Usuario TIENDA sin ubicación asignada" });
      }
      where.locationId = req.user.locationId;
    }

    if (brand && typeof brand === "string") {
      where.product = { ...where.product, brand: { contains: brand, mode: "insensitive" } };
    }
    if (model && typeof model === "string") {
      where.product = { ...where.product, model: { contains: model, mode: "insensitive" } };
    }

    const inventories = await prisma.inventory.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, itemCode: true, brand: true, model: true, manufacturer: true } },
        location: { select: { id: true, name: true, type: true } },
      },
      orderBy: { product: { name: "asc" } },
    });

    let filtered = inventories;
    if (lowStock === "true") {
      // Cercanos a 0: agotados o en/bajo el mínimo, ordenados por stock ascendente
      filtered = inventories
        .filter((i) => i.stock === 0 || (i.minStock > 0 && i.stock <= i.minStock))
        .sort((a, b) => a.stock - b.stock);
    }

    const byLocation = filtered.reduce((acc: any, inv) => {
      const locName = inv.location.name;
      if (!acc[locName]) acc[locName] = { location: inv.location, items: [], totalStock: 0 };
      acc[locName].items.push({
        ...inv,
        product: inv.product,
        stock: inv.stock,
        minStock: inv.minStock,
        status: inv.stock === 0 ? "AGOTADO" : inv.stock <= inv.minStock ? "BAJO" : "OK",
      });
      acc[locName].totalStock += inv.stock;
      return acc;
    }, {});

    res.json({
      locations: Object.values(byLocation),
      totalProducts: filtered.length,
      totalStock: filtered.reduce((sum, i) => sum + i.stock, 0),
      lowStockCount: filtered.filter((i) => i.minStock > 0 && i.stock <= i.minStock).length,
    });
  } catch (error) {
    console.error("Error en reporte de inventario:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /suppliers — Reporte por proveedor (solo ADMIN/INVENTARIO)
router.get("/suppliers", async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role === "TIENDA") {
      return res.status(403).json({ message: "Reporte de proveedores no disponible para TIENDA" });
    }
    const suppliers = await prisma.supplier.findMany({
      include: {
        costs: {
          include: {
            product: { select: { id: true, name: true, itemCode: true, brand: true } },
          },
          orderBy: { date: "desc" },
        },
      },
      orderBy: { name: "asc" },
    });

    const report = suppliers.map((s) => {
      const totalCost = s.costs.reduce((sum, c) => sum + Number(c.costPrice), 0);
      const productsCount = new Set(s.costs.map((c) => c.productId)).size;
      const lastPurchase = s.costs[0]?.date || null;

      return {
        id: s.id,
        name: s.name,
        nit: s.nit,
        phone: s.phone,
        totalPurchases: totalCost,
        productsCount,
        lastPurchase,
        recentCosts: s.costs.slice(0, 10).map((c) => ({
          id: c.id,
          product: c.product,
          costPrice: Number(c.costPrice),
          exchangeRate: c.exchangeRate ? Number(c.exchangeRate) : null,
          date: c.date,
        })),
      };
    });

    res.json({
      suppliers: report,
      summary: {
        totalSuppliers: report.length,
        totalPurchases: report.reduce((sum, s) => sum + s.totalPurchases, 0),
      },
    });
  } catch (error) {
    console.error("Error en reporte de proveedores:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /monthly — Reporte mensual por tienda con costos
router.get("/monthly", async (req: AuthRequest, res: Response) => {
  try {
    const { year, month } = req.query;

    const targetYear = year ? Number(year) : new Date().getFullYear();
    const targetMonth = month ? Number(month) : new Date().getMonth() + 1;

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

    // TIENDA solo ve su propia tienda; resto ven todas
    const locationScope = req.user?.role === "TIENDA" && req.user?.locationId ? req.user.locationId : null;
    if (req.user?.role === "TIENDA" && !req.user.locationId) {
      return res.status(403).json({ message: "Usuario TIENDA sin ubicación asignada" });
    }

    const saleWhere: any = { saleDate: { gte: startDate, lte: endDate } };
    if (locationScope) saleWhere.locationId = locationScope;

    const returnWhere: any = { date: { gte: startDate, lte: endDate } };
    if (locationScope) returnWhere.sale = { locationId: locationScope };

    const [sales, returns, locations, costs] = await Promise.all([
      prisma.sale.findMany({
        where: saleWhere,
        include: {
          location: { select: { id: true, name: true } },
          items: { include: { product: { select: { id: true, name: true, brand: true } } } },
        },
      }),
      prisma.return.findMany({
        where: returnWhere,
        include: { sale: { select: { locationId: true, location: { select: { name: true } } } } },
      }),
      prisma.location.findMany({ select: { id: true, name: true, type: true }, ...(locationScope ? { where: { id: locationScope } } : {}) }),
      prisma.cost.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        orderBy: { date: "desc" },
        select: { productId: true, costPrice: true },
      }),
    ]);

    // Costo más reciente por producto dentro del mes
    const costMap = new Map<number, number>();
    for (const c of costs) {
      if (!costMap.has(c.productId)) costMap.set(c.productId, Number(c.costPrice));
    }

    const byLocation: any[] = locations.map((loc) => {
      const locSales = sales.filter((s) => s.locationId === loc.id);
      const locReturns = returns.filter((r) => r.sale.locationId === loc.id);
      const totalSales = locSales.reduce((sum, s) => sum + Number(s.total), 0);
      const totalReturns = locReturns.reduce((sum, r) => sum + Number(r.amount), 0);
      const saleCount = locSales.length;

      const productSales: any = {};
      for (const sale of locSales) {
        for (const item of sale.items) {
          const key = item.productId;
          if (!productSales[key]) {
            productSales[key] = { product: item.product, quantity: 0, total: 0 };
          }
          productSales[key].quantity += item.quantity;
          productSales[key].total += Number(item.subtotal);
        }
      }

      // G7: costo tienda = costo de la mercadería vendida + 10%
      let productsCost = 0;
      for (const key of Object.keys(productSales)) {
        const pid = Number(key);
        const baseCost = costMap.get(pid) ?? 0;
        productsCost += baseCost * productSales[key].quantity;
      }
      const storeCost = Number((productsCost * 1.1).toFixed(2));

      return {
        location: loc,
        summary: {
          totalSales,
          totalReturns,
          netSales: totalSales - totalReturns,
          saleCount,
          averagePerSale: saleCount > 0 ? Number((totalSales / saleCount).toFixed(2)) : 0,
        },
        costs: {
          productsCost: Number(productsCost.toFixed(2)),
          storeCost,
        },
        topProducts: Object.values(productSales)
          .sort((a: any, b: any) => b.total - a.total)
          .slice(0, 10)
          .map((p: any) => ({
            product: p.product,
            quantitySold: p.quantity,
            totalRevenue: p.total,
          })),
      };
    });

    const totalGeneral = byLocation.reduce((sum, l) => sum + l.summary.totalSales, 0);
    const returnsGeneral = byLocation.reduce((sum, l) => sum + l.summary.totalReturns, 0);
    const totalProductsCost = byLocation.reduce((sum, l) => sum + l.costs.productsCost, 0);
    const totalStoreCost = byLocation.reduce((sum, l) => sum + l.costs.storeCost, 0);

    res.json({
      period: { year: targetYear, month: targetMonth, startDate, endDate },
      locations: byLocation,
      summary: {
        totalSales: totalGeneral,
        totalReturns: returnsGeneral,
        netSales: totalGeneral - returnsGeneral,
        totalLocations: locations.length,
        activeLocations: byLocation.filter((l) => l.summary.saleCount > 0).length,
        costs: {
          totalProductsCost: Number(totalProductsCost.toFixed(2)),
          totalStoreCost: Number(totalStoreCost.toFixed(2)),
        },
      },
    });
  } catch (error) {
    console.error("Error en reporte mensual:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /stores — Ventas y costo de tienda por período (día/semana/mes/personalizado), tienda y vendedor.
// El costo de tienda se calcula POR CADA VENTA: costo del producto (último costo <= fecha de venta) × cantidad × 1.10.
router.get("/stores", async (req: AuthRequest, res: Response) => {
  try {
    const { period = "day", startDate, endDate, locationId, seller, type } = req.query;

    const user = req.user!;
    const DAY_MS = 24 * 60 * 60 * 1000;

    let effectiveLocationId: number | null = locationId && typeof locationId === "string" ? Number(locationId) : null;
    if (user.role === "TIENDA") {
      if (!user.locationId) {
        return res.status(403).json({ message: "Usuario TIENDA sin ubicación asignada" });
      }
      effectiveLocationId = user.locationId;
    }

    let start: Date;
    let end: Date;
    if (startDate && typeof startDate === "string" && endDate && typeof endDate === "string") {
      start = new Date(startDate);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else if (startDate && typeof startDate === "string") {
      start = new Date(startDate);
      end = new Date();
    } else {
      // Por defecto últimos 30 días
      start = new Date(Date.now() - 30 * DAY_MS);
      end = new Date();
    }

    const saleWhere: any = { saleDate: { gte: start, lte: end } };
    if (effectiveLocationId) saleWhere.locationId = effectiveLocationId;
    if (seller && typeof seller === "string" && seller.trim()) saleWhere.seller = { contains: seller.trim(), mode: "insensitive" };
    if (type && typeof type === "string" && ["NORMAL", "MAYOR", "DEPARTAMENTAL"].includes(type)) saleWhere.type = type as any;

    const [sales, costs] = await Promise.all([
      prisma.sale.findMany({
        where: saleWhere,
        include: {
          location: { select: { id: true, name: true } },
          returns: { select: { amount: true } },
          items: { include: { product: { select: { id: true, cost: true } } } },
        },
      }),
      prisma.cost.findMany({
        select: { productId: true, costPrice: true, date: true },
        orderBy: { date: "desc" },
      }),
    ]);

    // Último costo por producto según fecha
    const costsByProduct = new Map<number, { date: Date; cost: number }[]>();
    for (const c of costs) {
      if (!costsByProduct.has(c.productId)) costsByProduct.set(c.productId, []);
      costsByProduct.get(c.productId)!.push({ date: c.date, cost: Number(c.costPrice) });
    }
    for (const arr of costsByProduct.values()) arr.sort((a, b) => b.date.getTime() - a.date.getTime());

    const unitCostAt = (productId: number, saleDate: Date): number => {
      const arr = costsByProduct.get(productId);
      if (arr) {
        for (const c of arr) {
          if (c.date.getTime() <= saleDate.getTime()) return c.cost;
        }
      }
      return 0;
    };

    const mondayOf = (d: Date) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      const dow = (x.getDay() + 6) % 7;
      x.setDate(x.getDate() - dow);
      return x;
    };

    const stamp = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const periodKeyOf = (d: Date): string => {
      if (period === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (period === "week") return stamp(mondayOf(d));
      if (period === "all") return "custom";
      return stamp(d);
    };

    const periodLabelOf = (key: string): string => {
      if (period === "all") return "Personalizado";
      if (period === "month") {
        const [y, m] = key.split("-").map(Number);
        return new Date(y, m - 1, 1).toLocaleDateString("es-BO", { month: "long", year: "numeric" });
      }
      if (period === "week") {
        const d = new Date(key + "T00:00:00");
        const sunday = new Date(d);
        sunday.setDate(sunday.getDate() + 6);
        return `Semana del ${d.toLocaleDateString("es-BO", { day: "2-digit", month: "short" })} al ${sunday.toLocaleDateString("es-BO", { day: "2-digit", month: "short", year: "numeric" })}`;
      }
      return new Date(key + "T00:00:00").toLocaleDateString("es-BO", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
    };

    const GROUPS = new Map<string, any>();

    const STORE_COST_RATE = 1.10;

    for (const sale of sales) {
      const sd = new Date(sale.saleDate);
      const pKey = periodKeyOf(sd);
      const sellerName = sale.seller || "Sin vendedor";
      const gkey = `${pKey}|${sale.locationId}|${sellerName}`;

      if (!GROUPS.has(gkey)) {
        GROUPS.set(gkey, {
          periodKey: pKey,
          periodLabel: periodLabelOf(pKey),
          location: sale.location,
          seller: sale.seller,
          saleCount: 0,
          totalSales: 0,
          returns: 0,
          productsCost: 0,
          storeCost: 0,
          items: 0,
        });
      }
      const g = GROUPS.get(gkey);
      g.saleCount += 1;
      g.totalSales += Number(sale.total) || 0;
      g.returns += (sale.returns || []).reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);

      let saleProductsCost = 0;
      for (const item of sale.items) {
        const unitCost = unitCostAt(item.productId, sd) || Number(item.product?.cost || 0);
        saleProductsCost += unitCost * item.quantity;
        g.items += item.quantity;
      }
      g.productsCost += saleProductsCost;
      g.storeCost += Number((saleProductsCost * STORE_COST_RATE).toFixed(2));
    }

    const groups = Array.from(GROUPS.values())
      .sort((a, b) => (a.periodKey < b.periodKey ? -1 : a.periodKey > b.periodKey ? 1 : a.location.name.localeCompare(b.location.name)))
      .map((g) => ({
        ...g,
        totalSales: Number(g.totalSales.toFixed(2)),
        returns: Number(g.returns.toFixed(2)),
        netSales: Number((g.totalSales - g.returns).toFixed(2)),
        productsCost: Number(g.productsCost.toFixed(2)),
        storeCost: Number(g.storeCost.toFixed(2)),
        utility: Number((g.totalSales - g.returns - g.storeCost).toFixed(2)),
        averagePerSale: g.saleCount > 0 ? Number((g.totalSales / g.saleCount).toFixed(2)) : 0,
      }));

    const summary = {
      totalSales: Number(groups.reduce((s, g) => s + g.totalSales, 0).toFixed(2)),
      totalReturns: Number(groups.reduce((s, g) => s + g.returns, 0).toFixed(2)),
      netSales: Number(groups.reduce((s, g) => s + g.netSales, 0).toFixed(2)),
      totalProductsCost: Number(groups.reduce((s, g) => s + g.productsCost, 0).toFixed(2)),
      totalStoreCost: Number(groups.reduce((s, g) => s + g.storeCost, 0).toFixed(2)),
      utility: Number(groups.reduce((s, g) => s + g.utility, 0).toFixed(2)),
      saleCount: groups.reduce((s, g) => s + g.saleCount, 0),
      items: groups.reduce((s, g) => s + g.items, 0),
      period,
      range: { start, end },
    };

    res.json({ period, groups, summary });
  } catch (error) {
    console.error("Error en reporte por período:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;
