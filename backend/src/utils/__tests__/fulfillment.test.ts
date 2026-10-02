import { test } from "node:test";
import assert from "node:assert/strict";
import { planFulfillment, summarizeFulfillment, loadStockSnapshot } from "../fulfillment";

test("entrega lo que hay en tienda y deja el resto pendiente", () => {
  const plan = planFulfillment([{ productId: 1, quantity: 15 }], { 1: { store: 10, warehouses: 20 } });
  assert.deepEqual(plan.lines, [{ index: 0, productId: 1, requested: 15, sellable: 15, delivered: 10, pending: 5 }]);
  assert.equal(plan.capped.length, 0);
});

test("si el almacen no alcanza, se vende solo lo que hay", () => {
  // Tienda 10, ningun almacen: el cliente pidio 15 pero no existen. Se venden 10
  // y se avisa, en vez de dejar una venta que nunca se va a poder completar.
  const plan = planFulfillment([{ productId: 1, quantity: 15 }], { 1: { store: 10, warehouses: 0 } });
  assert.deepEqual(plan.lines, [{ index: 0, productId: 1, requested: 15, sellable: 10, delivered: 10, pending: 0 }]);
  assert.deepEqual(plan.capped, [{ productId: 1, requested: 15, sellable: 10, missing: 5 }]);
});

test("el tope por producto no toca los demas", () => {
  const plan = planFulfillment(
    [{ productId: 1, quantity: 15 }, { productId: 2, quantity: 3 }],
    { 1: { store: 10, warehouses: 0 }, 2: { store: 3, warehouses: 0 } },
  );
  assert.deepEqual(plan.lines, [
    { index: 0, productId: 1, requested: 15, sellable: 10, delivered: 10, pending: 0 },
    { index: 1, productId: 2, requested: 3, sellable: 3, delivered: 3, pending: 0 },
  ]);
  assert.equal(plan.capped.length, 1);
  assert.equal(plan.capped[0].productId, 1);
});

test("sin stock en ningun lado la linea desaparece y se avisa", () => {
  const plan = planFulfillment([{ productId: 1, quantity: 3 }], { 1: { store: 0, warehouses: 0 } });
  assert.deepEqual(plan.lines, []);
  assert.deepEqual(plan.capped, [{ productId: 1, requested: 3, sellable: 0, missing: 3 }]);
});

test("las lineas del mismo producto comparten el stock disponible", () => {
  // Mismo producto en P1 y P2: la tienda tiene 3 unidades y se piden 2 y 4.
  // Se entregan 2 y 1; la tercera linea queda con 3 pendientes.
  const plan = planFulfillment(
    [{ productId: 1, quantity: 2 }, { productId: 1, quantity: 4 }],
    { 1: { store: 3, warehouses: 10 } },
  );
  assert.deepEqual(plan.lines, [
    { index: 0, productId: 1, requested: 2, sellable: 2, delivered: 2, pending: 0 },
    { index: 1, productId: 1, requested: 4, sellable: 4, delivered: 1, pending: 3 },
  ]);
  const delivered = plan.lines.reduce((s, l) => s + l.delivered, 0);
  assert.equal(delivered, 3);
});

test("el almacen solo cubre lo que queda tras la tienda", () => {
  // Tienda 4, almacen 3, se piden 10: se entregan 4, 3 quedan pendientes y 3
  // se descartan por no existir en ningun lado.
  const plan = planFulfillment([{ productId: 1, quantity: 10 }], { 1: { store: 4, warehouses: 3 } });
  assert.deepEqual(plan.lines, [{ index: 0, productId: 1, requested: 10, sellable: 7, delivered: 4, pending: 3 }]);
  assert.deepEqual(plan.capped, [{ productId: 1, requested: 10, sellable: 7, missing: 3 }]);
});

test("un producto sin informacion de stock se trata como vacio", () => {
  const plan = planFulfillment([{ productId: 9, quantity: 2 }], {});
  assert.deepEqual(plan.lines, []);
  assert.deepEqual(plan.capped, [{ productId: 9, requested: 2, sellable: 0, missing: 2 }]);
});

test("el resumen de entrega cuenta lo que falta por linea", () => {
  const resumen = summarizeFulfillment([
    { id: 1, productId: 1, quantity: 15, deliveredQuantity: 10 },
    { id: 2, productId: 2, quantity: 3, deliveredQuantity: 3 },
  ]);
  assert.equal(resumen.pendientes, 5);
  assert.equal(resumen.pedidas, 18);
  assert.equal(resumen.entregadas, 13);
  assert.equal(resumen.completa, false);
  assert.equal(resumen.lineas[0].pending, 5);
  assert.equal(resumen.lineas[1].pending, 0);
});

test("una venta totalmente entregada figura completa", () => {
  const resumen = summarizeFulfillment([{ id: 1, productId: 1, quantity: 4, deliveredQuantity: 4 }]);
  assert.equal(resumen.completa, true);
  assert.equal(resumen.pendientes, 0);
});

// --- loadStockSnapshot ---

const dbConFilas = (filas: any[]) => ({
  inventory: { findMany: async () => filas },
});

test("el snapshot separa tienda y almacenes", () => {
  const db = dbConFilas([
    { productId: 1, locationId: 10, stock: 10, location: { type: "TIENDA" } },
    { productId: 1, locationId: 20, stock: 6, location: { type: "ALMACEN" } },
    { productId: 1, locationId: 21, stock: 4, location: { type: "ALMACEN" } },
  ]);
  return loadStockSnapshot(db, [1], 10).then((s) => {
    assert.deepEqual(s[1], { store: 10, warehouses: 10 });
  });
});

test("el stock de otra tienda no cuenta como disponible", () => {
  // TUMUSLA tiene 99 pero la venta es en FALSURI, que no tiene nada. Prometer
  // esas unidades dejaria pedidos que no se pueden entregar.
  const db = dbConFilas([
    { productId: 1, locationId: 10, stock: 99, location: { type: "TIENDA" } },
    { productId: 1, locationId: 20, stock: 5, location: { type: "ALMACEN" } },
  ]);
  return loadStockSnapshot(db, [1], 11).then((s) => {
    assert.deepEqual(s[1], { store: 0, warehouses: 5 });
  });
});

test("vender desde un almacen no cuenta ese almacen dos veces", () => {
  // Si la venta se registra en un ALMACEN, sus unidades son stock de tienda y
  // no pueden sumarse tambien como almacen.
  const db = dbConFilas([
    { productId: 1, locationId: 20, stock: 7, location: { type: "ALMACEN" } },
    { productId: 1, locationId: 21, stock: 3, location: { type: "ALMACEN" } },
  ]);
  return loadStockSnapshot(db, [1], 20).then((s) => {
    assert.deepEqual(s[1], { store: 7, warehouses: 3 });
  });
});

test("producto pedido sin filas de inventario da cero, no undefined", () => {
  return loadStockSnapshot(dbConFilas([]), [1, 2], 10).then((s) => {
    assert.deepEqual(s[1], { store: 0, warehouses: 0 });
    assert.deepEqual(s[2], { store: 0, warehouses: 0 });
  });
});

test("sin productos no se consulta nada", async () => {
  let consulto = false;
  const db = { inventory: { findMany: async () => { consulto = true; return []; } } };
  assert.deepEqual(await loadStockSnapshot(db, [], 10), {});
  assert.equal(consulto, false);
});