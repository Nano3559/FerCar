-- Columnas para importación por fabricante (ej. DEPO):
-- unitPrice: precio unitario en USD que viene en el Excel (columna fija).
-- priceHermana: precio calculado para las tiendas hermanas (HERMANAS).
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "unitPrice" DECIMAL(12,2);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "priceHermana" DECIMAL(12,2);