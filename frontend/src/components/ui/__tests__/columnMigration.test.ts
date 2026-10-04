import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateCols, applyColumnMigration, resolveVisibleColumns, latestMigrationVersion } from "../columnMigration";

// Reproduce el ciclo completo: guardar lo que el usuario eligio y despues
// resolver que columnas mostrar, como hace la pagina al montar y el gestor al
// abrirse. Asi se fija el comportamiento que se rompio dos veces: ocultar una
// columna y que volviera a aparecer sola al recargar.

const COLS = ["Código", "Fecha", "Cliente", "Datos de envío", "Usuario", "Estado", "Nota"];

type Store = Record<string, string>;
const mkStore = (): Store => ({});

// Como en ColumnManager: un JSON roto se trata como "sin preferencia", nunca
// como un error que rompa la pantalla.
const readStored = (s: Store, m: string): string[] | null => {
  try {
    const raw = s[`columns_${m}`];
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
};
const readVersion = (s: Store, m: string): number => {
  const raw = Number(s[`columns_v_${m}`]);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
};
// Replica de persistColumns + resolveVisibleColumns del gestor.
const persist = (s: Store, m: string, cols: string[], version: number) => {
  s[`columns_${m}`] = JSON.stringify(cols);
  s[`columns_v_${m}`] = String(version);
  const prefs = JSON.parse(s.columnPrefs || "{}");
  prefs[m] = cols;
  s.columnPrefs = JSON.stringify(prefs);
};
const resolve = (s: Store, m: string, available: string[] = COLS): string[] => {
  const { columns, version } = resolveVisibleColumns(m, readStored(s, m), available, readVersion(s, m));
  persist(s, m, columns, version);
  return columns;
};
// Lo que hace el boton Aplicar: guarda la lista y deja marcada la version
// vigente de las migraciones.
const save = (s: Store, m: string, chosen: string[]) => persist(s, m, chosen, latestMigrationVersion(m));

test("migrateCols traduce los encabezados viejos", () => {
  assert.deepEqual(migrateCols(["#", "ID", "Tienda"]), ["Código", "Código", "Ubicación"]);
});

test("migrateCols descarta columnas que ya no existen", () => {
  // "Celular" paso dentro de "Datos de factura"; sin descartar ocupaba un hueco
  // invisible y el usuario creia tener menos columnas de las que pedia.
  const r = migrateCols(["Código", "Celular", "Fecha"], COLS);
  assert.ok(!r.includes("Celular"));
  assert.deepEqual(r, ["Código", "Fecha"]);
});

test("sin lista guardada se muestran todas las columnas", () => {
  const s = mkStore();
  assert.deepEqual(resolve(s, "ventas"), COLS);
});

test("las columnas nuevas se agregan una sola vez", () => {
  const s = mkStore();
  const primera = resolve(s, "ventas");
  const segunda = resolve(s, "ventas");
  assert.deepEqual(primera, segunda);
  assert.ok(primera.includes("Estado"));
});

test("ocultar una columna y recargar la deja oculta", () => {
  // Guion exacto del usuario: oculta "Nota", aplica, recarga, y "Nota" seguia
  // en pantalla.
  const s = mkStore();
  resolve(s, "ventas");
  save(s, "ventas", COLS.filter((c) => c !== "Nota"));
  const recarga = resolve(s, "ventas");
  assert.ok(!recarga.includes("Nota"), "la columna oculta reaparecio");
});

test("aguanta varias recargas seguidas sin volver a agregar la columna", () => {
  const s = mkStore();
  resolve(s, "ventas");
  save(s, "ventas", COLS.filter((c) => c !== "Estado"));
  for (let i = 0; i < 5; i++) {
    assert.ok(!resolve(s, "ventas").includes("Estado"), `reaparecio en la recarga ${i}`);
  }
});

test("ocultar varias columnas a la vez se sostiene", () => {
  const s = mkStore();
  resolve(s, "ventas");
  save(s, "ventas", COLS.filter((c) => c !== "Nota" && c !== "Usuario" && c !== "Datos de envío"));
  const recarga = resolve(s, "ventas");
  assert.deepEqual(recarga, ["Código", "Fecha", "Cliente", "Estado"]);
});

test("la version se escribe al guardar", () => {
  // Lo que faltaba en el arreglo anterior: save() guardaba la lista pero no la
  // version, y como la tabla se arma antes que el gestor, la migracion volvia a
  // correr en la recarga.
  const s = mkStore();
  resolve(s, "ventas");
  assert.ok(readVersion(s, "ventas") > 0, "la migracion no dejo marcada su version");
  save(s, "ventas", COLS.filter((c) => c !== "Cliente"));
  assert.equal(readVersion(s, "ventas"), latestMigrationVersion("ventas"));
});

test("dejar solo una columna visible se respeta", () => {
  const s = mkStore();
  resolve(s, "ventas");
  save(s, "ventas", ["Código"]);
  assert.deepEqual(resolve(s, "ventas"), ["Código"]);
});

test("una lista vacia guardada vuelve a las columnas migradas, no se cuela ninguna otra", () => {
  const s = mkStore();
  resolve(s, "ventas");
  save(s, "ventas", ["Fecha"]);
  const recarga = resolve(s, "ventas");
  assert.deepEqual(recarga, ["Fecha"]);
});

test("los datos rotos no rompen la pagina", () => {
  const s = mkStore();
  s.columns_ventas = "{no es json";
  assert.deepEqual(resolve(s, "ventas"), COLS);
});

test("un modulo sin migraciones respeta lo guardado tal cual", () => {
  const s = mkStore();
  save(s, "inventario", ["Código", "Precio"]);
  assert.deepEqual(resolve(s, "inventario", ["Código", "Precio", "Stock"]), ["Código", "Precio"]);
});

test("applyColumnMigration no hace nada si la version ya se aplico", () => {
  const r = applyColumnMigration("ventas", ["Código"], COLS, 2);
  assert.deepEqual(r.columns, ["Código"]);
  assert.equal(r.version, 2);
});

test("applyColumnMigration suma lo nuevo y sube la version", () => {
  const r = applyColumnMigration("ventas", ["Código"], COLS, 0);
  assert.ok(r.columns.includes("Nota"));
  assert.equal(r.version, 2);
});

test("latestMigrationVersion dice que version hay que dejar marcada al guardar", () => {
  assert.equal(latestMigrationVersion("ventas"), 2);
  assert.equal(latestMigrationVersion("inventario"), 0);
});

test("primera vez: guardar sin tocar nada ya marca la version actual", () => {
  // Este era el hole del segundo arreglo: en la primera carga se guardaba la
  // version 0, y la migracion corria despues, sobre la lista que el usuario
  // acababa de guardar al ocultar columnas.
  const s = mkStore();
  resolve(s, "ventas");
  assert.equal(readVersion(s, "ventas"), latestMigrationVersion("ventas"));
  save(s, "ventas", COLS.filter((c) => c !== "Usuario"));
  const recarga = resolve(s, "ventas");
  assert.ok(!recarga.includes("Usuario"), "la columna oculta reaparecio");
});

test("ocultar en la primera sesion y recargar se sostiene", () => {
  const s = mkStore();
  resolve(s, "ventas");
  save(s, "ventas", COLS.filter((c) => c !== "Estado" && c !== "Nota"));
  const recarga = resolve(s, "ventas");
  assert.deepEqual(recarga, ["Código", "Fecha", "Cliente", "Datos de envío", "Usuario"]);
});