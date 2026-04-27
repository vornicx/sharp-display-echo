// supabase/functions/analizar-parte/index.ts
// Edge function: analiza un parte diario de Lasarte usando Lovable AI Gateway (Gemini).
//
// REGLAS DE EXTRACCIÓN ESTRICTAS (Lasarte SAT, naranjas/cítricos):
//
//   1) kg_produccion_total       → Informe_produccion.xlsx → fila TOTALES → columna "Peso (kg)"
//   2) kg_mujeres_l              → Informe tamaños clase y calidad por variedad → SUMA Peso(kg)
//                                   de filas cuya CLASE contiene "L" (mujeres / clase L)
//   3) kg_podrido_calibrador     → Informe_producto.xlsx → fila "PODRIDO" → Peso(kg)
//   4) kg_palets_alta            → ARCHIVO GSTOCK → SUMA de la columna "Netos" de TODAS las filas
//                                   (los palets dados de alta se leen del GSTOCK, NO del archivo de palets)
//
// Manuales (NO los toca la IA): reciclado_manual, malla_z1, malla_z2, podrido_manual, inventario_final.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

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

B) ARCHIVO "Informe tamaños clase y calidad por variedad" (también puede llamarse "Informe_producto.xlsx" o similar con "tama" / "clase" / "calidad" en el nombre)
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
       exactamente "L" (clase L = "mujeres"). Case-insensitive. Suma TODAS las variedades con clase L.
       Resultado típico: ~2.000-5.000 kg.
     • "kg_podrido_calibrador" = **Peso(kg)** de la fila cuyo "Producto" o "Variedad" sea "PODRIDO" (case-insensitive),
       si existe en este archivo. Si no, déjalo a 0.
     • "produccion" = lista con TODAS las filas reales de producto (excluye totales). Cada fila:
       {product, size_range (calibre/tamaño si hay), kg_produced (=Peso(kg) de esa fila), destination}.

   VALIDACIÓN: la suma de TODOS los Peso(kg) del informe debe ser aproximadamente igual a kg_produccion_total
   (diferencia < 1 kg, es redondeo). Si no cuadra, te has equivocado de columna — REVÍSALO.

C) ARCHIVO GSTOCK (xlsx cuyo file_type es GSTOCK o nombre contiene "gstock" / "g-stock")
   ⚠️⚠️⚠️ ATENCIÓN MÁXIMA — ERROR FRECUENTE ⚠️⚠️⚠️
   El GSTOCK es el archivo de PALETS DADOS DE ALTA (no es solo planificación).
   Suele tener una columna llamada **Netos** (peso neto en kg de cada palet, valores típicos 600-900 kg por fila).

   ❌ NUNCA sumes "Cajas" (es número de cajas).
   ❌ NUNCA sumes "Fact." (es importe en euros).
   ❌ NUNCA sumes "NºPalet" (es identificador).
   ✅ SIEMPRE usa la columna cuyo header es exactamente "Netos".

   → "kg_palets_alta" = SUMA de la columna "Netos" de TODAS las filas con Netos > 0.
   → NO filtres por TipoPalet ni por Sit. Suma TODOS los palets con Netos positivo.
   → Resultado típico de un día normal: 80.000 - 120.000 kg.

   → "gstock" = lista {product, size_range, kg_expected} para descuadres por producto (informativo).

D) ARCHIVO DE PALETS antiguo (xlsx cuyo NOMBRE contiene "palet" pero NO es GSTOCK)
   → Solo se usa como FALLBACK si no hay archivo GSTOCK. Misma regla: suma columna "Netos".

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
- Las cantidades manuales (reciclado manual, malla Z1, malla Z2, podrido manual, inventario final)
  NUNCA las extraigas: las introduce el operario. NO las incluyas en el JSON.
- ANTES de devolver el JSON, VERIFICA mentalmente:
    · ¿He usado la columna "Peso(kg)" en el informe de tamaños/clase (no "Fruta" ni "Empaques")?
    · ¿He sumado SOLO las filas con Clase = "L" para kg_mujeres_l?
    · ¿He usado la columna "Netos" del GSTOCK para kg_palets_alta?
    · ¿kg_palets_alta está en el rango 50.000-150.000 (no en miles bajos)?
  Si alguna respuesta es NO, CORRIGE antes de responder.`;

interface FileMeta { id: string; file_name: string; file_path: string; file_type: string; mime_type: string | null }

serve();

function serve() {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

      // SELECT * para tener todos los campos del parte (incluido kg_palets_pendientes_anterior)
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

      // ─── Auto-rellenar kg_palets_pendientes_anterior desde el día anterior ───
      if (!parte.kg_palets_pendientes_anterior) {
        const { data: parteAnterior } = await admin
          .from("partes_diarios")
          .select("kg_inventario_final")
          .eq("user_id", parte.user_id)
          .lt("date", parte.date)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (parteAnterior?.kg_inventario_final) {
          parte.kg_palets_pendientes_anterior = parteAnterior.kg_inventario_final;
          await admin
            .from("partes_diarios")
            .update({ kg_palets_pendientes_anterior: parteAnterior.kg_inventario_final })
            .eq("id", partId);
          console.log(`[inventario-anterior] ${parteAnterior.kg_inventario_final} kg copiado del parte anterior`);
        }
      }

      const { data: archivos } = await admin
        .from("partes_archivos")
        .select("id, file_name, file_path, file_type, mime_type")
        .eq("part_id", partId);

      const files: FileMeta[] = (archivos ?? []) as FileMeta[];

      // Detección heurística por nombre / file_type
      const gstockFile = files.find((x) => x.file_type === "GSTOCK" || /g[\s_-]?stock/i.test(x.file_name));
      const paletsFile = files.find((x) => x !== gstockFile && /palet/i.test(x.file_name));
      const prodTotalFile = files.find((x) => /producci[oó]n/i.test(x.file_name) && !/producto/i.test(x.file_name));
      const tamanosFile = files.find((x) => /tama[ñn]o/i.test(x.file_name) || /clase/i.test(x.file_name) || /calidad/i.test(x.file_name) || /producto/i.test(x.file_name));

      const hints: string[] = [];
      if (prodTotalFile) hints.push(`• "${prodTotalFile.file_name}" → INFORME PRODUCCIÓN (toma fila TOTALES → columna Peso(kg) → kg_produccion_total).`);
      else hints.push("• AVISO: no se ha detectado Informe_produccion.xlsx → kg_produccion_total = 0.");
      if (tamanosFile) hints.push(`• "${tamanosFile.file_name}" → INFORME TAMAÑOS/CLASE/CALIDAD (suma Peso(kg) de filas con Clase="L" → kg_mujeres_l; fila PODRIDO → kg_podrido_calibrador).`);
      else hints.push("• AVISO: no se ha detectado el informe de tamaños/clase/calidad → kg_mujeres_l = 0.");
      if (gstockFile) hints.push(`• "${gstockFile.file_name}" → ARCHIVO GSTOCK (suma columna Netos>0 de TODAS las filas → kg_palets_alta).`);
      else if (paletsFile) hints.push(`• "${paletsFile.file_name}" → FALLBACK PALETS (suma columna Netos>0 → kg_palets_alta).`);
      else hints.push("• AVISO: no se ha detectado archivo GSTOCK ni de palets → kg_palets_alta = 0.");

      const content: any[] = [
        {
          type: "text",
          text: `Analiza el parte del ${parte.date}. ${files.length} archivos adjuntos.\n${hints.join("\n")}\n\nAplica las reglas del system prompt al pie de la letra.`,
        },
      ];

      let kg_palets_alta_server: number | null = null;
      let kg_produccion_total_server: number | null = null;
      let kg_mujeres_l_server: number | null = null;
      let kg_podrido_calib_server: number | null = null;

      type Src = { file: string; sheet: string; note?: string };
      const sources: Record<string, Src | null> = {
        kg_produccion_total: null,
        kg_palets_alta: null,
        kg_mujeres_l: null,
        kg_podrido_calibrador: null,
      };

      const norm = (s: any) =>
        String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const toNum = (v: any): number => {
        if (v == null || v === "") return NaN;
        if (typeof v === "number") return v;
        const s = String(v).trim().replace(/\s/g, "");
        if (/,\d+$/.test(s)) return parseFloat(s.replace(/\./g, "").replace(",", "."));
        return parseFloat(s.replace(/,/g, ""));
      };
      const findHeader = (rows: any[][], matchers: ((h: string) => boolean)[]) => {
        for (let r = 0; r < Math.min(rows.length, 40); r++) {
          const row = rows[r] ?? [];
          const cols = matchers.map(() => -1);
          for (let c = 0; c < row.length; c++) {
            const cell = norm(row[c]);
            if (!cell) continue;
            matchers.forEach((m, i) => { if (cols[i] === -1 && m(cell)) cols[i] = c; });
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

            const looksXlsxName = /\.(xlsx|xlsm)$/i.test(f.file_name);
            if (looksXlsxName && buf.length > 22) {
              const startsPK = buf[0] === 0x50 && buf[1] === 0x4b;
              const validZip = startsPK && buf[2] === 0x03 && buf[3] === 0x04;
              if (startsPK && !validZip) {
                const search = Math.min(buf.length - 4, 256);
                let cut = -1;
                for (let i = 1; i < search; i++) {
                  if (buf[i] === 0x50 && buf[i+1] === 0x4b && buf[i+2] === 0x03 && buf[i+3] === 0x04) { cut = i; break; }
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

            // GSTOCK / PALETS
            const isGstock = f.file_type === "GSTOCK" || /g[\s_-]?stock/i.test(f.file_name);
            const isPaletsLegacy = !isGstock && /palet/i.test(f.file_name);
            if (wb && (isGstock || isPaletsLegacy)) {
              try {
                let best: { total: number; count: number; col: number; sheet: string } | null = null;
                for (const sheetName of wb.SheetNames) {
                  const ws = wb.Sheets[sheetName];
                  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
                  let headerIdx = -1;
                  let netosCols: number[] = [];
                  for (let r = 0; r < Math.min(rows.length, 40); r++) {
                    const row = rows[r] ?? [];
                    const cols: number[] = [];
                    for (let c = 0; c < row.length; c++) {
                      const cell = norm(row[c]);
                      if (cell === "netos" || cell === "neto" || cell === "kg netos" || cell === "peso neto") cols.push(c);
                    }
                    if (cols.length > 0) { headerIdx = r; netosCols = cols; break; }
                  }
                  if (headerIdx < 0 || netosCols.length === 0) continue;
                  for (const col of netosCols) {
                    let total = 0, count = 0;
                    for (let r = headerIdx + 1; r < rows.length; r++) {
                      const row = rows[r] ?? [];
                      if (row.every((x) => x == null || String(x).trim() === "")) continue;
                      const isTotalRow = row.some((x) => /\b(sub)?total(es)?\b/i.test(String(x ?? "")));
                      if (isTotalRow) continue;
                      const n = toNum(row[col]);
                      if (isFinite(n) && n > 0) { total += n; count += 1; }
                    }
                    if (!best || count > best.count) best = { total, count, col, sheet: sheetName };
                  }
                }
                if (best && best.total > 0) {
                  if (kg_palets_alta_server === null || isGstock) {
                    kg_palets_alta_server = best.total;
                    sources.kg_palets_alta = { file: f.file_name, sheet: best.sheet, note: `${best.count} filas · columna "Netos"${isGstock ? " (GSTOCK)" : " (palets)"}` };
                  }
                  console.log(`[${isGstock ? "gstock" : "palets"}] Netos sum = ${best.total.toFixed(2)} kg from ${f.file_name}`);
                }
              } catch (err) { console.error("Netos sum error", err); }
            }

            // TAMAÑOS / CLASE / CALIDAD: mujeres L + podrido
            const isTamanosFile = /tama[ñn]o/i.test(f.file_name) || /clase/i.test(f.file_name) || /calidad/i.test(f.file_name) || /producto/i.test(f.file_name);
            if (wb && isTamanosFile) {
              try {
                for (const sheetName of wb.SheetNames) {
                  const ws = wb.Sheets[sheetName];
                  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
                  let headerIdx = -1, pesoCol = -1, claseCol = -1, prodCol = -1;
                  for (let r = 0; r < Math.min(rows.length, 40); r++) {
                    const row = rows[r] ?? [];
                    let pc = -1, cc = -1, pr = -1;
                    for (let c = 0; c < row.length; c++) {
                      const cell = norm(row[c]);
                      if (!cell) continue;
                      if (pc === -1 && (cell === "peso(kg)" || cell === "peso (kg)" || cell === "peso kg" || cell === "peso")) pc = c;
                      if (cc === -1 && (cell === "clase" || cell === "categoria" || cell === "categoría" || cell === "calidad")) cc = c;
                      if (pr === -1 && (cell === "producto" || cell === "variedad" || cell === "denominacion" || cell === "denominación")) pr = c;
                    }
                    if (pc !== -1) { headerIdx = r; pesoCol = pc; claseCol = cc; prodCol = pr; break; }
                  }
                  if (headerIdx < 0 || pesoCol < 0) continue;
                  let mujeresL = 0, podrido = 0;
                  for (let r = headerIdx + 1; r < rows.length; r++) {
                    const row = rows[r] ?? [];
                    const kg = toNum(row[pesoCol]);
                    if (!isFinite(kg)) continue;
                    const prodVal = prodCol >= 0 ? norm(row[prodCol]) : "";
                    const claseVal = claseCol >= 0 ? norm(row[claseCol]) : "";
                    if (prodVal && /\btotal(es)?\b/.test(prodVal)) continue;
                    if (claseCol >= 0 && claseVal === "l") mujeresL += kg;
                    if (prodVal === "podrido") podrido += kg;
                  }
                  if (mujeresL > 0) {
                    kg_mujeres_l_server = (kg_mujeres_l_server ?? 0) + mujeresL;
                    sources.kg_mujeres_l = { file: f.file_name, sheet: sheetName, note: 'filas con Clase="L" · columna Peso(kg)' };
                  }
                  if (podrido > 0) {
                    kg_podrido_calib_server = (kg_podrido_calib_server ?? 0) + podrido;
                    sources.kg_podrido_calibrador = { file: f.file_name, sheet: sheetName, note: 'fila "PODRIDO" · columna Peso(kg)' };
                  }
                  console.log(`[tamaños] ${f.file_name} "${sheetName}": mujeres(L)=${mujeresL.toFixed(2)} podrido=${podrido.toFixed(2)}`);
                }
              } catch (err) { console.error("tamaños/producto parse error", err); }
            }

            // INFORME PRODUCCIÓN
            if (wb && /producci[oó]n/i.test(f.file_name) && !/producto/i.test(f.file_name)) {
              try {
                for (const sheetName of wb.SheetNames) {
                  const ws = wb.Sheets[sheetName];
                  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
                  const { headerIdx, cols } = findHeader(rows, [(h) => h === "peso (kg)" || h === "peso(kg)" || h === "peso kg"]);
                  if (headerIdx < 0 || cols[0] < 0) continue;
                  const pesoCol = cols[0];
                  let lastDetail = 0, totalsRow = 0;
                  for (let r = headerIdx + 1; r < rows.length; r++) {
                    const row = rows[r] ?? [];
                    const kg = toNum(row[pesoCol]);
                    if (!isFinite(kg) || kg <= 0) continue;
                    const isTotalRow = row.some((x) => /\b(sub)?total(es)?\b/i.test(String(x ?? "")));
                    if (isTotalRow) { totalsRow = kg; continue; }
                    lastDetail = kg;
                  }
                  const total = totalsRow > 0 ? totalsRow : lastDetail;
                  if (total > 0) {
                    kg_produccion_total_server = total;
                    sources.kg_produccion_total = { file: f.file_name, sheet: sheetName, note: totalsRow > 0 ? "fila TOTALES · columna Peso (kg)" : "último valor · columna Peso (kg)" };
                    console.log(`[produccion] total=${total.toFixed(2)} from ${f.file_name}`);
                  }
                }
              } catch (err) { console.error("produccion parse error", err); }
            }

            if (sheetsText.length > 120_000) sheetsText = sheetsText.slice(0, 120_000) + "\n...[truncado]";
            content.push({ type: "text", text: `--- Archivo: ${f.file_name} (tipo: ${f.file_type}) ---\n${sheetsText}` });
          }
        } catch (e) { console.error("File fetch error", f.file_name, e); }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 130_000);
      let aiResp: Response;
      try {
        aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "system", content: sysPrompt }, { role: "user", content }],
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });
      } catch (e: any) {
        clearTimeout(timeoutId);
        if (e?.name === "AbortError") return j({ success: false, error: "La IA tardó demasiado (>130s). Prueba con menos archivos o reintenta." }, 504);
        throw e;
      }
      clearTimeout(timeoutId);

      if (aiResp.status === 429) return j({ success: false, error: "Rate limit. Intenta en unos minutos." }, 429);
      if (aiResp.status === 402) return j({ success: false, error: "Créditos de Lovable AI agotados." }, 402);
      if (!aiResp.ok) {
        const txt = await aiResp.text();
        console.error("AI error", aiResp.status, txt);
        return j({ success: false, error: `AI gateway error ${aiResp.status}` }, 500);
      }

      const aiJson = await aiResp.json();
      const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
      let parsed: any = {};
      try { parsed = typeof raw === "string" ? JSON.parse(raw) : raw; }
      catch { parsed = { analisis: String(raw) }; }

      await admin.from("production_runs").delete().eq("part_id", partId);
      await admin.from("gstock_entries").delete().eq("part_id", partId);
      await admin.from("lotes_dia").delete().eq("part_id", partId).eq("source", "ia");

      const prodRows = (parsed.produccion ?? []).map((r: any) => ({
        part_id: partId, user_id: parte.user_id, date: parte.date,
        product: String(r.product ?? "Desconocido"), size_range: r.size_range ?? null,
        kg_produced: Number(r.kg_produced) || 0, destination: r.destination ?? null,
      }));
      if (prodRows.length) await admin.from("production_runs").insert(prodRows);

      const gstockRows = (parsed.gstock ?? []).map((r: any) => ({
        part_id: partId, user_id: parte.user_id, date: parte.date,
        product: String(r.product ?? "Desconocido"), size_range: r.size_range ?? null,
        kg_expected: Number(r.kg_expected) || 0,
      }));
      if (gstockRows.length) await admin.from("gstock_entries").insert(gstockRows);

      const lotesRows = (parsed.lotes ?? []).filter((l: any) => l.lote_codigo).map((l: any) => ({
        part_id: partId, user_id: parte.user_id,
        lote_codigo: String(l.lote_codigo), producto: l.producto ?? null, source: "ia",
      }));
      if (lotesRows.length) await admin.from("lotes_dia").insert(lotesRows);

      const kg_produccion_total = round2(kg_produccion_total_server !== null ? kg_produccion_total_server : (Number(parsed.kg_produccion_total) || 0));
      const kg_mujeres_l = round2(kg_mujeres_l_server !== null ? kg_mujeres_l_server : (Number(parsed.kg_mujeres_l) || Number(parsed.kg_mujeres_calibrador) || 0));
      const kg_podrido_calibrador = round2(kg_podrido_calib_server !== null ? kg_podrido_calib_server : (Number(parsed.kg_podrido_calibrador) || 0));
      const kg_palets_alta = round2(kg_palets_alta_server !== null ? kg_palets_alta_server : (Number(parsed.kg_palets_alta) || 0));

      const resumen_ia = {
        kg_produccion_total, kg_palets_alta, kg_mujeres_l,
        kg_podrido_server: kg_podrido_calibrador, kg_podrido_calibrador,
        analisis: parsed.analisis ?? "", sources,
      };

      const updates: Record<string, any> = {
        resumen_ia,
        kg_mujeres_manual: kg_mujeres_l,
        kg_podrido_calibrador_manual: kg_podrido_calibrador,
        estado: "Analizado",
      };

      await admin.from("partes_diarios").update(updates).eq("id", partId);
      return j({ success: true, resumen_ia });

    } catch (e: any) {
      console.error("analizar-parte error", e);
      return j({ success: false, error: e?.message ?? "Unknown" }, 500);
    }
  });
}

function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function j(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
