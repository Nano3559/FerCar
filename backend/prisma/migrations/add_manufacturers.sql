-- Registro de fabricantes para seleccion rapida al crear/importar productos.
CREATE TABLE IF NOT EXISTS "Manufacturer" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Manufacturer_name_key" ON "Manufacturer"("name");