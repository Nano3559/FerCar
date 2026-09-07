import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import ProductImage from "../public/ProductImage";

interface ImagePreviewProps {
  image?: string | null;
  category?: string | null;
  name?: string;
  onClick: () => void;
  className?: string;
}

const PREVIEW_W = 272;
const PREVIEW_H = 236;

export default function ImagePreview({ image, category, name, onClick, className = "" }: ImagePreviewProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = r.right + 12;
    if (left + PREVIEW_W > window.innerWidth - 8) left = r.left - PREVIEW_W - 12;
    if (left < 8) left = 8;
    let top = r.top;
    if (top + PREVIEW_H > window.innerHeight - 8) top = window.innerHeight - PREVIEW_H - 8;
    if (top < 8) top = 8;
    setPos({ top, left });
  };

  const hide = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={onClick}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        title="Ver imagen ampliada"
        className={`w-10 h-10 bg-dark-900/50 rounded-lg flex items-center justify-center overflow-hidden cursor-zoom-in hover:ring-2 hover:ring-primary-500/50 transition-all shrink-0 ${className}`}
      >
        <ProductImage image={image} category={category} name={name} />
      </button>
      {pos &&
        createPortal(
          <div className="pointer-events-none fixed z-[70]" style={{ top: pos.top, left: pos.left }}>
            <div className="w-[272px] bg-dark-800 border border-dark-700/50 rounded-2xl shadow-2xl">
              <div className="h-44 p-2 flex items-center justify-center">
                <ProductImage image={image} category={category} name={name} className="max-h-full w-auto" />
              </div>
              <p className="px-3 pb-2.5 text-xs text-gray-300 truncate">{name || "Producto"}</p>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}