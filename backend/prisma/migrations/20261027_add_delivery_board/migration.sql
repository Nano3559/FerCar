-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDIENTE', 'ENTREGADO');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDIENTE';
ALTER TABLE "Sale" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN "deliveredById" INTEGER;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
