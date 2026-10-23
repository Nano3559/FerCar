import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, FileSpreadsheet, PackageCheck, CheckCircle2, Lock, Download } from "lucide-react";
import * as XLSX from "xlsx";
import api from "../services/api";
import toast from "react-hot-toast";

const API_HOST = (import.meta.env.VITE_API_URL || "http://localhost:3000/api").replace(/\/api\/?$/, "");

interface InvoiceItemEdit {
  id: number;
  factoryCode?: string | null;
  itemCode?: string | null;
  name: string;
  brand: string;
  model: string;
  year: string;
  oemCode?: string | null;
  detail?: string | null;
  quantity: number;
  costUSD: number;
  costBS?: number;
  costTienda?: number;
  price1?: number | null;
  price2?: number | null;
  priceMayor?: number | null;
  price10?: number | null;
  price20?: number | null;
  price30?: number | null;
  price40?: number | null;
  price50?: number | null;
  price60?: number | null;
  price70?: number | null;
  price80?: number | null;
}

interface InvoiceInfo {
  id: number;
  invoiceNumber: string;
  date: string;
  supplierName: string;
  manufacturerName?: string | null;
  locationName?: string | null;
  dimCode?: string | null;
  totalUnits: number;
  exchangeRate?: number | string;
  expensesPer?: number | string;
  marginTienda?: number | string;
  fileUrl?: string | null;
  status: string;
  inventoryAppliedAt?: string | null;
}

const inputClass =
  "px-2 py-1 bg-dark-900 border border-dark-700/50 rounded text-foreground disabled:opacity-60 disabled:cursor-not-allowed";

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceInfo | null>(null);
  const [items, setItems] = useState<InvoiceItemEdit[]>([]);

  useEffect(() => {
    loadDetail();
  }, [id]);

  const loadDetail = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/invoices/${id}/detail`);
      setInvoice(res.data.invoice);
      setItems(res.data.items || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Error cargando factura");
    } finally {
      setLoading(false);
    }
  };

  const locked = !!invoice?.inventoryAppliedAt;

  const updateItem = (idx: number, field: keyof InvoiceItemEdit, value: any) => {
    if (locked) return;
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const saveChanges = async () => {
    try {
      setSaving(true);
      await api.put(`/invoices/${id}/items`, { items });
      toast.success("Cambios guardados. El inventario aún no se ha actualizado.");
      loadDetail();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Error guardando factura");
    } finally {
      setSaving(false);
    }
  };

  const applyInventory = async () => {
    const total = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    const ok = window.confirm(
      `¿Actualizar el inventario con ${items.length} producto(s) y ${total} unidad(es)?\n\nDespués de esto la factura quedará bloqueada y no podrás modificar precios ni cantidades.`
    );
    if (!ok) return;
    try {
      setApplying(true);
      await api.post(`/invoices/${id}/apply-inventory`);
      toast.success("Inventario actualizado. La factura quedó bloqueada.");
      loadDetail();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Error actualizando inventario");
    } finally {
      setApplying(false);
    }
  };

  const exportExcel = () => {
    if (!invoice) return;
    try {
      const rows = items.map((it) => ({
        "COD FABRICA": it.factoryCode || "",
        PRODUCTO: it.name || "",
        MARCA: it.brand || "",
        MODELO: it.model || "",
        AÑO: it.year || "",
        DETALLES: it.detail || "",
        "PRECIO MAYOR":
          it.priceMayor === null || it.priceMayor === undefined ? "" : Number(it.priceMayor),
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 18 },
        { wch: 40 },
        { wch: 16 },
        { wch: 18 },
        { wch: 10 },
        { wch: 36 },
        { wch: 14 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "FACTURA");
      XLSX.writeFile(wb, `Factura-${invoice.invoiceNumber}.xlsx`);
    } catch (e) {
      console.error(e);
      toast.error("Error generando el Excel");
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Cargando factura...</div>;
  }

  if (!invoice) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400 mb-4">Factura no encontrada</p>
        <button onClick={() => navigate("/panel/facturas")} className="px-4 py-2 bg-primary-600 text-white rounded-xl">
          Volver
        </button>
      </div>
    );
  }

  const ex = Number(invoice.exchangeRate) || 0;
  const expPer = Number(invoice.expensesPer) || 0;
  const mT = Number(invoice.marginTienda) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/panel/facturas")}
            className="p-2 border border-dark-700/50 rounded-xl text-gray-300 hover:bg-dark-700/50"
            aria-label="Volver"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Factura {invoice.invoiceNumber}</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              {new Date(invoice.date).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" })} · {invoice.supplierName || "-"} · {invoice.locationName || "-"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {invoice.fileUrl && (
            <a
              href={`${API_HOST}/api/invoices/${invoice.id}/view-file`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 border border-dark-700/50 rounded-xl text-gray-300 hover:bg-dark-700/50"
            >
              <FileSpreadsheet size={16} /> Excel original
            </a>
          )}
          <button
            onClick={exportExcel}
            disabled={!locked || items.length === 0}
            title={!locked ? "Disponible cuando se actualice el inventario" : "Exportar factura en Excel"}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={16} /> Exportar Excel
          </button>
          {!locked && (
            <>
              <button
                onClick={saveChanges}
                disabled={saving || applying}
                className="flex items-center gap-2 px-4 py-2 border border-dark-700/50 rounded-xl text-gray-200 hover:bg-dark-700/50 disabled:opacity-50"
              >
                <Save size={16} /> {saving ? "Guardando..." : "Guardar cambios"}
              </button>
              <button
                onClick={applyInventory}
                disabled={applying || saving || items.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-50"
              >
                <PackageCheck size={16} /> {applying ? "Actualizando..." : "Actualizar inventario"}
              </button>
            </>
          )}
          {locked && (
            <span className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-300 border border-emerald-400 text-black font-bold text-sm">
              <CheckCircle2 size={16} /> Inventario actualizado
            </span>
          )}
        </div>
      </div>

      {locked ? (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-200 border border-emerald-400 text-black text-sm font-semibold">
          <Lock size={16} className="mt-0.5 shrink-0" />
          <p>
            El inventario se actualizó el{" "}
            {new Date(invoice.inventoryAppliedAt as string).toLocaleString("es-VE")}. Esta factura está bloqueada y ya no
            admite modificaciones.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm">
          <PackageCheck size={16} className="mt-0.5 shrink-0" />
          <p>
            Esta factura está en borrador. Puedes editar precios y cantidades y guardar los cambios las veces que
            necesites. El inventario se actualizará solo cuando presiones <strong>Actualizar inventario</strong>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-3">
          <p className="text-xs text-gray-400">Fabricante</p>
          <p className="text-sm text-foreground">{invoice.manufacturerName || "-"}</p>
        </div>
        <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-3">
          <p className="text-xs text-gray-400">Unidades</p>
          <p className="text-sm text-foreground">{invoice.totalUnits}</p>
        </div>
        <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-3">
          <p className="text-xs text-gray-400">Tipo de cambio</p>
          <p className="text-sm text-foreground">{ex.toFixed(2)}</p>
        </div>
        <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-3">
          <p className="text-xs text-gray-400">% Gastos</p>
          <p className="text-sm text-foreground">{expPer.toFixed(2)}</p>
        </div>
        <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-3">
          <p className="text-xs text-gray-400">% Tienda</p>
          <p className="text-sm text-foreground">{mT.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-dark-800 border border-dark-700/50 rounded-xl overflow-hidden">
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="bg-dark-900/70 sticky top-0 z-10">
              <tr>
                <th className="text-left p-2 text-xs text-gray-400 whitespace-nowrap">COD FABRICA</th>
                <th className="text-left p-2 text-xs text-gray-400">PRODUCTO</th>
                <th className="text-left p-2 text-xs text-gray-400">MARCA</th>
                <th className="text-left p-2 text-xs text-gray-400">MODELO</th>
                <th className="text-left p-2 text-xs text-gray-400">AÑO</th>
                <th className="text-left p-2 text-xs text-gray-400">DETALLES</th>
                <th className="text-left p-2 text-xs text-gray-400">COD OEM</th>
                <th className="text-left p-2 text-xs text-gray-400">CANTIDAD</th>
                <th className="text-left p-2 text-xs text-gray-400">COSTO $</th>
                <th className="text-center p-2 text-xs text-gray-400">COSTO BS</th>
                <th className="text-center p-2 text-xs text-gray-400">COSTO TIENDAS</th>
                <th className="text-center p-2 text-xs text-gray-400">20</th>
                <th className="text-center p-2 text-xs text-gray-400">30</th>
                <th className="text-center p-2 text-xs text-gray-400">40</th>
                <th className="text-center p-2 text-xs text-black bg-red-300 border-x border-red-400/50">50</th>
                <th className="text-center p-2 text-xs text-gray-400">60</th>
                <th className="text-center p-2 text-xs text-gray-400">70</th>
                <th className="text-center p-2 text-xs text-gray-400">80</th>
                <th className="text-left p-2 text-xs text-gray-400">PRECIO 1</th>
                <th className="text-left p-2 text-xs text-gray-400">PRECIO 2</th>
                <th className="text-left p-2 text-xs text-gray-400">PRECIO MAYOR</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const costUSD = Number(it.costUSD) || 0;
                const costBS = ex > 0 ? costUSD * (1 + expPer / 100) * ex : 0;
                const costTienda = costBS * (1 + mT / 100);
                const mk = (pct: number) => costBS * (1 + pct / 100);
                return (
                  <tr key={it.id} className="border-t border-dark-700/40">
                    <td className="p-2 text-gray-300 whitespace-nowrap">{it.factoryCode || "-"}</td>
                    <td className="p-2">
                      <input disabled={locked} value={it.name || ""} onChange={(e) => updateItem(idx, "name", e.target.value)} className={`${inputClass} w-40`} />
                    </td>
                    <td className="p-2">
                      <input disabled={locked} value={it.brand || ""} onChange={(e) => updateItem(idx, "brand", e.target.value)} className={`${inputClass} w-24`} />
                    </td>
                    <td className="p-2">
                      <input disabled={locked} value={it.model || ""} onChange={(e) => updateItem(idx, "model", e.target.value)} className={`${inputClass} w-24`} />
                    </td>
                    <td className="p-2">
                      <input disabled={locked} value={it.year || ""} onChange={(e) => updateItem(idx, "year", e.target.value)} className={`${inputClass} w-16`} />
                    </td>
                    <td className="p-2">
                      <input disabled={locked} value={it.detail || ""} onChange={(e) => updateItem(idx, "detail", e.target.value)} className={`${inputClass} w-40`} />
                    </td>
                    <td className="p-2">
                      <input disabled={locked} value={it.oemCode || ""} onChange={(e) => updateItem(idx, "oemCode", e.target.value)} className={`${inputClass} w-28`} />
                    </td>
                    <td className="p-2">
                      <input disabled={locked} type="number" value={it.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} className={`${inputClass} w-16`} />
                    </td>
                    <td className="p-2">
                      <input disabled={locked} type="number" step="0.01" value={it.costUSD} onChange={(e) => updateItem(idx, "costUSD", Number(e.target.value))} className={`${inputClass} w-20`} />
                    </td>
                    <td className="p-2 text-gray-300 text-center whitespace-nowrap">{costBS.toFixed(2)}</td>
                    <td className="p-2 text-gray-300 text-center whitespace-nowrap">{costTienda.toFixed(2)}</td>
                    <td className="p-2 text-gray-300 text-center">{mk(20).toFixed(2)}</td>
                    <td className="p-2 text-gray-300 text-center">{mk(30).toFixed(2)}</td>
                    <td className="p-2 text-gray-300 text-center">{mk(40).toFixed(2)}</td>
                    <td className="p-2 text-black text-center bg-red-200 border-x border-red-400/50 font-bold">{mk(50).toFixed(2)}</td>
                    <td className="p-2 text-gray-300 text-center">{mk(60).toFixed(2)}</td>
                    <td className="p-2 text-gray-300 text-center">{mk(70).toFixed(2)}</td>
                    <td className="p-2 text-gray-300 text-center">{mk(80).toFixed(2)}</td>
                    <td className="p-2">
                      <input disabled={locked} type="number" step="0.01" value={it.price1 ?? ""} onChange={(e) => updateItem(idx, "price1", e.target.value === "" ? null : Number(e.target.value))} className={`${inputClass} w-20`} />
                    </td>
                    <td className="p-2">
                      <input disabled={locked} type="number" step="0.01" value={it.price2 ?? ""} onChange={(e) => updateItem(idx, "price2", e.target.value === "" ? null : Number(e.target.value))} className={`${inputClass} w-20`} />
                    </td>
                    <td className="p-2">
                      <input disabled={locked} type="number" step="0.01" value={it.priceMayor ?? ""} onChange={(e) => updateItem(idx, "priceMayor", e.target.value === "" ? null : Number(e.target.value))} className={`${inputClass} w-24`} />
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={21} className="p-6 text-center text-gray-400">Sin items</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
