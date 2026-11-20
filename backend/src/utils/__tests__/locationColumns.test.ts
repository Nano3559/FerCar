import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolverColumnaUbicacion,
  resolverValorUbicacion,
  esColumnaCantidad,
  esColumnaUbicacionPorFila,
  pareceColumnaUbicacionPorFila,
  leerCantidad,
  normalizeHeader,
  type LocationRef,
} from "../locationColumns";

// Las 6 ubicaciones reales del sistema, con su tipo real. FALSURI, SILES y
// TUMUSLA son tiendas; CHIQUICOLLO, MELCHOR y QUIJARRO son almacenes.
const UBICACIONES: LocationRef[] = [
  { id: 24, name: "CHIQUICOLLO", type: "ALMACEN" },
  { id: 21, name: "FALSURI", type: "TIENDA" },
  { id: 22, name: "MELCHOR", type: "ALMACEN" },
  { id: 23, name: "QUIJARRO", type: "ALMACEN" },
  { id: 20, name: "SILES", type: "TIENDA" },
  { id: 19, name: "TUMUSLA", type: "TIENDA" },
];

const id = (encabezado: string) => resolverColumnaUbicacion(encabezado, UBICACIONES)?.locationId ?? null;

test("reconoce el nombre exacto de la ubicacion", () => {
  assert.equal(id("TUMUSLA"), 19);
  assert.equal(id("CHIQUICOLLO"), 24);
  assert.equal(id("MELCHOR"), 22);
});

test("ignora mayusculas, tildes y espacios sobrantes", () => {
  assert.equal(id("tumusla"), 19);
  assert.equal(id("  Tumusla  "), 19);
  assert.equal(id("CHÍQUICOLLO"), 24);
  assert.equal(id("MELCHOR "), 22);
});

test("reconoce el nombre escondido dentro del encabezado", () => {
  assert.equal(id("STOCK TUMUSLA"), 19);
  assert.equal(id("TUMUSLA (TIENDA)"), 19);
  assert.equal(id("EXISTENCIA MELCHOR"), 22);
  assert.equal(id("Stock Chiquicollo Bodega"), 24);
  assert.equal(id("SILES - Almacén"), 20);
});

test("prefiere el nombre de ubicacion mas largo contenido en el encabezado", () => {
  const conDos = [...UBICACIONES, { id: 25, name: "SANTA CRUZ", type: "TIENDA" }];
  const r = resolverColumnaUbicacion("STOCK SANTA CRUZ", conDos);
  assert.equal(r?.locationId, 25);
});

test("reconoce TIENDA n y ALMACEN n por su numero, en orden alfabetico", () => {
  // Orden alfabetico: ALMACENes = CHIQUICOLLO, MELCHOR, QUIJARRO.
  // TIENDAs = FALSURI, SILES, TUMUSLA.
  assert.equal(id("TIENDA 1"), 21);
  assert.equal(id("TIENDA 2"), 20);
  assert.equal(id("TIENDA 3"), 19);
  assert.equal(id("ALMACEN 1"), 24);
  assert.equal(id("ALMACEN 2"), 22);
  assert.equal(id("tienda 4"), null);
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

test("reconoce la columna que trae el nombre de la tienda en cada fila", () => {
  // Los Excel del proveedor traen los encabezados en mayusculas.
  for (const col of ["TIENDA", "UBICACION", "UBICACIÓN", "ALMACEN", "ALMACÉN", "Sucursal", "Local", "Depósito"]) {
    assert.equal(esColumnaUbicacionPorFila(col), true, `"${col}" deberia ser ubicacion por fila`);
  }
  assert.equal(esColumnaUbicacionPorFila("PRODUCTO"), false);
  assert.equal(esColumnaUbicacionPorFila("TUMUSLA"), false);
});

test("acepta encabezados compuestos para la ubicacion por fila", () => {
  assert.equal(pareceColumnaUbicacionPorFila("UBICACIÓN / TIENDA"), true);
  assert.equal(pareceColumnaUbicacionPorFila("TIENDA DE DESPACHO"), true);
  assert.equal(pareceColumnaUbicacionPorFila("ALMACEN DESTINO"), true);
  assert.equal(pareceColumnaUbicacionPorFila("PRODUCTO"), false);
  // "TIENDA 1" ya se resuelve como columna de cantidad; quien llama la descarta.
  assert.equal(pareceColumnaUbicacionPorFila("TIENDA 1"), true);
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

test("reconoce FALSURI escrito en la columna por fila", () => {
  const valorId = (v: string) => resolverValorUbicacion(v, UBICACIONES)?.locationId ?? null;
  // Formas que el usuario pone en la celda TIENDA/UBICACION.
  for (const v of [
    "falsuri", "Falsuri", "FALSURI", "FÁLSURI", " falsuri ",
    "FALSURY", "Fal Suri", "FAL-SURI", "TIENDA FALSURI", "SUCURSAL FALSURY",
  ]) {
    assert.equal(valorId(v), 21, `"${v}" deberia resolverse a FALSURI`);
  }
  // Las demas tiendas y almacenes siguen funcionando igual.
  assert.equal(valorId("siles"), 20);
  assert.equal(valorId("TUMUSLA"), 19);
  assert.equal(valorId("chiquicollo"), 24);
  assert.equal(valorId("melchor"), 22);
  assert.equal(valorId("quijarro"), 23);
});

test("no adivina una ubicacion cuando el valor es ambiguo o no existe", () => {
  const valorId = (v: string) => resolverValorUbicacion(v, UBICACIONES)?.locationId ?? null;
  assert.equal(valorId(""), null);
  assert.equal(valorId("?"), null);
  assert.equal(valorId("san pedro"), null);
  assert.equal(valorId("SIN TIENDA"), null);
});

test("normalizeHeader quita tildes, mayusculas y espacios", () => {
  assert.equal(normalizeHeader("  AÑO "), "ano");
  assert.equal(normalizeHeader("Melchor "), "melchor");
});
