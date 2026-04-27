/**
 * Edge function: analiza un parte diario de Lasarte SAT (DSJ Citrícola).
 *
 * 1. Lee los archivos adjuntos (xlsx, imágenes) del parte.
 * 2. Extrae datos deterministas server-side:
 *    - Informe_produccion.xlsx → produccion_calibrador_kg
 *    - Informe_tamanos_clase_calidad_variedad.xlsx → mujeres_kg (clase L)
 *    - Informe_producto.xlsx → podrido_calibrador_kg
 *    - palets_DDMMAAAA.xlsx → palets_alta_kg (suma Netos)
 * 3. Envía datos al modelo IA para análisis cualitativo y extracción de lotes/producción detallada.
 * 4. Calcula la cascada DSJ completa (producción real → diferencia bruta → DSJ).
 * 5. Persiste todo en resumen_ia y actualiza el estado del parte.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── DSJ Cascade computation (mirrors src/lib/cascade.ts) ───

interface CascadeInputs {
  kg_production_total: number;
  kg_palets_alta: number;
  kg_mujeres_manual: number;
  kg_podrido_calibrador_manual: number;
  kg_reciclado_manual: number;
  kg_reciclado_malla_z1: number;
  kg_reciclado_malla_z2: number;
  kg_podrido_manual: number;
  kg_inventario_final: number;
  kg_palets_pendientes_anterior: number;
}

type SemaforoLevel = "verde" | "amarillo" | "rojo";

interface CascadeStep {
  key: string;
  label: string;
  value: number;
  running: number;
  isMinus: boolean;
}

interface CascadeOutput {
  steps: CascadeStep[];
  produced: number;
  produccionReal: number;
  paletsAjustados: number;
  grossDiff: number;
  totalShrinkage: number;
  unjustifiedDiff: number;
  realDiff: number;
  deviationPct: number;
  realDeviationPct: number;
  semaforo: SemaforoLevel;
  alerts: string[];
}

function computeCascade(i: CascadeInputs): CascadeOutput {
  const produced = Number(i.kg_production_total) || 0;
  const palets = Number(i.kg_palets_alta) || 0;
  const invFinal = Number(i.kg_inventario_final) || 0;
  const invAnterior = Number(i.kg_palets_pendientes_anterior) || 0;
  const mL = Number(i.kg_mujeres_manual) || 0;
  const pc = Number(i.kg_podrido_calibrador_manual) || 0;
  const industria = Number(i.kg_reciclado_manual) || 0;
  const rz1 = Number(i.kg_reciclado_malla_z1) || 0;
  const rz2 = Number(i.kg_reciclado_malla_z2) || 0;
  const pm = Number(i.kg_podrido_manual) || 0;

  const produccionReal = produced + industria - mL - rz1 - rz2;
  const paletsAjustados = palets - invAnterior;
  const grossDiff = produccionReal - paletsAjustados - invFinal;
  const totalShrinkage = pc + pm;
  const unjustifiedDiff = grossDiff - totalShrinkage;
  const deviationPct = produccionReal > 0 ? (grossDiff / produccionReal) * 100 : 0;
  const realDeviationPct = produccionReal > 0 ? (unjustifiedDiff / produccionReal) * 100 : 0;

  const semaforo: SemaforoLevel =
    Math.abs(realDeviationPct) < 1 ? "verde" :
    Math.abs(realDeviationPct) <= 3 ? "amarillo" : "rojo";

  const alerts: string[] = [];
  if (palets > produccionReal + invFinal + 1000) {
    alerts.push("Posible fila TOTAL incluida en palets");
  }
  if (unjustifiedDiff < -500) {
    alerts.push("DSJ negativa: revisar inventario final del día anterior o duplicidades en palets");
  }
  if (produccionReal <= 0 && produced > 0) {
    alerts.push("Producción real <= 0: revisar valores de mujeres y reciclado");
  }
  if (produced <= 0) {
    alerts.push("No se ha podido extraer la producción del calibrador");
  }
  if (palets <= 0 && produced > 0) {
    alerts.push("No se ha podido extraer el peso de palets dados de alta");
  }

  const steps: CascadeStep[] = [
    { key: "production", label: "Producción calibrador", value: produced, isMinus: false, running: 0 },
    { key: "industria", label: "+ Industria", value: industria, isMinus: false, running: 0 },
    { key: "mujeres_l", label: "− Mujeres (L)", value: mL, isMinus: true, running: 0 },
    { key: "reciclado_z1", label: "− Reciclado Z1", value: rz1, isMinus: true, running: 0 },
    { key: "reciclado_z2", label: "− Reciclado Z2", value: rz2, isMinus: true, running: 0 },
    { key: "palets", label: "− Palets ajustados (alta − inv. ant.)", value: paletsAjustados, isMinus: true, running: 0 },
    { key: "inventario", label: "− Inventario final", value: invFinal, isMinus: true, running: 0 },
    { key: "podrido_calib", label: "− Podrido calibrador", value: pc, isMinus: true, running: 0 },
    { key: "podrido_manual", label: "− Podrido manual", value: pm, isMinus: true, running: 0 },
  ];

  let running = 0;
  steps.forEach((s, idx) => {
    if (idx === 0) running = s.value;
    else if (s.isMinus) running -= s.value;
    else running += s.value;
    s.running = running;
  });

  return {
    steps, produced, produccionReal, paletsAjustados, grossDiff,
    totalShrinkage, unjustifiedDiff, realDiff: unjustifiedDiff,
    deviationPct, realDeviationPct, semaforo, alerts,
  };
}

// ─── Helpers ───

const norm = (s: unknown): string =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const toNum = (v: unknown): number => {
  if (v == null || v === "") return NaN;
  if (typeof v === "number") return v;
  const s = String(v).trim().replace(/\s/g, "");
  if (/,\d+$/.test(s)) return parseFloat(s.replace(/\./g, "").replace(",", "."));
  return parseFloat(s.replace(/,/g, ""));
};

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

interface FileMeta {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  mime_type: string | null;
}

type Src = { file: string; sheet: string; note?: string };

// ─── AI prompt (updated for DSJ spec) ───

const sysPrompt = `Eres un analista de la planta de cítricos Lasarte SAT. Extraes datos EXACTOS de archivos del parte diario. NO inventes. NO redondees. NO agrupes a tu criterio.

Vas a recibir varios archivos. Identifícalos por el NOMBRE (no por el file_type) y aplica EXACTAMENTE estas reglas:

────────────────────────────────────────────────────────────────────
A) ARCHIVO "Informe_produccion.xlsx" (resumen del calibrador Spectrim)
   → Estructura típica: filas con "Nombre del Lote", "Fecha", "Peso (kg)", "Empaques", etc.
   → Hay filas de DETALLE (cada lote procesado) y al final una fila de TOTALES + posibles notas.
   → "kg_produccion_total" = valor de la columna "Peso (kg)" en la fila de TOTALES.
       Reglas para identificar la fila de totales:
         (a) Es la fila donde "Nombre del Lote" es un NÚMERO (cuenta de lotes), o
         (b) Si no, es la ÚLTIMA FILA con datos numéricos en Peso(kg) antes de las notas/comentarios,
             y suele tener vacío el campo Fecha o decir "Total".
       NUNCA sumes filas de detalle a mano: usa el total ya impreso.
   → Si solo hay una fila de detalle, ese es el total. Si hay varias, NO las sumes — usa la fila resumen.

B) ARCHIVO "Informe_tamanos_clase_calidad_variedad.xlsx" (también puede llamarse "Informe_tamanos.xlsx" o similar con "tama" / "clase" / "calidad" en el nombre)
   ⚠️⚠️⚠️ ATENCIÓN MÁXIMA — ERROR FRECUENTE QUE DEBES EVITAR ⚠️⚠️⚠️
   El archivo tiene MUCHAS columnas. Las relevantes son:
     Variedad | Clase (S/M/L/XL...) | Calibre/Tamaño | Peso(kg) | Empaques | Fruta | ...
   La columna **Peso(kg)** suele ser la 4ª-5ª columna de datos.
   La columna **Fruta** es el NÚMERO DE PIEZAS, NO kilos.
   La columna **Empaques** es el NÚMERO DE CAJAS, NO kilos.

   ❌ NUNCA leas "Fruta" / "Empaques" / "Empaque" como kg.
   ✅ SIEMPRE usa la columna cuyo header es exactamente "Peso(kg)" o "Peso (kg)".

   Reglas:
     • "kg_mujeres_l" = SUMA de la columna **Peso(kg)** de TODAS las filas cuya columna **Clase** sea
       exactamente "L" o contenga "Mujeres" (clase L = "mujeres"). Case-insensitive. Suma TODAS las variedades con clase L.
       Resultado típico: ~2.000-7.000 kg.
       IMPORTANTE: Las mujeres NO son una merma. Se restan de producción porque el calibrador las cuenta dos veces al recalibrarlas.

C) ARCHIVO "Informe_producto.xlsx" (desglose por producto)
   → Detectar cabecera con columnas "Producto" y "Peso(kg)".
   → "kg_podrido_calibrador" = Peso(kg) de la fila donde Producto = "PODRIDO" (case-insensitive, trim).
   → EXCLUIR filas con Producto = "MUESTRA" o "PREC" — NO entran en DSJ.
   → Si no hay fila PODRIDO, devolver 0.

D) ARCHIVO DE PALETS "palets_DDMMAAAA.xlsx" (también puede ser GSTOCK o nombre con "palet")
   ⚠️⚠️⚠️ ATENCIÓN MÁXIMA — ERROR FRECUENTE ⚠️⚠️⚠️
   El archivo de palets contiene los PALETS DADOS DE ALTA ese día.
   Suele tener una columna llamada **Netos** (peso neto en kg de cada palet, valores típicos 600-900 kg por fila).

   ❌ NUNCA sumes "Cajas" (es número de cajas).
   ❌ NUNCA sumes "Fact." (es importe en euros).
   ❌ NUNCA sumes "NºPalet" (es identificador).
   ✅ SIEMPRE usa la columna cuyo header es exactamente "Netos".

   → "kg_palets_alta" = SUMA de la columna "Netos" de TODAS las filas con Netos > 0.
   → EXCLUIR filas resumen/subtotal (TipoCaja = "TOTAL", TipoPalet vacío o null).
   → NO filtres por TipoPalet ni por Sit. Suma TODOS los palets con Netos positivo.
   → Resultado típico de un día normal: 80.000 - 120.000 kg.

   → "gstock" = lista {product, size_range, kg_expected} para descuadres por producto (informativo).

E) FOTO DE LOTES (imagen)
   → "lotes" = [{lote_codigo, producto?}] con los códigos visibles.

────────────────────────────────────────────────────────────────────
DEVUELVE SIEMPRE ESTE JSON EXACTO (sin texto fuera del JSON):

{
  "kg_produccion_total": number,
  "kg_mujeres_l": number,
  "kg_podrido_calibrador": number,
  "kg_palets_alta": number,
  "produccion": [{"product": string, "size_range": string|null, "kg_produced": number, "destination": string|null}],
  "gstock":     [{"product": string, "size_range": string|null, "kg_expected": number}],
  "lotes":      [{"lote_codigo": string, "producto": string|null}],
  "analisis": "3-5 frases en español describiendo el día y posibles incidencias"
}

REGLAS FINALES:
- Si un archivo no existe, devuelve 0 / lista vacía.
- NO inventes valores. NO calcules medias.
- Mantén los decimales tal cual aparecen en los archivos.
- Las cantidades manuales (industria, reciclado Z1, reciclado Z2, podrido manual, inventario final)
  NUNCA las extraigas: las introduce el operario. NO las incluyas en el JSON.
- ANTES de devolver el JSON, VERIFICA mentalmente:
    · ¿He usado la columna "Peso(kg)" en el informe de tamaños/clase (no "Fruta" ni "Empaques")?
    · ¿He sumado SOLO las filas con Clase = "L" o "Mujeres" para kg_mujeres_l?
    · ¿He usado la columna "Netos" del archivo de palets para kg_palets_alta?
    · ¿He EXCLUIDO "MUESTRA" y "PREC" del informe de producto?
    · ¿kg_palets_alta está en el rango 50.000-150.000 (no en miles bajos)?
  Si alguna respuesta es NO, CORRIGE antes de responder.`;

// ─── Main handler ───

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return j({ success: false, error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const token = auth.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return j({ success: false, error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub;

    const body = await req.json().catch(() => ({}));
    const partId = body?.part_id as string | undefined;
    if (!partId) return j({ success: false, error: "part_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: parte, error: pErr } = await admin
      .from("partes_diarios")
      .select("*")
      .eq("id", partId)
      .maybeSingle();
    if (pErr || !parte) return j({ success: false, error: "Part not found" }, 404);
    if (parte.user_id !== userId) {
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
      const isAdmin = roles?.some((r: { role: string }) => r.role === "admin");
      if (!isAdmin) return j({ success: false, error: "Forbidden" }, 403);
    }

    const { data: archivos } = await admin
      .from("partes_archivos")
      .select("id, file_name, file_path, file_type, mime_type")
      .eq("part_id", partId);

    const files: FileMeta[] = (archivos ?? []) as FileMeta[];

    // ─── Deterministic server-side extraction ───

    let kg_palets_alta_server: number | null = null;
    let kg_produccion_total_server: number | null = null;
    let kg_mujeres_l_server: number | null = null;
    let kg_podrido_calib_server: number | null = null;

    const sources: Record<string, Src | null> = {
      kg_produccion_total: null,
      kg_palets_alta: null,
      kg_mujeres_l: null,
      kg_podrido_calibrador: null,
    };

    const content: { type: string; text?: string; image_url?: { url: string } }[] = [
      {
        type: "text",
        text: `Analiza el parte del ${parte.date}. ${files.length} archivos adjuntos.\n\nAplica las reglas del system prompt al pie de la letra.`,
      },
    ];

    const findHeader = (rows: unknown[][], matchers: ((h: string) => boolean)[]) => {
      for (let r = 0; r < Math.min(rows.length, 40); r++) {
        const row = rows[r] ?? [];
        const cols = matchers.map(() => -1);
        for (let c = 0; c < row.length; c++) {
          const cell = norm(row[c]);
          if (!cell) continue;
          matchers.forEach((m, i) => {
            if (cols[i] === -1 && m(cell)) cols[i] = c;
          });
        }
        if (cols[0] !== -1) return { headerIdx: r, cols };
      }
      return { headerIdx: -1, cols: matchers.map(() => -1) };
    };

    for (const f of files) {
      try {
        const { data: signed } = await admin.storage
          .from("partes-archivos")
          .createSignedUrl(f.file_path, 600);
        if (!signed?.signedUrl) continue;

        const isImage = (f.mime_type ?? "").startsWith("image/");

        if (isImage) {
          const resp = await fetch(signed.signedUrl);
          const buf = new Uint8Array(await resp.arrayBuffer());
          let binary = "";
          const CHUNK = 0x8000;
          for (let i = 0; i < buf.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK) as unknown as number[]);
          }
          const b64 = btoa(binary);
          content.push({ type: "text", text: `--- Archivo: ${f.file_name} (tipo: ${f.file_type}) ---` });
          content.push({ type: "image_url", image_url: { url: `data:${f.mime_type};base64,${b64}` } });
        } else {
          const resp = await fetch(signed.signedUrl);
          let buf = new Uint8Array(await resp.arrayBuffer());

          // Repair xlsx with garbage prefix
          const looksXlsxName = /\.(xlsx|xlsm)$/i.test(f.file_name);
          if (looksXlsxName && buf.length > 22) {
            const startsPK = buf[0] === 0x50 && buf[1] === 0x4b;
            const validZip = startsPK && buf[2] === 0x03 && buf[3] === 0x04;
            if (startsPK && !validZip) {
              const search = Math.min(buf.length - 4, 256);
              let cut = -1;
              for (let i = 1; i < search; i++) {
                if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x03 && buf[i + 3] === 0x04) {
                  cut = i; break;
                }
              }
              if (cut > 0) {
                const out = buf.slice(cut);
                const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
                let eocd = -1;
                const minEocd = Math.max(0, out.length - 65557);
                for (let i = out.length - 22; i >= minEocd; i--) {
                  if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
                }
                if (eocd >= 0) {
                  const totalEntries = view.getUint16(eocd + 10, true);
                  const cdOffset = view.getUint32(eocd + 16, true);
                  if (cdOffset >= cut) view.setUint32(eocd + 16, cdOffset - cut, true);
                  let p = cdOffset >= cut ? cdOffset - cut : cdOffset;
                  for (let i = 0; i < totalEntries; i++) {
                    if (p + 46 > out.length) break;
                    if (view.getUint32(p, true) !== 0x02014b50) break;
                    const nameLen = view.getUint16(p + 28, true);
                    const extraLen = view.getUint16(p + 30, true);
                    const commentLen = view.getUint16(p + 32, true);
                    const lho = view.getUint32(p + 42, true);
                    if (lho >= cut) view.setUint32(p + 42, lho - cut, true);
                    p += 46 + nameLen + extraLen + commentLen;
                  }
                  buf = out;
                  console.log(`[zip-repair] ${f.file_name}: recortados ${cut} bytes basura`);
                }
              }
            }
          }

          let sheetsText = "";
          let wb: XLSX.WorkBook | null = null;
          try {
            wb = XLSX.read(buf, { type: "array" });
            for (const sheetName of wb.SheetNames) {
              const ws = wb.Sheets[sheetName];
              const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
              sheetsText += `\n### Hoja: ${sheetName}\n${csv}\n`;
            }
          } catch (err) {
            console.error("xlsx parse error", f.file_name, err);
            sheetsText = `[No se pudo parsear ${f.file_name}]`;
          }

          // ── PALETS: deterministic "Netos" sum ──
          // Matches: file_type=GSTOCK, or name contains "gstock"/"palet"
          const isGstock = f.file_type === "GSTOCK" || /g[\s_-]?stock/i.test(f.file_name);
          const isPalets = !isGstock && /palet/i.test(f.file_name);
          if (wb && (isGstock || isPalets)) {
            try {
              let best: { total: number; count: number; col: number; sheet: string } | null = null;
              for (const sheetName of wb.SheetNames) {
                const ws = wb.Sheets[sheetName];
                const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
                let headerIdx = -1;
                let netosCols: number[] = [];
                let tipoCajaCol = -1;
                let tipoPaletCol = -1;
                for (let r = 0; r < Math.min(rows.length, 40); r++) {
                  const row = rows[r] ?? [];
                  const cols: number[] = [];
                  let tc = -1, tp = -1;
                  for (let c = 0; c < row.length; c++) {
                    const cell = norm(row[c]);
                    if (cell === "netos" || cell === "neto" || cell === "kg netos" || cell === "peso neto") cols.push(c);
                    if (tc === -1 && (cell === "tipocaja" || cell === "tipo caja")) tc = c;
                    if (tp === -1 && (cell === "tipopalet" || cell === "tipo palet")) tp = c;
                  }
                  if (cols.length > 0) {
                    headerIdx = r; netosCols = cols; tipoCajaCol = tc; tipoPaletCol = tp; break;
                  }
                }
                if (headerIdx < 0 || netosCols.length === 0) continue;
                for (const col of netosCols) {
                  let total = 0, count = 0;
                  for (let r = headerIdx + 1; r < rows.length; r++) {
                    const row = rows[r] as unknown[];
                    if (row.every((x) => x == null || String(x).trim() === "")) continue;
                    // Exclude subtotal/total rows
                    const isTotalRow = row.some((x) => /\b(sub)?total(es)?\b/i.test(String(x ?? "")));
                    if (isTotalRow) continue;
                    // Exclude TipoCaja = "TOTAL"
                    if (tipoCajaCol >= 0 && norm(row[tipoCajaCol]) === "total") continue;
                    // Exclude TipoPalet empty/null (summary rows)
                    if (tipoPaletCol >= 0 && !norm(row[tipoPaletCol])) continue;
                    const n = toNum(row[col]);
                    if (isFinite(n) && n > 0) { total += n; count += 1; }
                  }
                  if (!best || count > best.count) best = { total, count, col, sheet: sheetName };
                }
              }
              if (best && best.total > 0) {
                if (kg_palets_alta_server === null || isGstock) {
                  kg_palets_alta_server = best.total;
                  sources.kg_palets_alta = {
                    file: f.file_name,
                    sheet: best.sheet,
                    note: `${best.count} filas · columna "Netos"${isGstock ? " (GSTOCK)" : " (palets)"}`,
                  };
                }
                console.log(`[${isGstock ? "gstock" : "palets"}] Netos sum = ${best.total.toFixed(2)} kg (${best.count} rows) from ${f.file_name}`);
              }
            } catch (err) {
              console.error("Netos sum error", err);
            }
          }

          // ── INFORME TAMAÑOS/CLASE/CALIDAD: mujeres (clase L) ──
          const isTamanosFile = /tama[ñn]o/i.test(f.file_name) || /clase/i.test(f.file_name) || /calidad/i.test(f.file_name);
          if (wb && isTamanosFile) {
            try {
              for (const sheetName of wb.SheetNames) {
                const ws = wb.Sheets[sheetName];
                const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });

                let headerIdx = -1, pesoCol = -1, claseCol = -1, prodCol = -1;
                for (let r = 0; r < Math.min(rows.length, 40); r++) {
                  const row = rows[r] ?? [];
                  let pc = -1, cc = -1, pr = -1;
                  for (let c = 0; c < row.length; c++) {
  const cell = norm(row[c]);
  if (!cell) continue;
  // Columna clase
  if (cc === -1 && (cell === 'clase' || cell === 'categoria' || cell === 'categoría' || cell === 'calidad')) cc = c;
  // Columna producto/variedad
  if (pr === -1 && (cell === 'producto' || cell === 'variedad' || cell === 'denominacion' || cell === 'denominación')) pr = c;
  // Columna peso: NUNCA coger si el header contiene "fruta" o "empaque"
  if (pc === -1 && (cell === 'pesokg' || cell === 'peso kg' || cell === 'peso (kg)' || cell === 'peso kg' || cell === 'kg')) {
    if (!cell.includes('fruta') && !cell.includes('empaque')) pc = c;
  }
}
// Verificación extra: asegurarse que pesoCol no es la misma columna que fruta/empaques
// buscando la primera columna con header "pesokg" o "peso kg" que no sea fruta
if (pc === -1) {
  // fallback: recorrer de nuevo buscando cualquier columna con "peso" y sin "fruta"/"empaque"
  for (let c = 0; c < row.length; c++) {
    const cell = norm(row[c]);
    if (cell.includes('peso') && !cell.includes('fruta') && !cell.includes('empaque')) {
      pc = c; break;
    }
  }
}
if (pc !== -1) { headerIdx = r; pesoCol = pc; claseCol = cc; prodCol = pr; break; }
                }
                if (headerIdx < 0 || pesoCol < 0) continue;

                let mujeresL = 0;
                for (let r = headerIdx + 1; r < rows.length; r++) {
                  const row = rows[r] as unknown[];
                  const kg = toNum(row[pesoCol]);
                  if (!isFinite(kg)) continue;
                  const prodVal = prodCol >= 0 ? norm(row[prodCol]) : "";
                  const claseVal = claseCol >= 0 ? norm(row[claseCol]) : "";
                  if (prodVal && /\btotal(es)?\b/.test(prodVal)) continue;
                  // Clase L or contains "mujeres"
                  if (claseCol >= 0 && (claseVal === "l" || claseVal.includes("mujeres"))) {
                    mujeresL += kg;
                  }
                }
                if (mujeresL > 0) {
                  kg_mujeres_l_server = (kg_mujeres_l_server ?? 0) + mujeresL;
                  sources.kg_mujeres_l = { file: f.file_name, sheet: sheetName, note: 'filas con Clase="L" o "Mujeres" · columna Peso(kg)' };
                }
                console.log(`[tamaños] ${f.file_name} "${sheetName}": mujeres(L)=${mujeresL.toFixed(2)}`);
              }
            } catch (err) {
              console.error("tamaños parse error", err);
            }
          }

          // ── INFORME PRODUCTO: podrido calibrador ──
          const isProductoFile = /producto/i.test(f.file_name) && !/producci[oó]n/i.test(f.file_name);
          if (wb && isProductoFile) {
            try {
              for (const sheetName of wb.SheetNames) {
                const ws = wb.Sheets[sheetName];
                const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });

                let headerIdx = -1, pesoCol = -1, prodCol = -1;
                for (let r = 0; r < Math.min(rows.length, 40); r++) {
                  const row = rows[r] ?? [];
                  let pc = -1, pr = -1;
                  for (let c = 0; c < row.length; c++) {
                    const cell = norm(row[c]);
                    if (!cell) continue;
                    if (pc === -1 && (cell === "peso(kg)" || cell === "peso (kg)" || cell === "peso kg" || cell === "peso")) pc = c;
                    if (pr === -1 && (cell === "producto" || cell === "variedad" || cell === "denominacion" || cell === "denominación")) pr = c;
                  }
                  if (pc !== -1 && pr !== -1) { headerIdx = r; pesoCol = pc; prodCol = pr; break; }
                }
                if (headerIdx < 0 || pesoCol < 0 || prodCol < 0) continue;

                let podrido = 0;
                for (let r = headerIdx + 1; r < rows.length; r++) {
                  const row = rows[r] as unknown[];
                  const kg = toNum(row[pesoCol]);
                  if (!isFinite(kg)) continue;
                  const prodVal = norm(row[prodCol]);
                  if (/\btotal(es)?\b/.test(prodVal)) continue;
                  // Only PODRIDO — exclude MUESTRA and PREC
                  if (prodVal === "podrido") {
                    podrido += kg;
                  }
                }
                if (podrido > 0) {
                  kg_podrido_calib_server = (kg_podrido_calib_server ?? 0) + podrido;
                  sources.kg_podrido_calibrador = { file: f.file_name, sheet: sheetName, note: 'fila "PODRIDO" · columna Peso(kg) (excluidos MUESTRA y PREC)' };
                }
                console.log(`[producto] ${f.file_name} "${sheetName}": podrido=${podrido.toFixed(2)}`);
              }
            } catch (err) {
              console.error("producto parse error", err);
            }
          }

          // ── INFORME PRODUCCION: kg_produccion_total ──
          if (wb && /producci[oó]n/i.test(f.file_name) && !/producto/i.test(f.file_name)) {
            try {
              for (const sheetName of wb.SheetNames) {
                const ws = wb.Sheets[sheetName];
                const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
                const { headerIdx, cols } = findHeader(rows, [
                  (h) => h === "peso (kg)" || h === "peso(kg)" || h === "peso kg",
                ]);
                if (headerIdx < 0 || cols[0] < 0) continue;
                const pesoCol = cols[0];
                let lastDetail = 0, totalsRow = 0;
                for (let r = headerIdx + 1; r < rows.length; r++) {
                  const row = rows[r] as unknown[];
                  const kg = toNum(row[pesoCol]);
                  if (!isFinite(kg) || kg <= 0) continue;
                  const isTotalRow = (row as unknown[]).some((x) => /\b(sub)?total(es)?\b/i.test(String(x ?? "")));
                  if (isTotalRow) { totalsRow = kg; continue; }
                  lastDetail = kg;
                }
                const total = totalsRow > 0 ? totalsRow : lastDetail;
                if (total > 0) {
                  kg_produccion_total_server = total;
                  sources.kg_produccion_total = {
                    file: f.file_name,
                    sheet: sheetName,
                    note: totalsRow > 0 ? "fila TOTALES · columna Peso (kg)" : "último valor (acumulado) · columna Peso (kg)",
                  };
                  console.log(`[produccion] total=${total.toFixed(2)} from ${f.file_name}`);
                }
              }
            } catch (err) {
              console.error("produccion parse error", err);
            }
          }

          if (sheetsText.length > 120_000) {
            sheetsText = sheetsText.slice(0, 120_000) + "\n...[truncado]";
          }
          content.push({
            type: "text",
            text: `--- Archivo: ${f.file_name} (tipo: ${f.file_type}) ---\n${sheetsText}`,
          });
        }
      } catch (e) {
        console.error("File fetch error", f.file_name, e);
      }
    }

    // ─── Call AI ───

    let parsed: Record<string, unknown> = {};
    try {
      const aiResp = await fetchAI(content);
      if (aiResp) {
        const raw = aiResp?.choices?.[0]?.message?.content ?? "{}";
        try {
          parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
          parsed = { analisis: String(raw) };
        }
      }
    } catch (e: unknown) {
      const err = e as Error;
      console.error("AI call failed:", err.message);
    }

    // ─── Merge: prefer server-side deterministic values, fallback to AI ───

    const kg_produccion_total = round2(
      kg_produccion_total_server !== null ? kg_produccion_total_server : (Number(parsed.kg_produccion_total) || 0)
    );
    const kg_mujeres_l = round2(
      kg_mujeres_l_server !== null
        ? kg_mujeres_l_server
        : (Number(parsed.kg_mujeres_l) || Number(parsed.kg_mujeres_calibrador) || 0)
    );
    const kg_podrido_calibrador = round2(
      kg_podrido_calib_server !== null ? kg_podrido_calib_server : (Number(parsed.kg_podrido_calibrador) || 0)
    );
    const kg_palets_alta = round2(
      kg_palets_alta_server !== null ? kg_palets_alta_server : (Number(parsed.kg_palets_alta) || 0)
    );

    // ─── Compute DSJ cascade ───

    const cascade = computeCascade({
      kg_production_total: kg_produccion_total,
      kg_palets_alta,
      kg_mujeres_manual: kg_mujeres_l,
      kg_podrido_calibrador_manual: kg_podrido_calibrador,
      kg_reciclado_manual: Number(parte.kg_reciclado_manual) || 0,
      kg_reciclado_malla_z1: Number(parte.kg_reciclado_malla_z1) || 0,
      kg_reciclado_malla_z2: Number(parte.kg_reciclado_malla_z2) || 0,
      kg_podrido_manual: Number(parte.kg_podrido_manual) || 0,
      kg_inventario_final: Number(parte.kg_inventario_final) || 0,
      kg_palets_pendientes_anterior: Number(parte.kg_palets_pendientes_anterior) || 0,
    });

    // ─── Persist production_runs, gstock_entries, lotes_dia ───

    await admin.from("production_runs").delete().eq("part_id", partId);
    await admin.from("gstock_entries").delete().eq("part_id", partId);
    await admin.from("lotes_dia").delete().eq("part_id", partId).eq("source", "ia");

    const prodRows = ((parsed.produccion as unknown[]) ?? []).map((r: unknown) => {
      const row = r as Record<string, unknown>;
      return {
        part_id: partId,
        user_id: parte.user_id,
        date: parte.date,
        product: String(row.product ?? "Desconocido"),
        size_range: (row.size_range as string) ?? null,
        kg_produced: Number(row.kg_produced) || 0,
        destination: (row.destination as string) ?? null,
      };
    });
    if (prodRows.length) await admin.from("production_runs").insert(prodRows);

    const gstockRows = ((parsed.gstock as unknown[]) ?? []).map((r: unknown) => {
      const row = r as Record<string, unknown>;
      return {
        part_id: partId,
        user_id: parte.user_id,
        date: parte.date,
        product: String(row.product ?? "Desconocido"),
        size_range: (row.size_range as string) ?? null,
        kg_expected: Number(row.kg_expected) || 0,
      };
    });
    if (gstockRows.length) await admin.from("gstock_entries").insert(gstockRows);

    const lotesRows = ((parsed.lotes as unknown[]) ?? [])
      .filter((l: unknown) => (l as Record<string, unknown>)?.lote_codigo)
      .map((l: unknown) => {
        const row = l as Record<string, unknown>;
        return {
          part_id: partId,
          user_id: parte.user_id,
          lote_codigo: String(row.lote_codigo),
          producto: (row.producto as string) ?? null,
          source: "ia",
        };
      });
    if (lotesRows.length) await admin.from("lotes_dia").insert(lotesRows);

    // ─── Determine estado ───

    const hasExtractedData = kg_produccion_total > 0 || kg_palets_alta > 0;
    const estado = !hasExtractedData
      ? "Borrador"
      : cascade.semaforo === "rojo"
        ? "Con descuadre"
        : "Analizado";

    // ─── Build resumen_ia ───

    const resumen_ia = {
      kg_produccion_total,
      kg_palets_alta,
      kg_mujeres_l,
      kg_podrido_server: kg_podrido_calibrador,
      kg_podrido_calibrador,
      analisis: (parsed.analisis as string) ?? "",
      sources,
      cascade: {
        steps: cascade.steps.map((s) => ({
          key: s.key,
          label: s.label,
          value: s.value,
          running: s.running,
          isMinus: s.isMinus,
        })),
        produced: cascade.produced,
        produccionReal: cascade.produccionReal,
        paletsAjustados: cascade.paletsAjustados,
        grossDiff: cascade.grossDiff,
        totalShrinkage: cascade.totalShrinkage,
        unjustifiedDiff: cascade.unjustifiedDiff,
        realDiff: cascade.realDiff,
        deviationPct: cascade.deviationPct,
        realDeviationPct: cascade.realDeviationPct,
        semaforo: cascade.semaforo,
        alerts: cascade.alerts,
      },
    };

    // ─── Update parte ───

    const updates: Record<string, unknown> = {
      resumen_ia,
      kg_mujeres_manual: kg_mujeres_l,
      kg_podrido_calibrador_manual: kg_podrido_calibrador,
      estado,
    };

    await admin.from("partes_diarios").update(updates).eq("id", partId);

    return j({ success: true, resumen_ia, cascade });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("analizar-parte error", err);
    return j({ success: false, error: err?.message ?? "Unknown" }, 500);
  }
});

// ─── AI call with fallback ───

async function fetchAI(content: unknown[]) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (LOVABLE_API_KEY) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 130_000);
    try {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: sysPrompt },
            { role: "user", content },
          ],
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (aiResp.status === 429) throw new Error("Rate limit. Intenta en unos minutos.");
      if (aiResp.status === 402) throw new Error("Créditos de Lovable AI agotados.");
      if (!aiResp.ok) {
        const txt = await aiResp.text();
        throw new Error(`AI gateway error ${aiResp.status}: ${txt}`);
      }
      return await aiResp.json();
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      const err = e as Error;
      if (err.name === "AbortError") throw new Error("La IA tardó demasiado (>130s). Prueba con menos archivos o reintenta.");
      throw err;
    }
  }

  // Fallback: deterministic-only results
  console.log("[ai-fallback] No LOVABLE_API_KEY configured. Returning deterministic-only results.");
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          kg_produccion_total: 0,
          kg_mujeres_l: 0,
          kg_podrido_calibrador: 0,
          kg_palets_alta: 0,
          produccion: [],
          gstock: [],
          lotes: [],
          analisis: "Análisis determinista completado (sin IA conversacional). Los valores numéricos se han extraído directamente de los archivos. Configura LOVABLE_API_KEY para obtener análisis cualitativo y extracción de lotes desde fotos.",
        }),
      },
    }],
  };
}

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
