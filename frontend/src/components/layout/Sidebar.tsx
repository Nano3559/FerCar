import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Package, ShoppingCart, TrendingUp,
  ArrowLeftRight, DollarSign, BarChart3, Settings,
  RotateCcw, Send, Tags, LogOut, X, ListChecks, ClipboardList,
} from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

const allLinks = [
  { to: "/panel", label: "Dashboard", icon: LayoutDashboard, module: "" },
  { to: "/panel/inventario", label: "Inventario", icon: Package, module: "inventario" },
  { to: "/panel/ventas", label: "Ventas", icon: ShoppingCart, module: "ventas" },
  { to: "/panel/ventas-mayor", label: "Ventas por Mayor", icon: TrendingUp, module: "ventas-mayor" },
  { to: "/panel/devoluciones", label: "Devoluciones", icon: RotateCcw, module: "devoluciones" },
  { to: "/panel/solicitudes", label: "Solicitudes", icon: Send, module: "solicitudes" },
  { to: "/panel/movimientos", label: "Movimientos", icon: ArrowLeftRight, module: "movimientos" },
  { to: "/panel/despachos", label: "Lista de Despacho", icon: ListChecks, module: "despachos" },
  { to: "/panel/costos", label: "Costos", icon: DollarSign, module: "costos" },
  { to: "/panel/precios", label: "Precios", icon: Tags, module: "precios" },
  { to: "/panel/notas-compra", label: "Notas de Compra", icon: ClipboardList, module: "notas-compra" },
  { to: "/panel/reportes", label: "Reportes", icon: BarChart3, module: "reportes" },
  { to: "/panel/configuracion", label: "Configuración", icon: Settings, module: "configuracion" },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout, permissions } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const role = user?.role || "";
  const isAdmin = role === "ADMIN";

  const links = allLinks.filter((l) => {
    if (!l.module) return true; // Dashboard always visible
    if (isAdmin) return true; // ADMIN sees everything
    return permissions.includes(l.module) || (l.module === "inventario" && permissions.includes("productos"));
  });

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  useEffect(() => {
    onClose();
  }, [location.pathname]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-dark-900 border-r border-dark-700/50 flex flex-col
        transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0 md:z-auto md:visible
        ${open ? "translate-x-0" : "-translate-x-full invisible"}
      `}>
        <div className="p-5 border-b border-dark-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-600/20 overflow-hidden">
                <img src="/fercar-logo.png" alt="RepuestoPro" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">RepuestoPro</h1>
                <p className="text-xs text-gray-500">{role || "Sistema"}</p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Cerrar menú" className="p-1.5 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-lg transition-all md:hidden">
              <X size={20} />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/panel"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  isActive
                    ? "bg-primary-600/10 text-primary-400 border border-primary-600/20"
                    : "text-gray-400 hover:bg-dark-800 hover:text-gray-200 border border-transparent"
                }`
              }
            >
              <link.icon size={18} />
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-dark-700/50">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:bg-red-500/10 hover:text-red-400 border border-transparent hover:border-red-500/20 transition-all"
          >
            <LogOut size={18} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
}
