// Cuanto se puede pedir a una ubicacion sin pasarse.
//
// Una solicitud abierta que todavia NO descontó el origen mantiene su
// mercaderia prometida pero fisicamente quieta ahi. El techo se calcula por
// ubicacion ORIGEN: lo que hay en la tienda/almacen al que se le pide, menos lo
// que esas solicitudes ya prometieron desde ese mismo origen.
//
// Antes se sumaba toda la cadena, asi que se podian pedir 3 unidades a una
// tienda que solo tenia 2 mientras hubiera stock en cualquier otra ubicacion
// (el caso reportado: SILES con 2 y dos pedidos de 2 y 1).
//
// Las solicitudes atadas a una linea de venta NO se cuentan: su origen ya se
// desconto al cobrar la venta (ver origenYaDescontado), asi que restarlas de
// nuevo lo contaria dos veces.

// Mientras no se entregue, estas solicitudes todavia no movieron nada.
export const ESTADOS_ABIERTOS = [
  "PENDIENTE",
  "RECIBIDO_POR_INVENTARIO",
  "PREPARANDO",
  "ENTREGADO",
] as const;

export interface SolicitudViva {
  quantity: number;
  /** Linea de venta que la origino. Si es null, el origen aun no se descontó. */
  saleItemId?: number | null;
}

export interface Disponibilidad {
  /** Stock de la ubicacion evaluada (el origen). */
  totalCadena: number;
  /** Cuanto de ese stock ya esta prometido por solicitudes abiertas sin descontar. */
  comprometido: number;
  /** Cuanto se puede pedir todavia. Nunca negativo. */
  disponible: number;
}

/**
 * true si la solicitud todavia tiene su mercaderia en el origen: no la descontó
 * al crearse. Es el mismo criterio que usa el despacho (origenYaDescontado).
 */
export const retieneStockEnOrigen = (s: SolicitudViva): boolean =>
  s.saleItemId === null || s.saleItemId === undefined;

/**
 * Calcula el techo. Las solicitudes con linea de venta se ignoran porque su
 * stock ya baja del origen cuando se cobra la venta.
 */
export const calcularDisponibilidad = (
  filasInventario: { stock: number }[],
  solicitudesAbiertas: SolicitudViva[],
): Disponibilidad => {
  const totalCadena = filasInventario.reduce((s, f) => s + Math.max(0, f.stock || 0), 0);
  const comprometido = solicitudesAbiertas
    .filter(retieneStockEnOrigen)
    .reduce((s, r) => s + Math.max(0, r.quantity || 0), 0);
  return { totalCadena, comprometido, disponible: Math.max(0, totalCadena - comprometido) };
};

/**
 * Mensaje de error si la cantidad excede el techo, o null si esta bien.
 * `nombre` es el nombre del producto para que el mensaje sea util. `origen` es
 * el nombre de la ubicacion a la que se le pide; si se omite el mensaje habla
 * de "toda la cadena".
 */
export const errorSiExcede = (
  cantidad: number,
  disp: Disponibilidad,
  nombre: string,
  origen?: string | null,
): string | null => {
  if (cantidad <= disp.disponible) return null;
  const donde = origen ? `en ${origen}` : "en toda la cadena";
  if (disp.totalCadena === 0) {
    return origen
      ? `"${nombre}" no tiene stock en ${origen}: no hay nada que pedir de ahí.`
      : `"${nombre}" no tiene stock en ninguna tienda ni almacén: no hay nada que pedir.`;
  }
  if (disp.comprometido > 0) {
    return (
      `No podés pedir ${cantidad} unidades de "${nombre}": ${donde} hay ${disp.totalCadena} ` +
      `y ${disp.comprometido} ya están comprometidas en solicitudes abiertas, así que quedan ${disp.disponible}.`
    );
  }
  return `No podés pedir ${cantidad} unidades de "${nombre}": ${donde} hay ${disp.totalCadena}.`;
};
