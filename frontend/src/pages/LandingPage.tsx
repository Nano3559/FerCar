import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  ArrowRight,
  Package,
  Tag,
  Users,
  Store,
  ChevronRight,
  Car,
  Settings,
  Search,
} from "lucide-react";
import api from "../services/api";

interface FeaturedProduct {
  id: number;
  name: string;
  brand: string;
  model: string;
  year: string;
  detalles: string | null;
  image: string | null;
  category: string | null;
  availability: string;
  price1: number;
}

const benefits = [
  {
    icon: Store,
    title: "7 Importadoras",
    desc: "Una red de importadoras especializadas reunidas en una sola plataforma.",
  },
  {
    icon: Package,
    title: "+10,000 productos",
    desc: "Amplia disponibilidad de autopartes y accesorios automotrices.",
  },
  {
    icon: Car,
    title: "Multimarca",
    desc: "Repuestos para numerosas marcas y modelos de veh\u00edculos.",
  },
  {
    icon: Tag,
    title: "Diferentes detalles",
    desc: "Alternativas para diferentes necesidades y presupuestos.",
  },
];

const steps = [
  { label: "Marca", icon: Car },
  { label: "Modelo", icon: Settings },
  { label: "A\u00f1o", icon: Search },
  { label: "Categor\u00eda", icon: Tag },
  { label: "Producto", icon: Package },
];

function ProductCardPlaceholder({ product }: { product: FeaturedProduct }) {
  const categoryColors: Record<string, string> = {
    Frenos: "text-red-400 bg-red-500/10 border-red-500/20",
    Motor: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    "Suspensi\u00f3n": "text-green-400 bg-green-500/10 border-green-500/20",
    Filtros: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    El\u00e9ctrico: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    Carrocer\u00eda: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  };
  const catClass =
    product.category && categoryColors[product.category]
      ? categoryColors[product.category]
      : "text-gray-400 bg-gray-500/10 border-gray-500/20";

  const availClass =
    product.availability === "Disponible"
      ? "text-emerald-400 bg-emerald-500/10"
      : product.availability === "Pocas unidades"
      ? "text-amber-400 bg-amber-500/10"
      : "text-gray-400 bg-gray-500/10";

  return (
    <Link
      to={`/productos/${product.id}`}
      className="group bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300"
    >
      <div className="aspect-square bg-dark-800/50 flex items-center justify-center p-6 border-b border-white/[0.04]">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-contain"
          />
        ) : (
          <Package size={48} className="text-gray-600/40" strokeWidth={1} />
        )}
      </div>
      <div className="p-4">
        {product.category && (
          <span
            className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-md border mb-2 uppercase tracking-wider ${catClass}`}
          >
            {product.category}
          </span>
        )}
        <h3 className="text-sm font-semibold text-foreground mb-1 leading-snug line-clamp-2">
          {product.name}
        </h3>
        <p className="text-xs text-gray-500 mb-2">
          {product.brand} {product.model}
        </p>
        <div className="flex items-center justify-between">
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${availClass}`}
          >
            {product.availability}
          </span>
          <ChevronRight
            size={14}
            className="text-gray-600 group-hover:text-primary-400 transition-colors"
          />
        </div>
      </div>
    </Link>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [featured, setFeatured] = useState<FeaturedProduct[]>([]);

  useEffect(() => {
    api
      .get("/public/products?limit=4")
      .then((r) => setFeatured(r.data.products || []))
      .catch(() => {});
  }, []);

  return (
    <div className="bg-dark-950">
      {/* HERO */}
      <section className="relative min-h-[85vh] flex items-center overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07]">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary-500 rounded-full blur-[140px]" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent rounded-full blur-[140px]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-500/10 border border-primary-500/20 rounded-full mb-6">
              <span className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" />
              <span className="text-xs font-semibold text-primary-400 uppercase tracking-wider">
                7 importadoras reunidas
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-foreground leading-[1.1] tracking-tight mb-6">
              Portal de Importadoras de
              <br />
              <span className="text-gradient">Autopartes</span>
            </h1>

            <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mb-4 leading-relaxed">
              Todo para tu veh&iacute;culo, en un solo lugar.
            </p>
            <p className="text-base text-gray-500 max-w-2xl mb-10 leading-relaxed">
              Somos un grupo de 7 importadoras especializadas en autopartes y
              accesorios automotrices, con m&aacute;s de 10,000 productos para
              diferentes marcas, modelos y tipos de veh&iacute;culos.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => navigate("/productos")}
                className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3.5 rounded-xl text-sm font-semibold transition-all hover:shadow-xl hover:shadow-primary-600/25 flex items-center gap-2.5"
              >
                Ver productos
                <ArrowRight size={16} />
              </button>
              <button
                onClick={() => navigate("/contacto")}
                className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-gray-300 px-8 py-3.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2.5"
              >
                Contactar
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-16 max-w-3xl">
            {[
              { n: "10,000+", l: "Productos" },
              { n: "7", l: "Importadoras" },
              { n: "7", l: "Ubicaciones" },
              { n: "Multimarca", l: "Repuestos" },
            ].map((s) => (
              <div
                key={s.l}
                className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-4 text-center"
              >
                <p className="text-xl sm:text-2xl font-bold text-foreground">
                  {s.n}
                </p>
                <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">
                  {s.l}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BENEFICIOS */}
      <section className="py-20 sm:py-24 bg-dark-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Por qu&eacute; elegirnos?
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              Soluciones integrales para el mantenimiento de tu flota vehicular.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {benefits.map((b) => (
              <div
                key={b.title}
                className="group bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300 text-center"
              >
                <div className="w-12 h-12 bg-primary-600/10 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:bg-primary-600/15 transition-colors">
                  <b.icon size={24} className="text-primary-400" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-2">
                  {b.title}
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {b.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRODUCTOS DESTACADOS */}
      <section className="py-20 sm:py-24 bg-dark-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
                Productos destacados
              </h2>
              <p className="text-gray-400 text-sm">
                Explora algunos de nuestros productos disponibles.
              </p>
            </div>
            <button
              onClick={() => navigate("/productos")}
              className="text-primary-400 hover:text-primary-300 text-sm font-medium flex items-center gap-1 transition-colors shrink-0"
            >
              Ver todos los productos <ArrowRight size={14} />
            </button>
          </div>

          {featured.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {featured.map((p) => (
                <ProductCardPlaceholder key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden animate-pulse"
                >
                  <div className="aspect-square bg-dark-800/50" />
                  <div className="p-4 space-y-3">
                    <div className="h-3 bg-dark-700/50 rounded w-1/3" />
                    <div className="h-4 bg-dark-700/50 rounded w-3/4" />
                    <div className="h-3 bg-dark-700/50 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ENCUENTRA LO QUE NECESITAS */}
      <section className="py-20 sm:py-24 bg-dark-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Encuentra la pieza que necesitas
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto mb-12">
            Consulta autopartes seg&uacute;n la marca, modelo, a&ntilde;o y tipo
            de pieza de tu veh&iacute;culo.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mb-10 max-w-3xl mx-auto">
            {steps.map((s, i) => (
              <div key={s.label} className="flex items-center gap-3 sm:gap-4">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white/[0.04] border border-white/[0.08] rounded-xl flex items-center justify-center">
                    <s.icon size={22} className="text-primary-400" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium">
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <ChevronRight
                    size={16}
                    className="text-gray-600 mt-[-16px] hidden sm:block"
                  />
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => navigate("/productos")}
            className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3.5 rounded-xl text-sm font-semibold transition-all hover:shadow-xl hover:shadow-primary-600/25 flex items-center gap-2.5 mx-auto"
          >
            <Search size={16} />
            Buscar productos
          </button>
        </div>
      </section>

      {/* VENTA MAYOR Y MENOR */}
      <section className="py-20 sm:py-24 bg-dark-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-8 sm:p-10 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300">
              <div className="w-12 h-12 bg-primary-600/10 rounded-xl flex items-center justify-center mb-5">
                <Users size={24} className="text-primary-400" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">
                Venta por mayor
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Atenci&oacute;n para tiendas de repuestos, talleres,
                distribuidores, comerciantes y empresas.
              </p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-8 sm:p-10 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300">
              <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mb-5">
                <Store size={24} className="text-accent" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">
                Venta por menor
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Encuentra la pieza espec&iacute;fica que necesitas para tu
                autom&oacute;vil, camioneta o SUV.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CALL TO ACTION */}
      <section className="py-20 sm:py-24 bg-dark-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              &iquest;No encuentras el repuesto que necesitas?
            </h2>
            <p className="text-gray-400 mb-8 leading-relaxed">
              Env&iacute;anos la marca, modelo, a&ntilde;o y pieza que
              est&aacute;s buscando y te ayudaremos a encontrar una alternativa
              disponible.
            </p>
            <button
              onClick={() => navigate("/contacto")}
              className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3.5 rounded-xl text-sm font-semibold transition-all hover:shadow-xl hover:shadow-primary-600/25 inline-flex items-center gap-2.5"
            >
              Contactarnos
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
