/**
 * Smoke SIGNALS-HISTORY (Fase 1) — o Feed vira o histórico durável. Prova, contra
 * o Supabase REAL, que `loadSignals`:
 *  1. RETÉM os antigos: devolve sinais de semanas atrás (não só a janela do cache).
 *  2. Ordena ts desc (mais novo primeiro).
 *  3. É ORG-SCOPED: a agência B NÃO vê os sinais do cliente da agência A.
 *  4. Cada agência vê os SEUS.
 *
 * Uso: npm run smoke:signals
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const URL = process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) { console.log("Sem chaves Supabase — smoke signals não roda."); process.exit(1); }

process.env.RADAR_DB = "supabase";
process.env.RADAR_ADMIN_CONTEXT = "1";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke SIGNALS-HISTORY — histórico durável, org-scoped ===\n");

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const { runAsOrgCollector } = await import("@/lib/db/collector-org");
const { loadSignals } = await import("@/lib/db/repo-signals");

const stamp = process.env.RADAR_ISO_STAMP || "sig";
const a = { slug: `test-sig-a-${stamp}`, name: "Org A (sig)" };
const b = { slug: `test-sig-b-${stamp}`, name: "Org B (sig)" };
await admin.from("orgs").delete().in("slug", [a.slug, b.slug]);
const { data: aRow } = await admin.from("orgs").insert(a).select("id").single();
const { data: bRow } = await admin.from("orgs").insert(b).select("id").single();
const aId = aRow!.id as string;
const bId = bRow!.id as string;

const cliA = `Cliente A ${stamp}`;
const cliB = `Cliente B ${stamp}`;
const dia = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString();
function sinal(org: string, cli: string, id: string, ts: string) {
  return {
    id, org_id: org, client_id: cli, competitor_id: "rival-x", ts,
    data: { id, clientName: cli, kind: "blog", competitorName: "Rival X", source: "rival-x", collectedAt: ts, title: `sinal ${id}`, url: "https://ex.test/" + id },
  };
}
// A: 3 sinais — um de 40 dias atrás (o "antigo" que sumiria do cache), um de 10, um de hoje.
await admin.from("signals").insert([
  sinal(aId, cliA, `a-antigo-${stamp}`, dia(40)),
  sinal(aId, cliA, `a-meio-${stamp}`, dia(10)),
  sinal(aId, cliA, `a-hoje-${stamp}`, dia(0)),
]);
// B: 1 sinal do seu próprio cliente.
await admin.from("signals").insert([sinal(bId, cliB, `b-1-${stamp}`, dia(1))]);

const hA = await runAsOrgCollector(aId, () => loadSignals(cliA));
const hB_verCliA = await runAsOrgCollector(bId, () => loadSignals(cliA)); // B tenta ver o cliente de A
const hB = await runAsOrgCollector(bId, () => loadSignals(cliB));

add("A retém os 3 sinais — inclusive o de 40 dias (nada some)", hA.length === 3 && hA.some((e) => e.id === `a-antigo-${stamp}`), `A=${hA.length} ids=[${hA.map((e) => e.id.replace(`-${stamp}`, "")).join(",")}]`);
add("Ordenado ts desc (mais novo primeiro)", hA[0]?.id === `a-hoje-${stamp}` && hA[hA.length - 1]?.id === `a-antigo-${stamp}`);
add("ISOLAMENTO: B NÃO vê os sinais do cliente de A", hB_verCliA.length === 0, `B viu ${hB_verCliA.length} do cliente de A`);
add("Cada agência vê os SEUS (B vê o dele)", hB.length === 1 && hB[0].id === `b-1-${stamp}`, `B=${hB.length}`);

await admin.from("orgs").delete().in("slug", [a.slug, b.slug]);

console.log("── Resultado ──");
let ok = true;
for (const c of criterios) { console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`); if (!c.feito) ok = false; }
console.log(ok ? "\nSIGNALS VERDE ✅ — histórico durável, retém antigos, org-scoped.\n" : "\nSIGNALS VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
