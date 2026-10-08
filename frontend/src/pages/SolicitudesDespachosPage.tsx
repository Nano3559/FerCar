import { useState } from "react";
import { Send, ListChecks, LayoutGrid } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import RequestsPage from "./RequestsPage";
import DespatchListPage from "./DespatchListPage";
import RequestsBoard from "../components/solicitudes/RequestsBoard";

type Tab = "solicitudes" | "tablero" | "despachos";

/**
 * Solicitudes y Despachos en una sola pantalla.
 *
 * Son las dos caras del mismo circuito: la tienda pide el producto
 * (Solicitudes) y el almacén lo manda (Despachos). Al entregar la nota de
 * despacho el stock se mueve solo y las solicitudes quedan listas para que
 * las confirme quien las pidió.
 *
 * El Tablero es la lectura de las dos: muestra en qué paso está cada
 * solicitud sin dejar hacer cambios, para mirar el estado general de un vistazo.
 */
export default function SolicitudesDespachosPage() {
  const [params, setParams] = useSearchParams();
  const { user, permissions } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";
  const canDespach = isAdmin || permissions.includes("despachos");

  const tabParam = params.get("tab");
  const inicial = (
    tabParam === "despachos" && canDespach ? "despachos" : tabParam === "tablero" ? "tablero" : "solicitudes"
  ) as Tab;
  const [tab, setTab] = useState<Tab>(inicial);

  const changeTab = (next: Tab) => {
    setTab(next);
    setParams(next === "solicitudes" ? {} : { tab: next }, { replace: true });
  };

  const tabClass = (activo: boolean) =>
    `flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl border border-b-0 transition-all ${
      activo
        ? "bg-dark-800 border-dark-700/50 text-primary-400"
        : "border-transparent text-gray-400 hover:text-foreground"
    }`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Solicitudes y Despachos</h1>
        <p className="text-gray-400 text-sm mt-1">
          La tienda solicita el producto y el almacén lo despacha. Al entregar la nota, el stock se descuenta
          y las solicitudes quedan para confirmar.
        </p>
      </div>

      <div className="flex gap-2 border-b border-dark-700/50">
        <button onClick={() => changeTab("solicitudes")} className={tabClass(tab === "solicitudes")}>
          <Send size={16} /> Solicitudes
        </button>
        <button onClick={() => changeTab("tablero")} className={tabClass(tab === "tablero")}>
          <LayoutGrid size={16} /> Tablero
        </button>
        {canDespach && (
          <button onClick={() => changeTab("despachos")} className={tabClass(tab === "despachos")}>
            <ListChecks size={16} /> Despachos
          </button>
        )}
      </div>

      {tab === "solicitudes" && <RequestsPage embedded />}
      {tab === "tablero" && <RequestsBoard />}
      {tab === "despachos" && <DespatchListPage embedded />}
    </div>
  );
}
