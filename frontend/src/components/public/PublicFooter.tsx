import { Car, Phone, Mail, MapPin, Clock, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";

const quickLinks = [
  { to: "/", label: "Inicio" },
  { to: "/productos", label: "Productos" },
  { to: "/contacto", label: "Contacto" },
];

const categories = [
  { to: "/productos?category=Frenos", label: "Frenos" },
  { to: "/productos?category=Motor", label: "Motor" },
  { to: "/productos?category=Suspensión", label: "Suspensión" },
  { to: "/productos?category=Eléctrico", label: "Eléctrico" },
  { to: "/productos?category=Carrocería", label: "Carrocería" },
  { to: "/productos", label: "Ver todos" },
];

export default function PublicFooter() {
  return (
    <footer className="bg-dark-900 border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Column 1: Logo & Description */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
                <Car size={22} className="text-foreground" />
              </div>
              <span className="text-lg font-bold text-foreground">RepuestoPro</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">
              Portal de Importadoras de Autopartes.
              <br />
              Todo para tu vehículo, en un solo lugar.
            </p>
            <p className="text-gray-500 text-xs">
              Reúne a 7 importadoras especializadas en autopartes y accesorios automotrices.
            </p>
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
              Enlaces Rápidos
            </h3>
            <ul className="space-y-2">
              {quickLinks.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-gray-400 hover:text-foreground text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Categories */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
              Productos
            </h3>
            <ul className="space-y-2">
              {categories.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-gray-400 hover:text-foreground text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4: Contact */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
              Contacto
            </h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-2 text-gray-400 text-sm">
                <MessageCircle size={14} className="text-green-400 shrink-0" />
                <span>WhatsApp: +591 71234567</span>
              </li>
              <li className="flex items-center gap-2 text-gray-400 text-sm">
                <Phone size={14} className="text-gray-500 shrink-0" />
                <span>+591 4 1234567</span>
              </li>
              <li className="flex items-center gap-2 text-gray-400 text-sm">
                <Mail size={14} className="text-gray-500 shrink-0" />
                <span>contacto@repuestopro.com</span>
              </li>
              <li className="flex items-center gap-2 text-gray-400 text-sm">
                <MapPin size={14} className="text-gray-500 shrink-0" />
                <span>Cochabamba, Bolivia</span>
              </li>
              <li className="flex items-center gap-2 text-gray-400 text-sm">
                <Clock size={14} className="text-gray-500 shrink-0" />
                <span>Lun-Vie: 8:30-18:00 | Sáb: 8:30-13:00</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/[0.06] py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-500 text-sm">
            © 2026 Portal de Importadoras de Autopartes. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
