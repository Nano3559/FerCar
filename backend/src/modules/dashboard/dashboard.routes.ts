import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";

const router = Router();
const prisma = new PrismaClient();

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
      where: { saleDate: { gte: startOfDay }, ...locWhere },
      _count: true,
      _sum: { total: true },
    });

    const salesMonth = await prisma.sale.aggregate({
      where: { saleDate: { gte: startOfMonth }, ...locWhere },
      _count: true,
      _sum: { total: true },
    });

    const salesByLocationAgg = await prisma.sale.groupBy({
      by: ["locationId"],
      where: { saleDate: { gte: startOfMonth }, ...locWhere },
      _count: true,
      _sum: { total: true },
    });
    const salesByLocation = salesByLocationAgg.map((agg) => {
      const loc = locations.find((l) => l.id === agg.locationId);
      return {
        locationId: agg.locationId,
        name: loc?.name || "Desconocido",
        count: agg._count,
        total: Number(agg._sum.total || 0),
      };
    });

    const saleItems = await prisma.saleItem.findMany({
      where: { sale: { saleDate: { gte: startOfMonth }, ...locWhere } },
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
      where: locWhere,
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
