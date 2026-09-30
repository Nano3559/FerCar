import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolverColumnaUbicacion,
  esColumnaCantidad,
  leerCantidad,
  normalizeHeader,
  type LocationRef,
} from "../locationColumns";

// Las 6 ubicaciones reales del sistema.
const UBICACIONES: LocationRef[] = [
  { id: 1, name: "FALSURI", type: "TIENDA" },
  { id: 2, name: "MELCHOR", type: "TIENDA" },
  { id: 3, name: "QUIJARRO", type: "TIENDA" },
  { id: 4, name: "SILES", type: "TIENDA" },
  { id: 5, name: "CHIQUICOLLO", type: "ALMACEN" },
  { id: 6, name: "TUMUSLA", type: "ALMACEN" },
];

const id = (encabezado: string) => resolverColumnaUbicacion(encabezado, UBICACIONES)?.locationId ?? null;

test("reconoce el nombre exacto de la ubicacion", () => {
  assert.equal(id("TUMUSLA"), 6);
  assert.equal(id("CHIQUICOLLO"), 5);
  assert.equal(id("MELCHOR"), 2);
});

test("ignora mayusculas, tildes y espacios sobrantes", () => {
  assert.equal(id("tumusla"), 6);
  assert.equal(id("  Tumusla  "), 6);
  assert.equal(id("CHÍQUICOLLO"), 5);
  assert.equal(id("MELCHOR "), 2);
});

test("reconoce el nombre escondido dentro del encabezado", () => {
  assert.equal(id("STOCK TUMUSLA"), 6);
  assert.equal(id("TUMUSLA (TIENDA)"), 6);
  assert.equal(id("EXISTENCIA MELCHOR"), 2);
  assert.equal(id("Stock Chiquicollo Bodega"), 5);
  assert.equal(id("SILES - Almacén"), 4);
});

test("prefiere el nombre de ubicacion mas largo contenido en el encabezado", () => {
  const conDos = [...UBICACIONES, { id: 7, name: "SANTA CRUZ", type: "TIENDA" }];
  const r = resolverColumnaUbicacion("STOCK SANTA CRUZ", conDos);
  assert.equal(r?.locationId, 7);
});

test("reconoce TIENDA n y ALMACEN n por su numero", () => {
  assert.equal(id("TIENDA 1"), 1);
  assert.equal(id("TIENDA 2"), 2);
  assert.equal(id("ALMACEN 1"), 5);
  assert.equal(id("ALMACEN 2"), 6);
  assert.equal(id("tienda 4"), 4);
});

test("no confunde columnas de datos con columnas de ubicacion", () => {
  for (const col of [
    "PROVEEDOR", "FABRICANTE", "PRODUCTO", "MARCA", "MODELO", "AÑO", "DETALLES",
    "COD OEM", "COD FABRICA", "COSTO $", "COSTO BS", "COSTO TIENDAS",
    "PRECIO 1", "PRECIO 2", "PRECIO MAYOR", "IMAGEN", "STOCK", "CANTIDAD",
  ]) {
    assert.equal(id(col), null, `"${col}" no deberia ser ubicacion`);
  }
});

test("distingue columna de cantidad de columna de ubicacion", () => {
  assert.equal(esColumnaCantidad("STOCK"), true);
  assert.equal(esColumnaCantidad("Cantidad"), true);
  assert.equal(esColumnaCantidad("existencia"), true);
  assert.equal(esColumnaCantidad("TUMUSLA"), false);
  assert.equal(esColumnaCantidad("PRECIO 1"), false);
});

test("lee cantidades en los formatos que traen los archivos", () => {
  assert.deepEqual(leerCantidad(12), { valor: 12, sinDato: false });
  assert.deepEqual(leerCantidad("12"), { valor: 12, sinDato: false });
  assert.deepEqual(leerCantidad(" 12 "), { valor: 12, sinDato: false });
  assert.deepEqual(leerCantidad("12,00"), { valor: 12, sinDato: false });
  assert.deepEqual(leerCantidad(0), { valor: 0, sinDato: false });
});

test("marca como sin dato lo que no es un numero, en vez de perderlo como 0", () => {
  // El archivo JALADORES trae 140 celdas con "?".
  assert.deepEqual(leerCantidad("?"), { valor: 0, sinDato: true });
  assert.deepEqual(leerCantidad(""), { valor: 0, sinDato: true });
  assert.deepEqual(leerCantidad(null), { valor: 0, sinDato: true });
  assert.deepEqual(leerCantidad("a confirmar"), { valor: 0, sinDato: true });
});

test("no adivina si un numero es decimal o millares: lo manda a revision manual", () => {
  // 1 contra 1.234 unidades. Adivinar en silencio aqui es exactamente el error
  // que ensucia el inventario sin que nadie se entere.
  assert.deepEqual(leerCantidad("1.234"), { valor: 0, sinDato: true });
  assert.deepEqual(leerCantidad("1,234"), { valor: 0, sinDato: true });
  assert.deepEqual(leerCantidad("1,5"), { valor: 0, sinDato: true });
  // Decimales que no aportan nada siguen siendo enteros legibles.
  assert.deepEqual(leerCantidad("12,00"), { valor: 12, sinDato: false });
  assert.deepEqual(leerCantidad("12.0"), { valor: 12, sinDato: false });
});

test("encabezados del archivo JALADORES 2026 (1).xlsx", () => {
  // Hoja1, fila 1, tal cual lo entrega el proveedor.
  const encabezados = [
    "PROVEEDOR", "FABRICANTE", "PRODUCTO", "MARCA", "MODELO ", "AÑO", "DETALLES",
    "COD OEM", "COD FABRICA", "COSTO $", "COSTO BS", "COSTO TIENDAS",
    "PRECIO 1", "PRECIO 2", "PRECIO MAYOR", "IMAGEN", "TUMUSLA", "CHIQUICOLLO", "STOCK",
  ];
  const ubicaciones = encabezados.filter((h) => resolverColumnaUbicacion(h, UBICACIONES));
  assert.deepEqual(ubicaciones, ["TUMUSLA", "CHIQUICOLLO"]);
});

test("normalizeHeader quita tildes, mayusculas y espacios", () => {
  assert.equal(normalizeHeader("  AÑO "), "ano");
  assert.equal(normalizeHeader("Melchor "), "melchor");
});
