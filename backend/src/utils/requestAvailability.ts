// Cuanto se puede pedir a mano de un producto sin passarse.
//
// Una solicitud manual no reserva nada: la mercaderia sigue en su ubicacion
// hasta que se despacha. Como no descuenta al crearse, tres solicitudes
// seguidas podian Commitmentar mas de lo que existe en toda la cadena (el caso
// reportado: un producto con 20 unidades en total y un pedido de 37).
//
// La regla es que la suma de lo que hay en todas las tiendas y almacenes, menos
// lo que ya esta comprometido en solicitudes abiertas, es el techo. No se
// recorta en silencio: si el pedido excede el techo la ruta lo rechaza con el
// numero exacto, para que el vendedor decida.

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
 * `nombre` es el nombre del producto para que el mensaje sea util.
 */
export const errorSiExcede = (
  cantidad: number,
  disp: Disponibilidad,
  nombre: string,
): string | null => {
  if (cantidad <= disp.disponible) return null;
  if (disp.totalCadena === 0) {
    return `"${nombre}" no tiene stock en ninguna tienda ni almacén: no hay nada que pedir.`;
  }
  if (disp.comprometido > 0) {
    return (
      `No podés pedir ${cantidad} unidades de "${nombre}": hay ${disp.totalCadena} en toda la cadena ` +
      `y ${disp.comprometido} ya están comprometidas en solicitudes abiertas, así que quedan ${disp.disponible}.`
    );
  }
  return (
    `No podés pedir ${cantidad} unidades de "${nombre}": en todas las tiendas y almacenes hay ${disp.totalCadena}.`
  );
};