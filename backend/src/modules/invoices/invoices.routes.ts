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

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: (err: Error | null, dest: string) => void) => cb(null, uploadDir),
  filename: (_req: any, file: any, cb: (err: Error | null, name: string) => void) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
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

const pickSheet = (wb: XLSX.WorkBook) => wb.SheetNames[0];

// Endpoint público para ver archivos de factura (sin autenticación)
router.get("/invoice/:filename", (req: AuthRequest, res: Response) => {
  const filename = path.basename(req.params.filename);
  let filePath = path.join(uploadDir, filename);
  if (!fs.existsSync(filePath)) {
    // Fallback: buscar también en uploads/ raíz (archivos antiguos)
    const altDir = path.join(__dirname, "../../../uploads");
    const altPath = path.join(altDir, filename);
    if (fs.existsSync(altPath)) {
      filePath = altPath;
    } else {
      return res.status(404).json({ message: "Archivo no encontrado" });
    }
  }
  res.sendFile(filePath);
});

router.get("/", authenticate, authorize("ADMIN"), async (_req: AuthRequest, res: Response) => {
  const invoices = await prisma.invoice.findMany({
    orderBy: { createdAt: "desc" },
    include: { supplier: true, manufacturer: true, location: true },
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
      createdAt: i.createdAt.toISOString(),
    })),
  });
});

router.post("/preview", authenticate, authorize("ADMIN"), upload.single("file"), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ message: "Archivo Excel requerido" });
  const wb = XLSX.readFile(req.file.path);
  const sheetName = pickSheet(wb);
  const ws = wb.Sheets[sheetName];
  const rowsRaw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[];
  if (rowsRaw.length < 2) return res.status(400).json({ message: "Archivo vacío" });
  const headers = rowsRaw[0].map((x: any) => (x === null || x === undefined ? "" : String(x)));
  const cFac = findCol(headers, INV_COLS_MAP.factoryCode);
  const cCant = findCol(headers, INV_COLS_MAP.cantidad);
  const cUsd = findCol(headers, INV_COLS_MAP.costoUSD);
  if (cFac < 0 || cCant < 0 || cUsd < 0) return res.status(400).json({ message: "Columnas requeridas: COD FABRICA, CANTIDAD, COSTO $" });
  let count = 0;
  for (let i = 1; i < rowsRaw.length; i++) {
    const r = rowsRaw[i];
    const fac = cFac < r.length ? r[cFac] : "";
    if (fac === "" || fac === null || fac === undefined) continue;
    count++;
  }
  res.json({ count, sheetName });
});

router.post("/import", authenticate, authorize("ADMIN"), upload.single("file"), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ message: "Archivo Excel requerido" });
  const { supplierId, manufacturerId, locationId, exchangeRate, expensesPer, marginTienda, dimCode } = req.body as any;
  if (!locationId) return res.status(400).json({ message: "Almacén requerido" });
  const ex = num(exchangeRate) || 0;
  const expPer = num(expensesPer) || 0;
  const mT = num(marginTienda) || 0;
  if (ex <= 0) return res.status(400).json({ message: "Tipo de cambio inválido" });

  const loc = await prisma.location.findUnique({ where: { id: Number(locationId) } });
  if (!loc) return res.status(400).json({ message: "Almacén no encontrado" });
  const sup = supplierId ? await prisma.supplier.findUnique({ where: { id: Number(supplierId) } }) : null;
  const man = manufacturerId ? await prisma.manufacturer.findUnique({ where: { id: Number(manufacturerId) } }) : null;

  const wb = XLSX.readFile(req.file.path);
  const sheetName = pickSheet(wb);
  const ws = wb.Sheets[sheetName];
  const rowsRaw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[];
  const headers = rowsRaw[0].map((x: any) => (x === null || x === undefined ? "" : String(x)));
  const cFac = findCol(headers, INV_COLS_MAP.factoryCode);
  const cCant = findCol(headers, INV_COLS_MAP.cantidad);
  const cUsd = findCol(headers, INV_COLS_MAP.costoUSD);
  if (cFac < 0 || cCant < 0 || cUsd < 0) return res.status(400).json({ message: "Columnas no encontradas" });

  const items: any[] = [];
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
  if (items.length === 0) return res.status(400).json({ message: "No hay filas válidas" });

  const factoryCodes = items.map((x) => x.factoryCode);
  const existingProducts = await prisma.product.findMany({ where: { factoryCode: { in: factoryCodes } } });

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
    const p = existingProducts.find((ep) => ep.factoryCode === it.factoryCode);
    const base = costBSUnit;
    const mk = (pct: number) => money(base * (1 + pct / 100));
    invoiceItemsData.push({
      factoryCode: it.factoryCode,
      productId: p?.id || null,
      itemCode: p?.itemCode || null,
      name: p?.name || "",
      brand: p?.brand || "",
      model: p?.model || "",
      year: p?.year || "",
      oemCode: p?.oemCode || null,
      quantity: it.quantity,
      costUSD: toDec(it.costUSD),
      costBS: costBSUnit,
      costTienda: costTiendaUnit,
      price1: p?.price1 ? Number(p.price1) : null,
      price2: p?.price2 ? Number(p.price2) : null,
      priceMayor: p?.wholesalePrice ? Number(p.wholesalePrice) : null,
      price10: mk(10),
      price20: mk(20),
      price30: mk(30),
      price40: mk(40),
      price50: mk(50),
      price60: mk(60),
      price70: mk(70),
      price80: mk(80),
      lineTotalBS: toDec(costBSUnit * it.quantity),
    });
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
      fileUrl: req.file.filename,
      totalUnits,
      totalCostUSD: toDec(totalCostUSD),
      totalCostBS: toDec(totalCostBS),
      status: InvoiceStatus.ACTIVA,
      createdById: req.user!.userId,
      items: { create: invoiceItemsData },
    },
    include: { items: true },
  });

  for (const it of invoice.items) {
    if (it.productId && it.quantity > 0) {
      await prisma.inventory.upsert({
        where: { productId_locationId: { productId: it.productId, locationId: loc.id } },
        create: { productId: it.productId, locationId: loc.id, stock: it.quantity },
        update: { stock: { increment: it.quantity } },
      });
    } else if (!it.productId) {
      const pCreated = await prisma.product.create({
        data: {
          itemCode: `P-${Date.now()}-${Math.round(Math.random() * 999)}`,
          manufacturer: man?.name || "",
          name: it.name || `Producto ${it.factoryCode}`,
          brand: it.brand || "",
          model: it.model || "",
          year: it.year || "",
          factoryCode: it.factoryCode,
          oemCode: it.oemCode || null,
          price1: it.price1 ? it.price1.toString() : "0",
          price2: it.price2 ? it.price2.toString() : "0",
          wholesalePrice: it.priceMayor ? it.priceMayor.toString() : null,
          cost: it.costBS ? it.costBS.toString() : null,
        },
      });
      await prisma.invoiceItem.update({ where: { id: it.id }, data: { productId: pCreated.id, itemCode: pCreated.itemCode } });
      await prisma.inventory.create({ data: { productId: pCreated.id, locationId: loc.id, stock: it.quantity } });
    }
  }

  res.json({ ok: true, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber });
});

router.get("/:id/export-excel", authenticate, authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { items: true } });
  if (!inv) return res.status(404).json({ message: "Factura no encontrada" });
  const data = inv.items.map((it) => ({
    "COD FABRICA": it.factoryCode || "",
    "PRODUCTO": it.name || "",
    "MARCA": it.brand || "",
    "MODELO": it.model || "",
    "AÑO": it.year || "",
    "PRECIO MAYOR": it.priceMayor !== null && it.priceMayor !== undefined ? Number(it.priceMayor) : "",
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Factura");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", `attachment; filename=${inv.invoiceNumber}.xlsx`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

router.get("/invoice/:filename", (req: AuthRequest, res: Response) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(uploadDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: "Archivo no encontrado" });
  res.sendFile(filePath);
});

export default router;
