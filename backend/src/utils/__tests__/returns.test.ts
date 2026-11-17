import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeReturns } from "../returns";

const items = [
  { productId: 1, quantity: 3 },
  { productId: 2, quantity: 2 },
];

test("una venta sin devoluciones no marca nada", () => {
  const r = summarizeReturns(items, []);
  assert.equal(r.hayDevolucion, false);
  assert.equal(r.completa, false);
  assert.equal(r.unidadesVendidas, 5);
  assert.equal(r.unidadesDevueltas, 0);
  assert.equal(r.montoDevuelto, 0);
  assert.deepEqual(r.porProducto, []);
});

test("una devolución parcial no marca la venta como devuelta del todo", () => {
  const r = summarizeReturns(items, [{ productId: 1, quantity: 1, amount: "150.50" }]);
  assert.equal(r.hayDevolucion, true);
  assert.equal(r.completa, false);
  assert.equal(r.unidadesDevueltas, 1);
  assert.equal(r.montoDevuelto, 150.5);
  assert.deepEqual(r.porProducto, [{ productId: 1, quantity: 1, amount: 150.5 }]);
});

test("varias devoluciones parciales del mismo producto se suman", () => {
  const r = summarizeReturns(items, [
    { productId: 1, quantity: 1, amount: 100 },
    { productId: 1, quantity: 2, amount: 200 },
  ]);
  assert.equal(r.unidadesDevueltas, 3);
  assert.equal(r.montoDevuelto, 300);
  assert.deepEqual(r.porProducto, [{ productId: 1, quantity: 3, amount: 300 }]);
});

test("devolver todas las unidades deja la venta como devuelta", () => {
  const r = summarizeReturns(items, [
    { productId: 1, quantity: 3, amount: 300 },
    { productId: 2, quantity: 2, amount: 80 },
  ]);
  assert.equal(r.hayDevolucion, true);
  assert.equal(r.completa, true);
  assert.equal(r.unidadesDevueltas, 5);
  assert.equal(r.montoDevuelto, 380);
});

test("devolver todo en dos tandas también deja la venta como devuelta", () => {
  const r = summarizeReturns(items, [
    { productId: 1, quantity: 2, amount: 200 },
    { productId: 1, quantity: 1, amount: 100 },
    { productId: 2, quantity: 1, amount: 40 },
    { productId: 2, quantity: 1, amount: 40 },
  ]);
  assert.equal(r.completa, true);
  assert.equal(r.unidadesDevueltas, 5);
});

test("ignora cantidades inválidas o negativas en vez de restar", () => {
  const r = summarizeReturns(items, [
    { productId: 1, quantity: -2, amount: -100 },
    { productId: 2, quantity: 0, amount: 0 },
  ]);
  assert.equal(r.unidadesDevueltas, 0);
  assert.equal(r.montoDevuelto, 0);
  assert.equal(r.hayDevolucion, false);
});

test("una venta sin unidades no se marca como devuelta", () => {
  const r = summarizeReturns([], []);
  assert.equal(r.completa, false);
  assert.equal(r.hayDevolucion, false);
});
