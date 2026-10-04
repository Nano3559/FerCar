import { test } from "node:test";
import assert from "node:assert/strict";
import { startOfLocalDay, endOfLocalDay, saleDateRange } from "../dateRange";

// El backend corre en America/La_Paz (UTC-4). Estos tests arman los instantes
// esperados con los mismos constructores que usa el codigo, asi que siguen
// valiendo aunque la maquina que los corre este en otra zona horaria.
const localMs = (y: number, m: number, d: number, h: number, min: number, s: number, ms: number) =>
  new Date(y, m - 1, d, h, min, s, ms).getTime();

test("startOfLocalDay arranca a medianoche LOCAL, no a medianoche UTC", () => {
  // Este era el bug: new Date("2026-10-04") es UTC, y en La Paz cae en la noche
  // del 3. El filtro arrancaba 4 horas antes del dia pedido.
  const start = startOfLocalDay("2026-10-04");
  assert.ok(start);
  assert.equal(start!.getTime(), localMs(2026, 10, 4, 0, 0, 0, 0));
});

test("endOfLocalDay cierra al final del dia LOCAL e incluye todo el dia", () => {
  const end = endOfLocalDay("2026-10-04");
  assert.ok(end);
  assert.equal(end!.getTime(), localMs(2026, 10, 4, 23, 59, 59, 999));
});

test("un dia cubre las 24 horas completas", () => {
  const start = startOfLocalDay("2026-10-04")!;
  const end = endOfLocalDay("2026-10-04")!;
  const horas = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  assert.ok(Math.abs(horas - 24) < 0.001, `esperaba 24 horas, dio ${horas}`);
});

test("una venta hecha tarde ese dia SI cae dentro del rango", () => {
  // La queja original: filtrar por el 4 no mostraba las ventas de la tarde del
  // 4. Con 23:59:59.999 locales, una venta de las 18:00 del 4 esta dentro.
  const end = endOfLocalDay("2026-10-04")!;
  const ventaTarde = new Date(2026, 9, 4, 18, 0, 0, 0);
  assert.ok(ventaTarde.getTime() <= end.getTime());
});

test("rechaza una fecha con texto", () => {
  assert.equal(startOfLocalDay("ayer"), null);
  assert.equal(startOfLocalDay(""), null);
  assert.equal(startOfLocalDay("2026-10-04T10:00"), null);
});

test("rechaza un dia que no existe en vez de ajustarlo al siguiente", () => {
  // new Date(2026, 1, 31) se convierte solo en 3 de marzo.
  assert.equal(startOfLocalDay("2026-02-31"), null);
  assert.equal(endOfLocalDay("2026-02-31"), null);
});

test("saleDateRange devuelve null si no hay fechas, para no filtrar de mas", () => {
  assert.equal(saleDateRange(), null);
  assert.equal(saleDateRange(undefined, undefined), null);
  assert.equal(saleDateRange("", ""), null);
});

test("el rango de un solo dia cubre ese dia entero", () => {
  const r = saleDateRange("2026-10-04", "2026-10-04");
  assert.ok(r);
  assert.equal(r!.gte!.getTime(), localMs(2026, 10, 4, 0, 0, 0, 0));
  assert.equal(r!.lte!.getTime(), localMs(2026, 10, 4, 23, 59, 59, 999));
});

test("solo 'Desde' arranca a las 00:00 de ese dia", () => {
  const r = saleDateRange("2026-10-01");
  assert.ok(r!.gte);
  assert.equal(r!.lte, undefined);
});

test("solo 'Hasta' cierra al final de ese dia", () => {
  const r = saleDateRange(undefined, "2026-10-31");
  assert.ok(r!.lte);
  assert.equal(r!.lte!.getTime(), localMs(2026, 10, 31, 23, 59, 59, 999));
  assert.equal(r!.gte, undefined);
});

test("acomoda un rango invertido en vez de devolver historial vacio", () => {
  // Del 10 al 5 no devolvia nada y no habia aviso de por que.
  const r = saleDateRange("2026-10-10", "2026-10-05");
  assert.ok(r);
  assert.equal(r!.gte!.getTime(), localMs(2026, 10, 5, 0, 0, 0, 0));
  assert.equal(r!.lte!.getTime(), localMs(2026, 10, 10, 23, 59, 59, 999));
});

test("una fecha invalida se ignora en vez de romper la consulta", () => {
  // Antes una fecha rota llegaba como Date invalida a Prisma y el listado
  // reventaba con 500 en vez de mostrar los datos sin ese filtro.
  const r = saleDateRange("no-es-fecha", "2026-10-04");
  assert.ok(r);
  assert.equal(r!.gte, undefined);
  assert.ok(r!.lte);
});

test("ignora valores que no son string", () => {
  assert.equal(saleDateRange(["2026-10-04"], { a: 1 }), null);
});