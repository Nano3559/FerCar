import { Router, Response } from "express";
import { PrismaClient, InvoiceStatus } from "@prisma/client";
import { authenticate, authorize } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";
import multer from "multer";
import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";

const router = Router();
const prisma = new PrismaClient();

const uploadDir = path.join(__dirname, "../../../uploads/facturas");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.memoryStorage();
const upload = multer({ storage });

const num = (v: any): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const s = String(v).toString().replace(/\s+/g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};
const toDec = (n: number) => Math.round(n * 100000) / 100000;
const money = (n: number) => Math.round(n * 10000) / 10000;

const findCol = (headers: string[], keys: string[]) => {
  const h = headers.map((x) => (x || "").toString().trim().toLowerCase());
  for (let i = 0; i < h.length; i++) {
    const v = h[i];
    if (keys.some((k) => v === k.toLowerCase())) return i;
  }
  return -1;
};

const INV_COLS_MAP: Record<string, string[]> = {
  factoryCode: ["cod fabrica", "cod_fabrica", "codigo fabrica", "factory code", "factorycode", "codfabric", "codigo de fabrica", "codigo fabrica"],
  cantidad: ["cantidad", "qty", "quantity", "cant", "unidades", "unid"],
  costoUSD: ["costo $", "costo$", "cost $", "cost$", "costo usd", "cost usd", "usd", "precio $", "precio$"],
};

const pickSheet = (wb: XLSX.WorkBook) => {
  const names = wb.SheetNames || [];
  const found = names.find((n) => String(n).toUpperCase().includes("ARCHIVO IMPORTAR"));
  if (found) return found;
  return names[0];
};

// TEMPORAL - BORRAR DESPUÉS
router.delete("/clear-all-temp", authenticate, authorize("ADMIN"), async (_req: AuthRequest, res: Response) => {
  try {
    await prisma.invoiceItem.deleteMany({});
    await prisma.invoice.deleteMany({});
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// Endpoint público para ver archivos de factura (sin autenticación)
router.get("/invoice/:filename", (req: AuthRequest, res: Response) => {
  const filename = path.basename(req.params.filename);
  const candidates = [
    path.join(uploadDir, filename),
    path.join(__dirname, "../../../uploads", filename),
    path.join(process.cwd(), "uploads", "facturas", filename),
    path.join(process.cwd(), "uploads", filename),
  ];
  let filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) {
    // Buscar recursivamente en uploads/
    try {
      const uploadsRoot = path.join(process.cwd(), "uploads");
      const walk = (dir: string): string | undefined => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            const found = walk(full);
            if (found) return found;
          } else if (e.isFile() && e.name === filename) {
            return full;
          }
        }
        return undefined;
      };
      filePath = walk(uploadsRoot);
    } catch {}
  }
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ message: "Archivo no encontrado" });
  res.sendFile(filePath);
});

router.get("/", authenticate, authorize("ADMIN"), async (_req: AuthRequest, res: Response) => {
  const invoices = await prisma.invoice.findMany({
    orderBy: { createdAt: "desc" },
  });
  res.json({
    invoices: invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      date: i.date.toISOString().slice(0, 10),
      supplierName: i.supplierName,
      manufacturerName: i.manufacturerName,
      locationName: i.locationName,
      dimCode: i.dimCode,
      totalUnits: i.totalUnits,
      fileUrl: i.fileUrl,
      status: i.status,
      inventoryAppliedAt: i.inventoryAppliedAt ? i.inventoryAppliedAt.toISOString() : null,
      createdAt: i.createdAt.toISOString(),
    })),
  });
});

router.post("/preview", authenticate, authorize("ADMIN"), upload.single("file"), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ message: "Archivo Excel requerido" });
  const wb = XLSX.read(req.file.buffer, { type: "buffer" });
  const sheetName = pickSheet(wb);
  const ws = wb.Sheets[sheetName];
  const rowsRaw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[];
  if (rowsRaw.length < 2) return res.status(400).json({ message: "Archivo vacío" });
  const headers = rowsRaw[0].map((x: any) => (x === null || x === undefined ? "" : String(x)));
  const cFac = findCol(headers, INV_COLS_MAP.factoryCode);
  const cCant = findCol(headers, INV_COLS_MAP.cantidad);
  const cUsd = findCol(headers, INV_COLS_MAP.costoUSD);
  if (cFac < 0 || cCant < 0 || cUsd < 0) return res.status(400).json({ message: "Columnas requeridas: COD FABRICA, CANTIDAD, COSTO $" });

  const items: any[] = [];
  for (let i = 1; i < rowsRaw.length; i++) {
    const r = rowsRaw[i] || [];
    const facRaw = cFac < r.length ? r[cFac] : "";
    const fac = facRaw === null || facRaw === undefined ? "" : String(facRaw).trim();
    if (!fac) continue;
    const cant = Math.max(0, Math.floor(num(cCant < r.length ? r[cCant] : 0)));
    const usd = num(cUsd < r.length ? r[cUsd] : 0);
    if (cant <= 0 || usd <= 0) continue;
    items.push({
      factoryCode: fac,
      quantity: cant,
      costUSD: usd,
      name: "",
      brand: "",
      model: "",
      year: "",
      oemCode: null,
      detail: "",
      price1: null,
      price2: null,
      priceMayor: null,
      productId: null,
    });
  }

  const factoryCodes = items.map((x) => x.factoryCode);
  const existingProducts = await prisma.product.findMany({ where: { factoryCode: { in: factoryCodes } } });
  const productMap = new Map(existingProducts.map((p) => [p.factoryCode, p]));

  const enriched = items.map((it) => {
    const p = productMap.get(it.factoryCode);
    if (!p) return it;
    const p1 = p.price1 === null || p.price1 === undefined ? null : num(p.price1);
    const p2 = p.price2 === null || p.price2 === undefined ? null : num(p.price2);
    const pM = p.wholesalePrice === null || p.wholesalePrice === undefined ? null : num(p.wholesalePrice);
    return {
      ...it,
      productId: p.id,
      itemCode: p.itemCode,
      name: p.name || it.name,
      brand: p.brand || it.brand,
      model: p.model || it.model,
      year: p.year || it.year,
      oemCode: p.oemCode || it.oemCode,
      detail: p.detail || p.detalles || it.detail || "",
      price1: p1,
      price2: p2,
      priceMayor: pM,
    };
  });

  res.json({ count: enriched.length, sheetName, items: enriched });
});

router.post("/import", authenticate, authorize("ADMIN"), upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    const { supplierId, manufacturerId, locationId, exchangeRate, expensesPer, marginTienda, dimCode, items: itemsJson } = req.body as any;
    if (!locationId) return res.status(400).json({ message: "Almacén requerido" });
    const ex = num(exchangeRate) || 0;
    const expPer = num(expensesPer) || 0;
    const mT = num(marginTienda) || 0;
    if (ex <= 0) return res.status(400).json({ message: "Tipo de cambio inválido" });

    const loc = await prisma.location.findUnique({ where: { id: Number(locationId) } });
    if (!loc) return res.status(400).json({ message: "Almacén no encontrado" });
    const sup = supplierId ? await prisma.supplier.findUnique({ where: { id: Number(supplierId) } }) : null;
    const man = manufacturerId ? await prisma.manufacturer.findUnique({ where: { id: Number(manufacturerId) } }) : null;

  let items: any[] = [];
  if (itemsJson) {
    try {
      const parsed = JSON.parse(itemsJson);
      items = parsed
        .filter((x: any) => x.factoryCode)
        .map((x: any) => ({
          factoryCode: String(x.factoryCode).trim(),
          quantity: Math.max(0, Math.floor(num(x.quantity))),
          costUSD: num(x.costUSD),
          name: x.name || "",
          brand: x.brand || "",
          model: x.model || "",
          year: x.year || "",
          oemCode: x.oemCode || null,
          detail: x.detail || x.detalles || "",
          price1: x.price1 !== null && x.price1 !== undefined && x.price1 !== "" ? num(x.price1) : null,
          price2: x.price2 !== null && x.price2 !== undefined && x.price2 !== "" ? num(x.price2) : null,
          priceMayor: x.priceMayor !== null && x.priceMayor !== undefined && x.priceMayor !== "" ? num(x.priceMayor) : null,
          productId: x.productId || null,
          itemCode: x.itemCode || null,
        }))
        .filter((x: any) => x.quantity > 0 && x.costUSD > 0);
    } catch (e: any) {
      console.error("Error parsing items:", e?.message || e);
      return res.status(400).json({ message: "Items inválidos" });
    }
  } else {
    if (!req.file) return res.status(400).json({ message: "Archivo Excel requerido" });
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = pickSheet(wb);
    const ws = wb.Sheets[sheetName];
    const rowsRaw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[];
    const headers = rowsRaw[0].map((x: any) => (x === null || x === undefined ? "" : String(x)));
    const cFac = findCol(headers, INV_COLS_MAP.factoryCode);
    const cCant = findCol(headers, INV_COLS_MAP.cantidad);
    const cUsd = findCol(headers, INV_COLS_MAP.costoUSD);
    if (cFac < 0 || cCant < 0 || cUsd < 0) return res.status(400).json({ message: "Columnas no encontradas" });

    for (let i = 1; i < rowsRaw.length; i++) {
      const r = rowsRaw[i];
      const facRaw = cFac < r.length ? r[cFac] : "";
      const fac = facRaw === null || facRaw === undefined ? "" : String(facRaw).trim();
      if (!fac) continue;
      const cant = Math.max(0, Math.floor(num(cCant < r.length ? r[cCant] : 0)));
      const usd = num(cUsd < r.length ? r[cUsd] : 0);
      if (cant <= 0 || usd <= 0) continue;
      items.push({ factoryCode: fac, quantity: cant, costUSD: usd });
    }
  }
  if (items.length === 0) return res.status(400).json({ message: "No hay filas válidas" });

  const factoryCodes = items.map((x) => x.factoryCode);
  const existingProducts = await prisma.product.findMany({ where: { factoryCode: { in: factoryCodes } } });
  const productMap = new Map(existingProducts.map((p) => [p.factoryCode, p]));

  let totalUnits = 0;
  let totalCostUSD = 0;
  let totalCostBS = 0;
  const invoiceItemsData: any[] = [];

  for (const it of items) {
    totalUnits += it.quantity;
    totalCostUSD += toDec(it.costUSD * it.quantity);
    const costBSUnit = toDec(it.costUSD * (1 + expPer / 100) * ex);
    const costTiendaUnit = toDec(costBSUnit * (1 + mT / 100));
    totalCostBS += toDec(costBSUnit * it.quantity);
    const p = productMap.get(it.factoryCode);
    const base = costBSUnit;
    const mk = (pct: number) => money(base * (1 + pct / 100));
    const pickPrice = (v: any, fallback: any) => {
      if (v !== null && v !== undefined && v !== "") return Number(v);
      if (fallback !== null && fallback !== undefined) return Number(fallback);
      return null;
    };
    invoiceItemsData.push({
      factoryCode: it.factoryCode,
      productId: p?.id || null,
      itemCode: p?.itemCode || null,
      name: it.name || p?.name || "",
      brand: it.brand || p?.brand || "",
      model: it.model || p?.model || "",
      year: it.year || p?.year || "",
      oemCode: it.oemCode || p?.oemCode || null,
      detail: it.detail || null,
      quantity: it.quantity,
      costUSD: toDec(it.costUSD),
      costBS: costBSUnit,
      costTienda: costTiendaUnit,
      price1: pickPrice(it.price1, p?.price1),
      price2: pickPrice(it.price2, p?.price2),
      priceMayor: pickPrice(it.priceMayor, p?.wholesalePrice),
      price10: mk(10),
      price20: mk(20),
      price30: mk(30),
      price40: mk(40),
      price50: mk(50),
      price60: mk(60),
      price70: mk(70),
      price80: mk(80),
      lineTotalBS: toDec(costBSUnit * it.quantity),
    } as any);
  }

  const last = await prisma.invoice.findFirst({ orderBy: { id: "desc" } });
  const nextNum = ((last?.id || 0) + 1).toString().padStart(5, "0");
  const invoiceNumber = `FAC-${nextNum}`;

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      date: new Date(),
      supplierId: sup?.id || null,
      supplierName: sup?.name || "",
      manufacturerId: man?.id || null,
      manufacturerName: man?.name || null,
      locationId: loc.id,
      locationName: loc.name,
      exchangeRate: ex,
      expensesPer: expPer,
      marginTienda: mT,
      dimCode: dimCode || null,
      fileUrl: req.file?.originalname || null,
      totalUnits,
      totalCostUSD: toDec(totalCostUSD),
      totalCostBS: toDec(totalCostBS),
      status: InvoiceStatus.ACTIVA,
      createdById: req.user!.userId,
    } as any,
  });
  await prisma.invoiceItem.createMany({ data: invoiceItemsData.map((x: any) => ({ ...x, invoiceId: invoice.id })) });

  if (req.file && req.file.buffer) {
    try {
      await prisma.invoiceFile.create({
        data: {
          invoiceId: invoice.id,
          filename: req.file.originalname || `${invoice.invoiceNumber}.xlsx`,
          mimeType: req.file.mimetype || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          data: req.file.buffer,
          size: req.file.size || req.file.buffer.length,
        },
      });
    } catch (e: any) {
      console.error("Error guardando archivo de factura:", e?.message || e);
    }
  }

  res.json({ ok: true, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber });
  } catch (e: any) {
    console.error("Error importando factura:", e);
    res.status(500).json({ message: e?.message || "Error importando factura" });
  }
});

router.get("/:id/export-excel", authenticate, authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) return res.status(404).json({ message: "Factura no encontrada" });
  const items = await prisma.invoiceItem.findMany({ where: { invoiceId: inv.id } });
  const data = items.map((it: any) => ({
    PROVEEDOR: inv.supplierName || "",
    FABRICANTE: inv.manufacturerName || "",
    PRODUCTO: it.name || "",
    MARCA: it.brand || "",
    MODELO: it.model || "",
    AÑO: it.year || "",
    DETALLES: it.detail || it.detalles || "",
    "COD OEM": it.oemCode || "",
    "COD FABRICA": it.factoryCode || "",
    "COSTO $": it.costUSD !== null && it.costUSD !== undefined ? Number(it.costUSD) : "",
    "COSTO BS": it.costBS !== null && it.costBS !== undefined ? Number(it.costBS) : "",
    "COSTO TIENDAS": it.costTienda !== null && it.costTienda !== undefined ? Number(it.costTienda) : "",
    "20": it.price20 !== null && it.price20 !== undefined ? Number(it.price20) : "",
    "30": it.price30 !== null && it.price30 !== undefined ? Number(it.price30) : "",
    "40": it.price40 !== null && it.price40 !== undefined ? Number(it.price40) : "",
    "50": it.price50 !== null && it.price50 !== undefined ? Number(it.price50) : "",
    "60": it.price60 !== null && it.price60 !== undefined ? Number(it.price60) : "",
    "70": it.price70 !== null && it.price70 !== undefined ? Number(it.price70) : "",
    "80": it.price80 !== null && it.price80 !== undefined ? Number(it.price80) : "",
    "PRECIO 1": it.price1 !== null && it.price1 !== undefined ? Number(it.price1) : "",
    "PRECIO 2": it.price2 !== null && it.price2 !== undefined ? Number(it.price2) : "",
    "PRECIO MAYOR": it.priceMayor !== null && it.priceMayor !== undefined ? Number(it.priceMayor) : "",
    CANTIDAD: it.quantity !== null && it.quantity !== undefined ? Number(it.quantity) : "",
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "COLUMNAS PARA VEREDITAR");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", `inline; filename="${inv.invoiceNumber}.xlsx"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

router.get("/invoice/:filename", (req: AuthRequest, res: Response) => {
  const filename = path.basename(req.params.filename);
  const candidates = [
    path.join(uploadDir, filename),
    path.join(__dirname, "../../../uploads", filename),
    path.join(process.cwd(), "uploads", "facturas", filename),
    path.join(process.cwd(), "uploads", filename),
  ];
  let filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) {
    try {
      const uploadsRoot = path.join(process.cwd(), "uploads");
      const walk = (dir: string): string | undefined => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            const found = walk(full);
            if (found) return found;
          } else if (e.isFile() && e.name === filename) {
            return full;
          }
        }
        return undefined;
      };
      filePath = walk(uploadsRoot);
    } catch {}
  }
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ message: "Archivo no encontrado" });
  res.sendFile(filePath);
});

router.get("/:id/view-file", async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const file = await prisma.invoiceFile.findUnique({ where: { invoiceId: id } });
    if (!file) return res.status(404).json({ message: "Archivo no encontrado" });
    res.setHeader("Content-Type", file.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `inline; filename="${file.filename.replace(/"/g, '')}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(Buffer.from(file.data));
  } catch (e: any) {
    res.status(500).json({ message: e?.message || "Error" });
  }
});

router.get("/:id/detail", authenticate, authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) return res.status(404).json({ message: "Factura no encontrada" });
    const items = await prisma.invoiceItem.findMany({ where: { invoiceId: id }, orderBy: { id: "asc" } });
    res.json({ invoice, items });
  } catch (e: any) {
    res.status(500).json({ message: e?.message || "Error" });
  }
});

router.put("/:id/items", authenticate, authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { items } = req.body as any;
    if (!Array.isArray(items)) return res.status(400).json({ message: "Items inválidos" });

    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) return res.status(404).json({ message: "Factura no encontrada" });
    if (invoice.inventoryAppliedAt) {
      return res.status(409).json({ message: "El inventario ya fue actualizado. Esta factura no se puede modificar." });
    }

    const ex = Number(invoice.exchangeRate) || 0;
    const expPer = Number(invoice.expensesPer) || 0;
    const mT = Number(invoice.marginTienda) || 0;

    const existing = await prisma.invoiceItem.findMany({ where: { invoiceId: id } });
    const existingMap = new Map(existing.map((x) => [x.id, x]));

    for (const it of items) {
      const itemId = Number(it.id);
      const prev = existingMap.get(itemId);
      if (!prev) continue;

      const quantity = Math.max(0, Math.floor(Number(it.quantity) || 0));
      const costUSD = Math.max(0, Number(it.costUSD) || 0);
      const costBS = toDec(costUSD * (1 + expPer / 100) * ex);
      const costTienda = toDec(costBS * (1 + mT / 100));
      const mk = (pct: number) => money(costBS * (1 + pct / 100));
      const numOrNull = (v: any) => (v !== undefined && v !== null && v !== "" ? Number(v) : null);

      await prisma.invoiceItem.update({
        where: { id: itemId },
        data: {
          name: it.name || "",
          brand: it.brand || "",
          model: it.model || "",
          year: it.year || "",
          oemCode: it.oemCode || null,
          detail: it.detail || null,
          quantity,
          costUSD: toDec(costUSD),
          costBS,
          costTienda,
          price1: numOrNull(it.price1),
          price2: numOrNull(it.price2),
          priceMayor: numOrNull(it.priceMayor),
          price10: mk(10),
          price20: mk(20),
          price30: mk(30),
          price40: mk(40),
          price50: mk(50),
          price60: mk(60),
          price70: mk(70),
          price80: mk(80),
          lineTotalBS: toDec(costBS * quantity),
        } as any,
      });
    }

    const updated = await prisma.invoiceItem.findMany({ where: { invoiceId: id } });
    const totalUnits = updated.reduce((s, x) => s + x.quantity, 0);
    const totalCostUSD = updated.reduce((s, x) => s + Number(x.costUSD) * x.quantity, 0);
    const totalCostBS = updated.reduce((s, x) => s + Number(x.costBS) * x.quantity, 0);

    await prisma.invoice.update({
      where: { id },
      data: {
        totalUnits,
        totalCostUSD: toDec(totalCostUSD),
        totalCostBS: toDec(totalCostBS),
      },
    });

    res.json({ ok: true });
  } catch (e: any) {
    console.error("Error actualizando factura:", e?.message || e);
    res.status(500).json({ message: e?.message || "Error" });
  }
});

router.post("/:id/apply-inventory", authenticate, authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  try {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) return res.status(404).json({ message: "Factura no encontrada" });

    // Bloqueo atómico: solo el primer click aplica el inventario.
    const claim = await prisma.invoice.updateMany({
      where: { id, inventoryAppliedAt: null },
      data: { inventoryAppliedAt: new Date() },
    });
    if (claim.count === 0) {
      return res.status(409).json({ message: "El inventario de esta factura ya fue actualizado." });
    }

    try {
      const items = await prisma.invoiceItem.findMany({ where: { invoiceId: id }, orderBy: { id: "asc" } });
      if (items.length === 0) {
        await prisma.invoice.update({ where: { id }, data: { inventoryAppliedAt: null } });
        return res.status(400).json({ message: "La factura no tiene productos" });
      }

      let applied = 0;
      for (const it of items) {
        if (it.quantity <= 0) continue;

        let product = it.productId
          ? await prisma.product.findUnique({ where: { id: it.productId } })
          : null;
        if (!product && it.factoryCode) {
          product = await prisma.product.findFirst({ where: { factoryCode: it.factoryCode } });
        }
        if (!product && it.itemCode) {
          product = await prisma.product.findFirst({ where: { itemCode: it.itemCode } });
        }

        const price1 = it.price1 !== null && it.price1 !== undefined ? String(it.price1) : null;
        const price2 = it.price2 !== null && it.price2 !== undefined ? String(it.price2) : null;
        const priceMayor = it.priceMayor !== null && it.priceMayor !== undefined ? String(it.priceMayor) : null;

        if (product) {
          // Producto existente: se actualizan datos y se aplican los precios nuevos.
          const data: any = {
            name: it.name || product.name,
            brand: it.brand || product.brand,
            model: it.model || product.model,
            year: it.year || product.year,
            oemCode: it.oemCode ?? product.oemCode,
            detail: it.detail ?? product.detail,
            detalles: it.detail ?? product.detalles,
            cost: String(it.costBS),
          };
          if (price1 !== null) data.price1 = price1;
          if (price2 !== null) data.price2 = price2;
          if (priceMayor !== null) data.wholesalePrice = priceMayor;
          await prisma.product.update({ where: { id: product.id }, data });
        } else {
          let itemCode = it.itemCode || it.factoryCode || `P-${Date.now()}-${Math.round(Math.random() * 999)}`;
          const taken = await prisma.product.findUnique({ where: { itemCode } });
          if (taken) itemCode = `P-${Date.now()}-${Math.round(Math.random() * 999)}`;

          product = await prisma.product.create({
            data: {
              itemCode,
              factoryCode: it.factoryCode || null,
              manufacturer: invoice.manufacturerName || "",
              name: it.name || it.factoryCode || "SIN NOMBRE",
              brand: it.brand || "",
              model: it.model || "",
              year: it.year || "",
              oemCode: it.oemCode || null,
              detail: it.detail || null,
              detalles: it.detail || null,
              price1: price1 ?? "0",
              price2: price2 ?? "0",
              wholesalePrice: priceMayor,
              cost: String(it.costBS),
            } as any,
          });
        }

        await prisma.inventory.upsert({
          where: { productId_locationId: { productId: product.id, locationId: invoice.locationId } },
          create: { productId: product.id, locationId: invoice.locationId, stock: it.quantity },
          update: { stock: { increment: it.quantity } },
        });

        if (it.productId !== product.id || it.itemCode !== product.itemCode) {
          await prisma.invoiceItem.update({
            where: { id: it.id },
            data: { productId: product.id, itemCode: product.itemCode },
          });
        }
        applied++;
      }

      const updated = await prisma.invoiceItem.findMany({ where: { invoiceId: id } });
      const totalUnits = updated.reduce((s, x) => s + x.quantity, 0);
      const totalCostUSD = updated.reduce((s, x) => s + Number(x.costUSD) * x.quantity, 0);
      const totalCostBS = updated.reduce((s, x) => s + Number(x.costBS) * x.quantity, 0);

      const finalInvoice = await prisma.invoice.update({
        where: { id },
        data: { totalUnits, totalCostUSD: toDec(totalCostUSD), totalCostBS: toDec(totalCostBS) },
      });

      res.json({
        ok: true,
        appliedItems: applied,
        inventoryAppliedAt: finalInvoice.inventoryAppliedAt ? finalInvoice.inventoryAppliedAt.toISOString() : null,
      });
    } catch (e: any) {
      // Si algo falla, se libera el bloqueo para poder reintentar.
      await prisma.invoice.updateMany({ where: { id }, data: { inventoryAppliedAt: null } });
      throw e;
    }
  } catch (e: any) {
    console.error("Error actualizando inventario:", e?.message || e);
    res.status(500).json({ message: e?.message || "Error actualizando inventario" });
  }
});

export default router;
