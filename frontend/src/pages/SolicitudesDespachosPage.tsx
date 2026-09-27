import { useState } from "react";
import { Send, ListChecks } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import RequestsPage from "./RequestsPage";
import DespatchListPage from "./DespatchListPage";

type Tab = "solicitudes" | "despachos";

/**
 * Solicitudes y Despachos en una sola pantalla.
 *
 * Son las dos caras del mismo circuito: la tienda pide el producto
 * (Solicitudes) y el almacén lo manda (Despachos). Al entregar la nota de
 * despacho el stock se mueve solo y las solicitudes quedan listas para que
 * las confirme quien las pidió.
 */
export default function SolicitudesDespachosPage() {
  const [params, setParams] = useSearchParams();
  const { user, permissions } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";
  const canDespach = isAdmin || permissions.includes("despachos");

  const inicial = (params.get("tab") === "despachos" && canDespach ? "despachos" : "solicitudes") as Tab;
  const [tab, setTab] = useState<Tab>(inicial);

  const changeTab = (next: Tab) => {
    setTab(next);
    setParams(next === "despachos" ? { tab: "despachos" } : {}, { replace: true });
  };

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
        <button
          onClick={() => changeTab("solicitudes")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl border border-b-0 transition-all ${
            tab === "solicitudes"
              ? "bg-dark-800 border-dark-700/50 text-primary-400"
              : "border-transparent text-gray-400 hover:text-foreground"
          }`}
        >
          <Send size={16} /> Solicitudes
        </button>
        {canDespach && (
          <button
            onClick={() => changeTab("despachos")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl border border-b-0 transition-all ${
              tab === "despachos"
                ? "bg-dark-800 border-dark-700/50 text-primary-400"
                : "border-transparent text-gray-400 hover:text-foreground"
            }`}
          >
            <ListChecks size={16} /> Despachos
          </button>
        )}
      </div>

      {tab === "solicitudes" ? <RequestsPage embedded /> : <DespatchListPage embedded />}
    </div>
  );
}
