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
    const { brand, model, month, locationId, supplierId, startDate, endDate, noInvoice, product, page = "1", limit = "50" } = req.query;

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
      filtered = inventories.filter((i) => i.minStock > 0 && i.stock <= i.minStock);
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

export default router;
