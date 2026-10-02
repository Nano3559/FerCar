export interface RawSaleItem {
  productId?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  wholesalePrice?: unknown;
}

export interface ValidatedSaleItem {
  productId: number;
  quantity: number;
  unitPrice: number;
}

/**
 * Valida y deduplica los ítems de una venta.
 * Combina cantidades del mismo producto **con el mismo precio** y rechaza
 * cantidades/precios no positivos. Lanza Error con mensajes claros (los
 * handlers lo convierten en respuesta 400).
 *
 * Un mismo producto puede legitimately aparecer en dos líneas con precios
 * distintos (P1 y P2). Antes se fusionaban conservando el primer precio y el
 * total cobrado no coincidía con el que el vendedor veía en pantalla, así que
 * esas líneas se conservan separadas.
 */
export function validateAndMergeItems(items: RawSaleItem[]): ValidatedSaleItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Debe enviar al menos un ítem (items)");
  }

  const totals = new Map<string, { productId: number; quantity: number; unitPrice: number }>();
  for (const it of items) {
    const productId = Number(it.productId);
    const quantity = Number(it.quantity);
    const unitPrice = Number(it.unitPrice || it.wholesalePrice || 0);

    if (!Number.isInteger(productId) || productId < 1) {
      throw new Error("Cada ítem debe tener un productId válido");
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error(`La cantidad del producto ${productId} debe ser un entero mayor a 0`);
    }
    if (isNaN(unitPrice) || unitPrice <= 0) {
      throw new Error(`El precio unitario del producto ${productId} debe ser mayor a 0`);
    }

    const key = `${productId}:${unitPrice}`;
    const prev = totals.get(key);
    if (prev) {
      prev.quantity += quantity;
    } else {
      totals.set(key, { productId, quantity, unitPrice });
    }
  }

  return Array.from(totals.values()).map(({ productId, quantity, unitPrice }) => ({
    productId,
    quantity,
    unitPrice,
  }));
}

/**
 * Cantidad total que se pide de cada producto, sumando todas sus líneas.
 * El stock se descuenta una sola vez por producto: validar línea por línea
 * dejaría pasar dos líneas del mismo producto que juntas superan el stock.
 */
export function demandByProduct(
  items: ValidatedSaleItem[],
): { productId: number; quantity: number }[] {
  const totals = new Map<number, number>();
  for (const it of items) {
    totals.set(it.productId, (totals.get(it.productId) ?? 0) + it.quantity);
  }
  return Array.from(totals.entries()).map(([productId, quantity]) => ({ productId, quantity }));
}