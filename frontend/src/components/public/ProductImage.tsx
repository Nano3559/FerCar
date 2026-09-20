interface ProductImageProps {
  category?: string | null;
  name?: string;
  image?: string | null;
  className?: string;
}

const categoryConfig: Record<string, { bg: string; icon: string; label: string }> = {
  Frenos: { bg: "#DC2626", icon: "⚙", label: "FRENOS" },
  Motor: { bg: "#2563EB", icon: "🔧", label: "MOTOR" },
  "Suspensión": { bg: "#16A34A", icon: "🛞", label: "SUSPENSIÓN" },
  Filtros: { bg: "#D97706", icon: "🔘", label: "FILTROS" },
  Eléctrico: { bg: "#0891B2", icon: "⚡", label: "ELÉCTRICO" },
  Carrocería: { bg: "#7C3AED", icon: "🚗", label: "CARROCERÍA" },
  Transmisión: { bg: "#0D9488", icon: "⛓", label: "TRANSMISIÓN" },
};

const embedAngleUrl = "https://lh3.googleusercontent.com/d/";

export const toEmbedUrl = (u: string): string => {
  const driveFile = u.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (driveFile) return `${embedAngleUrl}${driveFile[1]}=w1600`;
  const driveOpen = u.match(/drive\.google\.com\/open\?id=([^&#]+)/);
  if (driveOpen) return `${embedAngleUrl}${driveOpen[1]}=w1600`;
  return u;
};

export default function ProductImage({ category, name, image, className = "" }: ProductImageProps) {
  if (image) {
    return (
      <img
        src={toEmbedUrl(image)}
        alt={name || "Producto"}
        className={`w-full h-full object-contain ${className}`}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
          (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
        }}
      />
    );
  }

  const config = categoryConfig[category || ""] || { bg: "#4B5563", icon: "📦", label: "PRODUCTO" };

  return (
    <div className={`w-full h-full flex flex-col items-center justify-center ${image ? "hidden" : ""} ${className}`}>
      <svg viewBox="0 0 200 200" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={`grad-${category}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={config.bg} stopOpacity="0.15" />
            <stop offset="100%" stopColor={config.bg} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <rect width="200" height="200" fill={`url(#grad-${category})`} rx="12" />
        <circle cx="100" cy="85" r="40" fill={config.bg} fillOpacity="0.2" stroke={config.bg} strokeWidth="2" strokeOpacity="0.3" />
        <text x="100" y="95" textAnchor="middle" fontSize="36" fill={config.bg} fillOpacity="0.7">
          {config.icon}
        </text>
        <rect x="40" y="140" width="120" height="28" rx="6" fill={config.bg} fillOpacity="0.15" />
        <text x="100" y="159" textAnchor="middle" fontSize="11" fontWeight="700" fill={config.bg} fillOpacity="0.8" letterSpacing="2">
          {config.label}
        </text>
      </svg>
    </div>
  );
}
