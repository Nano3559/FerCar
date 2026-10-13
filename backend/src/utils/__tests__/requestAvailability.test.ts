import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularDisponibilidad,
  errorSiExcede,
  retieneStockEnOrigen,
  type Disponibilidad,
} from "../requestAvailability";

const stock = (n: number) => [{ stock: n }];

test("suma el stock de todas las ubicaciones de la cadena", () => {
  // El caso reportado: 20 en total entre todas las tiendas y almacenes.
  const d = calcularDisponibilidad([{ stock: 0 }, { stock: 3 }, { stock: 17 }], []);
  assert.equal(d.totalCadena, 20);
  assert.equal(d.disponible, 20);
});

test("sin solicitudes abiertas se puede pedir todo el stock", () => {
  const d = calcularDisponibilidad(stock(20), []);
  assert.equal(d.disponible, 20);
});

test("descuenta lo que ya está comprometido en solicitudes abiertas", () => {
  const d = calcularDisponibilidad(stock(20), [{ quantity: 8 }]);
  assert.equal(d.comprometido, 8);
  assert.equal(d.disponible, 12);
});

test("no cuenta las solicitudes de venta porque su origen ya bajó", () => {
  // Con línea de venta el origen se descuenta al cobrar: contarla restaría doble.
  const d = calcularDisponibilidad(stock(20), [{ quantity: 15, saleItemId: 55 }]);
  assert.equal(d.comprometido, 0);
  assert.equal(d.disponible, 20);
});

test("una solicitud sin línea de venta compromete aunque sea reposición", () => {
  const d = calcularDisponibilidad(stock(2), [{ quantity: 2, saleItemId: null }]);
  assert.equal(d.comprometido, 2);
  assert.equal(d.disponible, 0);
});

test("retieneStockEnOrigen distingue por línea de venta", () => {
  assert.equal(retieneStockEnOrigen({ quantity: 1 }), true);
  assert.equal(retieneStockEnOrigen({ quantity: 1, saleItemId: null }), true);
  assert.equal(retieneStockEnOrigen({ quantity: 1, saleItemId: 9 }), false);
});

test("acumula varias solicitudes abiertas", () => {
  const d = calcularDisponibilidad(stock(20), [{ quantity: 6 }, { quantity: 9 }]);
  assert.equal(d.disponible, 5);
});

test("el disponible nunca queda negativo", () => {
  const d = calcularDisponibilidad(stock(4), [{ quantity: 30 }]);
  assert.equal(d.disponible, 0);
});

test("un stock negativo en la base no resta disponibilidad", () => {
  const d = calcularDisponibilidad([{ stock: -5 }, { stock: 10 }], []);
  assert.equal(d.totalCadena, 10);
});

test("acepta pedir exactamente el total disponible", () => {
  const d = calcularDisponibilidad(stock(20), []);
  assert.equal(errorSiExcede(20, d, "TYD1126CIR"), null);
});

test("rechaza pedir 37 cuando en toda la cadena hay 20", () => {
  const d = calcularDisponibilidad(stock(20), []);
  const err = errorSiExcede(37, d, "TYD1126CIR");
  assert.ok(err);
  assert.match(err, /37/);
  assert.match(err, /20/);
  assert.match(err, /TYD1126CIR/);
});

test("el error dice cuánto queda cuando ya hay solicitudes abiertas", () => {
  const d = calcularDisponibilidad(stock(20), [{ quantity: 8 }]);
  const err = errorSiExcede(15, d, "TYD1126CIR");
  assert.ok(err);
  assert.match(err, /quedan 12/);
});

test("avisa cuando el producto no tiene stock en ninguna parte", () => {
  const d = calcularDisponibilidad(stock(0), []);
  const err = errorSiExcede(5, d, "TYD1126CIR");
  assert.ok(err);
  assert.match(err, /no tiene stock/i);
});

test("sin error devuelve null", () => {
  const d: Disponibilidad = { totalCadena: 20, comprometido: 0, disponible: 20 };
  assert.equal(errorSiExcede(3, d, "X"), null);
});

test("el mensaje nombra el origen y lo que queda cuando se pasa la ubicación", () => {
  // El caso reportado: SILES con 2 y una solicitud de 1 encima de otra de 2.
  const d = calcularDisponibilidad([{ stock: 2 }], [{ quantity: 2 }]);
  const err = errorSiExcede(1, d, "P015", "SILES");
  assert.ok(err);
  assert.match(err, /SILES/);
  assert.match(err, /quedan 0/);
});

test("avisa cuando el origen no tiene stock", () => {
  const d = calcularDisponibilidad([{ stock: 0 }], []);
  const err = errorSiExcede(1, d, "P015", "SILES");
  assert.ok(err);
  assert.match(err, /no tiene stock en SILES/);
});
