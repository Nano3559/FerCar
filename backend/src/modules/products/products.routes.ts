import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import multer from "multer";
import * as XLSX from "xlsx";
import { createWorker } from "tesseract.js";
import path from "path";
import { yearRangesOverlap } from "../../utils/yearRanges";
import { authenticate, authorize, optionalAuth } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";

// Escalera de precios calculada sobre el costo (columnas 20% a 80% del Excel DEPO).
const PRICE_STEPS = [20, 30, 40, 50, 60, 70, 80] as const;
const priceLadder = (cost: number | null | undefined): Record<string, number | null> => {
  const ladder: Record<string, number | null> = {};
  PRICE_STEPS.forEach((step) => {
    ladder[`price${step}`] = cost != null ? Math.round(cost * (1 + step / 100) * 100) / 100 : null;
  });
  return ladder;
};

// Mantiene el registro de fabricantes sincronizado con los productos.
const IGNORED_MANUFACTURER_NAMES = ["sin especificar", ""];
const syncManufacturer = async (name?: string | null): Promise<void> => {
  const trimmed = (name || "").trim();
  if (IGNORED_MANUFACTURER_NAMES.includes(trimmed.toLowerCase())) return;
  const key = trimmed.toUpperCase();
  const exists = await prisma.manufacturer.findFirst({
    where: { name: { equals: key, mode: "insensitive" } },
  });
  if (!exists) {
    await prisma.manufacturer.create({ data: { name: trimmed } }).catch(() => { /* carrera: ya existe */ });
  }
};

const router = Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const round2 = (v: number) => Math.round(v * 100) / 100;

// Datos de idioma locales para OCR (evita descargas en cada request)
const OCR_LANG_PATH = path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0");

const IMAGE_STOPWORDS = new Set(["img", "imagen", "image", "photo", "foto", "producto", "product", "part", "ref", "cod", "code", "dsc", "dscn", "captura", "nuevo", "venta", "jpeg", "jpg", "png", "webp", "2024", "2023", "2022", "the", "and", "for", "con", "numero", "number", "original", "oem", "referencia", "repuesto", "accesorio", "universal", "calidad", "estandar"]);

// GET / — Listar productos con filtros, búsqueda y paginación
router.get("/", optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const {
      search, name, itemCode, detail, brand, manufacturer, model, year, oemCode, factoryCode,
      categoryId, locationId: queryLocationId, page = "1", limit = "20",
    } = req.query;

    const where: any = {};
    const AND: any[] = [];

    if (search && typeof search === "string") {
      AND.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { itemCode: { contains: search, mode: "insensitive" } },
          { oemCode: { contains: search, mode: "insensitive" } },
          { factoryCode: { contains: search, mode: "insensitive" } },
          { manufacturer: { contains: search, mode: "insensitive" } },
          { brand: { contains: search, mode: "insensitive" } },
          { model: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    if (brand && typeof brand === "string") AND.push({ brand: { contains: brand, mode: "insensitive" } });
    if (manufacturer && typeof manufacturer === "string") AND.push({ manufacturer: { contains: manufacturer, mode: "insensitive" } });
    if (model && typeof model === "string") AND.push({ model: { contains: model, mode: "insensitive" } });
    if (oemCode && typeof oemCode === "string") AND.push({ oemCode: { contains: oemCode, mode: "insensitive" } });
    if (factoryCode && typeof factoryCode === "string") AND.push({ factoryCode: { contains: factoryCode, mode: "insensitive" } });
    if (categoryId && typeof categoryId === "string") AND.push({ categoryId: Number(categoryId) });

    // Filtro de categorías permitidas por rol (TIENDA) directamente en backend para
    // no depender solo de la UI. Se incluyen productos sin categoría (coherente con el frontend).
    if (req.user?.role === "TIENDA" && !req.query.categoryId) {
      const roleUser = await prisma.user.findUnique({
        where: { id: req.user.userId },
        include: { role: true },
      });
      const cats: string[] = ((roleUser?.role?.columnConfig as any)?.__categorias ?? []) as string[];
      if (cats.length > 0) {
        AND.push({
          OR: [{ category: { name: { in: cats } } }, { categoryId: null }],
        });
      }
    }

    if (name && typeof name === "string") AND.push({ name: { contains: name, mode: "insensitive" } });
    if (itemCode && typeof itemCode === "string") AND.push({ itemCode: { contains: itemCode, mode: "insensitive" } });
    if (detail && typeof detail === "string") {
      AND.push({
        OR: [
          { detail: { contains: detail, mode: "insensitive" } },
          { detalles: { contains: detail, mode: "insensitive" } },
        ],
      });
    }

    if (queryLocationId && typeof queryLocationId === "string") {
      AND.push({ inventories: { some: { locationId: Number(queryLocationId), stock: { gt: 0 } } } });
    }

    if (AND.length > 0) where.AND = AND;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const hasYearFilter = year && typeof year === "string";
    const filterLocationId = queryLocationId && typeof queryLocationId === "string" ? Number(queryLocationId) : null;

    let allProducts = await prisma.product.findMany({
      where,
      include: {
        category: true,
        inventories: { include: { location: true } },
        costs: {
          take: 1,
          orderBy: { date: "desc" },
          include: { supplier: { select: { name: true } } },
        },
      },
      orderBy: { name: "asc" },
    });

    if (hasYearFilter) {
      allProducts = allProducts.filter((p) => yearRangesOverlap(year as string, p.year));
    }

    const total = allProducts.length;
    const products = allProducts.slice(skip, skip + take);

    const isAuth = !!req.user;

    const result = products.map((p) => {
      const stock = filterLocationId
        ? (p.inventories.find((inv) => inv.locationId === filterLocationId)?.stock || 0)
        : p.inventories.reduce((sum, inv) => sum + inv.stock, 0);
      const item: any = {
        id: p.id,
        itemCode: p.itemCode,
        manufacturer: p.manufacturer,
        name: p.name,
        brand: p.brand,
        model: p.model,
        year: p.year,
        detail: p.detail,
        detalles: p.detalles,
        image: p.image,
        images: p.images,
        oemCode: p.oemCode,
        factoryCode: p.factoryCode,
        categoryId: p.categoryId,
        category: p.category?.name || null,
        stock,
      };
      if (isAuth) {
        item.price1 = p.price1;
        item.price2 = p.price2;
        item.wholesalePrice = p.wholesalePrice;
        item.cost = p.cost;
        item.unitPrice = p.unitPrice;
        item.priceHermana = p.priceHermana;
        Object.assign(item, priceLadder(Number(p.cost) || null));
        item.supplierName = p.costs[0]?.supplier?.name || null;
      }
      return item;
    });

    res.json({
      products: result,
      pagination: { total, page: Number(page), limit: take, pages: Math.ceil(total / take) },
    });
  } catch (error) {
    console.error("Error al listar productos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /filters — Marcas, fabricantes, modelos, años, categorías y otros detalles disponibles
router.get("/filters", optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    let allowedCats: string[] = [];
    if (req.user?.role === "TIENDA") {
      const roleUser = await prisma.user.findUnique({
        where: { id: req.user?.userId },
        include: { role: true },
      });
      allowedCats = ((roleUser?.role?.columnConfig as any)?.__categorias ?? []) as string[];
    }
    const hasCatScope = allowedCats.length > 0;
    const scopeWhere = hasCatScope
      ? { OR: [{ category: { name: { in: allowedCats } } }, { categoryId: null }] }
      : {};

    const [brandsRaw, manufacturersRaw, modelsRaw, yearsRaw, categories, namesRaw, itemCodesRaw, oemRaw, factoryRaw, detallesRaw] =
      await Promise.all([
        prisma.product.findMany({ where: scopeWhere, select: { brand: true }, orderBy: { brand: "asc" } }),
        prisma.product.findMany({ where: scopeWhere, select: { manufacturer: true }, orderBy: { manufacturer: "asc" } }),
        prisma.product.findMany({ where: scopeWhere, select: { model: true }, orderBy: { model: "asc" } }),
        prisma.product.findMany({ where: scopeWhere, select: { year: true }, orderBy: { year: "asc" } }),
        prisma.category.findMany({
          ...(hasCatScope ? { where: { name: { in: allowedCats } } } : {}),
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        prisma.product.findMany({ where: scopeWhere, select: { name: true }, orderBy: { name: "asc" } }),
        prisma.product.findMany({ where: scopeWhere, select: { itemCode: true }, orderBy: { itemCode: "asc" } }),
        prisma.product.findMany({ where: scopeWhere, select: { oemCode: true }, orderBy: { oemCode: "asc" } }),
        prisma.product.findMany({ where: scopeWhere, select: { factoryCode: true }, orderBy: { factoryCode: "asc" } }),
        prisma.product.findMany({ where: scopeWhere, select: { detail: true, detalles: true }, orderBy: { detail: "asc" } }),
      ]);

    const brands = [...new Set(brandsRaw.flatMap((b) => b.brand.split("/").map((v) => v.trim())).filter(Boolean))].sort();
    const manufacturers = [...new Set(manufacturersRaw.map((m) => m.manufacturer).filter(Boolean))].sort();
    const models = [...new Set(modelsRaw.flatMap((m) => m.model.split("/").map((v) => v.trim())).filter(Boolean))].sort();
    const years = [...new Set(yearsRaw.flatMap((y) => y.year.split("/").map((v) => v.trim())).filter(Boolean))].sort();
    const names = [...new Set(namesRaw.map((n) => n.name).filter(Boolean))].sort();
    const itemCodes = [...new Set(itemCodesRaw.map((c) => c.itemCode).filter(Boolean))].sort();
    const oemCodes = [...new Set(oemRaw.map((c) => c.oemCode).filter((v): v is string => Boolean(v)))].sort();
    const factoryCodes = [...new Set(factoryRaw.map((c) => c.factoryCode).filter((v): v is string => Boolean(v)))].sort();
    const detalles = [
      ...new Set(
        detallesRaw.flatMap((d) => [d.detail, d.detalles]).filter((v): v is string => Boolean(v))
      ),
    ].sort();

    res.json({ brands, manufacturers, models, categories, years, names, itemCodes, oemCodes, factoryCodes, detalles });
  } catch (error) {
    console.error("Error al obtener filtros:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /:id — Detalle de producto con stock por ubicación
router.get("/:id", optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        category: true,
        inventories: { include: { location: true } },
        importers: { include: { importer: true } },
      },
    });

    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    const isAuth = !!req.user;
    const isTienda = req.user?.role === "TIENDA";
    const tiendaLocationId = req.user?.locationId || null;
    const visibleInventories = isTienda && tiendaLocationId
      ? product.inventories.filter((inv) => inv.locationId === tiendaLocationId)
      : product.inventories;
    const stockTotal = visibleInventories.reduce((sum, inv) => sum + inv.stock, 0);

    const response: any = {
      id: product.id,
      itemCode: product.itemCode,
      manufacturer: product.manufacturer,
      name: product.name,
      brand: product.brand,
      model: product.model,
      year: product.year,
      detail: product.detail,
      detalles: product.detalles,
      image: product.image,
      images: product.images,
      oemCode: product.oemCode,
      factoryCode: product.factoryCode,
      categoryId: product.categoryId,
      category: product.category?.name || null,
      stock: stockTotal,
      stockByLocation: visibleInventories.map((inv) => ({
        locationId: inv.location.id,
        locationName: inv.location.name,
        locationType: inv.location.type,
        stock: inv.stock,
        minStock: inv.minStock,
      })),
      importers: product.importers.map((pi) => ({
        id: pi.importer.id,
        name: pi.importer.name,
        phone: pi.importer.phone,
        city: pi.importer.city,
      })),
    };
    if (isAuth) {
      response.price1 = product.price1;
      response.price2 = product.price2;
      response.wholesalePrice = product.wholesalePrice;
      response.cost = product.cost;
      response.unitPrice = product.unitPrice;
      response.priceHermana = product.priceHermana;
      Object.assign(response, priceLadder(Number(product.cost) || null));
    }
    res.json(response);
  } catch (error) {
    console.error("Error al obtener producto:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST — Crear producto (solo ADMIN)
router.post("/", authenticate, authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const { itemCode, manufacturer, name, brand, model, year, detail, oemCode, factoryCode, price1, price2, wholesalePrice, cost, unitPrice, priceHermana, categoryId, image, images, locationId, stock = 0, minStock = 1 } = req.body;

    if (!itemCode || !manufacturer || !name || !brand || !model || !year || price1 == null) {
      return res.status(400).json({ message: "Campos obligatorios: itemCode, manufacturer, name, brand, model, year, price1" });
    }

    const existing = await prisma.product.findUnique({ where: { itemCode } });
    if (existing) {
      return res.status(409).json({ message: `Ya existe un producto con código "${itemCode}"` });
    }

    await syncManufacturer(manufacturer);

    const product = await prisma.product.create({
      data: {
        itemCode,
        manufacturer,
        name,
        brand,
        model,
        year,
        detail: detail || null,
        oemCode: oemCode || null,
        factoryCode: factoryCode || null,
        price1,
        price2: price2 ?? price1,
        wholesalePrice: wholesalePrice ?? null,
        cost: cost ?? null,
        unitPrice: unitPrice ?? null,
        priceHermana: priceHermana ?? null,
        categoryId: categoryId ?? null,
        image: (image as string) || null,
        images: Array.isArray(images) ? (images as string[]).filter((u): u is string => typeof u === "string" && u.length > 0) : [],
      },
    });

    if (locationId) {
      await prisma.inventory.create({ data: { productId: product.id, locationId: Number(locationId), stock: Number(stock) || 0, minStock: Number(minStock) || 1 } });
    }

    res.status(201).json(product);
  } catch (error) {
    console.error("Error al crear producto:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// PUT /:id — Editar producto (solo ADMIN)
router.put("/:id", authenticate, authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    const { itemCode, manufacturer, name, brand, model, year, detail, oemCode, factoryCode, price1, price2, wholesalePrice, cost, unitPrice, priceHermana, categoryId, image, images } = req.body;

    if (itemCode && itemCode !== existing.itemCode) {
      const dup = await prisma.product.findUnique({ where: { itemCode } });
      if (dup) {
        return res.status(409).json({ message: `Ya existe un producto con código "${itemCode}"` });
      }
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(itemCode && { itemCode }),
        ...(manufacturer && { manufacturer }),
        ...(name && { name }),
        ...(brand && { brand }),
        ...(model && { model }),
        ...(year && { year }),
        detail: detail !== undefined ? detail : existing.detail,
        oemCode: oemCode !== undefined ? oemCode : existing.oemCode,
        factoryCode: factoryCode !== undefined ? factoryCode : existing.factoryCode,
        ...(price1 != null && { price1 }),
        ...(price2 != null && { price2 }),
        wholesalePrice: wholesalePrice !== undefined ? wholesalePrice : existing.wholesalePrice,
        cost: cost !== undefined ? cost : existing.cost,
        unitPrice: unitPrice !== undefined ? unitPrice : existing.unitPrice,
        priceHermana: priceHermana !== undefined ? priceHermana : existing.priceHermana,
        categoryId: categoryId !== undefined ? (categoryId ?? null) : existing.categoryId,
        image: image !== undefined ? (image || null) : existing.image,
        images: Array.isArray(images)
          ? (images as string[]).filter((u): u is string => typeof u === "string" && u.length > 0)
          : existing.images,
      },
    });

    if (manufacturer) await syncManufacturer(manufacturer);

    res.json(product);
  } catch (error) {
    console.error("Error al editar producto:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// DELETE /:id — Eliminar producto (solo ADMIN)
router.delete("/:id", authenticate, authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.product.findUnique({
      where: { id },
      include: { saleItems: { take: 1 } },
    });

    if (!existing) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    if (existing.saleItems.length > 0) {
      return res.status(409).json({ message: "No se puede eliminar: el producto tiene ventas asociadas" });
    }

    await prisma.inventory.deleteMany({ where: { productId: id } });
    await prisma.productImporter.deleteMany({ where: { productId: id } });
    await prisma.product.delete({ where: { id } });

    res.json({ message: "Producto eliminado correctamente" });
  } catch (error) {
    console.error("Error al eliminar producto:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST /search-image — Buscar productos por imagen
router.post("/search-image", upload.single("image"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Debe subir una imagen" });
    }

    // Normalizar el nombre del archivo: quitar extensión, guiones/guiones bajos y tokens genéricos/códigos
    const raw = req.file.originalname.toLowerCase().replace(/\.[^.]+$/, "");

    const tokenPool = new Set<string>();
    const pushToken = (w: string) => {
      if (w.length > 2 && !/^\d+$/.test(w) && !IMAGE_STOPWORDS.has(w)) tokenPool.add(w);
    };

    raw
      .replace(/[_\-\.\+\(\)\[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .forEach(pushToken);

    // R25/C5: extraer el contenido real de la imagen (OCR) además del nombre del archivo
    let ocrText = "";
    try {
      const worker = await createWorker("eng", 1, { langPath: OCR_LANG_PATH, gzip: true });
      try {
        const ctx = await worker.recognize(req.file.buffer);
        ocrText = ctx.data.text || "";
      } finally {
        await worker.terminate();
      }
    } catch (ocrErr) {
      console.error("OCR no disponible:", ocrErr);
    }

    ocrText
      .toLowerCase()
      .split(/[\s,;/|]+/)
      .map((t) => t.replace(/[^\w.-]/g, "").replace(/-/g, ""))
      .forEach(pushToken);

    const keywords = Array.from(tokenPool);

    if (keywords.length === 0) {
      return res.json({ products: [], message: "No se pudieron extraer palabras clave del nombre o la imagen" });
    }

    // Buscar por múltiples campos y rankear por cantidad de coincidencias
    const products = await prisma.product.findMany({
      where: {
        AND: [
          {
            OR: keywords.flatMap((kw) => [
              { name: { contains: kw, mode: "insensitive" as const } },
              { brand: { contains: kw, mode: "insensitive" as const } },
              { model: { contains: kw, mode: "insensitive" as const } },
              { itemCode: { contains: kw, mode: "insensitive" as const } },
              { oemCode: { contains: kw, mode: "insensitive" as const } },
              { factoryCode: { contains: kw, mode: "insensitive" as const } },
              { detail: { contains: kw, mode: "insensitive" as const } },
              { manufacturer: { contains: kw, mode: "insensitive" as const } },
            ]),
          },
        ],
      },
      include: {
        inventories: {
          include: { location: { select: { id: true, name: true, type: true } } },
        },
      },
      take: 50,
    });

    // Rankear: cuantas más keywords coincidan con el nombre/marca/modelo/códigos, mejor
    const scored = products
      .map((p) => {
        const haystack = `${p.name} ${p.brand} ${p.model} ${p.itemCode} ${p.oemCode || ""} ${p.factoryCode || ""} ${p.detail || ""}`.toLowerCase();
        const matches = keywords.filter((kw) => haystack.includes(kw)).length;
        return { p, score: matches };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    const results = scored.map(({ p }) => ({
      id: p.id,
      itemCode: p.itemCode,
      name: p.name,
      brand: p.brand,
      model: p.model,
      year: p.year,
      price1: Number(p.price1),
      price2: Number(p.price2),
      image: p.image,
      score: 1,
      totalStock: p.inventories.reduce((sum, i) => sum + i.stock, 0),
      locations: p.inventories.map((i) => ({
        name: i.location.name,
        type: i.location.type,
        stock: i.stock,
      })),
    }));

    res.json({
      query: keywords.join(" "),
      count: results.length,
      products: results,
    });
  } catch (error) {
    console.error("Error en búsqueda por imagen:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST /import — Importar productos masivamente desde Excel (solo ADMIN)
router.post("/import", authenticate, authorize("ADMIN"), upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Debe subir un archivo Excel (.xlsx o .xls)" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      return res.status(400).json({ message: "El archivo está vacío" });
    }

    const categories = await prisma.category.findMany();
    const catMap: Record<string, number> = {};
    categories.forEach((c) => { catMap[c.name.toLowerCase()] = c.id; });

    // Plantilla según el fabricante seleccionado en el modal de importación.
    // DEPO: columnas fijas Item Number / Description / Quantity / Unit Price /
    // XMAYOR y columnas calculadas con las fórmulas del Excel.
    const importType = req.body.importType === "depo" ? "depo" : "generic";
    const exchangeRate = parseFloat(req.body.exchangeRate) > 0 ? parseFloat(req.body.exchangeRate) : 10.03;
    const costFactor = parseFloat(req.body.costFactor) > 0 ? parseFloat(req.body.costFactor) : 1.5;
    const hermanaFactor = parseFloat(req.body.hermanaFactor) > 0 ? parseFloat(req.body.hermanaFactor) : 1.6;

    // Mapa de ubicaciones por nombre normalizado (con/sin tildes) para
    // distribuir stock usando columnas tipo "Tienda 1", "Almacén 1", etc.
    const allLocations = await prisma.location.findMany();
    const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const locByName: Record<string, number> = {};
    allLocations.forEach((l) => { locByName[normalize(l.name)] = l.id; });

    const getPerLocationStock = (row: any): { locationId: number; stock: number }[] => {
      const result: { locationId: number; stock: number }[] = [];
      for (const key of Object.keys(row)) {
        const locId = locByName[normalize(String(key).trim())];
        if (!locId) continue;
        const val = parseInt(row[key], 10) || 0;
        if (val > 0) result.push({ locationId: locId, stock: val });
      }
      return result;
    };

    // Validar que locationId global exista si se proporciona
    const requestedLocationId = Number(req.body.locationId) || 0;
    if (requestedLocationId) {
      const globalLocation = await prisma.location.findUnique({ where: { id: requestedLocationId } });
      if (!globalLocation) {
        return res.status(400).json({ message: `Ubicación no encontrada (ID: ${requestedLocationId})` });
      }
    }

    const imported: any[] = [];
    const updated: any[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as any;

      let itemCode = (
        row["itemCode"] || row["Codigo Item"] || row["Código Item"] || row["CodigoItem"] || row["Código"] || row["codigo"] || row["Codigo"] || row["Cód. Producto"] || row["Cod. Producto"] || row["Codigo Producto"] || row["Código Producto"] || row["Codigo Fabrica"] || row["Código Fábrica"] || row["Código fabrica"] || row["Cód. Fábrica"] || row["Cod. Fabrica"] || row["Code"] || ""
      ).toString().trim();
      let name = (row["Descripcion"] || row["descripcion"] || row["Descripción"] || row["descripción"] || row["Producto"] || row["producto"] || row["Nombre"] || row["nombre"] || row["Nombre del Producto"] || row["Nombre Producto"] || row["Nombre del Articulo"] || row["Articulo"] || row["Artículo"] || "").toString().trim();
      let manufacturer = (row["Fabricante"] || row["fabricante"] || row["Manufacturer"] || "Sin especificar").toString().trim();
      let brand = (row["Marca"] || row["marca"] || row["Brand"] || "").toString().trim();
      let model = (row["Modelo"] || row["modelo"] || row["Model"] || "").toString().trim();
      let year = (row["Anos"] || row["anos"] || row["Años"] || row["años"] || row["Año"] || "").toString().trim();
      let detail = (row["Detalle"] || row["detalle"] || row["Detail"] || "").toString().trim();
      let oemCode = (row["Código OEM"] || row["codigo oem"] || row["Codigo OEM"] || row["oemCode"] || row["Cód. OEM"] || row["Cod.OEM"] || row["OEM"] || "").toString().trim();
      let factoryCode = (row["Código fábrica"] || row["Código fabrica"] || row["codigo fabrica"] || row["Codigo fabrica"] || row["Codigo Fabrica"] || row["factoryCode"] || row["Cód. Fábrica"] || row["Cod. Fabrica"] || "").toString().trim();
      const category = (row["Categoría"] || row["categoría"] || row["Categoria"] || row["categoria"] || row["Category"] || "").toString().trim();
      let price1 = parseFloat(row["Precio 1"] || row["precio1"] || row["Precio minorista"] || row["price1"] || "0") || 0;
      let price2 = parseFloat(row["Precio 2"] || row["precio2"] || row["Precio mayoreo"] || row["price2"] || "0") || 0;
      let wholesalePrice = parseFloat(row["Precio mayor"] || row["precio mayor"] || row["wholesalePrice"] || "0") || 0;
      let cost = parseFloat(row["Costo"] || row["costo"] || row["cost"] || "0") || 0;
      let unitPrice = parseFloat(row["Unit Price"] || row["unitPrice"] || row["Precio USD"] || "0") || 0;
      let priceHermana = parseFloat(row["Hermanas"] || row["HERMANAS"] || row["Hermana"] || row["priceHermana"] || "0") || 0;
      let calidad = (row["Calidad"] || row["calidad"] || row["quality"] || row["Detalles"] || row["detalles"] || "").toString().trim();
      let rowStock = parseInt(row["Stock"] || row["stock"] || "0", 10) || 0;
      const rowLocation = (row["Ubicación"] || row["Ubicacion"] || row["Tienda"] || row["Almacén"] || row["Almacen"] || "").toString().trim();

      // Plantilla por fabricante (DEPO): las columnas fijas del Excel son
      // Item Number, Description, Quantity, Unit Price y XMAYOR; el resto
      // (COSTO BS, HERMANAS, 20%..80%) se calcula con las fórmulas del archivo
      // a partir de Unit Price y los factores que el usuario carga en el modal.
      if (importType === "depo") {
        const depoCell = (name: string): any => {
          if (row[name] !== undefined) return row[name];
          const found = Object.keys(row).find((k) => k.trim() === name);
          return found !== undefined ? row[found] : undefined;
        };
        const unitPriceUsd = parseFloat(String(depoCell("Unit Price") ?? "0")) || 0;
        itemCode = String(depoCell("Item Number") ?? "").toString().trim();
        name = String(depoCell("Description") ?? depoCell("Descripcion") ?? "").toString().trim();
        manufacturer = "DEPO";
        brand = "Sin marca";
        model = "Sin modelo";
        year = "";
        detail = "";
        oemCode = "";
        factoryCode = "";
        unitPrice = unitPriceUsd;
        cost = round2(unitPriceUsd * exchangeRate * costFactor);
        priceHermana = round2(unitPriceUsd * exchangeRate * hermanaFactor);
        price1 = priceHermana || cost;
        price2 = round2(cost * 1.8);
        wholesalePrice = parseFloat(String(depoCell("XMAYOR") ?? "0")) || 0;
        rowStock = parseInt(String(depoCell("Quantity") ?? "0"), 10) || 0;
        calidad = "";
      }

      if (!itemCode || !name) {
        errors.push(`Fila ${i + 2}: Código y nombre son obligatorios`);
        continue;
      }

      try {
        const rowWarnings: string[] = [];
        const label = `Fila ${i + 2} (${itemCode})`;
        if (importType === "depo") {
          if (!unitPrice) rowWarnings.push(`${label}: Unit Price vacío — precios quedan en 0, editarlo manualmente`);
          if (!rowStock) rowWarnings.push(`${label}: Quantity vacío o en 0 — sin stock`);
          if (!wholesalePrice) rowWarnings.push(`${label}: XMAYOR vacío — sin Precio Mayor`);
        } else {
          if (!price1) rowWarnings.push(`${label}: Precio 1 vacío — quedó en 0, editarlo manualmente`);
          if (!cost) rowWarnings.push(`${label}: Costo vacío — quedó en 0, editarlo manualmente`);
          if (!rowStock) rowWarnings.push(`${label}: Stock vacío o en 0 — sin stock`);
        }
        rowWarnings.forEach((w) => warnings.push(w));

        let categoryId: number | null = null;
        if (category && catMap[category.toLowerCase()]) {
          categoryId = catMap[category.toLowerCase()];
        }

        let rowLocationId = requestedLocationId;
        if (rowLocation) {
          const location = await prisma.location.findFirst({ where: { OR: [{ name: { equals: rowLocation, mode: "insensitive" } }, { id: Number(rowLocation) || -1 }] } });
          if (!location) throw new Error(`Ubicación no encontrada: ${rowLocation}`);
          rowLocationId = location.id;
        }

        const perLocationStock = getPerLocationStock(row);

        const existing = await prisma.product.findUnique({ where: { itemCode } });

        if (existing) {
          const updateData: any = {};
          if (name) updateData.name = name;
          if (brand) updateData.brand = brand;
          if (model) updateData.model = model;
          if (year) updateData.year = year;
          if (detail) updateData.detail = detail;
          if (manufacturer && manufacturer !== "Sin especificar") updateData.manufacturer = manufacturer;
          if (oemCode) updateData.oemCode = oemCode;
          if (factoryCode) updateData.factoryCode = factoryCode;
          if (price1 > 0) updateData.price1 = price1;
          if (price2 > 0) updateData.price2 = price2;
          if (wholesalePrice > 0) updateData.wholesalePrice = wholesalePrice;
          if (cost > 0) updateData.cost = cost;
          if (unitPrice > 0) updateData.unitPrice = unitPrice;
          if (priceHermana > 0) updateData.priceHermana = priceHermana;
          if (categoryId) updateData.categoryId = categoryId;
          if (calidad) updateData.detalles = calidad;

          if (Object.keys(updateData).length > 0) {
            await prisma.product.update({ where: { id: existing.id }, data: updateData });
          }
          if (manufacturer && manufacturer !== "Sin especificar") await syncManufacturer(manufacturer);
          if (perLocationStock.length > 0) {
            for (const { locationId, stock } of perLocationStock) {
              await prisma.inventory.upsert({ where: { productId_locationId: { productId: existing.id, locationId } }, update: { stock: { increment: stock } }, create: { productId: existing.id, locationId, stock, minStock: 1 } });
            }
          } else if (rowLocationId && rowStock > 0) {
            await prisma.inventory.upsert({ where: { productId_locationId: { productId: existing.id, locationId: rowLocationId } }, update: { stock: { increment: rowStock } }, create: { productId: existing.id, locationId: rowLocationId, stock: rowStock, minStock: 1 } });
          }
          updated.push({ id: existing.id, itemCode, name, action: "actualizado" });
        } else {
          await syncManufacturer(manufacturer);
          const product = await prisma.product.create({
            data: {
              itemCode,
              name,
              manufacturer,
              brand: brand || "Sin marca",
              model: model || "Sin modelo",
              year,
              detail,
              oemCode: oemCode || null,
              factoryCode: factoryCode || null,
              price1: price1 || 0,
              price2: price2 || 0,
              wholesalePrice: wholesalePrice || null,
              cost: cost || null,
              unitPrice: unitPrice || null,
              priceHermana: priceHermana || null,
              categoryId,
              detalles: calidad || null,
            },
          });

          let locations = allLocations;
          if (perLocationStock.length > 0) {
            const stockByLoc: Record<number, number> = {};
            allLocations.forEach((l) => { stockByLoc[l.id] = 0; });
            perLocationStock.forEach((p) => { stockByLoc[p.locationId] = p.stock; });
            for (const loc of allLocations) await prisma.inventory.create({ data: { productId: product.id, locationId: loc.id, stock: stockByLoc[loc.id], minStock: 1 } });
          } else {
            locations = rowLocationId
              ? allLocations.filter((l) => l.id === rowLocationId)
              : allLocations;
            for (const loc of locations) await prisma.inventory.create({ data: { productId: product.id, locationId: loc.id, stock: rowLocationId ? rowStock : 0, minStock: 1 } });
          }

          imported.push({ id: product.id, itemCode, name, action: "creado" });
        }
      } catch (err: any) {
        errors.push(`Fila ${i + 2}: ${err.message}`);
      }
    }

    res.json({
      total: rows.length,
      imported: imported.length,
      updated: updated.length,
      errors: errors.length,
      warnings: warnings.length,
      details: { imported, updated, errors, warnings },
    });
  } catch (error: any) {
    console.error("Error al importar productos:", error);
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "El archivo excede el tamaño máximo de 10MB" });
    }
    res.status(500).json({ message: error.message || "Error al procesar el archivo" });
  }
});

const INVOICE_SCALE = [20, 30, 40, 50, 60, 70, 80];

// Selecciona la hoja de la factura: prefiere la que tenga columna de costo
// de fábrica o QTY (evita tomar otras hojas como el inventario inicial).
const pickInvoiceSheet = (workbook: XLSX.WorkBook): XLSX.WorkSheet => {
const hasInvoiceCols = (name: string) => {
    const ws = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws);
    if (!rows.length) return false;
    const keys = Object.keys(rows[0] as any).map((k) => k.toLowerCase());
    return keys.some((k) => (k.includes("costo") && k.includes("fabric"))) || keys.includes("qty") || keys.includes("cantidad");
  };
  const found = workbook.SheetNames.find(hasInvoiceCols);
  return found ? workbook.Sheets[found] : workbook.Sheets[workbook.SheetNames[0]];
};

const findProductByCodes = async (itemCode: string, oemCode: string, factoryCode: string) => {
  let product = null;
  let matchedBy = "itemCode";
  if (itemCode) product = await prisma.product.findUnique({ where: { itemCode } });
  if (!product && oemCode) {
    product = await prisma.product.findFirst({ where: { oemCode } });
    matchedBy = "oem";
  }
  if (!product && factoryCode) {
    product = await prisma.product.findFirst({ where: { factoryCode } });
    matchedBy = "factory";
  }
  return { product, matchedBy };
};

const parseInvoiceRow = (row: any) => ({
  itemCode: (row["Codigo Item"] || row["Código Item"] || row["CodigoItem"] || row["Codigo"] || row["Código"] || row["Codigo Producto"] || row["Código Producto"] || "").toString().trim(),
  proveedor: (row["Proveedor"] || "").toString().trim(),
  fabricante: (row["Fabricante"] || "").toString().trim(),
  productName: (row["Producto"] || row["Descripcion"] || row["Descripción"] || "").toString().trim(),
  marca: (row["Marca"] || "").toString().trim(),
  modelo: (row["Modelo"] || "").toString().trim(),
  año: (row["Año"] || row["Ano"] || row["Anos"] || row["Años"] || "").toString().trim(),
  detalle: (row["Detalle"] || "").toString().trim(),
  oemCode: (row["Codigo OEM"] || row["Código OEM"] || row["Cod.OEM"] || row["OEM"] || "").toString().trim(),
  factoryCode: (row["Codigo Fabrica"] || row["Código Fabrica"] || "").toString().trim(),
  qty: parseInt(row["QTY"] || row["Qty"] || row["Cantidad"] || row["Cant"] || "1", 10) || 1,
  costoUnitario: parseFloat(row["COSTO UNITARIO FABRICA"] || row["Costo Unitario Fabrica"] || row["Costo Fabrica"] || row["Costo Unitario"] || row["Precio Unitario"] || row["Precio USD"] || row["PU"] || "0") || 0,
});

// POST /invoice-guide — Previsualizar importación por factura (solo ADMIN)
// Calcula la guía de precios: Costo = CU × TC × (1 + %gasto/100), Costo Tienda = Costo × (1 + %A tienda/100)
// y precios base 20%..80% = Costo × (1 + X/100). Muestra los precios antiguos de productoss ya existentes.
router.post("/invoice-guide", authenticate, authorize("ADMIN"), upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Debe subir el archivo Excel de la factura" });
    }

    const exchangeRate = parseFloat(req.body.exchangeRate);
    if (!exchangeRate || exchangeRate <= 0) return res.status(400).json({ message: "El tipo de cambio debe ser mayor a 0" });
    const gastosPer = req.body.gastosPer !== undefined && req.body.gastosPer !== "" ? parseFloat(req.body.gastosPer) || 0 : 0;
    if (gastosPer < 0 || gastosPer > 100) return res.status(400).json({ message: "El porcentaje de gastos debe estar entre 0 y 100" });
    const tiendaMargin = req.body.tiendaMargin !== undefined && req.body.tiendaMargin !== "" ? parseFloat(req.body.tiendaMargin) || 0 : 0;
    if (tiendaMargin < 0 || tiendaMargin > 200) return res.status(400).json({ message: "El margen de tienda debe estar entre 0 y 200" });

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = pickInvoiceSheet(workbook);
    const rows = XLSX.utils.sheet_to_json(sheet);
    if (rows.length === 0) return res.status(400).json({ message: "El archivo está vacío" });

    const out: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const p = parseInvoiceRow(rows[i] as any);
      if (!p.itemCode && !p.oemCode && !p.factoryCode) {
        errors.push(`Fila ${i + 2}: Falta el código del producto`);
        continue;
      }

      const costo = round2(p.costoUnitario * exchangeRate * (1 + gastosPer / 100));
      const costoTienda = round2(costo * (1 + tiendaMargin / 100));
      const prices: Record<string, number> = {};
      for (const pct of INVOICE_SCALE) prices[`p${pct}`] = round2(costo * (1 + pct / 100));

      const { product, matchedBy } = await findProductByCodes(p.itemCode, p.oemCode, p.factoryCode);

      out.push({
        rowIndex: i,
        itemCode: p.itemCode,
        proveedor: p.proveedor,
        fabricante: p.fabricante,
        productName: p.productName,
        marca: p.marca,
        modelo: p.modelo,
        año: p.año,
        detalle: p.detalle,
        oemCode: p.oemCode,
        factoryCode: p.factoryCode,
        qty: p.qty,
        costoUnitario: p.costoUnitario,
        costo,
        costoTienda,
        prices,
        oldPrice1: product ? Number(product.price1) : 0,
        oldPrice2: product ? Number(product.price2) : 0,
        oldMayor: product && product.wholesalePrice ? Number(product.wholesalePrice) : 0,
        oldCost: product && product.cost ? Number(product.cost) : 0,
        exists: !!product,
        matchedBy,
      });
    }

    res.json({ total: rows.length, valid: out.length, errors, exchangeRate, gastosPer, tiendaMargin, rows: out });
  } catch (error: any) {
    console.error("Error al generar guía de factura:", error);
    res.status(500).json({ message: error.message || "Error interno del servidor" });
  }
});

// POST /import-invoice — Guardar importación por factura (solo ADMIN)
// Crea/actualiza productos con los precios manuales (Precio Mayor, Precio 1, Precio 2),
// setea el costo calculado y suma la cantidad QTY al stock del almacén elegido.
router.post("/import-invoice", authenticate, authorize("ADMIN"), upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Debe subir el archivo Excel de la factura" });
    }

    const exchangeRate = parseFloat(req.body.exchangeRate);
    if (!exchangeRate || exchangeRate <= 0) return res.status(400).json({ message: "El tipo de cambio debe ser mayor a 0" });
    const gastosPer = parseFloat(req.body.gastosPer) || 0;
    if (gastosPer < 0 || gastosPer > 100) return res.status(400).json({ message: "El porcentaje de gastos debe estar entre 0 y 100" });
    const tiendaMargin = parseFloat(req.body.tiendaMargin) || 0;
    if (tiendaMargin < 0 || tiendaMargin > 200) return res.status(400).json({ message: "El margen de tienda debe estar entre 0 y 200" });

    const locationId = parseInt(req.body.locationId, 10) || 0;
    if (!locationId) return res.status(400).json({ message: "Debe seleccionar el almacén de destino" });
    const location = await prisma.location.findUnique({ where: { id: locationId } });
    if (!location) return res.status(404).json({ message: `Almacén no encontrado (ID: ${locationId})` });

    let prices: { price1?: number; price2?: number; mayor?: number }[] = [];
    if (req.body.prices) {
      try {
        prices = JSON.parse(req.body.prices);
      } catch {
        return res.status(400).json({ message: "Datos de precios inválidos" });
      }
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = pickInvoiceSheet(workbook);
    const rows = XLSX.utils.sheet_to_json(sheet);
    if (rows.length === 0) return res.status(400).json({ message: "El archivo está vacío" });

    const imported: any[] = [];
    const updated: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const p = parseInvoiceRow(rows[i] as any);
      if (!p.itemCode && !p.oemCode && !p.factoryCode) {
        errors.push(`Fila ${i + 2}: Falta el código del producto`);
        continue;
      }

      const costo = round2(p.costoUnitario * exchangeRate * (1 + gastosPer / 100));
      const costoTienda = round2(costo * (1 + tiendaMargin / 100));
      const priceSet = prices[i] || {};

      try {
        const { product, matchedBy } = await findProductByCodes(p.itemCode, p.oemCode, p.factoryCode);
        const price1 = priceSet.price1 !== undefined ? Number(priceSet.price1) || 0 : 0;
        const price2 = priceSet.price2 !== undefined ? Number(priceSet.price2) || 0 : 0;
        const mayor = priceSet.mayor !== undefined ? Number(priceSet.mayor) || 0 : 0;

        const common = {
          name: p.productName || product?.name || "Sin nombre",
          manufacturer: p.fabricante || product?.manufacturer || "Importado",
          brand: p.marca || product?.brand || "Sin marca",
          model: p.modelo || product?.model || "Sin modelo",
          year: p.año || product?.year || "",
          detail: p.detalle || product?.detail || "",
          oemCode: p.oemCode || product?.oemCode || null,
          factoryCode: p.factoryCode || product?.factoryCode || null,
        };

        let finalProduct;
        if (!product) {
          finalProduct = await prisma.product.create({
            data: {
              ...common,
              itemCode: p.itemCode || `${p.oemCode || p.factoryCode}-${Date.now().toString().slice(-4)}`,
              price1,
              price2,
              wholesalePrice: mayor > 0 ? mayor : null,
              cost: costo > 0 ? costo : null,
            },
          });
          imported.push({ id: finalProduct.id, itemCode: finalProduct.itemCode, name: finalProduct.name });
        } else {
          finalProduct = await prisma.product.update({
            where: { id: product.id },
            data: {
              ...common,
              price1,
              price2,
              wholesalePrice: mayor > 0 ? mayor : product.wholesalePrice,
              cost: costo > 0 ? costo : product.cost,
            },
          });
          updated.push({ id: product.id, itemCode: product.itemCode, name: product.name, matchedBy });
        }

        await prisma.inventory.upsert({
          where: { productId_locationId: { productId: finalProduct.id, locationId } },
          update: { stock: { increment: p.qty } },
          create: { productId: finalProduct.id, locationId, stock: p.qty, minStock: 1 },
        });
      } catch (err: any) {
        errors.push(`Fila ${i + 2}: ${err.message}`);
      }
    }

    res.json({
      total: rows.length,
      imported: imported.length,
      updated: updated.length,
      errors: errors.length,
      location: location.name,
      stockAdded: true,
      detail: `Costo = CU × TC(${exchangeRate}) × (1 + ${gastosPer}%/100); Costo Tienda = Costo × (1 + ${tiendaMargin}%/100)`,
      details: { imported, updated, errors },
    });
  } catch (error: any) {
    if (error.message && !error.message.includes("Prisma") && !error.code) {
      return res.status(400).json({ message: error.message });
    }
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "El archivo excede el tamaño máximo de 10MB" });
    }
    console.error("Error al importar factura:", error);
    res.status(500).json({ message: error.message || "Error interno del servidor" });
  }
});

// POST /export-oferta — Exportar Excel de oferta por factura (solo ADMIN)
router.post("/export-oferta", authenticate, authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: "No hay filas para exportar" });
    }

    const body = rows.map((r: any, i: number) => [
      r.itemCode || "",
      r.fabricante || "",
      r.productName || r.name || "",
      r.marca || "",
      r.modelo || "",
      r.año || r.year || "",
      r.detalle || "",
      r.oemCode || "",
      r.factoryCode || "",
      Number(r.mayor || r.price1 || 0),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([
      ["Codigo Item", "Fabricante", "Producto", "Marca", "Modelo", "Año", "Detalle", "Codigo OEM", "Codigo Fabrica", "Precio Mayor"],
      ...body,
    ]);
    ws["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Oferta");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="oferta_${Date.now()}.xlsx"`);
    return res.send(buf);
  } catch (error: any) {
    console.error("Error al exportar oferta:", error);
    res.status(500).json({ message: error.message || "Error interno del servidor" });
  }
});

export default router;
