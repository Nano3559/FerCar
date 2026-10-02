import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAndMergeItems, demandByProduct } from "../saleItems";

test("valida y mantiene ítems únicos", () => {
  const items = validateAndMergeItems([
    { productId: 1, quantity: 2, unitPrice: 10 },
    { productId: 2, quantity: 1, unitPrice: 5 },
  ]);
  assert.deepEqual(items, [
    { productId: 1, quantity: 2, unitPrice: 10 },
    { productId: 2, quantity: 1, unitPrice: 5 },
  ]);
});

test("deduplica productos repetidos sumando cantidades", () => {
  const items = validateAndMergeItems([
    { productId: 1, quantity: 2, unitPrice: 10 },
    { productId: 1, quantity: 3, unitPrice: 10 },
    { productId: 1, quantity: 1, unitPrice: 10 },
  ]);
  assert.deepEqual(items, [{ productId: 1, quantity: 6, unitPrice: 10 }]);
});

test("acepta wholesalePrice como precio si no hay unitPrice", () => {
  const items = validateAndMergeItems([
    { productId: 5, quantity: 3, wholesalePrice: 25 },
  ]);
  assert.deepEqual(items, [{ productId: 5, quantity: 3, unitPrice: 25 }]);
});

test("rechaza cantidad no entera menor a 1", () => {
  assert.throws(
    () => validateAndMergeItems([{ productId: 1, quantity: 0, unitPrice: 10 }]),
    /cantidad del producto 1 debe ser un entero mayor a 0/
  );
});

test("rechaza precio unitario menor o igual a 0", () => {
  assert.throws(
    () => validateAndMergeItems([{ productId: 1, quantity: 1, unitPrice: 0 }]),
    /precio unitario del producto 1 debe ser mayor a 0/
  );
});

test("rechaza productId inválido", () => {
  assert.throws(
    () => validateAndMergeItems([{ productId: 0, quantity: 1, unitPrice: 10 }]),
    /productId válido/
  );
  assert.throws(
    () => validateAndMergeItems([{ quantity: 1, unitPrice: 10 }]),
    /productId válido/
  );
});

test("rechaza lista vacía", () => {
  assert.throws(() => validateAndMergeItems([]), /al menos un ítem/);
});

test("conserva líneas del mismo producto con precios distintos", () => {
  // El carrito puede tener el mismo producto en P1 y en P2 (la app los muestra
  // como dos líneas). Si se fusionaran conservando el primer precio, el total
  // cobrado no seria el que el vendedor vio en pantalla.
  const items = validateAndMergeItems([
    { productId: 1, quantity: 1, unitPrice: 100 },
    { productId: 1, quantity: 1, unitPrice: 90 },
  ]);
  assert.deepEqual(items, [
    { productId: 1, quantity: 1, unitPrice: 100 },
    { productId: 1, quantity: 1, unitPrice: 90 },
  ]);
  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  assert.equal(total, 190);
});

test("sigue deduplicando cuando el precio es el mismo", () => {
  const items = validateAndMergeItems([
    { productId: 1, quantity: 2, unitPrice: 10 },
    { productId: 1, quantity: 3, unitPrice: 10 },
  ]);
  assert.deepEqual(items, [{ productId: 1, quantity: 5, unitPrice: 10 }]);
});

test("demandByProduct suma la demanda real para validar stock", () => {
  // Aunque el mismo producto aparezca en varias líneas, el stock se descuenta
  // una sola vez por la suma: es lo que evita la sobreventa.
  const items = validateAndMergeItems([
    { productId: 1, quantity: 1, unitPrice: 100 },
    { productId: 1, quantity: 4, unitPrice: 90 },
    { productId: 2, quantity: 3, unitPrice: 10 },
  ]);
  assert.deepEqual(demandByProduct(items), [
    { productId: 1, quantity: 5 },
    { productId: 2, quantity: 3 },
  ]);
});