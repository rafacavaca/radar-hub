/**
 * DIAG — estado do cache do loop por dia (só LEITURA, não roda coleta). Mostra,
 * pra org Formare, quais dias têm cache em org_docs (kind loop-cache), quando
 * rodou, quantos itens e se a análise falhou. Serve pra ver se o próximo acesso
 * vai pagar uma coleta a frio.
 *
 * Uso: npx tsx scripts/diag-loop-cache.mts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const FORMARE = "98e90ffe-1ece-4c05-8c09-43acaafcae7f";
const URL = process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) { console.error("sem chaves Supabase"); process.exit(2); }

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

const hojeUTC = new Date().toISOString().slice(0, 10);
console.log(`hoje (UTC) = ${hojeUTC}\n`);

const { data } = await admin
  .from("org_docs").select("key, data, updated_at").eq("org_id", FORMARE).eq("kind", "loop-cache")
  .order("key", { ascending: false });

if (!data || data.length === 0) {
  console.log("❌ NENHUM cache de loop pra Formare — o próximo acesso a /visao ou / roda a coleta INTEIRA a frio.");
  process.exit(0);
}
for (const row of data as Array<{ key: string; data: Record<string, unknown>; updated_at: string }>) {
  const d = row.data ?? {};
  const items = Array.isArray(d.items) ? d.items.length : "?";
  const fails = Array.isArray(d.failures) ? d.failures.length : 0;
  const marca = row.key === hojeUTC ? " ← HOJE" : "";
  console.log(`${row.key}${marca}  itens=${items} falhas=${fails} ranAt=${(d.ranAt as string) || "?"} (updated ${row.updated_at})`);
}
const temHoje = (data as Array<{ key: string }>).some((r) => r.key === hojeUTC);
console.log(temHoje
  ? "\n✅ cache de HOJE existe — acessos hoje são baratos."
  : "\n⚠️ SEM cache de HOJE — o próximo acesso paga a coleta a frio (o sintoma do Rafael).");
