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
   Columnas típicas: "Producto", "Empaques", "Peso(kg)" (o "Peso (kg)"), a veces "Fruta".
   ⚠️ USA SIEMPRE LA COLUMNA "Peso(kg)" — NUNCA "Empaques" ni "Fruta". Equivocarse de columna
       da valores 20× más grandes que los reales.
   Reglas:
     • "kg_mujeres_calibrador" = SUMA de la columna **Peso(kg)** de TODAS las filas cuyo "Producto"
       CONTIENE la cadena "PREC" (case-insensitive). Puede haber varias filas: PREC NAVELINA,
       PREC LANE, PREC SALUSTIANA, etc. Súmalas TODAS. Resultado típico: pocos miles de kg
       (ej: 2.195 kg). Si te sale >20.000 kg estás sumando la columna equivocada — REVISA.
     • "kg_podrido_calibrador" = **Peso(kg)** de la fila cuyo "Producto" sea "PODRIDO".
       Si no existe, 0.
     • "kg_muestra" = **Peso(kg)** de la fila cuyo "Producto" sea "MUESTRA". Si no existe, 0.
     • "produccion" = lista con TODAS las filas reales de producto (excluye totales). Cada fila:
       {product, size_range (calibre/tamaño si hay), kg_produced (=Peso(kg)), destination}.

C) ARCHIVO DE PALETS (xlsx cuyo NOMBRE contiene "palet" o "palets" — IGNORA su file_type)
   Columnas típicas: TipoPalet, NºPalet, Denominación Producto, Lote, DcmtoVta, Cliente,
   Cajas, TipoCaja, Netos, Fact., Sit.
   → "kg_palets_alta" = SUMA de la columna "Netos" de TODAS las filas con Netos > 0.
   → NO filtres por TipoPalet ni por Sit. Suma TODOS los palets con Netos positivo.
   → NO uses el archivo GSTOCK para esto.

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
  NUNCA las extraigas: las introduce el operario. NO las incluyas en el JSON.`;

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
            const b64 = btoa(String.fromCharCode(...buf));
            content.push({
              type: "text",
              text: `--- Archivo: ${f.file_name} (tipo: ${f.file_type}) ---`,
            });
            content.push({
              type: "image_url",
              image_url: { url: `data:${f.mime_type};base64,${b64}` },
            });
          } else {
            content.push({
              type: "text",
              text: `--- Archivo: ${f.file_name} (tipo: ${f.file_type}, mime: ${f.mime_type ?? "?"}). URL temporal: ${signed.signedUrl} ---`,
            });
          }
        } catch (e) {
          console.error("File fetch error", f.file_name, e);
        }
      }

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: sysPrompt },
            { role: "user", content },
          ],
          response_format: { type: "json_object" },
        }),
      });

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

      // ---- Valores autoritativos extraídos por la IA ----
      const kg_produccion_total = round2(Number(parsed.kg_produccion_total) || 0);
      const kg_mujeres_calibrador = round2(Number(parsed.kg_mujeres_calibrador) || 0);
      const kg_podrido_calibrador = round2(Number(parsed.kg_podrido_calibrador) || 0);
      const kg_muestra = round2(Number(parsed.kg_muestra) || 0);
      const kg_palets_alta = round2(Number(parsed.kg_palets_alta) || 0);

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
