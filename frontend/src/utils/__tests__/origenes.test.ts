import { test } from "node:test";
import assert from "node:assert/strict";
import {
  desdeMiTienda,
  faltanteDe,
  totalAsignado,
  disponibleEn,
  sugerirReparto,
  completarAllocations,
  deduplicar,
  origenesDisponibles,
  resumenDeFaltantes,
  hayFaltantesSinAsignar,
  AllocateableItem,
  OriginAllocation,
  StockByLocation,
} from "../origenes";

const MI_TIENDA = 10;
const SILES = 11;
const CHIQUICOLLO = 20;

const loc = (locationId: number, locationType: "TIENDA" | "ALMACEN", stock: number): StockByLocation => ({
  locationId,
  locationName: locationType === "TIENDA" ? `TIENDA ${locationId}` : `ALMACEN ${locationId}`,
  locationType,
  stock,
});

const item = (quantity: number, stockByLocation: StockByLocation[]): AllocateableItem => ({
  productId: 1,
  quantity,
  stockByLocation,
});

// --- Lo que sale de mi tienda ---

test("si tengo todo, no hay faltante", () => {
  const i = item(3, [loc(MI_TIENDA, "TIENDA", 10)]);
  assert.equal(desdeMiTienda(i, MI_TIENDA), 3);
  assert.equal(faltanteDe(i, MI_TIENDA), 0);
});

test("si no tengo nada, todo el pedido es faltante", () => {
  const i = item(20, [loc(SILES, "TIENDA", 3), loc(CHIQUICOLLO, "ALMACEN", 50)]);
  assert.equal(desdeMiTienda(i, MI_TIENDA), 0);
  assert.equal(faltanteDe(i, MI_TIENDA), 20);
});

test("lo que tengo en mi tienda nunca pasa la cantidad pedida", () => {
  const i = item(4, [loc(MI_TIENDA, "TIENDA", 99)]);
  assert.equal(desdeMiTienda(i, MI_TIENDA), 4);
  assert.equal(faltanteDe(i, MI_TIENDA), 0);
});

// --- Reparto sugerido ---

test("el reparto sugerido toma primero de las tiendas y después de los almacenes", () => {
  const i = item(20, [loc(MI_TIENDA, "TIENDA", 0), loc(SILES, "TIENDA", 3), loc(CHIQUICOLLO, "ALMACEN", 50)]);
  assert.deepEqual(sugerirReparto(i, [], MI_TIENDA), [
    { productId: 1, fromLocationId: SILES, quantity: 3 },
    { productId: 1, fromLocationId: CHIQUICOLLO, quantity: 17 },
  ]);
});

test("la sugerencia reparte entre dos almacenes si ninguna tienda alcanza", () => {
  const i = item(20, [
    loc(MI_TIENDA, "TIENDA", 0),
    loc(20, "ALMACEN", 8),
    loc(21, "ALMACEN", 50),
  ]);
  assert.deepEqual(sugerirReparto(i, [], MI_TIENDA), [
    { productId: 1, fromLocationId: 20, quantity: 8 },
    { productId: 1, fromLocationId: 21, quantity: 12 },
  ]);
});

test("si no hay stock en ningún lado, la sugerencia queda vacía", () => {
  const i = item(5, [loc(MI_TIENDA, "TIENDA", 0)]);
  assert.deepEqual(sugerirReparto(i, [], MI_TIENDA), []);
});

test("el reparto es estable: dos carritos con la misma falta proponen lo mismo", () => {
  const i = item(20, [loc(MI_TIENDA, "TIENDA", 0), loc(21, "ALMACEN", 9), loc(20, "ALMACEN", 40)]);
  assert.deepEqual(sugerirReparto(i, [], MI_TIENDA), sugerirReparto(i, [], MI_TIENDA));
});

// --- Lo que ya está asignado ---

test("lo ya asignado a un origen se descuenta de lo que se puede pedir ahí", () => {
  const i = item(10, [loc(MI_TIENDA, "TIENDA", 0), loc(SILES, "TIENDA", 5)]);
  const ya: OriginAllocation[] = [{ productId: 1, fromLocationId: SILES, quantity: 3 }];
  assert.equal(disponibleEn(i, SILES, ya, MI_TIENDA), 2);
});

test("el total asignado suma todas las orígenes de un producto", () => {
  const alloc: OriginAllocation[] = [
    { productId: 1, fromLocationId: SILES, quantity: 3 },
    { productId: 1, fromLocationId: CHIQUICOLLO, quantity: 4 },
    { productId: 2, fromLocationId: SILES, quantity: 9 },
  ];
  assert.equal(totalAsignado(alloc, 1), 7);
  assert.equal(totalAsignado(alloc, 2), 9);
});

test("pedir a mi propia tienda cuenta como un error y no como disponibilidad", () => {
  // No tiene sentido "pedir" a la tienda donde ya estás: eso se usa del stock.
  const i = item(10, [loc(MI_TIENDA, "TIENDA", 10)]);
  assert.equal(disponibleEn(i, MI_TIENDA, [], MI_TIENDA), 10);
  assert.deepEqual(sugerirReparto(i, [], MI_TIENDA), []);
});

test("las opciones que se ofrecen excluyen mi tienda", () => {
  const i = item(10, [loc(MI_TIENDA, "TIENDA", 4), loc(SILES, "TIENDA", 3), loc(CHIQUICOLLO, "ALMACEN", 9)]);
  const opciones = origenesDisponibles(i, [], MI_TIENDA);
  assert.deepEqual(opciones.map((o) => o.locationId), [SILES, CHIQUICOLLO]);
  assert.deepEqual(opciones.map((o) => o.disponible), [3, 9]);
});

// --- Completar el reparto ---

test("completarAllocations cubre todos los productos del carrito", () => {
  const items: AllocateableItem[] = [
    { productId: 1, quantity: 20, stockByLocation: [loc(MI_TIENDA, "TIENDA", 0), loc(SILES, "TIENDA", 3), loc(20, "ALMACEN", 50)] },
    { productId: 2, quantity: 5, stockByLocation: [loc(MI_TIENDA, "TIENDA", 2), loc(21, "ALMACEN", 10)] },
  ];
  const r = completarAllocations(items, [], MI_TIENDA);
  assert.deepEqual(r, [
    { productId: 1, fromLocationId: SILES, quantity: 3 },
    { productId: 1, fromLocationId: 20, quantity: 17 },
    { productId: 2, fromLocationId: 21, quantity: 3 },
  ]);
});

test("completarAllocations respeta lo que el vendedor ya eligió a mano", () => {
  const items: AllocateableItem[] = [
    { productId: 1, quantity: 20, stockByLocation: [loc(MI_TIENDA, "TIENDA", 0), loc(SILES, "TIENDA", 3), loc(20, "ALMACEN", 50)] },
  ];
  const manual: OriginAllocation[] = [{ productId: 1, fromLocationId: 20, quantity: 10 }];
  const r = completarAllocations(items, manual, MI_TIENDA);
  // 20 pedidas, 10 ya al almacén: los 3 de SILES y 7 más del almacén.
  assert.deepEqual(r, [
    { productId: 1, fromLocationId: 20, quantity: 17 },
    { productId: 1, fromLocationId: SILES, quantity: 3 },
  ]);
});

// --- Deduplicar ---

test("deduplicar junta lo que se pidió dos veces al mismo origen", () => {
  assert.deepEqual(
    deduplicar([
      { productId: 1, fromLocationId: SILES, quantity: 3 },
      { productId: 1, fromLocationId: SILES, quantity: 2 },
      { productId: 1, fromLocationId: CHIQUICOLLO, quantity: 0 },
    ]),
    [{ productId: 1, fromLocationId: SILES, quantity: 5 }],
  );
});

// --- Resumen y bloqueo ---

test("el resumen dice qué falta y si ya está asignado", () => {
  const items: AllocateableItem[] = [
    { productId: 1, quantity: 20, stockByLocation: [loc(MI_TIENDA, "TIENDA", 3), loc(SILES, "TIENDA", 8)] },
  ];
  const sinNada: OriginAllocation[] = [];
  assert.deepEqual(resumenDeFaltantes(items, sinNada, MI_TIENDA), [
    { productId: 1, desdeTienda: 3, faltante: 17, asignado: 0, sinAsignar: 17, completo: false },
  ]);

  const asignado: OriginAllocation[] = [{ productId: 1, fromLocationId: SILES, quantity: 17 }];
  assert.deepEqual(resumenDeFaltantes(items, asignado, MI_TIENDA), [
    { productId: 1, desdeTienda: 3, faltante: 17, asignado: 17, sinAsignar: 0, completo: true },
  ]);
});

test("hayFaltantesSinAsignar avisa si algún producto quedó a medias", () => {
  // Producto 1: 20 pedidos, 3 en mi tienda, 8 en SILES → faltan 17.
  const p1: AllocateableItem = {
    productId: 1,
    quantity: 20,
    stockByLocation: [loc(MI_TIENDA, "TIENDA", 3), loc(SILES, "TIENDA", 8)],
  };
  // Producto 2: 4 pedidos, 0 en mi tienda, 9 en el almacén → faltan 4.
  const p2: AllocateableItem = {
    productId: 2,
    quantity: 4,
    stockByLocation: [loc(MI_TIENDA, "TIENDA", 0), loc(20, "ALMACEN", 9)],
  };
  const completo: OriginAllocation[] = [
    { productId: 1, fromLocationId: SILES, quantity: 17 },
    { productId: 2, fromLocationId: 20, quantity: 4 },
  ];

  assert.equal(hayFaltantesSinAsignar([p1, p2], completo, MI_TIENDA), false);
  assert.equal(hayFaltantesSinAsignar([p1, p2], [{ productId: 1, fromLocationId: SILES, quantity: 17 }], MI_TIENDA), true);
  assert.equal(hayFaltantesSinAsignar([p1, p2], [], MI_TIENDA), true);
});

test("un producto que sí tengo en mi tienda nunca bloquea la venta", () => {
  const items: AllocateableItem[] = [
    { productId: 1, quantity: 3, stockByLocation: [loc(MI_TIENDA, "TIENDA", 10)] },
  ];
  assert.equal(hayFaltantesSinAsignar(items, [], MI_TIENDA), false);
});