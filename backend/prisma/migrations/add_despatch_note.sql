CREATE TYPE "DespatchNoteStatus" AS ENUM ('EMITIDA', 'ENTREGADA', 'ANULADA');

CREATE TABLE "DespatchNote" (
    "id" SERIAL NOT NULL,
    "noteNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "totalUnits" INTEGER NOT NULL DEFAULT 0,
    "status" "DespatchNoteStatus" NOT NULL DEFAULT 'EMITIDA',
    "entregadoA" TEXT,
    "entregadoAt" TIMESTAMP(3),
    "observacion" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "cancelledBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DespatchNote_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DespatchNote" ADD CONSTRAINT "DespatchNote_noteNumber_key" UNIQUE ("noteNumber");
ALTER TABLE "DespatchNote" ADD CONSTRAINT "DespatchNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DespatchNoteItem" (
    "id" SERIAL NOT NULL,
    "noteId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "itemCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "locationId" INTEGER NOT NULL,
    "locationName" TEXT NOT NULL,
    "locationType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DespatchNoteItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DespatchNoteItem" ADD CONSTRAINT "DespatchNoteItem_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "DespatchNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DespatchNoteItem" ADD CONSTRAINT "DespatchNoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DespatchNoteItem_noteId_idx" ON "DespatchNoteItem"("noteId");
CREATE INDEX "DespatchNoteItem_productId_idx" ON "DespatchNoteItem"("productId");