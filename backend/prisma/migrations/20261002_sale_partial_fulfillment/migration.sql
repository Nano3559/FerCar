-- Entrega parcial de ventas.
--
-- deliveredQuantity separa "vendido" de "entregado": una venta pagada puede
-- quedar con unidades pendientes de llegar desde el almacen. El estado de
-- pago no se toca, porque cobrar y entregar son cosas distintas.

-- ModifyTable
ALTER TABLE "SaleItem" ADD COLUMN     "deliveredQuantity" INTEGER NOT NULL DEFAULT 0;

-- Las ventas ya registradas se marcan como entregadas. Hasta ahora el backend
-- rechazaba la venta si no habia stock en la tienda, asi que todo lo cobrado
-- antes de esta migracion salio fisicamente de la bodega. Sin este backfill
-- quedarian con pendientes que nunca se pidieron y el historial mostraria
-- ventas colgadas que en realidad estan cerradas.
UPDATE "SaleItem" SET "deliveredQuantity" = "quantity";

-- ModifyTable
ALTER TABLE "ProductRequest" ADD COLUMN     "saleId" INTEGER,
ADD COLUMN     "saleItemId" INTEGER;

-- CreateIndex
CREATE INDEX "SaleItem_productId_idx" ON "SaleItem"("productId");

-- CreateIndex
CREATE INDEX "ProductRequest_saleId_idx" ON "ProductRequest"("saleId");

-- CreateIndex
CREATE INDEX "ProductRequest_saleItemId_idx" ON "ProductRequest"("saleItemId");

-- AddForeignKey
ALTER TABLE "ProductRequest" ADD CONSTRAINT "ProductRequest_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRequest" ADD CONSTRAINT "ProductRequest_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;