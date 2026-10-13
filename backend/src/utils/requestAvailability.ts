// Cuanto se puede pedir a mano de un producto sin passarse.
//
// Una solicitud manual no reserva nada: la mercaderia sigue en su ubicacion
// hasta que se despacha. Como no descuenta al crearse, tres solicitudes
// seguidas podian Commitmentar mas de lo que existe en toda la cadena (el caso
// reportado: un producto con 20 unidades en total y un pedido de 37).
//
// El techo se calcula por ubicacion ORIGEN: lo que hay en la tienda/almacen al
// que se le pide, menos lo que ya esta comprometido en solicitudes abiertas de
// ese mismo origen. Antes se sumaba toda la cadena, asi que se podian pedir 3
// unidades a una tienda que solo tenia 2 mientras hubiera stock en cualquier
// otra ubicacion (el caso reportado: SILES con 2 y dos pedidos de 2 y 1).
// No se recorta en silencio: si el pedido excede el techo la ruta lo rechaza
// con el numero exacto, para que el vendedor decida.

// Las de venta no se suman: su stock ya se desconto al cobrar, o sea que ya
// estan fuera del inventario disponible.
export const SOURCES_MANUALES = new Set(["MANUAL", "STOCK_MINIMO"]);

// Mientras no se entregue, estas solicitudes todavia no movieron nada.
export const ESTADOS_ABIERTOS = [
  "PENDIENTE",
  "RECIBIDO_POR_INVENTARIO",
  "PREPARANDO",
  "ENTREGADO",
] as const;

export interface SolicitudViva {
  quantity: number;
  source: string | null;
}

export interface Disponibilidad {
  /** Suma del stock del producto en todas las ubicaciones. */
  totalCadena: number;
  /** Cuanto de ese stock ya esta prometido en solicitudes abiertas. */
  comprometido: number;
  /** Cuanto se puede pedir todavia. Nunca negativo. */
  disponible: number;
}

/**
 * Calcula el techo de una solicitud manual. Las solicitudes de venta se
 * ignoran porque su stock ya bajo cuando se cobro la venta.
 */
export const calcularDisponibilidad = (
  filasInventario: { stock: number }[],
  solicitudesAbiertas: SolicitudViva[],
): Disponibilidad => {
  const totalCadena = filasInventario.reduce((s, f) => s + Math.max(0, f.stock || 0), 0);
  const comprometido = solicitudesAbiertas
    .filter((s) => !s.source || SOURCES_MANUALES.has(s.source))
    .reduce((s, r) => s + Math.max(0, r.quantity || 0), 0);
  return { totalCadena, comprometido, disponible: Math.max(0, totalCadena - comprometido) };
};

/**
 * Mensaje de error si la cantidad excede el techo, o null si esta bien.
 * `nombre` es el nombre del producto para que el mensaje sea util. `origen` es
 * el nombre de la ubicacion a la que se le pide; si se omite el mensaje habla
 * de "toda la cadena" (compatibilidad con el techo global).
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