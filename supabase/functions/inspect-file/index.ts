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
  const buf = new Uint8Array(await resp.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array" });
  const out: any = { sheets: {} };
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null }) as any[][];
    out.sheets[sn] = {
      total_rows: rows.length,
      first_15: rows.slice(0, 15),
      last_5: rows.slice(-5),
    };
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
