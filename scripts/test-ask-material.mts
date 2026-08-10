/**
 * Smoke ASK-MATERIAL — o "material coletado" do Pergunte ao Brain / relatórios
 * agora vem do cache do loop DA ORG (org_docs), não do cache de ARQUIVO (que era
 * vazio no modo org). Prova, contra o Supabase REAL:
 *  1. collectOrgItems lê os itens do cache do loop da org (por score desc, com dia).
 *  2. `anchor` filtra pra um cliente.
 *  3. ORG-SCOPED: a org B NÃO vê o material da org A.
 *
 * Uso: npm run smoke:ask-material
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const URL = process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) { console.log("Sem chaves Supabase — smoke ask-material não roda."); process.exit(1); }

process.env.RADAR_DB = "supabase";
process.env.RADAR_ADMIN_CONTEXT = "1";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke ASK-MATERIAL — material do chat vem do cache da ORG ===\n");

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const { runAsOrgCollector } = await import("@/lib/db/collector-org");
const { collectOrgItems } = await import("@/lib/ask");

const stamp = process.env.RADAR_ISO_STAMP || "askmat";
const a = { slug: `test-askmat-a-${stamp}`, name: "Org A (askmat)" };
const b = { slug: `test-askmat-b-${stamp}`, name: "Org B (askmat)" };
await admin.from("orgs").delete().in("slug", [a.slug, b.slug]);
const { data: aRow } = await admin.from("orgs").insert(a).select("id").single();
const { data: bRow } = await admin.from("orgs").insert(b).select("id").single();
const aId = aRow!.id as string;
const bId = bRow!.id as string;

const mkItem = (cli: string, id: string, score: number) => ({
  id, clientName: cli, sinal: `Sinal ${id}`, porQueImporta: "importa por X", acao: "faça Y",
  fonte: { titulo: `Fonte ${id}`, url: `https://ex.test/${id}` }, concorrente: "Rival", score,
});
// cache do loop da org A (org_docs kind loop-cache, key = um dia); 3 itens, 2 clientes.
await admin.from("org_docs").insert({
  org_id: aId, kind: "loop-cache", key: "2026-08-10",
  data: { ranAt: "2026-08-10T12:00:00.000Z", items: [mkItem("Cliente X", "x1", 80), mkItem("Cliente X", "x2", 60), mkItem("Cliente Y", "y1", 70)] },
});

// 1. lê os itens da org, por score desc, com dia derivado do ranAt.
const todosA = await runAsOrgCollector(aId, () => collectOrgItems());
add("collectOrgItems lê os 3 itens do cache da org", todosA.length === 3, `n=${todosA.length}`);
add("ordenado por score desc (x1 80 primeiro)", todosA[0]?.id === "x1" && todosA[0]?.score === 80, `1º=${todosA[0]?.id}`);
add("cada item ganha `dia` do ranAt", todosA.every((i) => i.dia === "2026-08-10"), `dia=${todosA[0]?.dia}`);

// 2. anchor filtra por cliente.
const soX = await runAsOrgCollector(aId, () => collectOrgItems("Cliente X"));
add("anchor filtra pra o cliente (Cliente X = 2)", soX.length === 2 && soX.every((i) => i.clientName === "Cliente X"), `n=${soX.length}`);

// 3. org-scoped: B não vê o material de A.
const todosB = await runAsOrgCollector(bId, () => collectOrgItems());
add("ORG-SCOPED: a org B NÃO vê o material da org A", todosB.length === 0, `B=${todosB.length}`);

await admin.from("orgs").delete().in("slug", [a.slug, b.slug]);

console.log("── Resultado ──");
let ok = true;
for (const c of criterios) { console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`); if (!c.feito) ok = false; }
console.log(ok ? "\nASK-MATERIAL VERDE ✅ — material do chat/relatório é org-scoped.\n" : "\nASK-MATERIAL VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
