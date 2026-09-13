CREATE TYPE "PurchaseNoteStatus" AS ENUM ('ACTIVA', 'ANULADA');
ALTER TABLE "PurchaseNote" ADD COLUMN "status" "PurchaseNoteStatus" NOT NULL DEFAULT 'ACTIVA';
ALTER TABLE "PurchaseNote" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "PurchaseNote" ADD COLUMN "cancelledReason" TEXT;
ALTER TABLE "PurchaseNote" ADD COLUMN "cancelledBy" INTEGER;