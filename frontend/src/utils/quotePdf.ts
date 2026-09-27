import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

/**
 * Vuelca la captura en el PDF repartida en paginas A4. Sin esto la imagen
 * entra entera en la primera pagina y el resto se pierde, dejando ademas una
 * pagina en blanco al final.
 */
export const addCanvasAsA4Pages = (pdf: jsPDF, canvas: HTMLCanvasElement) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const sliceHeightPx = Math.floor((canvas.width / pageWidth) * pageHeight);
  const totalSlices = Math.max(1, Math.ceil(canvas.height / sliceHeightPx));

  for (let i = 0; i < totalSlices; i++) {
    const y = i * sliceHeightPx;
    const h = Math.min(sliceHeightPx, canvas.height - y);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = h;
    const ctx = slice.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (i > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL("image/png"), "PNG", 0, 0, pageWidth, (h * pageWidth) / canvas.width);
  }
};

/** Captura un documento oculto y lo guarda como PDF A4. */
export const downloadElementAsPdf = async (elementId: string, fileName: string) => {
  const el = document.getElementById(elementId);
  if (!el) throw new Error("No se encontro el documento a imprimir");
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
  const pdf = new jsPDF("p", "mm", "a4");
  addCanvasAsA4Pages(pdf, canvas);
  pdf.save(fileName);
};
