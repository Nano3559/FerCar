-- Sincroniza la base con schema.prisma: campos y modelos que fueron
-- agregados a la base local a mano y no tenían migración.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "detalles" TEXT;

ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "paraQuien" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "lugarEntrega" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "datosFactura" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "formaPago" TEXT;

ALTER TABLE "ProductRequest" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "ProductRequest" ADD COLUMN IF NOT EXISTS "expectedDate" TIMESTAMP(3);

-- Alinear enum RequestStatus con schema.prisma
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'RequestStatus' AND e.enumlabel = 'RECIBIDO_POR_INVENTARIO'
  ) THEN
    ALTER TABLE "ProductRequest" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TYPE "RequestStatus" RENAME TO "RequestStatus_old";
    CREATE TYPE "RequestStatus" AS ENUM ('PENDIENTE', 'RECIBIDO_POR_INVENTARIO', 'PREPARANDO', 'ENTREGADO', 'RECIBIDO_POR_TIENDA', 'CANCELADO');
    ALTER TABLE "ProductRequest" ALTER COLUMN "status" TYPE "RequestStatus" USING "status"::text::"RequestStatus";
    DROP TYPE "RequestStatus_old";
    ALTER TABLE "ProductRequest" ALTER COLUMN "status" SET DEFAULT 'PENDIENTE';
  END IF;
END $$;

-- CreateTable RequestHistory
CREATE TABLE IF NOT EXISTS "RequestHistory" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "userRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable AuditLog
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" INTEGER,
    "oldValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable Notification
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "linkUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- FKs
ALTER TABLE "RequestHistory" ADD CONSTRAINT "RequestHistory_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ProductRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestHistory" ADD CONSTRAINT "RequestHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;