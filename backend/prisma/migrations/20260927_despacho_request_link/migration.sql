-- Fusion de solicitudes con la lista de despacho: la nota guarda la tienda
-- destino y la solicitud queda vinculada a la nota que la despacha.
ALTER TABLE "DespatchNote" ADD COLUMN "destinationId" INTEGER;
ALTER TABLE "ProductRequest" ADD COLUMN "despatchNoteId" INTEGER;

CREATE INDEX "DespatchNote_destinationId_idx" ON "DespatchNote"("destinationId");
CREATE INDEX "ProductRequest_despatchNoteId_idx" ON "ProductRequest"("despatchNoteId");

ALTER TABLE "DespatchNote" ADD CONSTRAINT "DespatchNote_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductRequest" ADD CONSTRAINT "ProductRequest_despatchNoteId_fkey" FOREIGN KEY ("despatchNoteId") REFERENCES "DespatchNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
