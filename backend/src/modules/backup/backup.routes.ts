import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import multer from "multer";
import { authenticate, authorize } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";

const router = Router();
const prisma = new PrismaClient();

// Una copia puede incluir los Excel de facturas guardados como binario.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.use(authenticate);
router.use(authorize("ADMIN"));

// Orden de dependencias: primero las tablas sin relaciones y al final las que
// apuntan a otras. Para borrar se recorre al reves.
const MODELS = [
  { key: "roleModel", table: "RoleModel", hasId: true },
  { key: "location", table: "Location", hasId: true },
  { key: "category", table: "Category", hasId: true },
  { key: "manufacturer", table: "Manufacturer", hasId: true },
  { key: "supplier", table: "Supplier", hasId: true },
  { key: "importer", table: "Importer", hasId: true },
  { key: "customer", table: "Customer", hasId: true },
  { key: "setting", table: "Setting", hasId: false },
  { key: "user", table: "User", hasId: true },
  { key: "product", table: "Product", hasId: true },
  { key: "inventory", table: "Inventory", hasId: true },
  { key: "cost", table: "Cost", hasId: true },
  { key: "productImporter", table: "ProductImporter", hasId: true },
  { key: "sale", table: "Sale", hasId: true },
  { key: "saleItem", table: "SaleItem", hasId: true },
  { key: "payment", table: "Payment", hasId: true },
  { key: "return", table: "Return", hasId: true },
  { key: "quote", table: "Quote", hasId: true },
  { key: "quoteItem", table: "QuoteItem", hasId: true },
  { key: "despatchNote", table: "DespatchNote", hasId: true },
  { key: "despatchNoteItem", table: "DespatchNoteItem", hasId: true },
  { key: "productRequest", table: "ProductRequest", hasId: true },
  { key: "requestHistory", table: "RequestHistory", hasId: true },
  { key: "movement", table: "Movement", hasId: true },
  { key: "purchaseNote", table: "PurchaseNote", hasId: true },
  { key: "purchaseNoteItem", table: "PurchaseNoteItem", hasId: true },
  { key: "invoice", table: "Invoice", hasId: true },
  { key: "invoiceItem", table: "InvoiceItem", hasId: true },
  { key: "invoiceFile", table: "InvoiceFile", hasId: true },
  { key: "notification", table: "Notification", hasId: true },
  { key: "auditLog", table: "AuditLog", hasId: true },
] as const;

const CHUNK_SIZE = 200;

const fileStamp = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
};

// GET /export — descarga un JSON con toda la base de datos.
router.get("/export", async (_req: AuthRequest, res: Response) => {
  try {
    const data: Record<string, any[]> = {};
    for (const model of MODELS) {
      const rows = await (prisma as any)[model.key].findMany(
        model.hasId ? { orderBy: { id: "asc" } } : undefined
      );
      data[model.key] = rows.map((row: any) => {
        if (model.key === "invoiceFile") {
          // Buffer -> base64 para que el JSON sea portatil.
          return { ...row, data: Buffer.from(row.data || []).toString("base64") };
        }
        return row;
      });
    }

    const payload = {
      format: "fercar-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      app: "Inventario Autopartes",
      binaryEncoding: "base64",
      data,
    };

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="respaldo-fercar-${fileStamp()}.json"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(JSON.stringify(payload));
  } catch (error: any) {
    console.error("Error generando respaldo:", error?.message || error);
    res.status(500).json({ message: error?.message || "Error generando la copia de seguridad" });
  }
});

// POST /import — reemplaza toda la base de datos con una copia descargada.
router.post("/import", upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    if (req.body?.confirm !== "RESTAURAR") {
      return res.status(400).json({ message: 'Debes escribir "RESTAURAR" para confirmar.' });
    }
    if (!req.file) return res.status(400).json({ message: "Archivo de respaldo requerido" });

    let payload: any;
    try {
      payload = JSON.parse(req.file.buffer.toString("utf8"));
    } catch {
      return res.status(400).json({ message: "El archivo no es un JSON válido" });
    }

    if (!payload || payload.format !== "fercar-backup" || !payload.data) {
      return res.status(400).json({ message: "El archivo no es una copia de seguridad de FerCar" });
    }

    for (const model of MODELS) {
      if (!Array.isArray(payload.data[model.key])) {
        return res.status(400).json({ message: `La copia está incompleta: falta "${model.key}"` });
      }
    }

    const counts: Record<string, number> = {};

    await prisma.$transaction(
      async (tx) => {
        for (const model of [...MODELS].reverse()) {
          await (tx as any)[model.key].deleteMany({});
        }

        for (const model of MODELS) {
          const rows = payload.data[model.key].map((row: any) => {
            if (model.key === "invoiceFile") {
              return { ...row, data: Buffer.from(String(row.data || ""), "base64") };
            }
            return row;
          });

          for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
            await (tx as any)[model.key].createMany({ data: rows.slice(i, i + CHUNK_SIZE) });
          }
          counts[model.key] = rows.length;
        }

        // Al insertar IDs explícitos hay que adelantar las secuencias; si no,
        // el siguiente registro nuevo chocaría con un ID existente.
        for (const model of MODELS) {
          if (!model.hasId) continue;
          await tx.$executeRawUnsafe(
            `SELECT setval(pg_get_serial_sequence('"${model.table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${model.table}"), 0) + 1, false)`
          );
        }
      },
      { maxWait: 60000, timeout: 600000 }
    );

    res.json({ ok: true, restoredAt: new Date().toISOString(), counts });
  } catch (error: any) {
    console.error("Error restaurando respaldo:", error?.message || error);
    res.status(500).json({ message: error?.message || "Error restaurando la copia de seguridad" });
  }
});

export default router;
