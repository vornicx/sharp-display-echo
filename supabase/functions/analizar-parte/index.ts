// supabase/functions/analizar-parte/index.ts
// Edge function: analiza un parte diario de Lasarte usando Lovable AI Gateway (Gemini).
//
// REGLAS DE EXTRACCIÓN ESTRICTAS (Lasarte SAT, naranjas/cítricos):
//
//   1) kg_produccion_total       → Informe_produccion.xlsx → fila TOTALES → columna "Peso (kg)"
//   2) kg_mujeres_calibrador     → Informe_producto.xlsx → SUMA de Peso(kg) de TODAS las filas
//                                   cuyo "Producto" CONTIENE "PREC" (mujeres / reciclado calibrador)
//   3) kg_podrido_calibrador     → Informe_producto.xlsx → fila "PODRIDO" → Peso(kg)
//   4) kg_muestra                → Informe_producto.xlsx → fila "MUESTRA" → Peso(kg)
//   5) kg_palets_alta            → palets_DDMMAAAA.xlsx → SUMA de la columna "Netos"
//                                   de TODAS las filas con Netos > 0 (sin filtrar por TipoPalet/Sit)
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

B) ARCHIVO "Informe_producto.xlsx" (desglose por producto)
   ⚠️⚠️⚠️ ATENCIÓN MÁXIMA — ERROR FRECUENTE QUE DEBES EVITAR ⚠️⚠️⚠️
   El archivo tiene MUCHAS columnas, en este orden aproximado:
     Producto | Empaque | Empaques | [columna vacía] | Peso(kg) | [columna vacía] | Fruta | Peso de Empaque Promedio | Conteo de Empaques Promedio
   La columna **Peso(kg)** es la 4ª-5ª columna de datos (después del nombre del producto), NO la última.
   La columna **Fruta** es el NÚMERO DE PIEZAS (frutos individuales), NO kilos.
   La columna **Empaques** es el NÚMERO DE CAJAS, NO kilos.

   ❌ NUNCA leas la columna "Fruta" como si fueran kg.
   ❌ NUNCA leas la columna "Empaques" como si fueran kg.
   ❌ NUNCA leas la columna "Empaque" (singular) como si fueran kg.
   ✅ SIEMPRE usa la columna cuyo header es exactamente "Peso(kg)" o "Peso (kg)".

   Identifica la columna correcta por su HEADER EXACTO ("Peso(kg)"), NUNCA por posición.
   Si el archivo está como imagen (PDF/JPG), localiza visualmente la columna "Peso(kg)" antes de leer datos.

   Reglas:
     • "kg_mujeres_calibrador" = SUMA de la columna **Peso(kg)** de TODAS las filas cuyo "Producto"
       CONTIENE la cadena "PREC" (case-insensitive, cualquier variante: PREC-1, PREC-2, PREC NAVELINA,
       PREC LANE, PREC SALUSTIANA, etc.). Súmalas TODAS. Resultado típico: ~2.000-3.000 kg.
     • "kg_podrido_calibrador" = **Peso(kg)** de la fila cuyo "Producto" sea "PODRIDO" (exacto, case-insensitive).
       Resultado típico: ~1.000 kg. Si te sale ~3.500 kg has leído la columna "Fruta" — REVISA.
     • "kg_muestra" = **Peso(kg)** de la fila cuyo "Producto" CONTIENE "MUESTRA".
       Resultado típico: ~150 kg. Si te sale ~450 kg has leído la columna "Fruta" — REVISA.
     • "produccion" = lista con TODAS las filas reales de producto (excluye totales). Cada fila:
       {product, size_range (calibre/tamaño si hay), kg_produced (=Peso(kg) de esa fila), destination}.

   VALIDACIÓN OBLIGATORIA: la suma de TODOS los Peso(kg) del informe_producto debe ser
   aproximadamente igual a kg_produccion_total (diferencia < 1 kg, es redondeo).
   Si no cuadra, te has equivocado de columna — REVÍSALO antes de devolver el JSON.

C) ARCHIVO DE PALETS (xlsx cuyo NOMBRE contiene "palet" o "palets" — IGNORA su file_type)
   ⚠️⚠️⚠️ ATENCIÓN MÁXIMA — ERROR FRECUENTE ⚠️⚠️⚠️
   Columnas en este orden aproximado:
     TipoPalet | NºPalet | Fecha | Denominación Producto | Lote | DcmtoVta | Fecha (albarán) | Cliente | Cajas | TipoCaja | Netos | Fact. | Sit
   La columna correcta es **Netos** (peso neto en kg de cada palet, valores típicos 600-900 kg por fila).
   ❌ NUNCA sumes "Cajas" (es número de cajas, valores 50-80 por fila, sumaría miles bajos).
   ❌ NUNCA sumes "Fact." (es importe en euros).
   ❌ NUNCA sumes "NºPalet" (es identificador).
   ✅ SIEMPRE usa la columna cuyo header es exactamente "Netos".

   → "kg_palets_alta" = SUMA de la columna "Netos" de TODAS las filas con Netos > 0.
   → NO filtres por TipoPalet ni por Sit. Suma TODOS los palets con Netos positivo.
   → Ignora filas con Netos ≤ 0 (errores de datos).
   → NO uses el archivo GSTOCK para esto.
   → Resultado típico de un día normal: 80.000 - 120.000 kg.
     Si te sale <20.000 kg has sumado la columna equivocada (Cajas/Fact./NºPalet) — REVISA.

D) ARCHIVO GSTOCK (planificación, solo si su nombre NO contiene "palet")
   → "gstock" = lista {product, size_range, kg_expected}. Es solo informativo.

E) FOTO DE LOTES (imagen)
   → "lotes" = [{lote_codigo, producto?}] con los códigos visibles.

────────────────────────────────────────────────────────────────────
DEVUELVE SIEMPRE ESTE JSON EXACTO (sin texto fuera del JSON):

{
  "kg_produccion_total": number,
  "kg_mujeres_calibrador": number,
  "kg_podrido_calibrador": number,
  "kg_muestra": number,
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
    · ¿He usado la columna "Peso(kg)" en el informe_producto (no "Fruta" ni "Empaques")?
    · ¿He usado la columna "Netos" en el archivo de palets (no "Cajas" ni "Fact.")?
    · ¿La suma de Peso(kg) del informe_producto ≈ kg_produccion_total?
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

      const { data: parte, error: pErr } = await admin
        .from("partes_diarios")
        .select("id, user_id, date")
        .eq("id", partId)
        .maybeSingle();
      if (pErr || !parte) return j({ success: false, error: "Part not found" }, 404);
      if (parte.user_id !== userId) {
        const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
        const isAdmin = roles?.some((r: any) => r.role === "admin");
        if (!isAdmin) return j({ success: false, error: "Forbidden" }, 403);
      }

      const { data: archivos } = await admin
        .from("partes_archivos")
        .select("id, file_name, file_path, file_type, mime_type")
        .eq("part_id", partId);

      const files: FileMeta[] = (archivos ?? []) as any;

      // Detección heurística por nombre
      const paletsFile = files.find((x) => /palet/i.test(x.file_name));
      const prodTotalFile = files.find((x) => /producci[oó]n/i.test(x.file_name) && !/producto/i.test(x.file_name));
      const productoFile = files.find((x) => /producto/i.test(x.file_name) || /tama[ñn]o/i.test(x.file_name) || /clase/i.test(x.file_name));

      const hints: string[] = [];
      if (prodTotalFile) hints.push(`• "${prodTotalFile.file_name}" → INFORME PRODUCCIÓN (toma fila TOTALES → columna Peso(kg) → kg_produccion_total).`);
      else hints.push("• AVISO: no se ha detectado Informe_produccion.xlsx → kg_produccion_total = 0.");
      if (productoFile) hints.push(`• "${productoFile.file_name}" → INFORME PRODUCTO (suma PREC* → kg_mujeres_calibrador; fila PODRIDO → kg_podrido_calibrador; fila MUESTRA → kg_muestra).`);
      else hints.push("• AVISO: no se ha detectado Informe_producto.xlsx → mujeres/podrido/muestra = 0.");
      if (paletsFile) hints.push(`• "${paletsFile.file_name}" → ARCHIVO DE PALETS (suma columna Netos>0 de TODAS las filas → kg_palets_alta). IGNORA su file_type.`);
      else hints.push("• AVISO: no se ha detectado archivo de palets → kg_palets_alta = 0.");

      const content: any[] = [
        {
          type: "text",
          text: `Analiza el parte del ${parte.date}. ${files.length} archivos adjuntos.\n${hints.join("\n")}\n\nAplica las reglas del system prompt al pie de la letra.`,
        },
      ];

      // Cálculo determinista server-side
      let kg_palets_alta_server: number | null = null;
      let kg_produccion_total_server: number | null = null;
      let kg_mujeres_server: number | null = null;
      let kg_podrido_calib_server: number | null = null;
      let kg_muestra_server: number | null = null;

      // Trazabilidad: de qué archivo/hoja salió cada valor
      type Src = { file: string; sheet: string; note?: string };
      const sources: Record<string, Src | null> = {
        kg_produccion_total: null,
        kg_palets_alta: null,
        kg_mujeres_calibrador: null,
        kg_podrido_calibrador: null,
        kg_muestra: null,
      };

      const norm = (s: any) =>
        String(s ?? "")
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
      const toNum = (v: any): number => {
        if (v == null || v === "") return NaN;
        if (typeof v === "number") return v;
        // Español: "1.234,56" → 1234.56
        const s = String(v).trim().replace(/\s/g, "");
        if (/,\d+$/.test(s)) {
          return parseFloat(s.replace(/\./g, "").replace(",", "."));
        }
        return parseFloat(s.replace(/,/g, ""));
      };
      const findHeader = (rows: any[][], matchers: ((h: string) => boolean)[]) => {
        // Devuelve {headerIdx, cols:[col per matcher, -1 si no se encuentra]}
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
            // Encode in chunks to avoid "Maximum call stack size exceeded"
            // when using btoa(String.fromCharCode(...buf)) on large images.
            let binary = "";
            const CHUNK = 0x8000; // 32KB
            for (let i = 0; i < buf.length; i += CHUNK) {
              binary += String.fromCharCode.apply(
                null,
                buf.subarray(i, i + CHUNK) as unknown as number[],
              );
            }
            const b64 = btoa(binary);
            content.push({
              type: "text",
              text: `--- Archivo: ${f.file_name} (tipo: ${f.file_type}) ---`,
            });
            content.push({
              type: "image_url",
              image_url: { url: `data:${f.mime_type};base64,${b64}` },
            });
          } else {
            // Parse xlsx/csv server-side to CSV text so the model can read it.
            const resp = await fetch(signed.signedUrl);
            const buf = new Uint8Array(await resp.arrayBuffer());
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

            // --------- PALETS: suma determinista de "Netos" ---------
            if (wb && /palet/i.test(f.file_name)) {
              try {
                let best: { total: number; count: number; col: number; sheet: string } | null = null;
                for (const sheetName of wb.SheetNames) {
                  const ws = wb.Sheets[sheetName];
                  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
                  let headerIdx = -1;
                  let netosCols: number[] = [];
                  let nPaletCol = -1;
                  for (let r = 0; r < Math.min(rows.length, 40); r++) {
                    const row = rows[r] ?? [];
                    const cols: number[] = [];
                    let np = -1;
                    for (let c = 0; c < row.length; c++) {
                      const cell = norm(row[c]);
                      if (cell === "netos" || cell === "neto" || cell === "kg netos" || cell === "peso neto") cols.push(c);
                      if (np === -1 && (cell === "nºpalet" || cell === "n°palet" || cell === "no palet" || cell === "npalet" || cell === "num palet" || cell === "numero palet" || cell === "no.palet" || cell === "nº palet")) np = c;
                    }
                    if (cols.length > 0) {
                      headerIdx = r;
                      netosCols = cols;
                      nPaletCol = np;
                      break;
                    }
                  }
                  if (headerIdx < 0 || netosCols.length === 0) continue;
                  for (const col of netosCols) {
                    let total = 0;
                    let count = 0;
                    for (let r = headerIdx + 1; r < rows.length; r++) {
                      const row = rows[r] ?? [];
                      if (row.every((x) => x == null || String(x).trim() === "")) continue;
                      const isTotalRow = row.some((x) => /\b(sub)?total(es)?\b/i.test(String(x ?? "")));
                      if (isTotalRow) continue;
                      if (nPaletCol >= 0) {
                        const npv = row[nPaletCol];
                        if (npv == null || String(npv).trim() === "") continue;
                      }
                      const n = toNum(row[col]);
                      if (isFinite(n) && n > 0) { total += n; count += 1; }
                    }
                    if (!best || count > best.count) best = { total, count, col, sheet: sheetName };
                  }
                }
                if (best && best.total > 0) {
                  kg_palets_alta_server = best.total;
                  sources.kg_palets_alta = { file: f.file_name, sheet: best.sheet, note: `${best.count} palets · columna "Netos"` };
                  console.log(`[palets] Netos sum (server) = ${best.total.toFixed(2)} kg (${best.count} rows, col ${best.col}, sheet "${best.sheet}") from ${f.file_name}`);
                }
              } catch (err) {
                console.error("palets Netos sum error", err);
              }
            }

            // --------- INFORME_PRODUCTO: mujeres(PREC*), podrido, muestra ---------
            if (wb && /producto/i.test(f.file_name)) {
              try {
                for (const sheetName of wb.SheetNames) {
                  const ws = wb.Sheets[sheetName];
                  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
                  const { headerIdx, cols } = findHeader(rows, [
                    (h) => h === "producto",
                    (h) => h === "peso(kg)" || h === "peso (kg)" || h === "peso kg" || h === "peso",
                  ]);
                  if (headerIdx < 0 || cols[0] < 0 || cols[1] < 0) continue;
                  const prodCol = cols[0];
                  const pesoCol = cols[1];
                  let mujeres = 0, podrido = 0, muestra = 0;
                  for (let r = headerIdx + 1; r < rows.length; r++) {
                    const row = rows[r] ?? [];
                    const prod = norm(row[prodCol]);
                    if (!prod) continue;
                    if (/\btotal(es)?\b/.test(prod)) continue;
                    const kg = toNum(row[pesoCol]);
                    if (!isFinite(kg)) continue;
                    if (prod.includes("prec")) mujeres += kg;
                    if (prod === "podrido") podrido += kg;
                    if (prod.includes("muestra")) muestra += kg;
                  }
                  kg_mujeres_server = (kg_mujeres_server ?? 0) + mujeres;
                  kg_podrido_calib_server = (kg_podrido_calib_server ?? 0) + podrido;
                  kg_muestra_server = (kg_muestra_server ?? 0) + muestra;
                  if (mujeres > 0) sources.kg_mujeres_calibrador = { file: f.file_name, sheet: sheetName, note: 'filas con "PREC*" · columna Peso(kg)' };
                  if (podrido > 0) sources.kg_podrido_calibrador = { file: f.file_name, sheet: sheetName, note: 'fila "PODRIDO" · columna Peso(kg)' };
                  if (muestra > 0) sources.kg_muestra = { file: f.file_name, sheet: sheetName, note: 'fila "MUESTRA" · columna Peso(kg)' };
                  console.log(`[producto] ${f.file_name} "${sheetName}": mujeres(PREC)=${mujeres.toFixed(2)} podrido=${podrido.toFixed(2)} muestra=${muestra.toFixed(2)}`);
                }
              } catch (err) {
                console.error("producto parse error", err);
              }
            }

            // --------- INFORME_PRODUCCION: kg_produccion_total ---------
            if (wb && /producci[oó]n/i.test(f.file_name) && !/producto/i.test(f.file_name)) {
              try {
                for (const sheetName of wb.SheetNames) {
                  const ws = wb.Sheets[sheetName];
                  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
                  const { headerIdx, cols } = findHeader(rows, [
                    (h) => h === "peso (kg)" || h === "peso(kg)" || h === "peso kg",
                  ]);
                  if (headerIdx < 0 || cols[0] < 0) continue;
                  const pesoCol = cols[0];
                  let sumDetail = 0;
                  let totalsRow = 0;
                  for (let r = headerIdx + 1; r < rows.length; r++) {
                    const row = rows[r] ?? [];
                    const kg = toNum(row[pesoCol]);
                    if (!isFinite(kg) || kg <= 0) continue;
                    const isTotalRow = row.some((x) => /\b(sub)?total(es)?\b/i.test(String(x ?? "")));
                    if (isTotalRow) { totalsRow = kg; continue; }
                    sumDetail += kg;
                  }
                  const total = totalsRow > 0 ? totalsRow : sumDetail;
                  if (total > 0) {
                    kg_produccion_total_server = total;
                    sources.kg_produccion_total = {
                      file: f.file_name,
                      sheet: sheetName,
                      note: totalsRow > 0 ? 'fila TOTALES · columna Peso (kg)' : "suma de filas de detalle · columna Peso (kg)",
                    };
                    console.log(`[produccion] total=${total.toFixed(2)} (detail=${sumDetail.toFixed(2)}, totalsRow=${totalsRow.toFixed(2)}) from ${f.file_name}`);
                  }
                }
              } catch (err) {
                console.error("produccion parse error", err);
              }
            }

            // Cap to avoid prompt bloat
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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 130_000);
      let aiResp: Response;
      try {
        aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
      } catch (e: any) {
        clearTimeout(timeoutId);
        if (e?.name === "AbortError") {
          return j({ success: false, error: "La IA tardó demasiado (>130s). Prueba con menos archivos o reintenta." }, 504);
        }
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
      try {
        parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        parsed = { analisis: String(raw) };
      }

      // Idempotency
      await admin.from("production_runs").delete().eq("part_id", partId);
      await admin.from("gstock_entries").delete().eq("part_id", partId);
      await admin.from("lotes_dia").delete().eq("part_id", partId).eq("source", "ia");

      const prodRows = (parsed.produccion ?? []).map((r: any) => ({
        part_id: partId,
        user_id: parte.user_id,
        date: parte.date,
        product: String(r.product ?? "Desconocido"),
        size_range: r.size_range ?? null,
        kg_produced: Number(r.kg_produced) || 0,
        destination: r.destination ?? null,
      }));
      if (prodRows.length) await admin.from("production_runs").insert(prodRows);

      const gstockRows = (parsed.gstock ?? []).map((r: any) => ({
        part_id: partId,
        user_id: parte.user_id,
        date: parte.date,
        product: String(r.product ?? "Desconocido"),
        size_range: r.size_range ?? null,
        kg_expected: Number(r.kg_expected) || 0,
      }));
      if (gstockRows.length) await admin.from("gstock_entries").insert(gstockRows);

      const lotesRows = (parsed.lotes ?? [])
        .filter((l: any) => l.lote_codigo)
        .map((l: any) => ({
          part_id: partId,
          user_id: parte.user_id,
          lote_codigo: String(l.lote_codigo),
          producto: l.producto ?? null,
          source: "ia",
        }));
      if (lotesRows.length) await admin.from("lotes_dia").insert(lotesRows);

      // ---- Valores autoritativos: preferimos cálculo server-side, fallback a IA ----
      const kg_produccion_total = round2(
        kg_produccion_total_server !== null ? kg_produccion_total_server : (Number(parsed.kg_produccion_total) || 0)
      );
      const kg_mujeres_calibrador = round2(
        kg_mujeres_server !== null ? kg_mujeres_server : (Number(parsed.kg_mujeres_calibrador) || 0)
      );
      const kg_podrido_calibrador = round2(
        kg_podrido_calib_server !== null ? kg_podrido_calib_server : (Number(parsed.kg_podrido_calibrador) || 0)
      );
      const kg_muestra = round2(
        kg_muestra_server !== null ? kg_muestra_server : (Number(parsed.kg_muestra) || 0)
      );
      const kg_palets_alta = round2(
        kg_palets_alta_server !== null ? kg_palets_alta_server : (Number(parsed.kg_palets_alta) || 0)
      );

      const resumen_ia = {
        kg_produccion_total,
        kg_palets_alta,
        kg_mujeres_calibrador,
        kg_podrido_calibrador,
        kg_muestra,
        analisis: parsed.analisis ?? "",
      };

      // Auto-rellenamos los campos del calibrador (vienen del archivo, no son "manuales" reales).
      const updates: Record<string, any> = {
        resumen_ia,
        kg_mujeres_manual: kg_mujeres_calibrador,
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
