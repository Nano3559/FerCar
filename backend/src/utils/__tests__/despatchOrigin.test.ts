import { test } from "node:test";
import assert from "node:assert/strict";
import {
  origenDeSolicitud,
  origenYaDescontado,
  alcanzaParaDespachar,
  claveProductoOrigen,
  type DatosDespachoOrigen,
} from "../despatchOrigin";

const venta = (fromLocationId: number | null, saleItemId: number | null): DatosDespachoOrigen => ({
  fromLocationId,
  saleItemId,
  locationId: 1,
});

test("el origen explícito gana sobre el destino", () => {
  assert.equal(origenDeSolicitud(venta(11, 55)), 11);
});

test("una solicitud vieja sin origen usa el destino", () => {
  assert.equal(origenDeSolicitud(venta(null, 55)), 1);
});

test("una solicitud de venta ya tiene el origen descontado", () => {
  assert.equal(origenYaDescontado(venta(11, 55)), true);
});

test("una solicitud armada a mano no lo tiene descontado", () => {
  assert.equal(origenYaDescontado(venta(11, null)), false);
});

test("una solicitud de venta se despacha aunque el origen ya haya bajado", () => {
  // El bug: se pidieron 3 de SILES, la venta descontó las 3 y quedaron en 0.
  // Comparar 0 >= 3 rechazaba una entrega que sí se podía hacer.
  assert.equal(alcanzaParaDespachar(venta(11, 55), 3, 0), true);
});

test("una solicitud de venta se despacha aunque el origen esté en cero", () => {
  assert.equal(alcanzaParaDespachar(venta(11, 55), 20, 0), true);
});

test("una solicitud manual sin stock no se despacha", () => {
  assert.equal(alcanzaParaDespachar(venta(11, null), 5, 3), false);
});

test("una solicitud manual con stock exacto sí se despacha", () => {
  assert.equal(alcanzaParaDespachar(venta(11, null), 3, 3), true);
});

test("un stock negativo nunca alcanza", () => {
  assert.equal(alcanzaParaDespachar(venta(11, null), 1, -5), false);
});

test("el mismo producto en dos orígenes da claves distintas", () => {
  // El bug: las 3 solicitudes de una venta repartida eran del mismo producto, y
  // un mapa por producto solo guardaba una, dejando el movimiento de SILES
  // registrado como si hubiera salido de FALSURI.
  assert.notEqual(claveProductoOrigen(8, 11), claveProductoOrigen(8, 12));
});

test("la clave es estable para el mismo producto y origen", () => {
  assert.equal(claveProductoOrigen(8, 11), claveProductoOrigen(8, 11));
});

test("dos productos en el mismo origen dan claves distintas", () => {
  assert.notEqual(claveProductoOrigen(8, 11), claveProductoOrigen(9, 11));
});