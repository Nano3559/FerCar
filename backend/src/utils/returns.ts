// Resumen de devoluciones de una venta.
//
// La venta y sus devoluciones viven en tablas distintas, así que el listado de
// ventas no sabía si una venta tenía productos devueltos: se veía igual una
// venta intacta que una devuelta por completo. Este resumen se calcula en un
// solo lugar para que el historial, el detalle y la nota digan lo mismo.

export interface SoldLineLike {
  productId: number;
  quantity: number;
}

export interface ReturnLineLike {
  productId: number;
  quantity: number;
  amount: unknown;
}

export interface ProductReturnSummary {
  productId: number;
  quantity: number;
  amount: number;
}

export interface ReturnSummary {
  /** Unidades vendidas en la venta (todas las líneas). */
  unidadesVendidas: number;
  /** Unidades devueltas hasta ahora (suma de todas las devoluciones). */
  unidadesDevueltas: number;
  /** Monto devuelto en Bs. */
  montoDevuelto: number;
  /** true si hay al menos una devolución registrada. */
  hayDevolucion: boolean;
  /** true si se devolvió todo lo vendido. */
  completa: boolean;
  /** Devoluciones agrupadas por producto, para marcarlas en el detalle. */
  porProducto: ProductReturnSummary[];
}

const toNumber = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Calcula el estado de devolución de una venta.
 *
 * `completa` compara unidades, no montos: si se vendieron 3 y se devolvieron 3
 * (aunque haya sido en varias devoluciones parciales), la venta queda devuelta.
 * Las cantidades negativas o inválidas se ignoran en vez de restar.
 */
export const summarizeReturns = (
  items: SoldLineLike[],
  returns: ReturnLineLike[],
): ReturnSummary => {
  const unidadesVendidas = items.reduce(
    (sum, i) => sum + Math.max(0, Math.trunc(toNumber(i.quantity))),
    0,
  );

  const porProducto = new Map<number, ProductReturnSummary>();
  let unidadesDevueltas = 0;
  let montoDevuelto = 0;

  for (const r of returns) {
    const quantity = Math.max(0, Math.trunc(toNumber(r.quantity)));
    // Una devolución sin unidades no aporta ni unidades ni monto: si la
    // cantidad viene inválida, tampoco se suma su importe.
    if (quantity <= 0) continue;
    const amount = toNumber(r.amount);
    unidadesDevueltas += quantity;
    montoDevuelto += amount;

    const acc = porProducto.get(r.productId) || { productId: r.productId, quantity: 0, amount: 0 };
    acc.quantity += quantity;
    acc.amount = round2(acc.amount + amount);
    porProducto.set(r.productId, acc);
  }

  return {
    unidadesVendidas,
    unidadesDevueltas,
    montoDevuelto: round2(montoDevuelto),
    hayDevolucion: unidadesDevueltas > 0,
    completa: unidadesVendidas > 0 && unidadesDevueltas >= unidadesVendidas,
    porProducto: [...porProducto.values()],
  };
};
