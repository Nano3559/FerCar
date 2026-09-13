// Clasificador de nombres de producto tipo "PARTE MARCA MODELO AÑO DETALLE"
// Separa un nombre plano en: producto (name), marca (brand), modelo (model),
// año (year) y el resto va a detalles (detail).

export interface ClassifyResult {
  name: string;
  nameChanged: boolean;
  brand?: string;
  model?: string;
  year?: string;
  details?: string;
}

const KNOWN_BRANDS: string[] = [
  "ACURA", "ALFA ROMEO", "AUDI", "BAIC", "BMW", "BRILLIANCE", "BUICK", "BYD",
  "CADILLAC", "CHANGAN", "CHERY", "CHEVROLET", "CHRYSLER", "CITROEN", "DACIA",
  "DAEWOO", "DODGE", "DONGFENG", "DONG FENG", "FIAT", "FORD", "GEELY", "GMC",
  "GREAT WALL", "GREATWALL", "HINO", "HONDA", "HYUNDAI", "INFINITI", "ISUZU",
  "JAC", "JAGUAR", "JEEP", "KIA", "LAND ROVER", "LEXUS", "LIFAN", "MAZDA",
  "MERCEDES", "MERCEDES BENZ", "MINI", "MITSUBISHI", "NISSAN", "OPEL",
  "PEUGEOT", "PONTIAC", "RENAULT", "SAAB", "SANGYONG", "SSANGYONG", "SUBARU",
  "SUZUKI", "TATA", "TOYOTA", "VOLKSWAGEN", "VOLVO", "VW",
];

const BRANDS_BY_LENGTH = [...KNOWN_BRANDS]
  .map((b) => b.toUpperCase())
  .filter((b, i, arr) => arr.indexOf(b) === i)
  .sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length || b.length - a.length);

const YEAR_PATTERNS: RegExp[] = [
  /\b(?:19|20)?\d{2}\s*[-–/]\s*\d{2,4}\b/, // 84-87, 08-12, 93-03, 97-00, 12-14
  /\b(?:19|20)?\d{2}\s*[-–]\s*/,         // rango abierto: 14-, 18-
  /\b(?:19|20)\d{2}\b/,                  // 1998, 2004
];

// Año suelto de 2 dígitos (97), pero solo como token completo: "I-10", "X30"
// no pueden confundirse porque "10" o "30" están pegados a una letra.
const standaloneYear = (text: string): Match | null => {
  const m = /(^|\s)(\d{2})(?=\s|$)/.exec(text);
  if (!m) return null;
  const offset = m[1] ? 1 : 0;
  return { index: m.index + offset, len: 2, value: m[2], priority: 3 };
};

const JUNK = new Set([
  "LED", "LHD", "RHD", "LTD", "XLS", "XL", "SEDAN", "HATCHBACK", "WAGON", "VAGON", "VAGONETA",
  "CABINA", "TURBO", "DIESEL", "CR", "GL", "GLS", "SR", "LS", "LT", "LX", "SE", "S4",
]);

interface Match {
  index: number;
  len: number;
  value: string;
  priority: number;
}

const findBest = (text: string, patterns: RegExp[], priorities: number[]): Match | null => {
  let best: Match | null = null;
  patterns.forEach((re, i) => {
    const m = re.exec(text);
    if (!m) return;
    const cand = { index: m.index, len: m[0].length, value: m[0], priority: priorities[i] };
    if (!best || cand.index < best.index || (cand.index === best.index && cand.len > best.len)) best = cand;
  });
  return best;
};

const findYear = (text: string): Match | null => {
  const base = findBest(text, YEAR_PATTERNS, [0, 1, 2]);
  const single = standaloneYear(text);
  if (!base) return single;
  if (!single) return base;
  if (single.index < base.index) return single;
  if (single.index === base.index && single.len > base.len) return single;
  return base;
};

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findBrand = (text: string): Match & { brand: string } | null => {
  for (const brand of BRANDS_BY_LENGTH) {
    const m = new RegExp(`(^|[\\s/])${escapeRegex(brand)}(?=$|[\\s/])`).exec(text);
    if (m) {
      const start = m[0].startsWith(" ") || m[0].startsWith("/") ? m.index + 1 : m.index;
      return { index: start, len: brand.length, value: brand, priority: 0, brand };
    }
  }
  return null;
};

const normalizeYear = (raw: string): string =>
  raw.replace(/\s+/g, "");

/**
 * Intenta separar un nombre plano. Devuelve null si no reconoce una marca
 * con la que poder dividir (en ese caso no hay forma segura de clasificar).
 */
export function classifyProductName(raw: string): ClassifyResult | null {
  const text = (raw || "").replace(/\s+/g, " ").trim();
  if (text.length < 3) return null;

  const brand = findBrand(text);
  if (!brand) return null;

  const year = findYear(text);

  const beforeBrand = text.slice(0, brand.index).trim();
  const afterBrand = text.slice(brand.index + brand.len).trim();

  let model = "";
  let details = "";
  let yearValue = "";

  if (year && year.index > brand.index) {
    const rest = text.slice(brand.index + brand.len);
    model = rest.slice(0, year.index - (brand.index + brand.len)).trim();
    yearValue = normalizeYear(year.value);
    details = text.slice(year.index + year.len).replace(/\s+/g, " ").trim();
    // Si el modelo quedó vacío y hay " / ALTERNATIVA", usar la alternativa.
    if (!model && details.startsWith("/")) {
      const parts = details.split("/").map((s) => s.trim());
      if (parts.length > 1) { model = parts[1]; details = parts.slice(2).join(" / ").trim(); }
    }
  } else {
    model = afterBrand;
  }

  // Limpiar ruido del modelo: quitar tokens tipo "LED", "LHD", "RHD", colores, etc.
  const cleanModel = model
    .split(/\s+/)
    .filter((w) => !JUNK.has(w.toUpperCase()))
    .join(" ");

  const result: ClassifyResult = {
    name: beforeBrand || text,
    nameChanged: Boolean(beforeBrand),
  };
  if (cleanModel) result.model = cleanModel;
  result.brand = brand.brand;
  if (yearValue) result.year = yearValue;
  if (details) result.details = details;

  if (!result.nameChanged && !result.model && !result.year) return null;

  return result;
}