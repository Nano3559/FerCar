-- Añade la columna "active" a la tabla User para permitir desactivar usuarios
-- (inactivación sin eliminar, cuando un usuario se retira).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;