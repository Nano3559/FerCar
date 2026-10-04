// Rango de fechas para los filtros del historial. Sin esto, un filtro por dia
// recortaba las ventas del propio dia.
//
// El problema: `new Date("2026-10-04")` no es medianoche del 4, es medianoche
// UTC. En Bolivia (UTC-4) eso es el 3 de octubre a las 20:00. Despues se
// llamaba a setHours(23,59,59,999), que si usa hora local, y el resultado era
// 2026-10-04T03:59Z, o sea el 3 de octubre a las 23:59. El filtro "Del 4 al 4"
// cubria 4 horas de la noche del 3, y las ventas del dia 4 a partir de las
// 00:00 quedaban afuera. Por eso el rango se veía cortado.
//
// Aqui los dos extremos se arman pegando "T23:59:59.999" a la fecha, que si se
// interpreta como hora local, y el "Desde" usa T00:00:00.000. Asi el filtro de
// un dia cubre ese dia entero en hora de Bolivia, que es lo que el vendedor
// espera ver.
//
// Las fechas llegan del <input type="date"> como "YYYY-MM-DD". Se validan aqui
// porque si viniera "ayer" o un string raro, new Date(...) daria una fecha
// invalida y Prisma lanzaria al consultar.
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Inicio del dia, inclusive, en hora local del servidor. */
export const startOfLocalDay = (value: string): Date | null => {
  const m = DATE_ONLY.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  // Un dia como 2026-02-31 se ajusta solo al 3 de marzo; eso no es un filtro
  // valido y traeria resultados sin avisar.
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3])
    ? d
    : null;
};

/** Fin del dia, inclusive, en hora local del servidor. */
export const endOfLocalDay = (value: string): Date | null => {
  const m = DATE_ONLY.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3])
    ? d
    : null;
};

/**
 * Arma el filtro saleDate del historial. Devuelve null cuando no hay rango, y
 * tambien cuando la fecha viene mal formada: antes una fecha invalida pasaba
 * directo a Prisma y reventaba el listado con un 500 en vez de ignorar el
 * filtro.
 */
export const saleDateRange = (startDate?: unknown, endDate?: unknown): { gte?: Date; lte?: Date } | null => {
const startStr = typeof startDate === "string" && startDate ? startDate : "";
  const endStr = typeof endDate === "string" && endDate ? endDate : "";
  if (!startStr && !endStr) return null;

  const from = startStr ? startOfLocalDay(startStr) : null;
  const to = endStr ? endOfLocalDay(endStr) : null;

  // "Del 10 al 5": se invirtió el rango y no devolvia nada, sin explicar por
  // que. Se rearman los extremos con los dias correctos, no se intercambian
  // los instantes: intercambiar daria como "desde" el final del dia 5, que
  // dejaria afuera casi todo ese dia.
  if (from && to && from > to) {
    return { gte: startOfLocalDay(endStr)!, lte: endOfLocalDay(startStr)! };
  }

  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = from;
  if (to) range.lte = to;
  return range;
};