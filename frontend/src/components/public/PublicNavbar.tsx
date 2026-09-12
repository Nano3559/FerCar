import { NavLink, useNavigate } from "react-router-dom";
import { ArrowRight, Menu, X } from "lucide-react";
import { useState } from "react";

const navLinks = [
  { to: "/", label: "Inicio" },
  { to: "/productos", label: "Productos" },
  { to: "/contacto", label: "Contacto" },
];

export default function PublicNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-dark-950/80 backdrop-blur-md border-b border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <button type="button" onClick={() => navigate("/")} className="flex items-center gap-3 cursor-pointer bg-transparent p-0 border-0">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-600/20 overflow-hidden">
              <img src="/fercar-logo.png" alt="Shibumi" className="w-full h-full object-contain" />
            </div>
            <span className="text-xl font-bold text-foreground">Shibumi</span>
          </button>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-white/[0.08] text-foreground"
                      : "text-gray-400 hover:text-foreground hover:bg-white/[0.04]"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </div>

          <div className="hidden md:block">
            <button
              onClick={() => navigate("/login")}
              className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-all hover:shadow-lg hover:shadow-primary-600/25 flex items-center gap-2"
            >
              Iniciar Sesión
              <ArrowRight size={16} />
            </button>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-gray-400 hover:text-foreground"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden pb-4 border-t border-white/[0.06] mt-2 pt-3 space-y-1">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `block px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-white/[0.08] text-foreground"
                      : "text-gray-400 hover:text-foreground hover:bg-white/[0.04]"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <button
              onClick={() => { navigate("/login"); setMobileOpen(false); }}
              className="w-full mt-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
            >
              Iniciar Sesión <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
