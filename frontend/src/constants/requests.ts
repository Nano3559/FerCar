import { Clock, Package, Truck, CheckCircle, Ban } from "lucide-react";

/**
 * Estados del flujo de solicitudes, en el orden en que avanzan.
 *
 * Lo comparten la lista (RequestsPage) y el tablero visual (RequestsBoard):
 * si cada uno armara su propia lista, los colores y las etiquetas terminarian
 * divergiendo y no se reconoceria que son la misma solicitud en las dos vistas.
 */
export const REQUEST_STATUSES: readonly string[] = [
  "PENDIENTE",
  "RECIBIDO_POR_INVENTARIO",
  "PREPARANDO",
  "ENTREGADO",
  "RECIBIDO_POR_TIENDA",
] as const;

export const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock; bg: string }> = {
  PENDIENTE: { label: "Pendiente", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", icon: Clock },
  RECIBIDO_POR_INVENTARIO: { label: "Recibido por Inventario", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", icon: Package },
  PREPARANDO: { label: "Preparando", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20", icon: Package },
  ENTREGADO: { label: "Entregado", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", icon: Truck },
  RECIBIDO_POR_TIENDA: { label: "Recibido por Tienda", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20", icon: CheckCircle },
  CANCELADO: { label: "Cancelado", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", icon: Ban },
};

export const SOURCE_CONFIG: Record<string, { label: string; className: string }> = {
  MANUAL: { label: "Manual", className: "text-gray-400 bg-dark-700/50 border-dark-600/50" },
  VENTA: { label: "Auto · Venta", className: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  STOCK_MINIMO: { label: "Auto · Stock mínimo", className: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
};
