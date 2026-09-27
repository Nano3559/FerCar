-- Solicitudes: ubicacion de origen, confirmacion por el solicitante y origen del registro
ALTER TABLE "ProductRequest" ADD COLUMN "fromLocationId" INTEGER;
ALTER TABLE "ProductRequest" ADD COLUMN "confirmedById" INTEGER;
ALTER TABLE "ProductRequest" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "ProductRequest" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';

CREATE INDEX "ProductRequest_fromLocationId_idx" ON "ProductRequest"("fromLocationId");
CREATE INDEX "ProductRequest_confirmedById_idx" ON "ProductRequest"("confirmedById");

ALTER TABLE "ProductRequest" ADD CONSTRAINT "ProductRequest_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductRequest" ADD CONSTRAINT "ProductRequest_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
