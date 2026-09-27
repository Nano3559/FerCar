export interface QuoteDocItem {
  itemCode: string;
  name: string;
  brand?: string | null;
  quantity: number;
  unitPrice: number;
  priceTier?: number | null;
}

interface QuoteDocumentProps {
  id: string;
  code?: string | null;
  date: Date;
  title: string;
  storeName: string;
  sellerName: string;
  clientName?: string | null;
  items: QuoteDocItem[];
  total: number;
  /** Al reimprimir una cotización vieja se marca como copia. */
  copyOf?: string | null;
}

const formatBs = (v: number) =>
  `Bs. ${v.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Documento de cotización listo para imprimir.
 *
 * Se renderiza fuera de la pantalla (left: -9999px) y se captura con
 * html2canvas, asi que todo el estilo va en linea y sin dependencias externas:
 * un <img> externo puede fallar al capturar y romperia el PDF.
 */
export default function QuoteDocument({
  id, code, date, title, storeName, sellerName, clientName, items, total, copyOf,
}: QuoteDocumentProps) {
  const unitCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div id={id} className="fixed" style={{ left: "-9999px", top: 0, width: "680px", background: "#ffffff", color: "#111827", fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: "12px" }}>
      <div style={{ padding: "0 40px 30px" }}>
        {/* Encabezado */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "26px 0 18px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "4px", height: "40px", backgroundColor: "#f59e0b", borderRadius: "2px" }} />
            <div>
              <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#111827", margin: 0, letterSpacing: "3px", lineHeight: 1.1 }}>
                COTIZACIÓN
              </h1>
              <p style={{ margin: "4px 0 0", color: "#9ca3af", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                {title}
              </p>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            {code && (
              <p style={{ margin: 0, fontSize: "10px", color: "#9ca3af", letterSpacing: "1.5px", textTransform: "uppercase" }}>Código</p>
            )}
            {code && (
              <p style={{ margin: "3px 0 0", fontSize: "15px", fontWeight: 600, color: "#111827", letterSpacing: "0.5px" }}>
                {code}
              </p>
            )}
            <p style={{ margin: code ? "10px 0 0" : 0, fontSize: "10px", color: "#9ca3af", letterSpacing: "1.5px", textTransform: "uppercase" }}>Fecha</p>
            <p style={{ margin: "3px 0 0", fontSize: "15px", fontWeight: 600, color: "#111827" }}>
              {date.toLocaleDateString("es-BO")}
            </p>
          </div>
        </div>

        {/* Tienda, vendedor y cliente */}
        <div style={{ display: "flex", gap: "12px", margin: "20px 0 22px" }}>
          <div style={{ flex: 1, backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "12px 14px" }}>
            <p style={{ margin: 0, fontSize: "9px", color: "#9ca3af", letterSpacing: "1.2px", textTransform: "uppercase" }}>Tienda</p>
            <p style={{ margin: "5px 0 0", fontSize: "15px", fontWeight: 700, color: "#111827" }}>{storeName || "—"}</p>
          </div>
          <div style={{ flex: 1, backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "12px 14px" }}>
            <p style={{ margin: 0, fontSize: "9px", color: "#9ca3af", letterSpacing: "1.2px", textTransform: "uppercase" }}>Vendedor</p>
            <p style={{ margin: "5px 0 0", fontSize: "15px", fontWeight: 700, color: "#111827" }}>{sellerName || "—"}</p>
          </div>
          <div style={{ flex: 1, backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "12px 14px" }}>
            <p style={{ margin: 0, fontSize: "9px", color: "#9ca3af", letterSpacing: "1.2px", textTransform: "uppercase" }}>Cliente</p>
            <p style={{ margin: "5px 0 0", fontSize: "15px", fontWeight: 700, color: "#111827" }}>{clientName || "—"}</p>
          </div>
        </div>

        {/* Detalle */}
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "15%" }} />
            <col style={{ width: "41%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "17%" }} />
          </colgroup>
          <thead>
            <tr style={{ backgroundColor: "#111827" }}>
              <th style={{ padding: "10px 12px", textAlign: "left", color: "#ffffff", fontSize: "9px", fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", borderRadius: "6px 0 0 6px" }}>Código</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: "#ffffff", fontSize: "9px", fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase" }}>Producto</th>
              <th style={{ padding: "10px 12px", textAlign: "center", color: "#ffffff", fontSize: "9px", fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase" }}>Cant.</th>
              <th style={{ padding: "10px 12px", textAlign: "right", color: "#ffffff", fontSize: "9px", fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase" }}>P. unitario</th>
              <th style={{ padding: "10px 12px", textAlign: "right", color: "#ffffff", fontSize: "9px", fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", borderRadius: "0 6px 6px 0" }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={`${it.itemCode}-${idx}`} style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid #e5e7eb", color: "#6b7280", fontSize: "11px" }}>{it.itemCode}</td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid #e5e7eb", color: "#111827", fontSize: "12px" }}>
                  <span style={{ fontWeight: 600 }}>{it.name}</span>
                  <span style={{ color: "#9ca3af", fontSize: "11px" }}> · {it.brand || "—"}</span>
                </td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid #e5e7eb", textAlign: "center", color: "#374151", fontSize: "12px" }}>{it.quantity}</td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid #e5e7eb", textAlign: "right", whiteSpace: "nowrap", color: "#374151", fontSize: "12px" }}>
                  {formatBs(it.unitPrice)}
                </td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid #e5e7eb", textAlign: "right", whiteSpace: "nowrap", color: "#111827", fontSize: "12px", fontWeight: 600 }}>
                  {formatBs(it.unitPrice * it.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Total */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "18px" }}>
          <div style={{ minWidth: "240px", backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "14px 20px", textAlign: "right" }}>
            <p style={{ margin: 0, fontSize: "9px", color: "#b45309", letterSpacing: "1.5px", textTransform: "uppercase" }}>Total a cotizar</p>
            <p style={{ margin: "4px 0 0", fontSize: "24px", fontWeight: 700, color: "#b45309", letterSpacing: "-0.5px" }}>
              {formatBs(total)}
            </p>
          </div>
        </div>

        {/* Pie */}
        <div style={{ margin: "26px 0 0", padding: "14px 0 0", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ margin: 0, fontSize: "10px", color: "#9ca3af" }}>
            {items.length} producto(s) · {unitCount} unidad(es)
          </p>
          <p style={{ margin: 0, fontSize: "11px", color: "#374151", fontWeight: 600 }}>¡Gracias por su compra!</p>
        </div>
        <p style={{ margin: "6px 0 0", fontSize: "9px", color: "#9ca3af", textAlign: "center", letterSpacing: "0.5px" }}>
          {copyOf ? `Copia de la cotización ${copyOf}` : "Cotización sin valor fiscal"}
        </p>
      </div>
    </div>
  );
}
