import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { toEmbedUrl } from "./public/ProductImage";

interface ProductThumbProps {
  image?: string | null;
  name?: string;
  /** Lado del cuadrado en px. */
  size?: number;
  className?: string;
  /** Si se pasa, la miniatura se vuelve un botón (p. ej. para ampliar la foto). */
  onClick?: () => void;
}

/**
 * Miniatura de la foto de un producto. Acepta las URLs de Google Drive tal como
 * se guardan en la base y las manda por el proxy del backend (`toEmbedUrl`),
 * porque el enlace `uc?export=view` directo no se puede mostrar en el navegador.
 * Si el producto no tiene foto, o la foto falla, muestra un icono neutro.
 */
export default function ProductThumb({
  image,
  name,
  size = 44,
  className = "",
  onClick,
}: ProductThumbProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [image]);

  const src = image ? toEmbedUrl(image) : null;
  const hasImage = !!src && !failed;

  const inner = hasImage ? (
    <img
      src={src!}
      alt={name || "Producto"}
      referrerPolicy="no-referrer"
      loading="lazy"
      className="w-full h-full object-cover"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="w-full h-full flex items-center justify-center text-gray-600" title="Sin imagen">
      <ImageOff size={Math.max(14, Math.round(size * 0.38))} />
    </span>
  );

  const base = `shrink-0 overflow-hidden rounded-lg bg-dark-900 border border-dark-700/50 ${className}`;
  const style = { width: size, height: size };

  if (onClick && hasImage) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Ver imagen"
        className={`${base} block cursor-zoom-in`}
        style={style}
      >
        {inner}
      </button>
    );
  }

  return (
    <span className={`${base} inline-flex`} style={style}>
      {inner}
    </span>
  );
}
