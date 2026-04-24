import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { path } = await req.json();
  const { data: signed } = await admin.storage.from("partes-archivos").createSignedUrl(path, 600);
  const resp = await fetch(signed!.signedUrl);
  const buf = new Uint8Array(await resp.arrayBuffer());
  
  // Hex dump first 512 bytes
  const hex: string[] = [];
  for (let i = 0; i < Math.min(512, buf.length); i += 16) {
    const chunk = buf.slice(i, i+16);
    const hexStr = Array.from(chunk).map(b => b.toString(16).padStart(2,'0')).join(' ');
    const ascii = Array.from(chunk).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
    hex.push(`${i.toString(16).padStart(4,'0')}: ${hexStr.padEnd(48)} ${ascii}`);
  }
  return new Response(JSON.stringify({ size: buf.length, hex }, null, 2), { headers: { "Content-Type": "application/json" } });
});
