/**
 * Codigos de documento legibles para trazabilidad.
 *
 * El id numerico de la venta por si solo no dice nada: en el papel queda un
 * "12" que no indica de que tienda es ni de que ano, y se confunde con el id
 * de cualquier otra tabla. El codigo se deriva del id y de la fecha, asi que
 * no necesita columna en la base ni backfill, y es estable para siempre.
 *
 * Debe coincidir con backend/src/shared/documentCodes.ts
 */

const yearOf = (date?: Date | string | null): number => {
  if (!date) return new Date().getFullYear();
  const d = typeof date === "string" ? new Date(date) : date;
  return Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
};

/** V-2026-1042 */
export const saleCode = (id: number, date?: Date | string | null): string =>
  `V-${yearOf(date)}-${id}`;

/** COT-2026-0007 */
export const quoteCode = (id: number, date?: Date | string | null): string =>
  `COT-${yearOf(date)}-${String(id).padStart(4, "0")}`;

/**
 * Acepta lo que la persona escribe a mano o pega desde el papel: "1042",
 * "#1042", "V-2026-1042", "v-2026-1042" o "COT-2026-0007". Devuelve el id o null.
 * El codigo es prefijo-año-id, asi que el id es el ULTIMO grupo de digitos.
 */
export const parseSaleCode = (raw: string | number | null | undefined): number | null => {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const groups = text.replace(/^#/, "").match(/\d+/g);
  if (!groups || groups.length === 0) return null;
  const id = Number(groups[groups.length - 1]);
  return Number.isInteger(id) && id > 0 ? id : null;
};
