/**
 * Columnas que cada modulo puede mostrar.
 *
 * Antes cada pagina tenia su propia lista y el bloque de configuracion de
 * columnas de un rol solo guardaba un numero ("7 cols"): nadie podia ver quais
 * eran ni quais faltaban, y una columna vetada por el rol se quedaba
 * invisible y sin explicar. Con esta lista, Ajustes puede mostrar los nombres
 * reales y corregirlos.
 *
 * El module key es el mismo que usa <ColumnManager module="..." />.
 */
export const MODULE_COLUMNS: Record<string, string[]> = {
  ventas: [
    "Código", "Fecha", "Cliente", "Datos de envío", "Datos de factura", "Usuario",
    "Ubicación", "Vendedor", "Tipo", "Total", "Estado", "Pagos", "Nota",
  ],
  carrito: ["Producto", "Precio", "Cantidad", "Subtotal", "Eliminar"],
  inventario: [
    "Proveedor", "Fabricante", "Producto", "Marca", "Modelo", "Año", "Detalles",
    "Cód. OEM", "Cód. Fábrica", "Costo $", "Costo Bs", "Costo Tiendas",
    "Precio 1", "Precio 2", "Precio Mayor", "Imagen", "Stock", "Acciones",
  ],
};

export const MODULE_LABELS: Record<string, string> = {
  inventario: "Inventario",
  ventas: "Ventas",
  carrito: "Carrito de venta",
  "ventas-mayor": "Ventas por Mayor",
  devoluciones: "Devoluciones",
  solicitudes: "Solicitudes",
  movimientos: "Movimientos",
  costos: "Costos",
  precios: "Precios",
  reportes: "Reportes",
  configuracion: "Configuración",
  despachos: "Lista de Despacho",
  "notas-compra": "Notas de Compra",
};