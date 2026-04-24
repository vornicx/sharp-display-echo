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
  
  // Magic bytes
  const magic = Array.from(buf.slice(0, 8)).map(b => b.toString(16).padStart(2,'0')).join(' ');
  const asAscii = new TextDecoder('latin1').decode(buf.slice(0, 200));
  
  // Try different parse modes
  let r1: any = {}, r2: any = {}, r3: any = {};
  try {
    const wb = XLSX.read(buf, { type: "array" });
    r1 = { ok: true, sheets: wb.SheetNames, firstRows: XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }).slice(0, 5) };
  } catch (e) { r1 = { error: String(e) }; }
  
  try {
    const wb = XLSX.read(buf, { type: "buffer" });
    r2 = { ok: true, sheets: wb.SheetNames, firstRows: XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }).slice(0, 5) };
  } catch (e) { r2 = { error: String(e) }; }
  
  try {
    // base64
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, buf.subarray(i, i+0x8000) as any);
    }
    const b64 = btoa(bin);
    const wb = XLSX.read(b64, { type: "base64" });
    r3 = { ok: true, sheets: wb.SheetNames, firstRows: XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }).slice(0, 5) };
  } catch (e) { r3 = { error: String(e) }; }
  
  return new Response(JSON.stringify({ size: buf.length, magic, asAscii, r1, r2, r3 }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
