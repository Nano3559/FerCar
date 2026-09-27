import { test } from "node:test";
import assert from "node:assert/strict";
import { saleCode, quoteCode, parseSaleCode } from "../documentCodes";

test("saleCode usa el anio de la fecha de la venta, no el de hoy", () => {
  assert.equal(saleCode(1042, new Date("2026-03-09T10:00:00Z")), "V-2026-1042");
  assert.equal(saleCode(7, new Date("2025-12-31T23:00:00Z")), "V-2025-7");
});

test("saleCode cae al anio actual si no hay fecha", () => {
  assert.equal(saleCode(1), `V-${new Date().getFullYear()}-1`);
});

test("quoteCode completa con ceros para que el papel se lea bien", () => {
  assert.equal(quoteCode(7, "2026-01-02"), "COT-2026-0007");
  assert.equal(quoteCode(1234, "2026-01-02"), "COT-2026-1234");
});

test("parseSaleCode acepta lo que se escribe a mano o se pega del papel", () => {
  assert.equal(parseSaleCode("1042"), 1042);
  assert.equal(parseSaleCode("#1042"), 1042);
  assert.equal(parseSaleCode("V-2026-1042"), 1042);
  assert.equal(parseSaleCode("  v-2026-1042  "), 1042);
  assert.equal(parseSaleCode("COT-2026-0007"), 7);
  assert.equal(parseSaleCode(1042), 1042);
});

test("parseSaleCode rechaza lo que no es una venta", () => {
  assert.equal(parseSaleCode(""), null);
  assert.equal(parseSaleCode("hola"), null);
  assert.equal(parseSaleCode("0"), null);
  assert.equal(parseSaleCode(null), null);
  assert.equal(parseSaleCode(undefined), null);
});
