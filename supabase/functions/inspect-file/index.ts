import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Repara un ZIP corrupto que tiene N bytes basura prepended antes del primer PK\x03\x04.
// Recorta esos N bytes y ajusta los offsets en cada Central Directory Entry y en el EOCD.
function repairZipPrefix(buf: Uint8Array): { fixed: Uint8Array; cut: number } | null {
  if (buf.length < 22) return null;
  const startsPK = buf[0] === 0x50 && buf[1] === 0x4b;
  const validZip = startsPK && buf[2] === 0x03 && buf[3] === 0x04;
  if (!startsPK || validZip) return null;

  // Encuentra la firma real PK\x03\x04 en los primeros 256 bytes
  const search = Math.min(buf.length - 4, 256);
  let cut = -1;
  for (let i = 1; i < search; i++) {
    if (buf[i] === 0x50 && buf[i+1] === 0x4b && buf[i+2] === 0x03 && buf[i+3] === 0x04) {
      cut = i;
      break;
    }
  }
  if (cut <= 0) return null;

  // Hacer una copia y recortar
  const out = buf.slice(cut);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

  // Encuentra el End of Central Directory (EOCD) — firma 0x06054b50, buscando desde el final
  // Puede haber comentario al final, pero límite 65535.
  let eocd = -1;
  const minEocd = Math.max(0, out.length - 65557);
  for (let i = out.length - 22; i >= minEocd; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const totalEntries = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);

  // Ajustar offset del Central Directory en EOCD
  if (cdOffset >= cut) {
    view.setUint32(eocd + 16, cdOffset - cut, true);
  }

  // Recorrer cada Central Directory Entry y ajustar el "relative offset of local header"
  // CDE firma 0x02014b50, tamaño base 46 + filename + extra + comment
  let p = cdOffset - cut < 0 ? cdOffset : cdOffset - cut;
  for (let i = 0; i < totalEntries; i++) {
    if (p + 46 > out.length) break;
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localHeaderOffset = view.getUint32(p + 42, true);
    if (localHeaderOffset >= cut) {
      view.setUint32(p + 42, localHeaderOffset - cut, true);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }

  return { fixed: out, cut };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { path } = await req.json();
  const { data: signed } = await admin.storage.from("partes-archivos").createSignedUrl(path, 600);
  const resp = await fetch(signed!.signedUrl);
  let buf = new Uint8Array(await resp.arrayBuffer());

  const rep = repairZipPrefix(buf);
  let cutBytes = 0;
  if (rep) { buf = rep.fixed; cutBytes = rep.cut; }

  let parseError = null;
  let result: any = null;
  try {
    const wb = XLSX.read(buf, { type: "array" });
    result = { sheets: {} };
    for (const sn of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, blankrows: false, defval: null }) as any[][];
      let netosCol = -1, headerIdx = -1;
      for (let r = 0; r < Math.min(40, rows.length); r++) {
        for (let c = 0; c < (rows[r]||[]).length; c++) {
          const v = String(rows[r][c]||'').trim().toLowerCase();
          if (v === 'netos' || v === 'neto') { netosCol = c; headerIdx = r; break; }
        }
        if (netosCol >= 0) break;
      }
      let total = 0, count = 0;
      if (netosCol >= 0) {
        for (let r = headerIdx + 1; r < rows.length; r++) {
          const v = rows[r]?.[netosCol];
          let n: number;
          if (typeof v === 'number') n = v;
          else {
            const s = String(v || '').trim().replace(/\s/g,'');
            n = /,\d+$/.test(s) ? parseFloat(s.replace(/\./g,'').replace(',','.')) : parseFloat(s.replace(/,/g,''));
          }
          if (isFinite(n) && n > 0) { total += n; count++; }
        }
      }
      result.sheets[sn] = {
        total_rows: rows.length,
        headers: rows[headerIdx >= 0 ? headerIdx : 0],
        netosCol, headerIdx, total, count,
        first_5_data: rows.slice(headerIdx >= 0 ? headerIdx + 1 : 0, headerIdx >= 0 ? headerIdx + 6 : 5),
      };
    }
  } catch (e) {
    parseError = String(e);
  }

  return new Response(JSON.stringify({ cutBytes, parseError, result }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
