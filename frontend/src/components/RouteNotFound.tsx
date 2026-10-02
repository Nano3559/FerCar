import { Link, useLocation } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

/** Ruta que no existe dentro del panel. Sin esto React Router no renderiza
 *  nada y el usuario ve una pantalla completamente en blanco. */
export default function RouteNotFound() {
  const { pathname } = useLocation();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-5">
        <AlertTriangle size={26} className="text-amber-400" />
      </div>

      <h2 className="text-lg font-semibold text-foreground mb-2">Esta pantalla no existe</h2>
      <p className="text-sm text-gray-400 max-w-md">
        El enlace apunta a <span className="font-mono text-gray-300">{pathname}</span>, que no es una
        ruta de la aplicación. Es probable que un botón apunte a una dirección equivocada.
      </p>

      <Link
        to="/panel"
        className="mt-6 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
      >
        Volver al panel
      </Link>
    </div>
  );
}