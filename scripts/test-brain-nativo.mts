/**
 * Smoke BRAIN NATIVO (D14) — a base de conhecimento que a agência-cliente
 * constrói na PRÓPRIA org. Prova, contra o Supabase REAL:
 *  1. addBrainItems adiciona e DEDUPE por id (re-descobrir não duplica).
 *  2. re-descobrir NÃO rebaixa um item já confirmado.
 *  3. confirmBrainItem promove inferido→confirmado com autoridade.
 *  4. discardBrainItem remove.
 *  5. brainStats conta (aguardando/confirmados/tipos/fontes).
 *  6. ORG-SCOPED: a org B NÃO vê o Brain da org A (nem por cliente homônimo).
 *
 * Uso: npm run smoke:brain
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const URL = process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) {
  console.log("Sem chaves Supabase — smoke brain não roda.");
  process.exit(1);
}

process.env.RADAR_DB = "supabase";
process.env.RADAR_ADMIN_CONTEXT = "1";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke BRAIN NATIVO — a base de conhecimento da implantação ===\n");

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const { runAsOrgCollector } = await import("@/lib/db/collector-org");
const { addBrainItems, confirmBrainItem, discardBrainItem, brainStats, loadBrainItems, brainItemId } =
  await import("@/lib/brain-nativo/store");
const { itensDoPosicionamento } = await import("@/lib/brain-nativo/descobrir");
const { campoFato, campoNaoEncontrado } = await import("@/lib/diagnostico/schema");

const stamp = process.env.RADAR_ISO_STAMP || "brn";
const a = { slug: `test-brn-a-${stamp}`, name: "Org A (brn)" };
const b = { slug: `test-brn-b-${stamp}`, name: "Org B (brn)" };
await admin.from("orgs").delete().in("slug", [a.slug, b.slug]);
const { data: aRow } = await admin.from("orgs").insert(a).select("id").single();
const { data: bRow } = await admin.from("orgs").insert(b).select("id").single();
const aId = aRow!.id as string;
const bId = bRow!.id as string;

const cli = `Cliente ${stamp}`;
type Tipo = "posicionamento" | "institucional" | "oferta_produto" | "concorrentes" | "mercado";
const mk = (tipo: Tipo, texto: string, autoridade: "verdade" | "referencia") => ({
  id: brainItemId(tipo, texto),
  texto,
  tipo,
  autoridade,
  status: "inferido" as const,
  origem: "site" as const,
  fonte_url: "https://ex.test/x",
  data: "2026-08-10T00:00:00.000Z",
});
const novos = [
  mk("posicionamento", "A empresa se posiciona como líder em X", "verdade"),
  mk("oferta_produto", "Produto A — faz Y pro cliente", "verdade"),
  mk("institucional", "Cita 30 clientes no site", "referencia"),
];

// ── 1/2. add + dedupe ──
const r1 = await runAsOrgCollector(aId, () => addBrainItems(cli, novos));
const r2 = await runAsOrgCollector(aId, () => addBrainItems(cli, novos)); // re-descobrir os mesmos
add("addBrainItems adiciona os 3 itens", r1.added === 3, `added=${r1.added}`);
add("re-descobrir NÃO duplica (dedupe por id)", r2.added === 0 && r2.skipped === 3, `added=${r2.added} skipped=${r2.skipped}`);
const apos = await runAsOrgCollector(aId, () => loadBrainItems(cli));
add("total continua 3 (sem duplicar)", apos.length === 3, `total=${apos.length}`);

// ── 3. confirm ──
await runAsOrgCollector(aId, () => confirmBrainItem(cli, novos[0].id, "verdade"));
const st1 = await runAsOrgCollector(aId, () => brainStats(cli));
add("confirmBrainItem promove inferido→confirmado", st1.confirmados === 1 && st1.aguardando === 2, `conf=${st1.confirmados} aguard=${st1.aguardando}`);

// re-descobrir NÃO rebaixa o confirmado
await runAsOrgCollector(aId, () => addBrainItems(cli, novos));
const st1b = await runAsOrgCollector(aId, () => brainStats(cli));
add("re-descobrir não rebaixa o confirmado", st1b.confirmados === 1, `conf=${st1b.confirmados}`);

// ── 4. discard ──
await runAsOrgCollector(aId, () => discardBrainItem(cli, novos[2].id));
const st2 = await runAsOrgCollector(aId, () => brainStats(cli));
add("discardBrainItem remove o item", st2.itens === 2, `itens=${st2.itens}`);

// ── 5. stats ──
add("brainStats conta tipos e fontes", st2.tipos === 2 && st2.fontes >= 1, `tipos=${st2.tipos} fontes=${st2.fontes}`);

// ── 6. org-scoped ──
const bItems = await runAsOrgCollector(bId, () => loadBrainItems(cli));
add("ORG-SCOPED: a org B NÃO vê o Brain da org A", bItems.length === 0, `B=${bItems.length}`);

// ── 7. mapping Posicionamento (Lente 1) → itens inferidos (puro, sem rede/custo) ──
const dt = "2026-08-10T00:00:00.000Z";
const fu = "https://site.test/x";
const pos = {
  tagline: campoFato("Somos a plataforma X", fu, dt),
  proposito: campoNaoEncontrado(dt),
  posicionamento: campoFato("Líder em Y no Brasil", fu, dt),
  diferenciais: [campoFato("Único com Z", fu, dt)],
  produtos: [{ nome: "Produto A", descricao: "faz W pro cliente", fonte_url: fu, data_coleta: dt }],
  provas: {
    clientes_citados: [campoFato("Cliente Alfa", fu, dt)],
    depoimentos: campoNaoEncontrado(dt),
    premiacoes: [],
    big_numbers: [campoFato("+900 clientes", fu, dt)],
  },
};
const mapItens = itensDoPosicionamento(pos);
const mapTipos = new Set(mapItens.map((i) => i.tipo));
add("mapping: extrai só os campos ACHADOS, ignora nao_encontrado (6 de 8)", mapItens.length === 6, `n=${mapItens.length}`);
add("mapping: todo item entra INFERIDO e com fonte", mapItens.every((i) => i.status === "inferido" && !!i.fonte_url), "");
add("mapping: cobre posicionamento + oferta_produto + institucional", mapTipos.has("posicionamento") && mapTipos.has("oferta_produto") && mapTipos.has("institucional"), [...mapTipos].join(","));

await admin.from("orgs").delete().in("slug", [a.slug, b.slug]);

console.log("── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nBRAIN NATIVO VERDE ✅ — dedupe, confirmação, descarte, org-scoped.\n" : "\nBRAIN NATIVO VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
