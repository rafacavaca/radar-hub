/**
 * Smoke RENDER-NONBLOCKING — prova que o caminho de RENDER das telas
 * (loadRadarForRender) NUNCA coleta: serve o cache que existir e sinaliza
 * needsRefresh quando está morno. É o conserto da lentidão "depois de um tempo
 * sem acessar" (a página não pendura mais numa coleta a frio).
 *
 * Contra o Supabase REAL, sob contexto de org:
 *  1. Cache de HOJE → devolve-o, needsRefresh FALSO (fresco).
 *  2. Só cache VELHO → devolve o velho + needsRefresh TRUE (o cliente aquece).
 *  3. SEM cache → vazio + needsRefresh TRUE. (nunca coleta em nenhum caso)
 * Tempo de cada chamada é logado — deve ser sub-segundo (leitura, não coleta).
 *
 * Uso: npm run smoke:render
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const URL = process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) { console.log("Sem chaves Supabase — smoke render não roda."); process.exit(1); }

process.env.RADAR_DB = "supabase";
process.env.RADAR_ADMIN_CONTEXT = "1";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke RENDER-NONBLOCKING ===\n");

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const { runAsOrgCollector } = await import("@/lib/db/collector-org");
const { loadRadarForRender } = await import("@/lib/loop");

const stamp = process.env.RADAR_ISO_STAMP || "render";
const org = { slug: `test-render-${stamp}`, name: "Org Render" };
await admin.from("orgs").delete().eq("slug", org.slug);
const { data: row } = await admin.from("orgs").insert(org).select("id").single();
const orgId = row!.id as string;

const hoje = new Date().toISOString().slice(0, 10);
async function seedCache(dia: string, items: unknown[]): Promise<void> {
  await admin.from("org_docs").upsert(
    { org_id: orgId, kind: "loop-cache", key: dia, data: { items, ranAt: `${dia}T12:00:00.000Z` }, updated_at: new Date().toISOString() },
    { onConflict: "org_id,kind,key" },
  );
}
async function limparCache(): Promise<void> {
  await admin.from("org_docs").delete().eq("org_id", orgId).eq("kind", "loop-cache");
}
async function medir(): Promise<{ r: Awaited<ReturnType<typeof loadRadarForRender>>; ms: number }> {
  const t = Date.now();
  const r = await runAsOrgCollector(orgId, () => loadRadarForRender());
  return { r, ms: Date.now() - t };
}

// 1. cache de HOJE → fresco
await seedCache(hoje, [{ id: "hoje-1", score: 5 }, { id: "hoje-2", score: 9 }]);
const c1 = await medir();
add("Cache de HOJE: devolve os itens, needsRefresh falso", c1.r.items.length === 2 && !c1.r.needsRefresh, `itens=${c1.r.items.length} needsRefresh=${c1.r.needsRefresh ?? false} (${c1.ms}ms)`);
add("Ordenado por score desc (item de score 9 primeiro)", (c1.r.items[0] as { id: string }).id === "hoje-2");

// 2. só cache VELHO → morno + needsRefresh
await limparCache();
await seedCache("2020-01-01", [{ id: "velho-1", score: 3 }]);
const c2 = await medir();
add("Só cache VELHO: serve o velho + needsRefresh TRUE (não coleta)", c2.r.items.length === 1 && c2.r.needsRefresh === true, `itens=${c2.r.items.length} needsRefresh=${c2.r.needsRefresh} (${c2.ms}ms)`);

// 3. SEM cache → vazio + needsRefresh
await limparCache();
const c3 = await medir();
add("SEM cache: vazio + needsRefresh TRUE (não coleta)", c3.r.items.length === 0 && c3.r.needsRefresh === true, `itens=${c3.r.items.length} needsRefresh=${c3.r.needsRefresh} (${c3.ms}ms)`);

// tempo: leitura, nunca coleta (coleta seria dezenas de segundos)
const maxMs = Math.max(c1.ms, c2.ms, c3.ms);
add("Toda chamada é sub-segundo-e-pouco (leitura, não coleta)", maxMs < 5000, `pior caso=${maxMs}ms`);

await admin.from("orgs").delete().eq("slug", org.slug);

console.log("── Resultado ──");
let ok = true;
for (const c of criterios) { console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`); if (!c.feito) ok = false; }
console.log(ok ? "\nRENDER VERDE ✅ — o render serve cache e nunca pendura numa coleta.\n" : "\nRENDER VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
