import { useState } from "react";
import {
  OriginAllocation,
  AllocateableItem,
  origenesDisponibles,
  disponibleEn,
  totalAsignado,
  faltanteDe,
  desdeMiTienda,
  completarAllocations,
  deduplicar,
} from "../../utils/origenes";

interface Props {
  items: AllocateableItem[];
  allocations: OriginAllocation[];
  storeLocationId: number;
  /** Nombre de la tienda donde se cobra, para no repetirlo arriba. */
  storeName: string;
  onChange: (allocations: OriginAllocation[]) => void;
  disabled?: boolean;
}

/**
 * Selector de origen para la mercadería que no está en la tienda donde se cobra.
 *
 * El stock propio se consume solo y no se toca. Lo que falta se reparte a mano
 * entre tiendas y almacenes: se puede pedir 3 a una y 4 a otra, y cada elección
 * genera su propia solicitud cuando se guarda la venta.
 */
export default function OrigenesSelector({ items, allocations, storeLocationId, storeName, onChange, disabled }: Props) {
  const [abierto, setAbierto] = useState(false);

  const pendientes = items
    .map((item) => ({
      item,
      faltante: faltanteDe(item, storeLocationId),
      asignado: totalAsignado(allocations, item.productId),
    }))
    .filter((p) => p.faltante > 0);

  const sinAsignar = pendientes.reduce((s, p) => s + Math.max(0, p.faltante - p.asignado), 0);

  const setCantidad = (productId: number, locationId: number, cantidad: number) => {
    const resto = allocations.filter((a) => !(a.productId === productId && a.fromLocationId === locationId));
    if (cantidad > 0) resto.push({ productId, fromLocationId: locationId, quantity: cantidad });
    onChange(deduplicar(resto));
  };

  const agregarUno = (item: AllocateableItem, locationId: number) => {
    const disponible = disponibleEn(item, locationId, allocations, storeLocationId);
    if (disponible <= 0) return;
    const yaTiene = allocations.find((a) => a.productId === item.productId && a.fromLocationId === locationId);
    setCantidad(item.productId, locationId, (yaTiene?.quantity ?? 0) + 1);
  };

  // La sugerencia solo completa lo que falta: lo que el vendedor ya eligió a mano
  // se respeta y no se pisa.
  const sugerirTodo = () => {
    onChange(completarAllocations(items, allocations, storeLocationId));
  };

  if (pendientes.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] p-3">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className="w-full flex items-center justify-between gap-2 text-left"
        aria-expanded={abierto}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-400">
            {pendientes.length} producto{pendientes.length > 1 ? "s" : ""} sin stock completo en {storeName}
          </p>
          <p className="text-xs text-amber-200/70 mt-0.5">
            {sinAsignar > 0
              ? `Te faltan ${sinAsignar} unidad(es) por decidir de dónde salen.`
              : "Todo asignado. Cada origen genera su propia solicitud."}
          </p>
        </div>
        <span className="text-amber-400 text-xs shrink-0">{abierto ? "Ocultar" : "Elegir"}</span>
      </button>

      {abierto && (
        <div className="mt-3 space-y-3">
          <button
            type="button"
            onClick={sugerirTodo}
            disabled={disabled}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 disabled:opacity-40"
          >
            Sugerir reparto (primero tiendas, después almacenes)
          </button>

          {pendientes.map(({ item, faltante, asignado }) => {
            const opciones = origenesDisponibles(item, allocations, storeLocationId).filter((o) => o.disponible > 0);
            const propio = desdeMiTienda(item, storeLocationId);
            const falta = Math.max(0, faltante - asignado);

            return (
              <div key={item.productId} className="rounded-xl border border-dark-700/60 bg-dark-900/40 p-2.5">
                <p className="text-xs text-gray-300 mb-2">
                  {propio > 0 && <span className="text-emerald-400">{propio} de tu tienda</span>}
                  {propio > 0 && <span className="text-gray-500"> · </span>}
                  <span className={falta > 0 ? "text-amber-400" : "text-gray-400"}>
                    {falta > 0 ? `faltan ${falta}` : `todo asignado (${asignado})`}
                  </span>
                </p>

                {opciones.length === 0 ? (
                  <p className="text-xs text-red-400">
                    Este producto no tiene stock en ninguna otra tienda ni almacén.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {opciones.map((o) => {
                      const asignadoAqui =
                        allocations.find(
                          (a) => a.productId === item.productId && a.fromLocationId === o.locationId,
                        )?.quantity ?? 0;
                      return (
                        <div key={o.locationId} className="flex items-center gap-2">
                          <span
                            className={`text-[11px] px-1.5 py-0.5 rounded shrink-0 ${
                              o.locationType === "TIENDA"
                                ? "bg-blue-500/15 text-blue-300"
                                : "bg-purple-500/15 text-purple-300"
                            }`}
                          >
                            {o.locationType === "TIENDA" ? "Tda" : "Alm"}
                          </span>
                          <span className="text-xs text-gray-300 flex-1 truncate">
                            {o.locationName}
                            <span className="text-gray-500"> · hay {o.disponible}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => agregarUno(item, o.locationId)}
                            disabled={disabled}
                            className="w-6 h-6 rounded-md border border-dark-600 text-gray-300 hover:border-amber-500/40 hover:text-amber-400 disabled:opacity-30 text-xs shrink-0"
                            title="Pedir una más"
                          >
                            +
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={asignadoAqui + o.disponible}
                            value={asignadoAqui}
                            disabled={disabled}
                            onChange={(e) => setCantidad(item.productId, o.locationId, Number(e.target.value) || 0)}
                            className="w-14 px-1.5 py-1 rounded-md bg-dark-800 border border-dark-600 text-xs text-center text-gray-200 disabled:opacity-40"
                          />
                          <button
                            type="button"
                            onClick={() => setCantidad(item.productId, o.locationId, 0)}
                            disabled={disabled || asignadoAqui === 0}
                            className="w-6 h-6 rounded-md text-gray-500 hover:text-red-400 disabled:opacity-20 text-xs shrink-0"
                            title="Quitar"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}