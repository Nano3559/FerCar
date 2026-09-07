import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, authorize } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";
import { parseId, parsePositiveDecimal, parsePositiveInt, parseString } from "../../shared/middlewares/validate";
import multer from "multer";
import path from "path";
import fs from "fs";
import * as XLSX from "xlsx";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
router.use(authorize("ADMIN"));

const uploadsDir = path.join(__dirname, "../../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".xlsx" || ext === ".xls") {
      cb(null, true);
    } else if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten archivos Excel (.xlsx o .xls)"));
    }
  },
});

// Configuración por defecto (márgenes y descuentos por volumen)
const SETTING_DEFAULTS: Record<string, number> = {
  margin1: 25,
  margin2: 45,
  disc20: 2,
  disc30: 3,
  disc40: 5,
  disc50: 8,
};

async function getSettings(keys: string[]): Promise<Record<string, number>> {
  const found = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const map = new Map(found.map((s) => [s.key, parseFloat(s.value)]));
  const out: Record<string, number> = {};
  for (const k of keys) {
    const v = map.get(k);
    out[k] = v != null && isFinite(v) ? v : SETTING_DEFAULTS[k];
  }
  return out;
}

async function saveSettings(entries: { key: string; value: number }[]) {
  for (const e of entries) {
    if (!isFinite(e.value)) continue;
    await prisma.setting.upsert({
      where: { key: e.key },
      update: { value: String(e.value) },
      create: { key: e.key, value: String(e.value) },
    });
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100;

// GET /file/:filename — Ver/descargar el Excel de una nota
router.get("/file/:filename", (req: AuthRequest, res: Response) => {
  const filename = path.basename(String(req.params.filename));
  if (!filename || filename !== req.params.filename) {
    return res.status(400).json({ message: "Nombre de archivo inválido" });
  }
  const filePath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "Archivo no encontrado" });
  }
  res.sendFile(filePath);
});

// POST /import — Subir Excel → Nota de Compra (ADMIN).
// Cada archivo crea una nota independiente con su correlativo. Suma stock a la
// ubicación elegida y actualiza costo/precios del producto automáticamente.
router.post("/import", upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Debe subir el archivo Excel de la nota (campo 'file')" });
    }

    const supplierName = parseString(req.body.supplierName, "Proveedor", { required: true, max: 120 })!;
    const supplierNit = parseString(req.body.supplierNit, "NIT", { max: 40 });
    const supplierPhone = parseString(req.body.supplierPhone, "Teléfono", { max: 40 });

    const locationId = parsePositiveInt(req.body.locationId, "Ubicación");
    const location = await prisma.location.findUnique({ where: { id: locationId } });
    if (!location) return res.status(404).json({ message: "Ubicación no encontrada" });

    const exchangeRate = req.body.exchangeRate !== undefined && req.body.exchangeRate !== ""
      ? parsePositiveDecimal(req.body.exchangeRate, "Tipo de cambio")
      : 1;
    if (exchangeRate <= 0) return res.status(400).json({ message: "El tipo de cambio debe ser mayor a 0" });

    const expensesPer = req.body.expensesPer !== undefined && req.body.expensesPer !== ""
      ? parsePositiveDecimal(req.body.expensesPer, "Porcentaje de gastos")
      : 0;
    if (expensesPer < 0 || expensesPer > 100) return res.status(400).json({ message: "El porcentaje de gastos debe estar entre 0 y 100" });

    const settings = await getSettings(["margin1", "margin2", "disc20", "disc30", "disc40", "disc50"]);

    const getNum = (key: string, fallback: number, min: number, max: number, label: string): number => {
      const raw = req.body[key];
      if (raw === undefined || raw === "") return fallback;
      const v = parsePositiveDecimal(raw, label);
      if (v < min || v > max) throw new Error(`${label} debe estar entre ${min} y ${max}`);
      return v;
    };

    const margin1 = getNum("margin1", settings.margin1, 0, 200, "Margen Precio 1");
    const margin2 = getNum("margin2", settings.margin2, 0, 200, "Margen Precio 2");
    const disc20 = getNum("disc20", settings.disc20, 0, 90, "Descuento por volumen 20");
    const disc30 = getNum("disc30", settings.disc30, 0, 90, "Descuento por volumen 30");
    const disc40 = getNum("disc40", settings.disc40, 0, 90, "Descuento por volumen 40");
    const disc50 = getNum("disc50", settings.disc50, 0, 90, "Descuento por volumen 50");

    const workbook = XLSX.read(fs.readFileSync(req.file.path), { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);
    if (rows.length === 0) return res.status(400).json({ message: "El archivo Excel está vacío" });

    const items: {
      productId: number;
      quantity: number;
      unitCost: number;
      price1: number;
      price2: number;
      disc20: number;
      disc30: number;
      disc40: number;
      disc50: number;
      priceD20: number;
      priceD30: number;
      priceD40: number;
      priceD50: number;
      lineTotal: number;
    }[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as any;
      const code = (row["Código"] || row["Codigo"] || row["codigo"] || row["itemCode"] || row["ItemCode"]
        || row["Codigo Fabrica"] || row["Código Fábrica"] || row["Cod. Fabrica"] || row["Cód. Fabrica"]
        || row["Cod. Producto"] || row["Codigo Producto"] || row["Cód. Producto"] || "").toString().trim();
      const qtyRaw = parseFloat(row["Cantidad"] || row["cantidad"] || row["Cant"] || row["Qty"] || row["Quantity"] || "1") || 1;
      const unitRaw = parseFloat(row["Precio Unitario"] || row["Precio unitario"] || row["Precio"] || row["PU"]
        || row["Pu"] || row["Unit Price"] || row["Precio USD"] || row["Precio US"] || row["precio"] || "0") || 0;

      if (!code) {
        errors.push(`Fila ${i + 2}: Falta el código del producto`);
        continue;
      }
      if (unitRaw <= 0) {
        errors.push(`Fila ${i + 2}: Precio unitario inválido para "${code}"`);
        continue;
      }

      const product = await prisma.product.findUnique({ where: { itemCode: code } });
      if (!product) {
        errors.push(`Fila ${i + 2}: Producto no encontrado (código "${code}")`);
        continue;
      }

      const quantity = Math.max(1, Math.round(qtyRaw));
      const unitCost = round2(unitRaw * exchangeRate * (1 + expensesPer / 100));
      const price1 = round2(unitCost * (1 + margin1 / 100));
      const price2 = round2(unitCost * (1 + margin2 / 100));

      items.push({
        productId: product.id,
        quantity,
        unitCost,
        price1,
        price2,
        disc20,
        disc30,
        disc40,
        disc50,
        priceD20: round2(price1 * (1 - disc20 / 100)),
        priceD30: round2(price1 * (1 - disc30 / 100)),
        priceD40: round2(price1 * (1 - disc40 / 100)),
        priceD50: round2(price1 * (1 - disc50 / 100)),
        lineTotal: round2(unitCost * quantity),
      });
    }

    if (items.length === 0) {
      return res.status(400).json({
        message: "No se pudo importar ninguna línea",
        errors: errors.slice(0, 50),
      });
    }

    const totalUnits = items.reduce((s, it) => s + it.quantity, 0);
    const totalCost = round2(items.reduce((s, it) => s + it.lineTotal, 0));

    const result = await prisma.$transaction(async (tx) => {
      const count = await tx.purchaseNote.count();
      const noteNumber = `NC-${String(count + 1).padStart(4, "0")}`;

      const note = await tx.purchaseNote.create({
        data: {
          noteNumber,
          date: new Date(),
          supplierName,
          supplierNit,
          supplierPhone,
          locationId,
          fileUrl: req.file!.filename,
          exchangeRate,
          expensesPer: expensesPer > 0 ? expensesPer : null,
          totalUnits,
          totalCost,
          userId: req.user!.userId,
          items: { create: items },
        },
        include: { items: true },
      });

      for (const it of items) {
        await tx.inventory.upsert({
          where: { productId_locationId: { productId: it.productId, locationId } },
          update: { stock: { increment: it.quantity } },
          create: { productId: it.productId, locationId, stock: it.quantity },
        });
        await tx.product.update({
          where: { id: it.productId },
          data: { cost: it.unitCost, price1: it.price1, price2: it.price2 },
        });
      }

      return note;
    });

    // Persistir márgenes/descuentos si vienen en el formulario
    const toSave: { key: string; value: number }[] = [];
    if (req.body.margin1 !== undefined && req.body.margin1 !== "") toSave.push({ key: "margin1", value: margin1 });
    if (req.body.margin2 !== undefined && req.body.margin2 !== "") toSave.push({ key: "margin2", value: margin2 });
    if (req.body.disc20 !== undefined && req.body.disc20 !== "") toSave.push({ key: "disc20", value: disc20 });
    if (req.body.disc30 !== undefined && req.body.disc30 !== "") toSave.push({ key: "disc30", value: disc30 });
    if (req.body.disc40 !== undefined && req.body.disc40 !== "") toSave.push({ key: "disc40", value: disc40 });
    if (req.body.disc50 !== undefined && req.body.disc50 !== "") toSave.push({ key: "disc50", value: disc50 });
    if (toSave.length) await saveSettings(toSave);

    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: "CREATE_PURCHASE_NOTE",
        targetType: "PURCHASE_NOTE",
        targetId: result.id,
        newValue: { noteNumber: result.noteNumber, totalUnits, totalCost, locationId, supplierName },
      },
    });

    res.status(201).json({
      note: {
        id: result.id,
        noteNumber: result.noteNumber,
        totalUnits,
        totalCost,
      },
      imported: items.length,
      errores: errors.length,
      errors: errors.slice(0, 50),
      formula: `Costo Puesto Aquí = PrecioUnitario × TC(${exchangeRate}) × (1 + ${expensesPer}%/100); P1 = Costo × (1 + ${margin1}/100); P2 = Costo × (1 + ${margin2}/100); Descuentos 20/30/40/50 = ${disc20}%/${disc30}%/${disc40}%/${disc50}%`,
    });
  } catch (error: any) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "El archivo excede el tamaño máximo de 10MB" });
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ message: "Solo se permite un archivo (campo 'file')" });
    }
    if (error.message && !error.message.includes("Prisma")) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error al importar nota de compra:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET / — Listar notas de compra
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { search, page = "1", limit = "20" } = req.query;
    const pg = Math.max(1, Number(page) || 1);
    const take = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (pg - 1) * take;

    const where: any = {};
    if (search && typeof search === "string") {
      where.OR = [
        { noteNumber: { contains: search, mode: "insensitive" } },
        { supplierName: { contains: search, mode: "insensitive" } },
      ];
    }

    const [notes, total] = await Promise.all([
      prisma.purchaseNote.findMany({
        where,
        include: {
          location: { select: { id: true, name: true, type: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.purchaseNote.count({ where }),
    ]);

    res.json({
      notes: notes.map((n) => ({
        id: n.id,
        noteNumber: n.noteNumber,
        date: n.date,
        supplierName: n.supplierName,
        supplierNit: n.supplierNit,
        supplierPhone: n.supplierPhone,
        locationId: n.locationId,
        locationName: n.location.name,
        locationType: n.location.type,
        fileUrl: n.fileUrl,
        exchangeRate: n.exchangeRate ? Number(n.exchangeRate) : null,
        expensesPer: n.expensesPer ? Number(n.expensesPer) : null,
        totalUnits: n.totalUnits,
        totalCost: Number(n.totalCost),
        createdAt: n.createdAt,
      })),
      pagination: { total, page: pg, limit: take, pages: Math.ceil(total / take) },
    });
  } catch (error) {
    console.error("Error al listar notas de compra:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /reconcile — Conciliación: Compras − Ventas = saldo esperado vs stock real (filtrable por nota)
router.get("/reconcile", async (req: AuthRequest, res: Response) => {
  try {
    const { noteId, locationId, search, page = "1", limit = "20" } = req.query;

    const purchaseWhere: any = {};
    if (noteId && !Number.isNaN(Number(noteId))) purchaseWhere.noteId = Number(noteId);

    const [purchases, sales, stockBy, products] = await Promise.all([
      prisma.purchaseNoteItem.groupBy({
        by: ["productId"],
        where: purchaseWhere,
        _sum: { quantity: true, lineTotal: true },
      }),
      prisma.saleItem.groupBy({
        by: ["productId"],
        _sum: { quantity: true },
      }),
      prisma.inventory.groupBy({
        by: ["productId"],
        where: locationId && !Number.isNaN(Number(locationId)) ? { locationId: Number(locationId) } : {},
        _sum: { stock: true },
      }),
      prisma.product.findMany({
        select: { id: true, itemCode: true, name: true, brand: true, model: true },
      }),
    ]);

    const purchaseMap = new Map<number, { quantity: number; lineTotal: number }>();
    for (const p of purchases) {
      purchaseMap.set(p.productId, {
        quantity: p._sum.quantity ?? 0,
        lineTotal: p._sum.lineTotal ? Number(p._sum.lineTotal) : 0,
      });
    }
    const salesMap = new Map(purchases.map((p) => [p.productId, 0]));
    for (const s of sales) {
      salesMap.set(s.productId, s._sum.quantity ?? 0);
    }
    const stockMap = new Map<number, number>();
    for (const s of stockBy) {
      stockMap.set(s.productId, s._sum.stock ?? 0);
    }

    let rows = products
      .filter((p) => purchaseMap.has(p.id) || salesMap.has(p.id) || stockMap.has(p.id))
      .map((p) => {
        const purchasesQty = purchaseMap.get(p.id)?.quantity ?? 0;
        const purchasesCost = purchaseMap.get(p.id)?.lineTotal ?? 0;
        const sold = salesMap.get(p.id) ?? 0;
        const expected = purchasesQty - sold;
        const stock = stockMap.get(p.id) ?? 0;
        return {
          productId: p.id,
          itemCode: p.itemCode,
          name: p.name,
          brand: p.brand,
          model: p.model,
          purchases: purchasesQty,
          purchasesCost,
          sales: sold,
          expected,
          stock,
          difference: stock - expected,
        };
      });

    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.itemCode.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.brand.toLowerCase().includes(q) ||
          r.model.toLowerCase().includes(q)
      );
    }

    rows.sort((a, b) => a.name.localeCompare(b.name));
    const total = rows.length;
    const pg = Math.max(1, Number(page) || 1);
    const take = Math.min(200, Math.max(1, Number(limit) || 20));
    const skip = (pg - 1) * take;

    res.json({
      rows: rows.slice(skip, skip + take),
      pagination: { total, page: pg, limit: take, pages: Math.ceil(total / take) },
    });
  } catch (error) {
    console.error("Error en conciliación:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /:id — Detalle de una nota
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const note = await prisma.purchaseNote.findUnique({
      where: { id },
      include: {
        location: { select: { id: true, name: true, type: true } },
        items: {
          include: {
            product: { select: { id: true, itemCode: true, name: true, brand: true, model: true, image: true } },
          },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!note) return res.status(404).json({ message: "Nota de compra no encontrada" });

    res.json({
      note: {
        id: note.id,
        noteNumber: note.noteNumber,
        date: note.date,
        supplierName: note.supplierName,
        supplierNit: note.supplierNit,
        supplierPhone: note.supplierPhone,
        locationId: note.locationId,
        locationName: note.location.name,
        locationType: note.location.type,
        fileUrl: note.fileUrl,
        exchangeRate: note.exchangeRate ? Number(note.exchangeRate) : null,
        expensesPer: note.expensesPer ? Number(note.expensesPer) : null,
        totalUnits: note.totalUnits,
        totalCost: Number(note.totalCost),
        createdAt: note.createdAt,
        items: note.items.map((it) => ({
          id: it.id,
          productId: it.productId,
          itemCode: it.product.itemCode,
          name: it.product.name,
          brand: it.product.brand,
          model: it.product.model,
          image: it.product.image,
          quantity: it.quantity,
          unitCost: Number(it.unitCost),
          price1: it.price1 ? Number(it.price1) : null,
          price2: it.price2 ? Number(it.price2) : null,
          disc20: it.disc20 ? Number(it.disc20) : 0,
          disc30: it.disc30 ? Number(it.disc30) : 0,
          disc40: it.disc40 ? Number(it.disc40) : 0,
          disc50: it.disc50 ? Number(it.disc50) : 0,
          priceD20: it.priceD20 ? Number(it.priceD20) : null,
          priceD30: it.priceD30 ? Number(it.priceD30) : null,
          priceD40: it.priceD40 ? Number(it.priceD40) : null,
          priceD50: it.priceD50 ? Number(it.priceD50) : null,
          lineTotal: Number(it.lineTotal),
        })),
      },
    });
  } catch (error: any) {
    if (error.message === "ID inválido") return res.status(400).json({ message: error.message });
    console.error("Error al obtener nota:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;