/**
 * Smoke da INGESTÃO DE LINKEDIN (F1) — o "juiz" do botão "Enviar pro Radar".
 * Prova a LÓGICA de ingestão (sem HTTP, sem rede), em data dir isolado:
 *   1. Data relativa ("3 sem", "1 mês") -> ABSOLUTA correta (o bug do "31 dez 1969").
 *   2. Post de CONCORRENTE -> entra no pilar Concorrentes (com data absoluta + url + fonte).
 *   3. Post de CONTA-CHAVE -> entra na conta E dispara o analista de relacionamento (≥1 jogada).
 *   4. Isolamento: workspace sem posts -> coleta vazia (nada vaza).
 *
 * Custo: 1 chamada ao gateway (o teste 3). Uso: npm run smoke:linkedin
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// isola o store (data/linkedin.json) num tmp — não toca os dados reais.
process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-li-"));

const { resolveRelativeDate, ingestLinkedInPost, collectLinkedIn } = await import("@/lib/linkedin");
const { analyzeRelacionamento } = await import("@/lib/analyst-relacionamento");
const { TAGAT } = await import("@/lib/clients/tagat");

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (nome: string, feito: boolean, detalhe?: string) => criterios.push({ nome, feito, detalhe });

const now = new Date().toISOString();
const WS = "TAGAT Foodtech";

console.log("\n=== Smoke Ingestão LinkedIn — botão 'Enviar pro Radar' ===\n");

// ── 1. Data relativa -> absoluta (o bug histórico) ──────────────────────────
const d3sem = resolveRelativeDate("3 sem", now);
const anoAtual = new Date(now).getUTCFullYear();
const diasAtras = d3sem ? Math.round((new Date(now).getTime() - new Date(d3sem).getTime()) / 86400000) : -1;
add(
  '"3 sem" vira data absoluta correta (~21 dias atrás, ano atual — não 1969)',
  Boolean(d3sem) && new Date(d3sem!).getUTCFullYear() === anoAtual && diasAtras >= 20 && diasAtras <= 22,
  `resolvida=${d3sem?.slice(0, 10)} (${diasAtras} dias atrás)`,
);
add(
  "Data sem sentido -> null (sem data de publicação, honesto)",
  resolveRelativeDate("qualquer coisa", now) === null,
  `garbage -> ${resolveRelativeDate("qualquer coisa", now)}`,
);
add(
  "Data ISO absoluta passa direto",
  resolveRelativeDate("2026-06-28", now)?.slice(0, 10) === "2026-06-28",
  `2026-06-28 -> ${resolveRelativeDate("2026-06-28", now)?.slice(0, 10)}`,
);

// ── 2. Post de CONCORRENTE -> pilar Concorrentes ────────────────────────────
ingestLinkedInPost({
  workspace: WS,
  papel: "concorrente",
  perfil: "Mtech",
  texto: "Mtech anuncia módulo de compliance de exportação para frigoríficos — foco em rastreabilidade halal.",
  data_publicacao: "2 sem",
  data_coleta: now,
  url: "https://www.linkedin.com/posts/mtech_export-compliance-activity-1",
});
const li1 = collectLinkedIn(WS);
const conc = li1.concorrente[0];
add(
  "Post de concorrente entra no pilar Concorrentes (data absoluta + url + fonte)",
  li1.concorrente.length === 1 &&
    Boolean(conc?.publishedAt) &&
    new Date(conc!.publishedAt as string).getUTCFullYear() === anoAtual &&
    conc!.url.startsWith("https://www.linkedin.com/") &&
    conc!.competitorName === "Mtech",
  conc ? `perfil=${conc.competitorName} · publishedAt=${conc.publishedAt?.slice(0, 10)} · source=${conc.source}` : "sem evento",
);

// ── 3. Post de CONTA-CHAVE -> ficha + dispara o analista ─────────────────────
ingestLinkedInPost({
  workspace: WS,
  papel: "conta-chave",
  perfil: "GTF",
  texto:
    "GTF inaugura nova planta de proteína e habilita exportação para o Oriente Médio, com meta de dobrar a capacidade produtiva.",
  data_publicacao: "5 d",
  data_coleta: now,
  url: "https://www.linkedin.com/posts/gtf_nova-planta-exportacao-activity-2",
});
const li2 = collectLinkedIn(WS);
add("Post de conta-chave entra na conta (GTF)", li2.conta.length === 1 && li2.conta[0].competitorName === "GTF", `conta=${li2.conta[0]?.competitorName}`);

const jogadas = await analyzeRelacionamento(li2.conta, WS, TAGAT.offerContext);
const j = jogadas.find((p) => p.conta === "GTF");
add(
  "Post de conta-chave DISPARA o analista de relacionamento (≥1 jogada classificada)",
  jogadas.length >= 1 && Boolean(j) && ["direto", "adjacente", "brecha"].includes(j!.encaixe),
  j ? `[${j.encaixe}] ${j.sinal} (score ${j.score})` : "nenhuma jogada",
);
if (j) {
  console.log(`\n   Jogada gerada do post de LinkedIn: [${j.encaixe}] ${j.sinal}`);
  console.log(`   Gatilho: ${j.gatilho}\n   Ação: ${j.acao}\n   Fonte: <${j.fonte.url}>\n`);
}

// ── 4. Isolamento: outro workspace não vê nada ──────────────────────────────
add("Isolamento: workspace sem posts -> coleta vazia", collectLinkedIn("Moovefy").conta.length === 0 && collectLinkedIn("Moovefy").concorrente.length === 0);

// ── Resultado ───────────────────────────────────────────────────────────────
console.log("── Critérios ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(
  ok
    ? "\nIngestão LinkedIn VERDE ✅ — post entra pelo pilar certo, com data absoluta + fonte, e dispara a correlação.\n"
    : "\nIngestão LinkedIn VERMELHO ❌ — ver acima.\n",
);
process.exit(ok ? 0 : 1);
