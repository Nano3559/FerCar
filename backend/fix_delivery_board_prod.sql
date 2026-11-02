-- Aplica la migracion pendiente de la pizarra de entregas.
-- Es idempotente: se puede ejecutar varias veces sin romper nada.
-- Motivo: en produccion la tabla _prisma_migrations esta vacia y las
-- columnas nunca se crearon, por lo que cualquier consulta a "Sale" falla.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeliveryStatus') THEN
    CREATE TYPE "DeliveryStatus" AS ENUM ('PENDIENTE', 'ENTREGADO');
  END IF;
END $$;

ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDIENTE';
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "deliveredById" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Sale_deliveredById_fkey'
  ) THEN
    ALTER TABLE "Sale"
      ADD CONSTRAINT "Sale_deliveredById_fkey"
      FOREIGN KEY ("deliveredById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Indices de la migracion 20261008000000_add_dashboard_indexes (tambien pendiente)
CREATE INDEX IF NOT EXISTS "Sale_saleDate_idx" ON "Sale"("saleDate");
CREATE INDEX IF NOT EXISTS "Sale_locationId_idx" ON "Sale"("locationId");
CREATE INDEX IF NOT EXISTS "Sale_userId_idx" ON "Sale"("userId");
CREATE INDEX IF NOT EXISTS "Inventory_locationId_idx" ON "Inventory"("locationId");
CREATE INDEX IF NOT EXISTS "Movement_date_idx" ON "Movement"("date");
CREATE INDEX IF NOT EXISTS "Payment_saleId_idx" ON "Payment"("saleId");
CREATE INDEX IF NOT EXISTS "SaleItem_saleId_idx" ON "SaleItem"("saleId");
CREATE INDEX IF NOT EXISTS "ProductRequest_status_createdAt_idx" ON "ProductRequest"("status", "createdAt");
