import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planFulfillment,
  summarizeFulfillment,
  loadStockSnapshot,
  FulfillmentError,
} from "../fulfillment";

const TIENDA = 10;
const SILES = 11;
const FALSURI = 12;
const CHIQUICOLLO = 20;
const MELCHOR = 21;

/** Snapshot de ejemplo: la tienda propia, otras tiendas y almacenes. */
const snap = (
  store: number,
  otras: { locationId: number; stock: number }[] = [],
  almacenes: { locationId: number; stock: number }[] = [],
) => ({
  store,
  otherStores: otras.reduce((s, t) => s + t.stock, 0),
  otherStoreStock: otras,
  warehouses: almacenes.reduce((s, t) => s + t.stock, 0),
  byLocation: [
    { locationId: TIENDA, name: "MI TIENDA", type: "TIENDA" as const, stock: store },
    ...otras.map((t) => ({ locationId: t.locationId, name: `TIENDA ${t.locationId}`, type: "TIENDA" as const, stock: t.stock })),
    ...almacenes.map((a) => ({ locationId: a.locationId, name: `ALMACEN ${a.locationId}`, type: "ALMACEN" as const, stock: a.stock })),
  ],
});

const soloTienda = (productId: number, cantidad: number, stock: Record<number, any>) =>
  planFulfillment([{ productId, quantity: cantidad }], stock, TIENDA, []);

// --- La tienda donde se cobra se consume sola ---

test("lo que hay en la tienda se entrega sin pedirlo a nadie", () => {
  const plan = soloTienda(1, 4, { 1: snap(10) });
  assert.equal(plan.lines[0].delivered, 4);
  assert.equal(plan.lines[0].pending, 0);
  assert.deepEqual(plan.deductions, [{ productId: 1, locationId: TIENDA, units: 4 }]);
});

test("si la tienda alcanza, no se puede asignar un origen de más", () => {
  assert.throws(
    () => planFulfillment([{ productId: 1, quantity: 4 }], { 1: snap(10) }, TIENDA, [
      { productId: 1, fromLocationId: SILES, quantity: 1 },
    ]),
    (e: any) => e instanceof FulfillmentError && /de m[aá]s/.test(e.problemas[0]),
  );
});

// --- El faltante lo elige el vendedor ---

test("el faltante se pide a la tienda que eligió el vendedor", () => {
  const plan = soloTiendaCon(1, 15, { 1: snap(10, [{ locationId: SILES, stock: 8 }]) }, [
    { productId: 1, fromLocationId: SILES, quantity: 5 },
  ]);
  assert.equal(plan.lines[0].delivered, 10);
  assert.equal(plan.lines[0].pending, 5);
  assert.deepEqual(plan.lines[0].origenesPendientes, [{ locationId: SILES, quantity: 5 }]);
});

test("el faltante se puede repartir entre una tienda y un almacén", () => {
  // El caso que pidió el usuario: 3 de SILES y 4 de CHIQUICOLLO.
  const plan = soloTiendaCon(
    1,
    17,
    {
      1: snap(10, [{ locationId: SILES, stock: 3 }], [{ locationId: CHIQUICOLLO, stock: 30 }]),
    },
    [
      { productId: 1, fromLocationId: SILES, quantity: 3 },
      { productId: 1, fromLocationId: CHIQUICOLLO, quantity: 4 },
    ],
  );
  assert.equal(plan.lines[0].delivered, 10);
  assert.equal(plan.lines[0].pending, 7);
  // Ordenado por ubicación: SILES(11) antes que CHIQUICOLLO(20).
  assert.deepEqual(plan.lines[0].origenesPendientes, [
    { locationId: SILES, quantity: 3 },
    { locationId: CHIQUICOLLO, quantity: 4 },
  ]);
});

test("cada origen asignado descuenta de su propia ubicación", () => {
  // Si se descontara de la ubicación equivocada, el inventario de otra tienda
  // bajaría sin que esa tienda haya vendido nada.
  const plan = soloTiendaCon(
    1,
    20,
    {
      1: snap(2, [{ locationId: SILES, stock: 3 }, { locationId: FALSURI, stock: 5 }], [{ locationId: MELCHOR, stock: 40 }]),
    },
    [
      { productId: 1, fromLocationId: SILES, quantity: 3 },
      { productId: 1, fromLocationId: FALSURI, quantity: 5 },
      { productId: 1, fromLocationId: MELCHOR, quantity: 10 },
    ],
  );
  assert.deepEqual(ordenado(plan.deductions), [
    { productId: 1, locationId: 10, units: 2 },
    { productId: 1, locationId: 11, units: 3 },
    { productId: 1, locationId: 12, units: 5 },
    { productId: 1, locationId: 21, units: 10 },
  ]);
});

test("la venta no se guarda si el faltante quedó sin origen", () => {
  // Es la regla acordada: es mejor avisarle al vendedor que dejar una venta que
  // nadie va a poder completar.
  assert.throws(
    () => soloTienda(1, 15, { 1: snap(10, [{ locationId: SILES, stock: 8 }]) }),
    (e: any) => e instanceof FulfillmentError && /Falta elegir/.test(e.message),
  );
});

test("el error dice cuántas unidades falta asignar", () => {
  try {
    planFulfillment([{ productId: 1, quantity: 15 }], { 1: snap(10, [{ locationId: SILES, stock: 8 }]) }, TIENDA, [
      { productId: 1, fromLocationId: SILES, quantity: 2 },
    ]);
    assert.fail("debería lanzar FulfillmentError");
  } catch (e: any) {
    assert.ok(e instanceof FulfillmentError);
    assert.match(e.message, /faltaban/);
    assert.match(e.message, /asignaste 2 de las 5/);
  }
});

test("no se puede pedir mercadería a la propia tienda", () => {
  assert.throws(
    () => soloTiendaCon(1, 15, { 1: snap(10) }, [{ productId: 1, fromLocationId: TIENDA, quantity: 5 }]),
    (e: any) => e instanceof FulfillmentError && /propia tienda/.test(e.message),
  );
});

test("no se puede pedir más de lo que hay en el origen", () => {
  assert.throws(
    () => soloTiendaCon(1, 20, { 1: snap(10, [{ locationId: SILES, stock: 3 }]) }, [
      { productId: 1, fromLocationId: SILES, quantity: 10 },
    ]),
    (e: any) => e instanceof FulfillmentError && /quedan 3/.test(e.message),
  );
});

test("no se puede pedir a una ubicación donde el producto no está registrado", () => {
  assert.throws(
    () => soloTiendaCon(1, 15, { 1: snap(10) }, [{ productId: 1, fromLocationId: CHIQUICOLLO, quantity: 5 }]),
    (e: any) => e instanceof FulfillmentError && /no tiene stock registrado/.test(e.message),
  );
});

test("no se puede asignar mercadería a un producto que no está en la venta", () => {
  assert.throws(
    () => soloTiendaCon(1, 3, { 1: snap(3), 2: snap(0) }, [{ productId: 2, fromLocationId: SILES, quantity: 1 }]),
    (e: any) => e instanceof FulfillmentError && /no está en la venta/.test(e.message),
  );
});

test("una cantidad cero o negativa se rechaza", () => {
  assert.throws(
    () => soloTiendaCon(1, 15, { 1: snap(10, [{ locationId: SILES, stock: 8 }]) }, [
      { productId: 1, fromLocationId: SILES, quantity: 0 },
      { productId: 1, fromLocationId: CHIQUICOLLO, quantity: 5 },
    ]),
    (e: any) => e instanceof FulfillmentError && /mayor que cero/.test(e.message),
  );
});

test("el nombre del producto aparece en el error cuando se lo pasa la ruta", () => {
  try {
    planFulfillment(
      [{ productId: 1, quantity: 15 }],
      { 1: snap(10) },
      TIENDA,
      [],
      { 1: "JALADOR EXTERIOR" },
    );
    assert.fail("debería lanzar FulfillmentError");
  } catch (e: any) {
    assert.match(e.message, /JALADOR EXTERIOR/);
  }
});

// --- Varios productos en el mismo carrito ---

test("cada producto se reparte con su propio origen", () => {
  const plan = planFulfillment(
    [{ productId: 1, quantity: 12 }, { productId: 2, quantity: 5 }],
    {
      1: snap(10, [{ locationId: SILES, stock: 6 }]),
      2: snap(2, [], [{ locationId: MELCHOR, stock: 9 }]),
    },
    TIENDA,
    [
      { productId: 1, fromLocationId: SILES, quantity: 2 },
      { productId: 2, fromLocationId: MELCHOR, quantity: 3 },
    ],
  );
  assert.equal(plan.lines[0].pending, 2);
  assert.equal(plan.lines[1].pending, 3);
  assert.deepEqual(plan.lines[1].origenesPendientes, [{ locationId: MELCHOR, quantity: 3 }]);
});

test("el mismo origen no se puede usar dos veces para el mismo producto", () => {
  // Dos asignaciones al mismo origen se suman y se comparan con el stock una
  // sola vez: 3 y 3 contra un stock de 5 es un error, no un reparto de 6.
  assert.throws(
    () => soloTiendaCon(1, 16, { 1: snap(10, [{ locationId: SILES, stock: 5 }]) }, [
      { productId: 1, fromLocationId: SILES, quantity: 3 },
      { productId: 1, fromLocationId: SILES, quantity: 3 },
    ]),
    (e: any) => e instanceof FulfillmentError && /pediste 6 y quedan 5/.test(e.message),
  );
});

test("dos productos distintos pueden pedir al mismo origen", () => {
  const plan = planFulfillment(
    [{ productId: 1, quantity: 12 }, { productId: 2, quantity: 12 }],
    {
      1: snap(10, [{ locationId: SILES, stock: 2 }]),
      2: snap(10, [{ locationId: SILES, stock: 2 }]),
    },
    TIENDA,
    [
      { productId: 1, fromLocationId: SILES, quantity: 2 },
      { productId: 2, fromLocationId: SILES, quantity: 2 },
    ],
  );
  assert.deepEqual(plan.deductions.filter((d) => d.locationId === SILES), [
    { productId: 1, locationId: SILES, units: 2 },
    { productId: 2, locationId: SILES, units: 2 },
  ]);
});

test("las líneas del mismo producto comparten el stock de la tienda", () => {
  // Mismo producto en P1 y P2: la tienda tiene 3 y se piden 2 y 4. La primera
  // línea se lleva 2 de la tienda; la segunda, 1 de la tienda y el resto de SILES.
  const plan = planFulfillment(
    [{ productId: 1, quantity: 2 }, { productId: 1, quantity: 4 }],
    { 1: snap(3, [{ locationId: SILES, stock: 5 }]) },
    TIENDA,
    [{ productId: 1, fromLocationId: SILES, quantity: 3 }],
  );
  assert.equal(plan.lines[0].delivered, 2);
  assert.equal(plan.lines[1].delivered, 1);
  assert.equal(plan.lines[1].pending, 3);
  assert.deepEqual(plan.lines[1].origenesPendientes, [{ locationId: SILES, quantity: 3 }]);
});

test("sin existencias en ninguna parte no hay plan: hay que elegir el origen", () => {
  assert.throws(
    () => soloTienda(1, 3, { 1: snap(0) }),
    (e: any) => e instanceof FulfillmentError && /Falta elegir/.test(e.message),
  );
});

test("un producto sin informacion de stock se trata como vacio", () => {
  assert.throws(() => soloTienda(9, 2, {}), (e: any) => e instanceof FulfillmentError);
});

test("todos los problemas se reportan juntos, no solo el primero", () => {
  try {
    planFulfillment(
      [{ productId: 1, quantity: 12 }, { productId: 2, quantity: 8 }],
      { 1: snap(10, [{ locationId: SILES, stock: 1 }]), 2: snap(1) },
      TIENDA,
      [{ productId: 1, fromLocationId: SILES, quantity: 1 }],
      { 1: "PRODUCTO UNO", 2: "PRODUCTO DOS" },
    );
    assert.fail("debería lanzar FulfillmentError");
  } catch (e: any) {
    assert.ok(e.problemas.length >= 2, "debería avisar de los dos productos");
    assert.match(e.message, /PRODUCTO UNO/);
    assert.match(e.message, /PRODUCTO DOS/);
  }
});

// --- Resumen de entrega ---

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

test("el snapshot separa tienda, otras tiendas y almacenes", () => {
  const db = dbConFilas([
    { productId: 1, locationId: 10, stock: 10, location: { type: "TIENDA", name: "TUMUSLA" } },
    { productId: 1, locationId: 11, stock: 3, location: { type: "TIENDA", name: "SILES" } },
    { productId: 1, locationId: 20, stock: 6, location: { type: "ALMACEN", name: "MELCHOR" } },
    { productId: 1, locationId: 21, stock: 4, location: { type: "ALMACEN", name: "QUIJARRO" } },
  ]);
  return loadStockSnapshot(db, [1], 10).then((s) => {
    assert.equal(s[1].store, 10);
    assert.equal(s[1].otherStores, 3);
    assert.deepEqual(s[1].otherStoreStock, [{ locationId: 11, stock: 3 }]);
    assert.equal(s[1].warehouses, 10);
    assert.deepEqual(s[1].byLocation, [
      { locationId: 10, name: "TUMUSLA", type: "TIENDA", stock: 10 },
      { locationId: 11, name: "SILES", type: "TIENDA", stock: 3 },
      { locationId: 20, name: "MELCHOR", type: "ALMACEN", stock: 6 },
      { locationId: 21, name: "QUIJARRO", type: "ALMACEN", stock: 4 },
    ]);
  });
});

test("el stock de otra tienda si cuenta como disponible", () => {
  const db = dbConFilas([
    { productId: 1, locationId: 10, stock: 99, location: { type: "TIENDA", name: "TUMUSLA" } },
    { productId: 1, locationId: 20, stock: 5, location: { type: "ALMACEN", name: "MELCHOR" } },
  ]);
  return loadStockSnapshot(db, [1], 11).then((s) => {
    assert.equal(s[1].store, 0);
    assert.equal(s[1].otherStores, 99);
    assert.deepEqual(s[1].otherStoreStock, [{ locationId: 10, stock: 99 }]);
    assert.equal(s[1].warehouses, 5);
  });
});

test("vender desde un almacen no cuenta ese almacen dos veces", () => {
  const db = dbConFilas([
    { productId: 1, locationId: 20, stock: 7, location: { type: "ALMACEN", name: "MELCHOR" } },
    { productId: 1, locationId: 21, stock: 3, location: { type: "ALMACEN", name: "QUIJARRO" } },
  ]);
  return loadStockSnapshot(db, [1], 20).then((s) => {
    assert.equal(s[1].store, 7);
    assert.equal(s[1].otherStores, 0);
    assert.equal(s[1].warehouses, 3);
  });
});

test("producto pedido sin filas de inventario da cero, no undefined", () => {
  return loadStockSnapshot(dbConFilas([]), [1, 2], 10).then((s) => {
    assert.deepEqual(s[1], { store: 0, otherStores: 0, otherStoreStock: [], warehouses: 0, byLocation: [] });
    assert.deepEqual(s[2], { store: 0, otherStores: 0, otherStoreStock: [], warehouses: 0, byLocation: [] });
  });
});

test("sin productos no se consulta nada", async () => {
  let consulto = false;
  const db = { inventory: { findMany: async () => { consulto = true; return []; } } };
  assert.deepEqual(await loadStockSnapshot(db, [], 10), {});
  assert.equal(consulto, false);
});

/** Los descuentos se comparan sin importar el orden en que se recorrieron. */
const ordenado = (deductions: { productId: number; locationId: number; units: number }[]) =>
  [...deductions].sort((a, b) => a.productId - b.productId || a.locationId - b.locationId);

function soloTiendaCon(
  productId: number,
  cantidad: number,
  stock: Record<number, any>,
  allocations: { productId: number; fromLocationId: number; quantity: number }[],
) {
  return planFulfillment([{ productId, quantity: cantidad }], stock, TIENDA, allocations);
}