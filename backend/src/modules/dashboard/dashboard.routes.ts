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

    // Las dos salen juntas: ninguna depende de la otra.
    const [locations, sellerSales] = await Promise.all([
      prisma.location.findMany({
        select: { id: true, name: true, type: true },
      }),
      // Vendedores con actividad en la ubicación seleccionada (sin filtro de fechas).
      prisma.sale.findMany({
        where: locWhere,
        distinct: ["userId"],
        select: { userId: true },
      }),
    ]);
    const locationById = new Map(locations.map((l) => [l.id, l]));

    const sellerIds = sellerSales.map((s) => s.userId);
    const sellers = sellerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: sellerIds } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [];

    const sellerNameMap = new Map(sellers.map((s) => [s.id, s.name]));

    // Todo lo que sale del rango de fechas se pide de una: antes las últimas
    // ventas se esperaban aparte, al final, y alargaban la respuesta.
    //
    // En vez de traer cada renglón de venta con su producto anidado (una fila
    // por ítem, con la cruzada a Product), la base agrupa: una fila por venta
    // para las unidades y una por producto para el top. Son los mismos números,
    // sumados en la base en vez de en memoria.
    const [sales, unitsBySaleRows, unitsByProductRows, payments, recentSales] = await Promise.all([
      prisma.sale.findMany({
        where,
        select: { id: true, saleDate: true, total: true, userId: true, type: true, locationId: true },
      }),
      prisma.saleItem.groupBy({
        by: ["saleId"],
        where: { sale: where },
        _sum: { quantity: true },
      }),
      prisma.saleItem.groupBy({
        by: ["productId"],
        where: { sale: where },
        _sum: { quantity: true, subtotal: true },
      }),
      prisma.payment.groupBy({
        by: ["method"],
        where: { sale: where },
        _count: true,
        _sum: { amount: true },
      }),
      prisma.sale.findMany({
        where,
        take: 10,
        orderBy: { saleDate: "desc" },
        include: {
          location: { select: { name: true } },
          user: { select: { name: true } },
          customer: { select: { name: true } },
          // Solo el número de renglones: `items: true` traía los ítems
          // enteros para contarlos.
          _count: { select: { items: true } },
        },
      }),
    ]);

    const unitsBySale = new Map<number, number>();
    for (const row of unitsBySaleRows) {
      unitsBySale.set(row.saleId, row._sum.quantity || 0);
    }

    // Totales
    const total = sales.reduce((s, x) => s + Number(x.total), 0);
    const count = sales.length;
    const units = unitsBySaleRows.reduce((s, row) => s + (row._sum.quantity || 0), 0);
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
        name: locationById.get(s.locationId)?.name || "Desconocido",
        type: locationById.get(s.locationId)?.type || null,
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

    // Top productos y marcas: el top se ordena en el rango completo y los
    // datos del producto se piden solo de los 10 que se van a mostrar.
    const topProductRows = unitsByProductRows
      .map((row) => ({
        productId: row.productId,
        quantity: row._sum.quantity || 0,
        total: Number(row._sum.subtotal || 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const topProducts = topProductRows.length
      ? await prisma.product.findMany({
          where: { id: { in: topProductRows.map((p) => p.productId) } },
          select: { id: true, name: true, itemCode: true, brand: true, model: true },
        })
      : [];
    const topProductById = new Map(topProducts.map((p) => [p.id, p]));

    const salesByProduct = topProductRows.map((row) => ({
      productId: row.productId,
      name: topProductById.get(row.productId)?.name || "",
      itemCode: topProductById.get(row.productId)?.itemCode || "",
      brand: topProductById.get(row.productId)?.brand || null,
      model: topProductById.get(row.productId)?.model || null,
      quantity: row.quantity,
      total: row.total,
    }));

    // Formas de pago
    const salesByPayment = payments
      .map((p) => ({ method: p.method, count: p._count, total: Number(p._sum.amount || 0) }))
      .sort((a, b) => b.total - a.total);

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
      recentSales: recentSales.map((sale) => ({
        id: sale.id,
        date: sale.saleDate,
        total: Number(sale.total),
        type: sale.type,
        location: sale.location.name,
        user: sale.user.name,
        customer: sale.customer?.name || "Cliente general",
        itemCount: sale._count.items,
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

    // "Total Productos" tiene que contar lo mismo que los KPIs que lo rodean.
    // Si se filtra por tienda, son los productos que existen en esa tienda, no
    // todo el catalogo: si no, el tablero mezcla una cifra global con el resto
    // de numeros de una sola tienda.
    //
    // Las consultas de abajo no se dependen entre si: van todas juntas. Antes
    // se esperaban de a una y el resumen daba 13 idas y vueltas a la base, que
    // es lo que mas tardaba en pintar el dashboard.
    const [
      totalProducts,
      productsWithoutStock,
      lowStockItems,
      locations,
      stockAgg,
      salesToday,
      salesMonth,
      salesByLocationAgg,
      recentMovements,
      pendingRequests,
      pendingRequestsCount,
    ] = await Promise.all([
      prisma.product.count({
        where: scopeId ? { inventories: { some: invWhere } } : {},
      }),
      // Productos sin unidades disponibles en el alcance actual. Sin alcance
      // (toda la cadena) entran tambien los productos que nunca tuvieron una
      // fila de inventario: no tienen stock, pero antes se salian del
      // contador y "Sin Stock" quedaba por debajo de "Total Productos".
      prisma.product.count({
        where: scopeId
          ? { inventories: { some: invWhere, none: { ...invWhere, stock: { gt: 0 } } } }
          : { NOT: { inventories: { some: { stock: { gt: 0 } } } } },
      }),
      prisma.inventory.findMany({
        where: { stock: { gt: 0 }, minStock: { gt: 0 }, ...locWhere },
        orderBy: { stock: "asc" },
        // Solo los campos que se usan: antes se traia la fila completa de
        // inventario entera para contar y mostrar las primeras 50.
        select: { productId: true, locationId: true, stock: true, minStock: true },
      }),
      prisma.location.findMany({ select: { id: true, name: true, type: true } }),
      prisma.inventory.groupBy({
        by: ["locationId"],
        ...(scopeId ? { where: locWhere } : {}),
        _sum: { stock: true },
      }),
      prisma.sale.aggregate({
        where: { saleDate: { gte: startOfDay }, ...locWhere, ...userWhere },
        _count: true,
        _sum: { total: true },
      }),
      prisma.sale.aggregate({
        where: { saleDate: { gte: startOfMonth }, ...locWhere, ...userWhere },
        _count: true,
        _sum: { total: true },
      }),
      prisma.sale.groupBy({
        by: ["locationId"],
        where: { saleDate: { gte: startOfMonth }, ...locWhere, ...userWhere },
        _count: true,
        _sum: { total: true },
      }),
      prisma.movement.findMany({
        where: movementWhere,
        take: 10,
        orderBy: { date: "desc" },
        include: {
          product: { select: { name: true, itemCode: true } },
          fromLocation: { select: { name: true } },
          toLocation: { select: { name: true } },
          user: { select: { name: true } },
        },
      }),
      prisma.productRequest.findMany({
        where: { status: "PENDIENTE", ...locWhere },
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          product: { select: { name: true, itemCode: true } },
          location: { select: { name: true } },
          requestedBy: { select: { name: true } },
        },
      }),
      // La lista de solicitudes viene cortada en 10 para pintar solo lo
      // reciente, pero el contador tiene que ser el real: si no, el badge
      // miente cuando hay mas de 10 pendientes.
      prisma.productRequest.count({
        where: { status: "PENDIENTE", ...locWhere },
      }),
    ]);

    const criticalStockItems = lowStockItems.filter((item) => item.stock <= item.minStock);
    // "Stock Bajo" cuenta productos, no filas de inventario: el mismo
    // producto bajo en tres tiendas sigue siendo un solo producto que hay
    // que reponer. El badge de la tabla "Stock Critico" si cuenta filas,
    // porque la tabla pinta una fila por producto y ubicacion.
    const productsWithLowStock = new Set(criticalStockItems.map((item) => item.productId)).size;

    // Mapa en vez de .find(): cada lista se recorre una sola vez por fila.
    const locationById = new Map(locations.map((l) => [l.id, l]));

    const stockByLocation = stockAgg.map((agg) => {
      const loc = locationById.get(agg.locationId);
      return {
        locationId: agg.locationId,
        name: loc?.name || "Desconocido",
        type: loc?.type || "TIENDA",
        totalStock: Number(agg._sum.stock || 0),
      };
    });

    const salesByLocation = salesByLocationAgg
      .map((agg) => {
        const loc = locationById.get(agg.locationId);
        return {
          locationId: agg.locationId,
          name: loc?.name || "Desconocido",
          type: loc?.type || "TIENDA",
          count: agg._count,
          total: Number(agg._sum.total || 0),
        };
      })
      .filter((l) => l.type === "TIENDA");

    // El stock critico se pinta en una tabla con scroll. Con varios almacenes y
    // cientos de productos puede haber miles de filas criticas, asi que se
    // resuelven los nombres solo de las primeras y el total va aparte.
    const CRITICAL_STOCK_LIMIT = 50;
    const criticalStockTotal = criticalStockItems.length;
    const criticalStockSample = criticalStockItems.slice(0, CRITICAL_STOCK_LIMIT);
    const [sampleProducts, sampleLocations] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: [...new Set(criticalStockSample.map((i) => i.productId))] } },
        select: { id: true, name: true, itemCode: true },
      }),
      prisma.location.findMany({
        where: { id: { in: [...new Set(criticalStockSample.map((i) => i.locationId))] } },
        select: { id: true, name: true },
      }),
    ]);
    const sampleProductById = new Map(sampleProducts.map((p) => [p.id, p]));
    const sampleLocationName = new Map(sampleLocations.map((l) => [l.id, l.name]));
    const criticalStock = criticalStockSample.map((item) => ({
      product: sampleProductById.get(item.productId)?.name || "",
      itemCode: sampleProductById.get(item.productId)?.itemCode || "",
      location: sampleLocationName.get(item.locationId) || "",
      stock: item.stock,
      minStock: item.minStock,
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
        pendingRequests: pendingRequestsCount,
        criticalStock: criticalStockTotal,
      },
      stockByLocation,
      salesByLocation,
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
      criticalStock,
    });
  } catch (error) {
    console.error("Error en dashboard:", error);
    res.status(500).json({ message: "Error al obtener datos del dashboard" });
  }
});

export default router;
