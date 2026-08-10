/**
 * DIAG (Fase 0) — os sinais antigos estão FILTRADOS (na tabela `signals`) ou
 * APAGADOS? Só LEITURA. Compara, por cliente da org Formare: quantos sinais
 * DURÁVEIS existem na tabela (com faixa de datas) vs quantos o CACHE do dia
 * (o que o Briefing/Feed leem) tem agora. Se a tabela tem muito mais / mais
 * antigos que o cache → retido, é problema de VISÃO, não perda.
 *
 * Uso: npx tsx scripts/diag-signals.mts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const FORMARE = "98e90ffe-1ece-4c05-8c09-43acaafcae7f";
const URL = process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) { console.error("sem chaves"); process.exit(2); }

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

// 1) tabela signals (história durável) — por cliente, contagem + faixa de datas
const { data: sigs, count } = await admin
  .from("signals").select("client_id, ts", { count: "exact" }).eq("org_id", FORMARE)
  .order("ts", { ascending: true });
console.log(`\n=== TABELA signals (durável) — org Formare ===`);
console.log(`total de sinais na tabela: ${count ?? sigs?.length ?? 0}`);
const porCliente = new Map<string, { n: number; min: string; max: string }>();
for (const s of (sigs ?? []) as Array<{ client_id: string; ts: string }>) {
  const cur = porCliente.get(s.client_id);
  if (!cur) porCliente.set(s.client_id, { n: 1, min: s.ts, max: s.ts });
  else { cur.n++; if (s.ts < cur.min) cur.min = s.ts; if (s.ts > cur.max) cur.max = s.ts; }
}
for (const [cli, v] of porCliente) {
  const dias = Math.round((new Date(v.max).getTime() - new Date(v.min).getTime()) / 86400000);
  console.log(`  ${cli}: ${v.n} sinais · de ${v.min.slice(0, 10)} a ${v.max.slice(0, 10)} (${dias} dias de história)`);
}

// 2) cache do dia (o que o Briefing/Feed leem) — eventos por cliente
console.log(`\n=== CACHE do loop (o que o Briefing/Feed mostram HOJE) ===`);
const { data: caches } = await admin
  .from("org_docs").select("key, data").eq("org_id", FORMARE).eq("kind", "loop-cache")
  .order("key", { ascending: false }).limit(1);
const cache = (caches?.[0]?.data ?? null) as { events?: Array<{ clientName?: string }>; items?: unknown[]; ranAt?: string } | null;
if (!cache) console.log("  (sem cache)");
else {
  const evPorCliente = new Map<string, number>();
  for (const e of cache.events ?? []) evPorCliente.set(e.clientName ?? "?", (evPorCliente.get(e.clientName ?? "?") ?? 0) + 1);
  console.log(`  cache de ${caches?.[0]?.key} (ranAt ${cache.ranAt}): ${(cache.events ?? []).length} eventos, ${(cache.items ?? []).length} itens`);
  for (const [cli, n] of evPorCliente) console.log(`  ${cli}: ${n} eventos no cache`);
}

// 3) veredito
console.log(`\n=== VEREDITO ===`);
const totalTabela = count ?? 0;
const totalCache = (cache?.events ?? []).length;
console.log(totalTabela > totalCache
  ? `A tabela tem ${totalTabela} sinais; o cache mostra ${totalCache}. Os antigos estão RETIDOS na tabela — problema de VISÃO, não perda.`
  : `A tabela tem ${totalTabela} e o cache ${totalCache} — investigar mais (tabela não maior que o cache).`);
