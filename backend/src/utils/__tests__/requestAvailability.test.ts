import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularDisponibilidad,
  errorSiExcede,
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
  const d = calcularDisponibilidad(stock(20), [{ quantity: 8, source: "MANUAL" }]);
  assert.equal(d.comprometido, 8);
  assert.equal(d.disponible, 12);
});

test("no cuenta las solicitudes de venta porque su stock ya bajó", () => {
  const d = calcularDisponibilidad(stock(20), [{ quantity: 15, source: "VENTA" }]);
  assert.equal(d.comprometido, 0);
  assert.equal(d.disponible, 20);
});

test("acumula varias solicitudes abiertas", () => {
  const d = calcularDisponibilidad(stock(20), [
    { quantity: 6, source: "MANUAL" },
    { quantity: 9, source: "STOCK_MINIMO" },
  ]);
  assert.equal(d.disponible, 5);
});

test("el disponible nunca queda negativo", () => {
  const d = calcularDisponibilidad(stock(4), [{ quantity: 30, source: "MANUAL" }]);
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
  const d = calcularDisponibilidad(stock(20), [{ quantity: 8, source: "MANUAL" }]);
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