import { useState, useEffect, useRef, useId } from "react";
import { Search, X, Check } from "lucide-react";

interface AutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  label?: string;
  className?: string;
}

export default function Autocomplete({
  value,
  onChange,
  suggestions,
  placeholder = "Escribir para buscar...",
  label,
  className = "",
}: AutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [filtered, setFiltered] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const inputId = useId();

  useEffect(() => {
    if (value.trim() === "") {
      setFiltered(suggestions.slice(0, 10));
    } else {
      const lower = value.toLowerCase();
      const matches = suggestions.filter((s) => s.toLowerCase().includes(lower));
      setFiltered(matches.slice(0, 10));
    }
  }, [value, suggestions]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (item: string) => {
    onChange(item);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? filtered.length - 1 : prev - 1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && filtered[activeIndex]) {
        e.preventDefault();
        handleSelect(filtered[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const showOptions = isOpen && filtered.length > 0;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label ? (
        <label htmlFor={inputId} className="block text-xs text-gray-400 mb-1.5">
          {label}
        </label>
      ) : (
        <label htmlFor={inputId} className="sr-only">
          {placeholder}
        </label>
      )}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        <input
          id={inputId}
          role="combobox"
          aria-expanded={showOptions}
          aria-controls={showOptions ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            showOptions && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
          }
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setActiveIndex(-1);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-8 pr-8 py-2 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary-500 outline-none placeholder-gray-600"
        />
        {value && (
          <button
            onClick={() => { onChange(""); setIsOpen(false); setActiveIndex(-1); }}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {showOptions && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Sugerencias"
          className="absolute z-50 w-full mt-1 bg-dark-800 border border-dark-700/50 rounded-xl shadow-xl max-h-48 overflow-y-auto"
        >
          {filtered.map((item, idx) => (
            <button
              key={item}
              id={`${listboxId}-${idx}`}
              role="option"
              aria-selected={activeIndex === idx}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setActiveIndex(idx)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors first:rounded-t-xl last:rounded-b-xl ${
                activeIndex === idx
                  ? "bg-primary-600/10 text-primary-400"
                  : "text-gray-300 hover:bg-dark-700/50 hover:text-foreground"
              }`}
            >
              {item}
              {activeIndex === idx && <Check size={12} className="inline ml-1.5 -mt-0.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}