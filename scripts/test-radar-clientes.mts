/**
 * Smoke do PILAR CLIENTES (F1a) — o "juiz" do motor de correlação da conta.
 *
 * Prova a regra que rege o pilar: A OFERTA É CLASSIFICAÇÃO, NÃO PORTÃO.
 *   1. Sinal com encaixe DIRETO (planta + exportação) → gera jogada, com a oferta
 *      nomeada (brainRef), ação e fonte real do evento + conta do evento.
 *   2. Sinal de BRECHA (white space — marca D2C ao consumidor) → APARECE rotulado
 *      como oportunidade estratégica, NÃO some (brainRef vazio, por construção).
 *   3. HONESTIDADE: ruído puro (sem gatilho de negócio) não vira jogada forte.
 *   4. Seam de dados: a TAGAT (modo concorrentes) tem o pilar Clientes (≥1
 *      conta-chave) SEM perder o pilar Concorrentes (coexistência).
 *
 * Custo: 1 chamada ao gateway. 0 créditos de coleta (sinais sintéticos seedados).
 * Pré-requisito: `npm run seed:tagat` (grava a conta-chave Bom Gosto).
 * Uso: npm run smoke:clientes
 */

import { config } from "dotenv";

config({ path: ".env.local" });

import { analyzeRelacionamento } from "@/lib/analyst-relacionamento";
import { TAGAT } from "@/lib/clients/tagat";
import { pillarOf, readWatchlist } from "@/lib/watchlist";
import type { RawEvent } from "@/lib/types";

type Criterio = { nome: string; feito: boolean; detalhe?: string };

const now = new Date().toISOString();
const ev = (
  id: string,
  conta: string,
  title: string,
  description: string,
  publishedAt: string,
): RawEvent => ({
  id,
  source: id,
  competitorName: conta,
  kind: "news",
  url: `https://example.test/${id}`,
  title,
  description,
  publishedAt,
  collectedAt: now,
});

// Um sinal por encaixe (DIRETO no núcleo · ADJACENTE que esbarra na produção ·
// BRECHA fora do domínio) + um ruído sem gatilho de negócio.
const S_DIRETO = "bg-planta-export";
const S_ADJACENTE = "bg-marca-d2c";
const S_BRECHA = "bg-fintech-credito";
const S_RUIDO = "bg-doacao-sangue";

const EVENTOS: RawEvent[] = [
  ev(
    S_DIRETO,
    "Bom Gosto",
    "Bom Gosto inaugura nova planta no Nordeste e habilita exportação de carne para o Oriente Médio",
    "O frigorífico abriu uma segunda unidade industrial e obteve habilitação para exportar, passando a operar duas plantas e a atender exigências de rastreabilidade e certificação dos mercados importadores.",
    "2026-06-28",
  ),
  ev(
    S_ADJACENTE,
    "Bom Gosto",
    "Bom Gosto lança marca própria de produtos ao consumidor final com venda direta pelo e-commerce (D2C)",
    "A empresa criou uma marca de varejo voltada ao consumidor final e passou a vender diretamente pela internet, investindo em marketing de consumo e logística de entrega ao cliente doméstico.",
    "2026-06-26",
  ),
  ev(
    S_BRECHA,
    "Bom Gosto",
    "Bom Gosto cria fintech própria para financiar a compra de gado dos pecuaristas de sua cadeia",
    "A empresa lançou um braço de serviços financeiros que oferece crédito e antecipação de recebíveis aos produtores rurais fornecedores, entrando no mercado de crédito para o agronegócio.",
    "2026-06-24",
  ),
  ev(
    S_RUIDO,
    "Bom Gosto",
    "Bom Gosto promove campanha interna de doação de sangue entre colaboradores",
    "Ação social voltada aos funcionários, sem relação com produção, exportação, contratação ou investimento.",
    "2026-06-20",
  ),
];

// F2 — movimentos de CONCORRENTES da TAGAT (a urgência cita um destes, por índice).
// O da Mtech mira a MESMA brecha do sinal direto (exportação); o da Brainr, não.
const COMP_MTECH = "mtech-export";
const COMPETITOR_EVENTS: RawEvent[] = [
  ev(
    COMP_MTECH,
    "Mtech",
    "Mtech lança módulo de compliance de exportação e rastreabilidade para frigoríficos exportadores",
    "A Mtech anunciou um módulo focado em rastreabilidade e conformidade documental para plantas que exportam carne — mirando frigoríficos que abrem mercados externos.",
    "2026-06-27",
  ),
  ev(
    "brainr-ui",
    "Brainr",
    "Brainr renova a interface do painel de produção",
    "Atualização de usabilidade do dashboard de chão de fábrica — sem relação com exportação.",
    "2026-06-21",
  ),
];

// F4 — sinais de MERCADO (o reforço cita um destes por índice). publishedAt null
// (hit de busca não traz data confiável — honesto).
const M_HALAL = "mkt-halal";
const MARKET_EVENTS: RawEvent[] = [
  {
    id: M_HALAL,
    source: "mercado",
    competitorName: "Mercado",
    kind: "market",
    url: `https://example.test/${M_HALAL}`,
    title: "Demanda por carne halal cresce nas exportações brasileiras para o Oriente Médio",
    description:
      "Frigoríficos brasileiros ampliam habilitações halal para atender a demanda crescente dos países importadores do Oriente Médio.",
    publishedAt: null,
    collectedAt: now,
  },
];

const criterios: Criterio[] = [];
const add = (nome: string, feito: boolean, detalhe?: string) =>
  criterios.push({ nome, feito, detalhe });

console.log("\n=== Smoke Pilar Clientes — TAGAT × contas-chave (correlação) ===\n");

// ── 4. Seam de dados (rápido, sem gateway) ──────────────────────────────────
const wl = readWatchlist();
const tagat = wl.clients.find((c) => c.name === TAGAT.clientName);
const entidades = tagat?.competitors ?? [];
const contas = entidades.filter((c) => pillarOf(c, tagat?.mode) === "conta-chave");
const concorrentes = entidades.filter((c) => pillarOf(c, tagat?.mode) === "concorrente");
add(
  "Seam: TAGAT (concorrentes) com pilar Clientes ≥1 conta-chave E pilar Concorrentes preservado",
  (tagat?.mode ?? "concorrentes") === "concorrentes" && contas.length >= 1 && concorrentes.length >= 1,
  `mode=${tagat?.mode ?? "concorrentes"} · contas-chave=${contas.length} · concorrentes=${concorrentes.length}` +
    (contas.length === 0 ? "  (rode: npm run seed:tagat)" : ""),
);

// ── 1-3. O analista de relacionamento (1 chamada ao gateway) ────────────────
const jogadas = await analyzeRelacionamento(
  EVENTOS,
  TAGAT.clientName,
  TAGAT.offerContext,
  COMPETITOR_EVENTS,
  MARKET_EVENTS,
);

// Imprime a SAÍDA REAL, em linguagem simples, pro Rafael julgar a classificação.
const contaPorId = new Map(EVENTOS.map((e) => [e.id, e.competitorName]));
const rotuloSinal: Record<string, string> = {
  [S_DIRETO]: "DIRETO",
  [S_ADJACENTE]: "ADJACENTE",
  [S_BRECHA]: "BRECHA",
  [S_RUIDO]: "RUÍDO",
};
const idDoSinal = (id: string) => rotuloSinal[id] ?? id;
console.log("── Saída real do analista (o que a ficha da conta mostraria) ──\n");
for (const j of jogadas) {
  const origem = j.eventIds.map((id) => idDoSinal(id)).join(",");
  console.log(`▸ [${j.encaixe.toUpperCase()}] ${j.conta}  (sinal: ${origem}, impacto ${j.score})`);
  console.log(`   Sinal:        ${j.sinal}`);
  console.log(`   Gatilho:      ${j.gatilho}`);
  console.log(`   Justificativa:${" "}${j.justificativa}`);
  console.log(`   Ação:         ${j.acao}`);
  console.log(`   Oferta (Brain):${" "}${j.brainRef ?? "— (nenhuma — é brecha/white space)"}`);
  console.log(
    `   Urgência:     ${j.urgencia ? `${j.urgencia}  [${j.urgenciaConcorrente ?? "?"} — ${j.urgenciaFonte?.url ?? ""}]` : "— (nenhum concorrente no tema)"}`,
  );
  console.log(
    `   Reforço mkt:  ${j.reforco ? `${j.reforco}${j.reforcoFonte ? `  [fonte: ${j.reforcoFonte.url}]` : "  (derivado, sem fonte)"}` : "— (sem evidência de tendência)"}`,
  );
  console.log(`   Fonte:        ${j.fonte.titulo}  <${j.fonte.url}>`);
  console.log("");
}
if (jogadas.length === 0) console.log("   (o analista não devolveu jogadas)\n");

// ≥3 jogadas: os 3 sinais com gatilho viram item (o ruído pode ou não virar).
add("Analista produziu ≥3 jogadas (nenhum sinal real descartado)", jogadas.length >= 3, `jogadas=${jogadas.length}`);

// bem-formadas: campos + score + fonte real + conta do evento
const urlsReais = new Set(EVENTOS.map((e) => e.url));
const idsValidos = new Set(EVENTOS.map((e) => e.id));
const bemFormada = (j: (typeof jogadas)[number]) =>
  Boolean(j.sinal && j.gatilho && j.justificativa && j.acao) &&
  ["direto", "adjacente", "brecha"].includes(j.encaixe) &&
  j.score >= 0 &&
  j.score <= 100 &&
  urlsReais.has(j.fonte.url) &&
  j.eventIds.every((id) => idsValidos.has(id)) &&
  Boolean(j.publishedAt || j.collectedAt) &&
  j.eventIds.every((id) => contaPorId.get(id) === j.conta); // conta do evento, nunca do LLM
add(
  "Todas bem-formadas (campos/encaixe/score/fonte real/conta do evento)",
  jogadas.length > 0 && jogadas.every(bemFormada),
  jogadas.map((j) => `${j.encaixe}:${j.conta}(${j.score})`).join(" · ") || "—",
);

// 1. encaixe DIRETO: gera jogada com a oferta nomeada (brainRef)
const direto = jogadas.find((j) => j.eventIds.includes(S_DIRETO));
add(
  "Sinal planta+exportação → encaixe DIRETO, com oferta nomeada (brainRef) e ação",
  Boolean(direto) && direto!.encaixe === "direto" && Boolean(direto!.brainRef) && Boolean(direto!.acao),
  direto ? `encaixe=${direto.encaixe} · brainRef=${direto.brainRef ? "sim" : "VAZIO"}` : "sem jogada pro sinal direto",
);

// 2. ADJACENTE (o meio honesto): D2C esbarra na produção → NÃO é descartado nem
//    force-fit a 'direto'; aparece como oportunidade a confirmar.
const adjacente = jogadas.find((j) => j.eventIds.includes(S_ADJACENTE));
add(
  "Sinal D2C → aparece como oportunidade honesta (não descartado, não force-fit a direto)",
  Boolean(adjacente) && adjacente!.encaixe !== "direto",
  adjacente ? `encaixe=${adjacente.encaixe}` : "SUMIU (descartado) ❌",
);

// 3. WHITE SPACE: fintech (fora do domínio) é registrada e classificada
//    HONESTAMENTE — nunca some, nunca é force-fit a 'direto'. Pode vir 'brecha'
//    (white space puro) OU 'adjacente' (o analista achou um elo plausível, ex.:
//    rastreabilidade→elegibilidade de crédito) — a régua de honestidade prefere
//    adjacente havendo QUALQUER conexão. Se vier brecha, brainRef tem de ser vazio.
const brecha = jogadas.find((j) => j.eventIds.includes(S_BRECHA));
add(
  "Sinal fintech/crédito → registrado e honesto (adjacente/brecha, nunca force-fit a direto)",
  Boolean(brecha) &&
    brecha!.encaixe !== "direto" &&
    (brecha!.encaixe !== "brecha" || !brecha!.brainRef),
  brecha
    ? `encaixe=${brecha.encaixe}${brecha.encaixe === "brecha" ? ` · brainRef=${brecha.brainRef ? "presente(?)" : "vazio"}` : ""}`
    : "SUMIU (descartado) ❌",
);

// F2 — URGÊNCIA (concorrente): o sinal direto (exportação) ganha urgência
// citando a Mtech (que mira a mesma brecha), ancorada na FONTE real do concorrente.
add(
  "F2 — Urgência: jogada direta cita o concorrente Mtech, com fonte real do sinal dele",
  Boolean(direto?.urgencia) &&
    (direto?.urgenciaConcorrente ?? "").toLowerCase().includes("mtech") &&
    direto?.urgenciaFonte?.url === `https://example.test/${COMP_MTECH}`,
  direto
    ? `urgencia=${direto.urgencia ? "sim" : "não"} · concorrente=${direto.urgenciaConcorrente ?? "—"} · fonte=${direto.urgenciaFonte?.url ?? "—"}`
    : "sem jogada direto",
);

// F2 — HONESTO: a brecha (fintech) NÃO tem concorrente no tema → urgência OMITIDA (não inventada).
add(
  "F2 — Honesto: fintech sem concorrente no tema → sem urgência",
  Boolean(brecha) && !brecha!.urgencia,
  brecha ? `urgencia=${brecha.urgencia ? "PRESENTE(?)" : "ausente (correto)"}` : "sem jogada pro sinal fintech",
);

// F4 — REFORÇO com FONTE de mercado: alguma jogada ancora o reforço no sinal de
// mercado coletado (halal/exportação) — deixa de ser inferido e passa a citar fonte real.
const comReforcoFonte = jogadas.find(
  (j) => j.reforcoFonte?.url === `https://example.test/${M_HALAL}`,
);
add(
  "F4 — Reforço ancorado numa FONTE de mercado real (não inventado)",
  Boolean(comReforcoFonte),
  comReforcoFonte
    ? `${comReforcoFonte.encaixe}: reforço cita ${comReforcoFonte.reforcoFonte?.url}`
    : "nenhuma jogada citou o sinal de mercado (reforço ficou derivado)",
);

// 3. honestidade: ruído puro não vira jogada forte
const ruido = jogadas.find((j) => j.eventIds.includes(S_RUIDO));
add(
  "Honesto: ruído (doação de sangue) não vira jogada forte (≥60)",
  !ruido || ruido.score < 60,
  ruido ? `gerou jogada score=${ruido.score}` : "ignorado (correto)",
);

// ── Resultado ───────────────────────────────────────────────────────────────
console.log("── Critérios ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(
  ok
    ? "\nPilar Clientes VERDE ✅ — a oferta CLASSIFICA (direto/brecha), não filtra; honesto, com fonte e conta do evento.\n"
    : "\nPilar Clientes VERMELHO ❌ — ver acima.\n",
);
process.exit(ok ? 0 : 1);
