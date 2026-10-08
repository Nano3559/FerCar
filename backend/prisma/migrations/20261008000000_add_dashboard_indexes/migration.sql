-- Indices que faltaban en las tablas que consulta el dashboard.
--
-- Un indice es solo una estructura de busqueda auxiliar: no cambia ningun
-- dato ni ninguna respuesta, solo hace mas rapidos los filtros, ordenes y
-- agrupaciones que el dashboard hace sobre estas tablas.
--
-- CREATE INDEX CONCURRENTLY no puede correr dentro de la transaccion que usa
-- Prisma, pero con el volumen actual de estas tablas la pausa al crearlos es
-- minima. Se usa IF NOT EXISTS para que el script se pueda repetir sin error.

CREATE INDEX IF NOT EXISTS "Sale_saleDate_idx" ON "Sale"("saleDate");
CREATE INDEX IF NOT EXISTS "Sale_locationId_idx" ON "Sale"("locationId");
CREATE INDEX IF NOT EXISTS "Sale_userId_idx" ON "Sale"("userId");
CREATE INDEX IF NOT EXISTS "Inventory_locationId_idx" ON "Inventory"("locationId");
CREATE INDEX IF NOT EXISTS "Movement_date_idx" ON "Movement"("date");
CREATE INDEX IF NOT EXISTS "Payment_saleId_idx" ON "Payment"("saleId");
CREATE INDEX IF NOT EXISTS "SaleItem_saleId_idx" ON "SaleItem"("saleId");
CREATE INDEX IF NOT EXISTS "ProductRequest_status_createdAt_idx" ON "ProductRequest"("status", "createdAt");
