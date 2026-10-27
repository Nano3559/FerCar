import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /sales — Ventas filtradas (detalle por producto)
router.get("/sales", async (req: AuthRequest, res: Response) => {
  try {
    const { brand, model, month, locationId, supplierId, seller, type, startDate, endDate, noInvoice, product } = req.query;

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

    const sales = await prisma.sale.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
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
                priceHermana: true,
              },
            },
          },
        },
        payments: true,
      },
      orderBy: [{ saleDate: "desc" }, { id: "desc" }],
    });

    const details: any[] = [];
    let totalSales = 0;
    let totalQuantity = 0;
    let totalStoreCost = 0;

    for (const s of sales) {
      for (const item of s.items) {
        const qty = Number(item.quantity) || 0;
        const unitPrice = Number(item.unitPrice) || 0;
        const storeCostUnit = Number(item.product?.priceHermana || 0);
        const lineTotal = qty * unitPrice;
        const lineStoreCost = qty * storeCostUnit;
        totalSales += lineTotal;
        totalQuantity += qty;
        totalStoreCost += lineStoreCost;
        details.push({
          saleId: s.id,
          date: s.saleDate,
          type: s.type,
          location: s.location?.name || null,
          seller: s.seller || s.user?.name || null,
          factoryCode: item.product?.factoryCode || item.product?.itemCode || null,
          productName: item.product?.name || null,
          brand: item.product?.brand || null,
          model: item.product?.model || null,
          quantity: qty,
          unitPrice,
          storeCostUnit,
          lineTotal,
          lineStoreCost,
        });
      }
    }

    res.json({
      details,
      summary: {
        totalSales: Number(totalSales.toFixed(2)),
        totalQuantity,
        totalStoreCost: Number(totalStoreCost.toFixed(2)),
        count: details.length,
      },
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
      select: {
        id: true,
        stock: true,
        minStock: true,
        productId: true,
        locationId: true,
        product: {
          select: {
            id: true,
            name: true,
            itemCode: true,
            factoryCode: true,
            oemCode: true,
            brand: true,
            model: true,
            year: true,
            detail: true,
            detalles: true,
            manufacturer: true,
            cost: true,
            unitPrice: true,
            priceHermana: true,
            price1: true,
            price2: true,
            wholesalePrice: true,
          },
        },
        location: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    const sortedInventories = inventories.sort((a, b) => {
      const nameA = a.product?.name || "";
      const nameB = b.product?.name || "";
      return nameA.localeCompare(nameB);
    });

    let filtered = sortedInventories;
    if (lowStock === "true") {
      // Cercanos a 0: agotados o en/bajo el mínimo, ordenados por stock ascendente
      filtered = sortedInventories
        .filter((i) => i.stock === 0 || (i.minStock > 0 && i.stock <= i.minStock))
        .sort((a, b) => a.stock - b.stock);
    }

    const byLocation = filtered.reduce((acc: any, inv) => {
      const locName = inv.location.name;
      if (!acc[locName]) acc[locName] = { location: inv.location, items: [], totalStock: 0 };
      acc[locName].items.push({
        id: inv.id,
        stock: inv.stock,
        minStock: inv.minStock,
        product: inv.product,
        location: inv.location,
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
// El costo de tienda se toma directamente del campo priceHermana de cada producto (Costo Tienda).
router.get("/stores", async (req: AuthRequest, res: Response) => {
  try {
    const { period = "day", startDate, endDate, locationId, seller, type, groupBy = "both" } = req.query;

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

    const sales = await prisma.sale.findMany({
      where: saleWhere,
      include: {
        location: { select: { id: true, name: true } },
        returns: { select: { amount: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                brand: true,
                model: true,
                factoryCode: true,
                itemCode: true,
                priceHermana: true,
              },
            },
          },
        },
      },
      orderBy: [{ saleDate: "asc" }, { id: "asc" }],
    });

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

    for (const sale of sales) {
      const sd = new Date(sale.saleDate);
      const pKey = periodKeyOf(sd);
      const sellerName = sale.seller || "Sin vendedor";
      const locId = sale.locationId;

      let gkey = "";
      if (groupBy === "location") {
        gkey = `${pKey}|LOC:${locId}`;
      } else if (groupBy === "seller") {
        gkey = `${pKey}|SELL:${sellerName.toLowerCase()}`;
      } else {
        gkey = `${pKey}|${locId}|${sellerName.toLowerCase()}`;
      }

      if (!GROUPS.has(gkey)) {
        GROUPS.set(gkey, {
          periodKey: pKey,
          periodLabel: periodLabelOf(pKey),
          location: groupBy === "seller" ? null : sale.location,
          seller: groupBy === "location" ? null : sellerName,
          saleCount: 0,
          totalSales: 0,
          returns: 0,
          storeCost: 0,
          itemsQty: 0,
          details: [],
        });
      }
      const g = GROUPS.get(gkey);
      g.saleCount += 1;
      g.totalSales += Number(sale.total) || 0;
      g.returns += (sale.returns || []).reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);

      for (const item of sale.items) {
        const qty = Number(item.quantity) || 0;
        const storeCostUnit = Number(item.product?.priceHermana || 0);
        const storeCostLine = qty * storeCostUnit;
        g.storeCost += storeCostLine;
        g.itemsQty += qty;
        g.details.push({
          saleId: sale.id,
          saleDate: sale.saleDate,
          location: sale.location?.name || "Sin tienda",
          seller: sale.seller || "Sin vendedor",
          factoryCode: item.product?.factoryCode || item.product?.itemCode || null,
          productId: item.product?.id,
          productName: item.product?.name,
          brand: item.product?.brand,
          model: item.product?.model,
          quantity: qty,
          storeCostUnit,
          storeCostLine,
          unitPrice: Number(item.unitPrice) || 0,
          lineTotal: Number(item.subtotal) || qty * Number(item.unitPrice) || 0,
        });
      }
    }

    const groups = Array.from(GROUPS.values())
      .sort((a, b) => {
        if (a.periodKey !== b.periodKey) return a.periodKey < b.periodKey ? -1 : 1;
        const al = a.location?.name || "";
        const bl = b.location?.name || "";
        if (al !== bl) return al.localeCompare(bl);
        return (a.seller || "").localeCompare(b.seller || "");
      })
      .map((g) => ({
        ...g,
        totalSales: Number(g.totalSales.toFixed(2)),
        returns: Number(g.returns.toFixed(2)),
        netSales: Number((g.totalSales - g.returns).toFixed(2)),
        storeCost: Number(g.storeCost.toFixed(2)),
        utility: Number((g.totalSales - g.returns - g.storeCost).toFixed(2)),
        averagePerSale: g.saleCount > 0 ? Number((g.totalSales / g.saleCount).toFixed(2)) : 0,
      }));

    const summary = {
      totalSales: Number(groups.reduce((s, g) => s + g.totalSales, 0).toFixed(2)),
      totalReturns: Number(groups.reduce((s, g) => s + g.returns, 0).toFixed(2)),
      netSales: Number(groups.reduce((s, g) => s + g.netSales, 0).toFixed(2)),
      storeCost: Number(groups.reduce((s, g) => s + g.storeCost, 0).toFixed(2)),
      utility: Number(groups.reduce((s, g) => s + g.utility, 0).toFixed(2)),
      saleCount: groups.reduce((s, g) => s + g.saleCount, 0),
      itemsQty: groups.reduce((s, g) => s + g.itemsQty, 0),
      period,
      groupBy,
      range: { start, end },
    };

    const allDetails = groups.flatMap((g) => g.details).sort((a, b) => {
      const da = new Date(a.saleDate).getTime();
      const db = new Date(b.saleDate).getTime();
      if (da !== db) return da - db;
      return (a.saleId || 0) - (b.saleId || 0);
    });

    res.json({ period, groupBy, groups, summary, details: allDetails });
  } catch (error) {
    console.error("Error en reporte por período/costo tiendas:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;
