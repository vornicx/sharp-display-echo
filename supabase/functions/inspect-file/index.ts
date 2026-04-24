import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { path } = await req.json();
  const { data: signed } = await admin.storage.from("partes-archivos").createSignedUrl(path, 600);
  const resp = await fetch(signed!.signedUrl);
  let buf = new Uint8Array(await resp.arrayBuffer());

  let cutBytes = 0;
  if (buf.length > 8) {
    const startsPK = buf[0] === 0x50 && buf[1] === 0x4b;
    const validZip = startsPK && buf[2] === 0x03 && buf[3] === 0x04;
    if (startsPK && !validZip) {
      const search = Math.min(buf.length - 4, 256);
      for (let i = 1; i < search; i++) {
        if (buf[i] === 0x50 && buf[i+1] === 0x4b && buf[i+2] === 0x03 && buf[i+3] === 0x04) {
          cutBytes = i;
          buf = buf.slice(i);
          break;
        }
      }
    }
  }

  const wb = XLSX.read(buf, { type: "array" });
  const out: any = { cutBytes, sheets: {} };
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, blankrows: false, defval: null }) as any[][];
    // Find Netos column
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
        const n = typeof v === 'number' ? v : parseFloat(String(v||'').replace(/\./g,'').replace(',','.'));
        if (isFinite(n) && n > 0) { total += n; count++; }
      }
    }
    out.sheets[sn] = {
      total_rows: rows.length,
      headers: rows[headerIdx] || rows[0],
      netosCol, headerIdx, total, count,
      sample_data: rows.slice(headerIdx >= 0 ? headerIdx : 0, (headerIdx >= 0 ? headerIdx : 0) + 5),
    };
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
