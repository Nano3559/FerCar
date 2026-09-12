import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  X,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Star,
  Truck,
  Shield,
  Phone,
  Image as ImageIcon,
} from "lucide-react";
import ProductImage from "../components/public/ProductImage";
import api from "../services/api";

interface ProductCard {
  id: number;
  itemCode: string;
  name: string;
  brand: string;
  model: string;
  year: string;
  detalles: string | null;
  image: string | null;
  category: string | null;
  availability: string;
  price1: number;
  price2: number;
}

interface Filters {
  brands: string[];
  categories: string[];
  qualities: string[];
}

interface ImageSearchResult {
  id: number;
  itemCode: string;
  name: string;
  brand: string;
  model: string;
  year: string;
  image: string | null;
  price1: number;
  price2: number;
  totalStock: number;
}

const bannerSlides = [
  {
    title: "Las mejores autopartes del mercado",
    subtitle: "Más de 7 importadoras reunidas en un solo lugar",
    cta: "Ver catálogo",
    accent: "from-primary-600/20 to-primary-800/10",
    icon: <Truck size={48} className="text-primary-400" />,
  },
  {
    title: "Envíos a todo Bolivia",
    subtitle: "Recibe tus repuestos donde estés, rápido y seguro",
    cta: "Explorar productos",
    accent: "from-green-600/20 to-green-800/10",
    icon: <Shield size={48} className="text-green-400" />,
  },
  {
    title: "¿No encontrás tu repuesto?",
    subtitle: "Contactanos y lo conseguimos para vos",
    cta: "Escribinos",
    accent: "from-green-600/20 to-emerald-800/10",
    icon: <Phone size={48} className="text-green-400" />,
    onClick: () => alert("Próximamente podrás contactarnos por WhatsApp. ¡Escríbenos a contacto@shibumi.com!"),
  },
];

export default function PublicProductsPage() {
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [featured, setFeatured] = useState<ProductCard[]>([]);
  const [filters, setFilters] = useState<Filters>({ brands: [], categories: [], qualities: [] });
  const [models, setModels] = useState<string[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [category, setCategory] = useState("");
  const [detalles, setDetalles] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageResults, setImageResults] = useState<ImageSearchResult[]>([]);
  const [imageSearching, setImageSearching] = useState(false);

  const [currentSlide, setCurrentSlide] = useState(0);

  const searchByImage = async () => {
    if (!imageFile) return;
    const data = new FormData();
    data.append("image", imageFile);
    try {
      setImageSearching(true);
      const res = await api.post("/products/search-image", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImageResults(res.data.products || []);
      if (!(res.data.products || []).length) alert("No encontramos productos relacionados con la imagen.");
    } catch {
      setImageResults([]);
      alert("No se pudo buscar la imagen. Intenta nuevamente.");
    } finally {
      setImageSearching(false);
    }
  };

  useEffect(() => {
    api.get("/public/filters").then((res) => setFilters(res.data));
    api.get("/public/products?limit=4").then((res) => setFeatured(res.data.products));
  }, []);

  useEffect(() => {
    if (brand) {
      api.get(`/public/filters/models?brand=${encodeURIComponent(brand)}`).then((res) => {
        setModels(res.data);
        setModel("");
      });
    } else {
      setModels([]);
      setModel("");
    }
  }, [brand]);

  useEffect(() => {
    if (brand || model) {
      const params = new URLSearchParams();
      if (brand) params.set("brand", brand);
      if (model) params.set("model", model);
      api.get(`/public/filters/years?${params.toString()}`).then((res) => {
        setYears(res.data);
        setYear("");
      });
    } else {
      setYears([]);
      setYear("");
    }
  }, [brand, model]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (brand) params.set("brand", brand);
    if (model) params.set("model", model);
    if (year) params.set("year", year);
    if (category) params.set("category", category);
    if (detalles) params.set("detalles", detalles);

    api
      .get(`/public/products?${params.toString()}`)
      .then((res) => {
        setProducts(res.data.products);
        setTotal(res.data.pagination.total);
      })
      .finally(() => setLoading(false));
  }, [search, brand, model, year, category, detalles]);

  const clearFilters = () => {
    setSearch("");
    setBrand("");
    setModel("");
    setYear("");
    setCategory("");
    setDetalles("");
  };

  const hasFilters = search || brand || model || year || category || detalles;

  const availabilityColor = (status: string) => {
    if (status === "Disponible") return "text-green-400 bg-green-500/10 border-green-500/20";
    if (status === "Pocas unidades") return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
    return "text-gray-400 bg-gray-500/10 border-gray-500/20";
  };

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % bannerSlides.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + bannerSlides.length) % bannerSlides.length);
  }, []);

  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(nextSlide, 5000);
    return () => clearInterval(timer);
  }, [nextSlide, paused]);

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Carousel */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16">
          <div className="relative bg-dark-900/60 border border-white/[0.06] rounded-3xl overflow-hidden" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
            {bannerSlides.map((slide, i) => (
              <div
                key={i}
                aria-hidden={i !== currentSlide}
                className={`transition-all duration-700 ease-in-out ${
                  i === currentSlide ? "opacity-100 relative" : "invisible opacity-0 absolute inset-0"
                }`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${slide.accent} pointer-events-none`} />
                <div className="relative flex flex-col md:flex-row items-center gap-8 px-8 md:px-14 py-12 md:py-16">
                  <div className="flex-1 text-center md:text-left">
                    <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-3 leading-tight">
                      {slide.title}
                    </h2>
                    <p className="text-gray-400 text-sm md:text-base mb-6 max-w-md">
                      {slide.subtitle}
                    </p>
                    {slide.onClick ? (
                      <button
                        onClick={slide.onClick}
                        className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-all"
                      >
                        {slide.cta}
                        <ChevronRight size={16} />
                      </button>
                    ) : (
                      <Link
                        to="/productos"
                        onClick={() => {
                          if (i === 0) clearFilters();
                        }}
                        className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-all"
                      >
                        {slide.cta}
                        <ChevronRight size={16} />
                      </Link>
                    )}
                  </div>
                  <div className="shrink-0 hidden md:flex items-center justify-center w-28 h-28 bg-white/[0.04] rounded-2xl">
                    {slide.icon}
                  </div>
                </div>
              </div>
            ))}

            {/* Arrows */}
            <button
              onClick={prevSlide}
              aria-label="Diapositiva anterior"
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-dark-800/70 hover:bg-dark-700 text-gray-400 hover:text-foreground rounded-full transition-all border border-white/[0.06] z-10"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={nextSlide}
              aria-label="Siguiente diapositiva"
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-dark-800/70 hover:bg-dark-700 text-gray-400 hover:text-foreground rounded-full transition-all border border-white/[0.06] z-10"
            >
              <ChevronRight size={18} />
            </button>

            {/* Dots */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
              {bannerSlides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  aria-label={`Ir a la diapositiva ${i + 1}`}
                  aria-current={i === currentSlide}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === currentSlide ? "bg-primary-400 w-6" : "bg-gray-600 hover:bg-gray-500"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Productos destacados */}
      {featured.length > 0 && !hasFilters && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
          <div className="flex items-center gap-3 mb-6">
            <Star size={20} className="text-amber-400" />
            <h2 className="text-xl font-bold text-foreground">Productos destacados</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {featured.map((product) => (
              <Link
                key={product.id}
                to={`/productos/${product.id}`}
                className="group bg-dark-800/30 border border-white/[0.06] rounded-2xl overflow-hidden hover:border-primary-500/30 transition-all duration-300"
              >
                <div className="aspect-square bg-dark-900/50 flex items-center justify-center p-4">
                  <ProductImage image={product.image} category={product.category} name={product.name} className="group-hover:scale-105 transition-transform duration-300" />
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-semibold text-foreground mb-1 line-clamp-2 leading-tight">{product.name}</h3>
                  <p className="text-xs text-gray-500 mb-2">{product.brand} · {product.model}</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border uppercase tracking-wider ${availabilityColor(product.availability)}`}>
                    {product.availability}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Catálogo completo */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-2xl mx-auto">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, código OEM o código de fábrica..."
              aria-label="Buscar productos"
              className="w-full pl-12 pr-12 py-3.5 bg-dark-800/50 border border-white/[0.06] rounded-xl text-foreground placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-foreground">
                <X size={18} />
              </button>
            )}
          </div>
          <div className="max-w-2xl mx-auto mt-3 flex flex-wrap items-center justify-center gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2.5 bg-dark-800/50 border border-white/[0.06] rounded-xl text-gray-300 text-sm cursor-pointer hover:border-primary-500/50 transition-colors">
              <ImageIcon size={16} className="text-primary-400" />
              {imageFile ? imageFile.name : "Buscar por imagen"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
            </label>
            {imageFile && (
              <>
                <button onClick={searchByImage} disabled={imageSearching}
                  className="px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                  {imageSearching ? "Buscando..." : "Buscar"}
                </button>
                <button onClick={() => { setImageFile(null); setImageResults([]); }} className="p-2.5 text-gray-400 hover:text-foreground" title="Limpiar imagen">
                  <X size={16} />
                </button>
              </>
            )}
          </div>
        </div>

        {imageResults.length > 0 && (
          <section className="mb-8 bg-dark-800/30 border border-primary-500/20 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-foreground font-semibold">Resultados por imagen</h2>
              <span className="text-xs text-gray-500">{imageResults.length} coincidencias</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {imageResults.map((product) => (
                <Link key={product.id} to={`/productos/${product.id}`} className="bg-dark-900/40 border border-white/[0.06] rounded-xl overflow-hidden hover:border-primary-500/40 transition-colors">
                  <div className="aspect-square flex items-center justify-center p-4 bg-dark-900/50">
                    <ProductImage image={product.image} category={null} name={product.name} />
                  </div>
                  <div className="p-3 space-y-1">
                    <p className="text-foreground text-sm font-medium line-clamp-2">{product.name}</p>
                    <p className="text-xs text-gray-500">{product.brand} · {product.model}</p>
                    <p className="text-xs text-gray-400">Código: {product.itemCode}</p>
                    <div className="flex justify-between text-xs pt-1"><span className="text-amber-400">Bs. {(Number(product.price2) > 0 ? Number(product.price2) : Number(product.price1)).toFixed(2)}</span><span className="text-green-400">Stock: {product.totalStock}</span></div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Filters */}
        <div className="bg-dark-800/30 border border-white/[0.06] rounded-2xl p-4 mb-8">
          <div className="flex items-center gap-2 mb-3 text-gray-400">
            <Filter size={16} />
            <span className="text-sm font-medium">Filtros</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="relative">
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-white/[0.06] rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8"
              >
                <option value="">Marca</option>
                {filters.brands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={!brand}
                className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-white/[0.06] rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8 disabled:opacity-40"
              >
                <option value="">Modelo</option>
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                disabled={!brand && !model}
                className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-white/[0.06] rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8 disabled:opacity-40"
              >
                <option value="">Año</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-white/[0.06] rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8"
              >
                <option value="">Categoría</option>
                {filters.categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={detalles}
                onChange={(e) => setDetalles(e.target.value)}
                className="w-full appearance-none px-3 py-2.5 bg-dark-900/50 border border-white/[0.06] rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none pr-8"
              >
                <option value="">Detalles</option>
                {filters.qualities.map((q) => <option key={q} value={q}>{q}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm hover:bg-red-500/20 transition-colors"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-gray-400 text-sm">
            {total} producto{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-400">Cargando productos...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 bg-dark-800/30 border border-white/[0.06] rounded-2xl">
            <Search size={48} className="text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg mb-2">No encontramos productos con estos criterios</p>
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={clearFilters}
                className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition-all"
              >
                Limpiar filtros
              </button>
              <button
                onClick={() => alert("Próximamente podrás contactarnos por WhatsApp. ¡Escríbenos a contacto@shibumi.com!")}
                className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition-all"
              >
                Consultar por WhatsApp
              </button>
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {products.map((product) => (
              <Link
                key={product.id}
                to={`/productos/${product.id}`}
                className="group bg-dark-800/30 border border-white/[0.06] rounded-2xl overflow-hidden hover:border-white/[0.12] transition-all duration-300"
              >
                <div className="aspect-square bg-dark-900/50 flex items-center justify-center p-6">
                  <ProductImage image={product.image} category={product.category} name={product.name} />
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border uppercase tracking-wider ${availabilityColor(product.availability)}`}>
                      {product.availability}
                    </span>
                    {product.detalles && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md border text-blue-400 bg-blue-500/10 border-blue-500/20 uppercase tracking-wider">
                        {product.detalles}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1 line-clamp-2">{product.name}</h3>
                  <p className="text-xs text-gray-500 mb-1">{product.brand} · {product.model}</p>
                  <p className="text-xs text-gray-500 mb-3">Años: {product.year}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-primary-400 text-sm font-semibold">Ver producto</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
