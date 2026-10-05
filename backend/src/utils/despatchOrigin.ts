// Que hay que hacer con el stock de origen al despachar.
//
// Hay dos tipos de solicitud y se comportan distinto:
//
// - La que nace de una venta ya discounted su origen en el momento de cobrar,
//   para que dos ventas no pudieran pedir la misma unidad. Al despachar NO se
//   vuelve a descontar: la mercaderia ya salio de ahi. Lo que falta es que
//   llegue al destino.
// - La que se arma a mano (un pedido de sucursal, una reposicion) si descuenta
//   aqui, porque hasta ahora no habia salido de ningun lado.
//
// La distincion importa: comparar el stock del origen sin mirar esto daba
// siempre falso en las de venta (ya habia bajado) y hacia rejectar entregas que
// si se podían hacer, dejando mercaderia que ya estaba en camino.

export interface DatosDespachoOrigen {
  /** Nullable: las solicitudes viejas no tienen origen explicito. */
  fromLocationId: number | null;
  /** Vincula la solicitud con una linea de venta, si nacio de una venta. */
  saleItemId: number | null;
  locationId: number;
}

/** De donde sale fisicamente la mercaderia. */
export const origenDeSolicitud = (d: DatosDespachoOrigen): number =>
  d.fromLocationId ?? d.locationId;

/**
 * true si el origen ya fue descontado antes de llegar a la nota, o sea que la
 * mercaderia ya salio de ahi y no hay que restarla otra vez.
 */
export const origenYaDescontado = (d: DatosDespachoOrigen): boolean =>
  d.saleItemId !== null && d.saleItemId !== undefined;

/**
 * Si hay stock suficiente en el origen para despachar esta solicitud.
 *
 * Con el stock ya descontado la comparacion no dice nada: lo que se pide es
 * mercaderia que ya esta en camino, asi que siempre alcanza.
 */
export const alcanzaParaDespachar = (
  d: DatosDespachoOrigen,
  cantidad: number,
  stockEnOrigen: number,
): boolean => (origenYaDescontado(d) ? true : stockEnOrigen >= cantidad);

/** Clave para emparejar solicitudes e items de nota del mismo producto y origen. */
export const claveProductoOrigen = (productId: number, origenId: number): string =>
  `${productId}:${origenId}`;