-- Agregar campo de nota/recordatorio a las ventas
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "note" TEXT;