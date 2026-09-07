import { useState } from "react";
import {
  Send,
  Phone,
  Mail,
  MapPin,
  Clock,
  MessageCircle,
  Building2,
  CheckCircle,
  User,
  Car,
  FileText,
} from "lucide-react";

const contactInfo = [
  {
    icon: MessageCircle,
    label: "WhatsApp",
    value: "[Numero pendiente]",
    color: "text-green-400",
    bg: "bg-green-500/10",
  },
  {
    icon: Phone,
    label: "Telefono",
    value: "[Numero pendiente]",
    color: "text-primary-400",
    bg: "bg-primary-500/10",
  },
  {
    icon: Mail,
    label: "Correo",
    value: "[Correo pendiente]",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    icon: MapPin,
    label: "Direccion",
    value: "[Direccion pendiente]",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    icon: Clock,
    label: "Horario",
    value: "Lun-Vie: 8:30-18:00 | Sab: 8:30-13:00",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
  },
];

const placeholderImporters = [
  "Importadora 1", "Importadora 2", "Importadora 3",
  "Importadora 4", "Importadora 5", "Importadora 6", "Importadora 7",
];

interface FormData {
  nombre: string;
  telefono: string;
  email: string;
  marca: string;
  modelo: string;
  anio: string;
  pieza: string;
  mensaje: string;
}

export default function ContactPage() {
  const [form, setForm] = useState<FormData>({
    nombre: "", telefono: "", email: "",
    marca: "", modelo: "", anio: "",
    pieza: "", mensaje: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const inputClass = "w-full bg-dark-900/50 border border-dark-600/50 rounded-xl px-4 py-3 text-sm text-foreground placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all";

  return (
    <div className="bg-dark-950">
      <section className="py-16 sm:py-20 bg-dark-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-5">
            Contáctanos
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto leading-relaxed text-base sm:text-lg">
            ¿No encuentras la pieza que buscas? Envíanos los datos de tu vehículo y la pieza que necesitas. Nuestro equipo podrá ayudarte a encontrar una alternativa disponible entre nuestras importadoras.
          </p>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-dark-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-[1fr,auto] gap-10 lg:gap-14">
            <div>
              <h2 className="text-xl font-bold text-foreground mb-6">Envíanos tu consulta</h2>
              {submitted ? (
                <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-10 text-center">
                  <CheckCircle size={48} className="text-green-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-foreground mb-2">¡Consulta enviada!</h3>
                  <p className="text-gray-400 text-sm mb-6">Nuestro equipo te responderá a la brevedad.</p>
                  <button onClick={() => { setSubmitted(false); setForm({ nombre: "", telefono: "", email: "", marca: "", modelo: "", anio: "", pieza: "", mensaje: "" }); }} className="text-primary-400 hover:text-primary-300 text-sm font-medium transition-colors">
                    Enviar otra consulta
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="contact-nombre" className="block text-sm font-medium text-gray-300 mb-1.5">Nombre *</label>
                      <div className="relative">
                        <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input id="contact-nombre" type="text" name="nombre" required value={form.nombre} onChange={handleChange} placeholder="Tu nombre completo" className={inputClass + " pl-10"} />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="contact-telefono" className="block text-sm font-medium text-gray-300 mb-1.5">Teléfono / WhatsApp *</label>
                      <div className="relative">
                        <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input id="contact-telefono" type="tel" name="telefono" required value={form.telefono} onChange={handleChange} placeholder="+591 71234567" className={inputClass + " pl-10"} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="contact-email" className="block text-sm font-medium text-gray-300 mb-1.5">Correo electrónico</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input id="contact-email" type="email" name="email" value={form.email} onChange={handleChange} placeholder="correo@ejemplo.com" className={inputClass + " pl-10"} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div>
                      <label htmlFor="contact-marca" className="block text-sm font-medium text-gray-300 mb-1.5">Marca del vehículo</label>
                      <div className="relative">
                        <Car size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input id="contact-marca" type="text" name="marca" value={form.marca} onChange={handleChange} placeholder="Toyota, Nissan..." className={inputClass + " pl-10"} />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="contact-modelo" className="block text-sm font-medium text-gray-300 mb-1.5">Modelo</label>
                      <input id="contact-modelo" type="text" name="modelo" value={form.modelo} onChange={handleChange} placeholder="Hilux, Sentra..." className={inputClass} />
                    </div>
                    <div>
                      <label htmlFor="contact-anio" className="block text-sm font-medium text-gray-300 mb-1.5">Año</label>
                      <input id="contact-anio" type="text" name="anio" value={form.anio} onChange={handleChange} placeholder="2020" className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="contact-pieza" className="block text-sm font-medium text-gray-300 mb-1.5">Pieza que necesita *</label>
                    <div className="relative">
                      <FileText size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input id="contact-pieza" type="text" name="pieza" required value={form.pieza} onChange={handleChange} placeholder="Ej: Pastillas de freno delanteras" className={inputClass + " pl-10"} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="contact-mensaje" className="block text-sm font-medium text-gray-300 mb-1.5">Mensaje adicional</label>
                    <textarea id="contact-mensaje" name="mensaje" rows={4} value={form.mensaje} onChange={handleChange} placeholder="Describe cualquier detalle adicional..." className={inputClass + " resize-none"} />
                  </div>
                  <button type="submit" className="w-full sm:w-auto bg-primary-600 hover:bg-primary-700 text-white px-8 py-3.5 rounded-xl text-sm font-semibold transition-all hover:shadow-xl hover:shadow-primary-600/25 flex items-center justify-center gap-2.5">
                    Enviar consulta <Send size={16} />
                  </button>
                </form>
              )}
            </div>

            <div className="lg:w-80 shrink-0">
              <h2 className="text-xl font-bold text-foreground mb-6">Información de contacto</h2>
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-4">
                {contactInfo.map((c) => (
                  <div key={c.label} className="flex items-start gap-3">
                    <div className={`w-9 h-9 ${c.bg} rounded-lg flex items-center justify-center shrink-0 mt-0.5`}>
                      <c.icon size={16} className={c.color} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">{c.label}</p>
                      <p className="text-sm text-gray-300">{c.value}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => alert("Próximamente podrás contactarnos por WhatsApp.")} className="w-full mt-5 bg-green-600 hover:bg-green-500 text-white px-5 py-3 rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-green-600/25 flex items-center justify-center gap-2">
                <MessageCircle size={18} /> Contactar por WhatsApp
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-dark-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Nuestras importadoras</h2>
            <p className="text-gray-400 max-w-xl mx-auto">Red de proveedores especializados en autopartes y accesorios automotrices.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {placeholderImporters.map((name) => (
              <div key={name} className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300">
                <div className="w-11 h-11 bg-primary-600/10 rounded-xl flex items-center justify-center mb-4">
                  <Building2 size={22} className="text-primary-400" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-2">{name}</h3>
                <p className="text-gray-500 text-sm mb-1">[Dirección pendiente]</p>
                <p className="text-gray-500 text-sm">[Teléfono pendiente]</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
