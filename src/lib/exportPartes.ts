import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { computeCascade } from "./cascade";

export interface ParteExportRow {
  id: string;
  date: string;
  estado: string;
  kg_mujeres_manual: number;
  kg_podrido_calibrador_manual: number;
  kg_reciclado_manual: number;
  kg_reciclado_malla_z1: number;
  kg_reciclado_malla_z2: number;
  kg_podrido_manual: number;
  kg_inventario_final: number;
  kg_palets_pendientes_anterior?: number;
  notas_inventario: string | null;
  notas_generales: string | null;
  resumen_ia: any;
}

const num = (n: number) => Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;

function buildCascadeFor(p: ParteExportRow) {
  return computeCascade({
    kg_production_total: Number(p.resumen_ia?.kg_produccion_total ?? 0),
    kg_palets_alta: Number(p.resumen_ia?.kg_palets_alta ?? 0),
    kg_mujeres_manual: Number(p.resumen_ia?.kg_mujeres_l ?? p.kg_mujeres_manual ?? 0),
    kg_podrido_calibrador_manual: Number(p.resumen_ia?.kg_podrido_server ?? p.kg_podrido_calibrador_manual ?? 0),
    kg_reciclado_manual: p.kg_reciclado_manual,
    kg_reciclado_malla_z1: p.kg_reciclado_malla_z1,
    kg_reciclado_malla_z2: p.kg_reciclado_malla_z2,
    kg_podrido_manual: p.kg_podrido_manual,
    kg_inventario_final: p.kg_inventario_final,
    kg_palets_pendientes_anterior: p.kg_palets_pendientes_anterior ?? 0,
  });
}

function buildSummaryRow(p: ParteExportRow) {
  const c = buildCascadeFor(p);
  const muestra = Number(p.resumen_ia?.kg_muestra ?? 0);
  return {
    Fecha: p.date,
    Estado: p.estado,
    "Resumen Calibrador (kg)": num(c.produced),
    "Industria de la punta (kg)": num(p.kg_reciclado_manual),
    "Mujeres L (kg)": num(Number(p.resumen_ia?.kg_mujeres_l ?? p.kg_mujeres_manual ?? 0)),
    "Palets alta (kg)": num(c.palets),
    "Inventario final (kg)": num(p.kg_inventario_final),
    "Palets pendientes día ant. (kg)": num(p.kg_palets_pendientes_anterior ?? 0),
    "Podrido calibrador (kg)": num(Number(p.resumen_ia?.kg_podrido_server ?? p.kg_podrido_calibrador_manual ?? 0)),
    "Reciclado malla Z1 (kg)": num(p.kg_reciclado_malla_z1),
    "Reciclado malla Z2 (kg)": num(p.kg_reciclado_malla_z2),
    "Podrido manual bolsa basura (kg)": num(p.kg_podrido_manual),
    "Muestra (kg)": num(muestra),
    "Diferencia bruta (kg)": num(c.grossDiff),
    "Merma total (kg)": num(c.totalShrinkage),
    "Dif. justificada por podrido y merma natural (kg)": num(c.unjustifiedDiff),
    "% Dif. justificada": num(c.realDeviationPct),
    "Notas generales": p.notas_generales ?? "",
    "Notas inventario": p.notas_inventario ?? "",
  };
}

function fileStamp(from: string, to: string) {
  return from === to ? from : `${from}_a_${to}`;
}

export function exportToExcel(partes: ParteExportRow[], from: string, to: string) {
  const wb = XLSX.utils.book_new();

  // Resumen
  const summary = partes.map(buildSummaryRow);
  const wsSum = XLSX.utils.json_to_sheet(summary);
  XLSX.utils.book_append_sheet(wb, wsSum, "Resumen");

  // Cascada por parte
  const cascadeRows: any[] = [];
  partes.forEach((p) => {
    const c = buildCascadeFor(p);
    c.steps.forEach((s) => {
      cascadeRows.push({
        Fecha: p.date,
        Paso: s.key,
        Operación: s.isMinus ? "−" : (s.key === "production" ? "=" : "+"),
        "Valor (kg)": num(s.value),
        "Acumulado (kg)": num(s.running),
      });
    });
    cascadeRows.push({
      Fecha: p.date,
      Paso: "diferencia_sin_justificar",
      Operación: "=",
      "Valor (kg)": num(c.unjustifiedDiff),
      "Acumulado (kg)": num(c.unjustifiedDiff),
    });
  });
  if (cascadeRows.length) {
    const wsC = XLSX.utils.json_to_sheet(cascadeRows);
    XLSX.utils.book_append_sheet(wb, wsC, "Cascada");
  }

  // Valores extraídos por IA (raw)
  const iaRows = partes.map((p) => ({
    Fecha: p.date,
    "kg_produccion_total": num(Number(p.resumen_ia?.kg_produccion_total ?? 0)),
    "kg_palets_alta": num(Number(p.resumen_ia?.kg_palets_alta ?? 0)),
    "kg_inventario_final": num(Number(p.resumen_ia?.kg_inventario_final ?? 0)),
    "kg_mujeres_precalibrador": num(Number(p.resumen_ia?.kg_mujeres_precalibrador ?? 0)),
    "kg_mujeres_l": num(Number(p.resumen_ia?.kg_mujeres_l ?? 0)),
    "kg_podrido_server": num(Number(p.resumen_ia?.kg_podrido_server ?? 0)),
    "kg_reciclados": num(Number(p.resumen_ia?.kg_reciclados ?? 0)),
    "kg_muestra": num(Number(p.resumen_ia?.kg_muestra ?? 0)),
    "Análisis IA": (p.resumen_ia?.analisis ?? "").toString().slice(0, 32000),
  }));
  const wsIA = XLSX.utils.json_to_sheet(iaRows);
  XLSX.utils.book_append_sheet(wb, wsIA, "Valores IA");

  XLSX.writeFile(wb, `partes_${fileStamp(from, to)}.xlsx`);
}

export function exportToPDF(partes: ParteExportRow[], from: string, to: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const title = partes.length === 1
    ? `Parte diario — ${partes[0].date}`
    : `Partes diarios — ${from} a ${to}`;

  doc.setFontSize(16);
  doc.text(title, 40, 40);
  doc.setFontSize(10);
  doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 40, 58);

  // Tabla resumen
  const summary = partes.map(buildSummaryRow);
  const head = [[
    "Fecha", "Estado", "Resumen Calibrador", "+Industria punta", "−Mujeres L",
    "−Palets", "−Inventario", "−Podrido C.", "−Recic. Z1", "−Recic. Z2",
    "−Podrido manual b.b.", "Dif. bruta", "Merma", "Dif. just. p./m.n.", "% Dif. just.",
  ]];
  const body = summary.map((r) => [
    r.Fecha,
    r.Estado,
    r["Resumen Calibrador (kg)"].toLocaleString("es-ES"),
    r["Industria de la punta (kg)"].toLocaleString("es-ES"),
    r["Mujeres L (kg)"].toLocaleString("es-ES"),
    r["Palets alta (kg)"].toLocaleString("es-ES"),
    r["Inventario final (kg)"].toLocaleString("es-ES"),
    r["Podrido calibrador (kg)"].toLocaleString("es-ES"),
    r["Reciclado malla Z1 (kg)"].toLocaleString("es-ES"),
    r["Reciclado malla Z2 (kg)"].toLocaleString("es-ES"),
    r["Podrido manual bolsa basura (kg)"].toLocaleString("es-ES"),
    r["Diferencia bruta (kg)"].toLocaleString("es-ES"),
    r["Merma total (kg)"].toLocaleString("es-ES"),
    r["Dif. justificada por podrido y merma natural (kg)"].toLocaleString("es-ES"),
    `${r["% Dif. justificada"].toFixed(2)}%`,
  ]);

  autoTable(doc, {
    startY: 75,
    head,
    body,
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 55 } },
  });

  // Detalle por parte (cascada + notas + análisis IA)
  partes.forEach((p) => {
    const c = buildCascadeFor(p);
    doc.addPage();
    doc.setFontSize(14);
    doc.text(`Parte ${p.date} — ${p.estado}`, 40, 40);

    autoTable(doc, {
      startY: 60,
      head: [["Paso de la cascada", "Operación", "Valor (kg)", "Acumulado (kg)"]],
      body: c.steps.map((s) => [
        s.key,
        s.isMinus ? "−" : (s.key === "production" ? "=" : "+"),
        num(s.value).toLocaleString("es-ES"),
        num(s.running).toLocaleString("es-ES"),
      ]).concat([[
        "= Diferencia sin justificar", "=",
        num(c.unjustifiedDiff).toLocaleString("es-ES"),
        `${num(c.realDeviationPct).toFixed(2)}%`,
      ]]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    });

    let y = (doc as any).lastAutoTable.finalY + 20;
    if (p.notas_generales) {
      doc.setFontSize(11);
      doc.text("Notas generales:", 40, y);
      y += 14;
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(p.notas_generales, 760);
      doc.text(lines, 40, y);
      y += lines.length * 11 + 10;
    }
    if (p.notas_inventario) {
      doc.setFontSize(11);
      doc.text("Notas inventario:", 40, y);
      y += 14;
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(p.notas_inventario, 760);
      doc.text(lines, 40, y);
      y += lines.length * 11 + 10;
    }
    const analisis = p.resumen_ia?.analisis;
    if (analisis) {
      if (y > 480) { doc.addPage(); y = 40; }
      doc.setFontSize(11);
      doc.text("Análisis IA:", 40, y);
      y += 14;
      doc.setFontSize(8);
      const lines = doc.splitTextToSize(String(analisis), 760);
      doc.text(lines, 40, y);
    }
  });

  doc.save(`partes_${fileStamp(from, to)}.pdf`);
}
