import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MessageCircle, MapPin, Phone, Search } from "lucide-react";
import api from "../services/api";
import ProductImage from "../components/public/ProductImage";

interface ProductDetail {
  id: number;
  itemCode: string;
  name: string;
  manufacturer: string;
  brand: string;
  model: string;
  year: string;
  detail: string | null;
  detalles: string | null;
  image: string | null;
  oemCode: string | null;
  factoryCode: string | null;
  price1: number;
  price2: number;
  category: string | null;
  availability: string;
  importers: Array<{
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    city: string | null;
    address: string | null;
    description: string | null;
  }>;
}

export default function PublicProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      api.get(`/public/products/${id}`)
        .then((res) => setProduct(res.data))
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="text-center">
          <Search size={48} className="text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">Producto no encontrado</p>
          <Link to="/productos" className="text-primary-400 hover:text-primary-300 text-sm mt-4 inline-block">
            ← Volver al catálogo
          </Link>
        </div>
      </div>
    );
  }

  const availabilityColor = (status: string) => {
    if (status === "Disponible") return "text-green-400 bg-green-500/10 border-green-500/20";
    if (status === "Pocas unidades") return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
    return "text-gray-400 bg-gray-500/10 border-gray-500/20";
  };

  return (
    <div className="min-h-screen bg-dark-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back */}
        <Link to="/productos" className="inline-flex items-center gap-2 text-gray-400 hover:text-foreground text-sm mb-6 transition-colors">
          <ArrowLeft size={16} />
          Volver al catálogo
        </Link>

        <div className="grid lg:grid-cols-2 gap-10">
          {/* Image */}
          <div className="bg-dark-800/30 border border-white/[0.06] rounded-2xl aspect-square flex items-center justify-center p-10">
            <ProductImage image={product.image} category={product.category} name={product.name} />
          </div>

          {/* Info */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border uppercase tracking-wider ${availabilityColor(product.availability)}`}>
                {product.availability}
              </span>
              {product.detalles && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-lg border text-blue-400 bg-blue-500/10 border-blue-500/20 uppercase tracking-wider">
                  {product.detalles}
                </span>
              )}
            </div>

            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">{product.name}</h1>
            <p className="text-gray-400 mb-6">{product.manufacturer}</p>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-dark-800/30 border border-white/[0.06] rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">Marca</p>
                <p className="text-sm font-medium text-foreground">{product.brand}</p>
              </div>
              <div className="bg-dark-800/30 border border-white/[0.06] rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">Modelo</p>
                <p className="text-sm font-medium text-foreground">{product.model}</p>
              </div>
              <div className="bg-dark-800/30 border border-white/[0.06] rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">Años</p>
                <p className="text-sm font-medium text-foreground">{product.year}</p>
              </div>
              {product.category && (
                <div className="bg-dark-800/30 border border-white/[0.06] rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Categoría</p>
                  <p className="text-sm font-medium text-foreground">{product.category}</p>
                </div>
              )}
              {product.oemCode && (
                <div className="bg-dark-800/30 border border-white/[0.06] rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Código OEM</p>
                  <p className="text-sm font-medium text-foreground">{product.oemCode}</p>
                </div>
              )}
              {product.factoryCode && (
                <div className="bg-dark-800/30 border border-white/[0.06] rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Código Fábrica</p>
                  <p className="text-sm font-medium text-foreground">{product.factoryCode}</p>
                </div>
              )}
            </div>

            {product.detail && (
              <p className="text-gray-400 text-sm mb-6 leading-relaxed">{product.detail}</p>
            )}

            {/* WhatsApp */}
            <button
              onClick={() => alert("Próximamente podrás contactarnos por WhatsApp. ¡Escríbenos a contacto@repuestopro.com!")}
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-medium transition-all"
            >
              <MessageCircle size={18} />
              Consultar por WhatsApp
            </button>
          </div>
        </div>

        {/* Importers */}
        {product.importers.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-bold text-foreground mb-6">Disponible en</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {product.importers.map((imp) => (
                <div key={imp.id} className="bg-dark-800/30 border border-white/[0.06] rounded-2xl p-5">
                  <h3 className="text-base font-semibold text-foreground mb-2">{imp.name}</h3>
                  {imp.description && <p className="text-gray-400 text-xs mb-3">{imp.description}</p>}
                  <div className="space-y-1.5">
                    {imp.city && (
                      <p className="flex items-center gap-2 text-gray-400 text-xs">
                        <MapPin size={12} className="text-gray-500 shrink-0" />
                        {imp.city}
                      </p>
                    )}
                    {imp.phone && (
                      <p className="flex items-center gap-2 text-gray-400 text-xs">
                        <Phone size={12} className="text-gray-500 shrink-0" />
                        {imp.phone}
                      </p>
                    )}
                  </div>
                  {imp.phone && (
                    <button
                      onClick={() => alert(`Próximamente podrás contactar a ${imp.name} por WhatsApp.`)}
                      className="mt-3 inline-flex items-center gap-1.5 text-green-400 hover:text-green-300 text-xs font-medium transition-colors"
                    >
                      <MessageCircle size={12} />
                      Consultar
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
