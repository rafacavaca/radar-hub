/**
 * Smoke test da F9 — o "juiz" do INTERNO × EXTERNO (o cruzamento).
 *
 * O que prova (a alma da feature é a HONESTIDADE):
 *   1. Brain que DIZ que o cliente tem a capacidade -> o cruzamento reconhece
 *      (verdict acionável: ja_temos/meio_pronto/gap), NÃO fica "sem dado";
 *   2. Brain SILENCIOSO sobre a capacidade interna -> verdict OBRIGATÓRIO
 *      'sem_dado_interno' — NUNCA inventa 'ja_temos' nem 'meio_pronto' (a linha
 *      que separa ouro de alucinação);
 *   3. toda leitura cita a fonte REAL do movimento (mapeada, nunca inventada).
 *
 * Custo: 2 chamadas ao gateway (uma por cenário). 0 créditos Firecrawl.
 * Uso: npm run smoke:f9
 */

import { config } from "dotenv";

config({ path: ".env.local" });

const { crossReference } = await import("@/lib/cross-reference");

import type { RawEvent } from "@/lib/types";

type Criterio = { nome: string; feito: boolean; detalhe?: string };

/** Movimento externo: concorrente lançou "previsão de churn com IA". */
const EVENTO: RawEvent = {
  id: "evt-cross-smoke",
  source: "concorrente-x",
  competitorName: "Concorrente X",
  kind: "release",
  url: "https://example.com/concorrente-x/previsao-de-churn-ia",
  title: "Concorrente X lançou previsão de churn com IA no CRM",
  description:
    "O Concorrente X anunciou um módulo de IA que prevê churn de clientes dentro do CRM, " +
    "com alertas automáticos para o time comercial agir antes do cancelamento.",
  collectedAt: new Date().toISOString(),
};

/** Brain que DIZ explicitamente que o cliente já tem previsão de churn. */
const BRAIN_TEM =
  "A Moovefy é CRM/SFA B2B customizável. IMPORTANTE (interno): a Moovefy JÁ POSSUI um módulo " +
  "de previsão de churn baseado em dados, entregue como parte do BI da plataforma para alguns clientes.";

/** Brain SILENCIOSO sobre churn/IA interna — só descreve o que a empresa é. */
const BRAIN_CALADO =
  "A Moovefy é uma empresa de tecnologia B2B: CRM/SFA, e-procurement e software sob medida. " +
  "Diferencial é a customização ao processo do cliente. (Nada aqui sobre previsão de churn nem IA interna.)";

async function rodar(): Promise<Criterio[]> {
  const criterios: Criterio[] = [];

  // 1) Brain diz que tem -> reconhece (acionável), não "sem dado".
  try {
    const out = await crossReference([EVENTO], "Moovefy", BRAIN_TEM);
    const insight = out.find((i) => i.eventIds[0] === EVENTO.id) ?? out[0];
    const reconheceu = Boolean(insight) && insight.verdict !== "sem_dado_interno";
    criterios.push({
      nome: "Brain diz que o cliente TEM -> cruzamento reconhece (não fica 'sem dado')",
      feito: reconheceu,
      detalhe: insight ? `verdict=${insight.verdict}` : "nenhum insight gerado",
    });
  } catch (err) {
    criterios.push({
      nome: "Brain diz que o cliente TEM -> cruzamento reconhece (não fica 'sem dado')",
      feito: false,
      detalhe: (err as Error).message,
    });
  }

  // 2) Brain calado -> sem_dado_interno; NUNCA inventa ja_temos/meio_pronto.
  try {
    const out = await crossReference([EVENTO], "Moovefy", BRAIN_CALADO);
    const insight = out.find((i) => i.eventIds[0] === EVENTO.id) ?? out[0];
    // honesto = ou não gerou nada, OU gerou como sem_dado_interno/gap; o que
    // NÃO pode acontecer é afirmar que a Moovefy TEM/COMEÇOU (isso seria invenção).
    const inventou = Boolean(insight) && (insight.verdict === "ja_temos" || insight.verdict === "meio_pronto");
    criterios.push({
      nome: "Brain CALADO -> honesto (sem_dado_interno/gap); NUNCA inventa 'ja_temos'/'meio_pronto'",
      feito: !inventou,
      detalhe: insight ? `verdict=${insight.verdict} (inventou=${inventou})` : "nenhum insight (honesto)",
    });
  } catch (err) {
    criterios.push({
      nome: "Brain CALADO -> honesto (sem_dado_interno/gap); NUNCA inventa 'ja_temos'/'meio_pronto'",
      feito: false,
      detalhe: (err as Error).message,
    });
  }

  // 3) Fontes reais.
  try {
    const out = await crossReference([EVENTO], "Moovefy", BRAIN_TEM);
    const fontesReais = out.every((i) => i.fonte.url === EVENTO.url);
    criterios.push({
      nome: "Todo insight cita a fonte REAL do movimento (mapeada)",
      feito: out.length === 0 || fontesReais,
      detalhe: `${out.length} insight(s), fontes ok=${fontesReais}`,
    });
  } catch (err) {
    criterios.push({
      nome: "Todo insight cita a fonte REAL do movimento (mapeada)",
      feito: false,
      detalhe: (err as Error).message,
    });
  }

  return criterios;
}

async function main(): Promise<void> {
  console.log("\n=== Smoke F9 — Interno × Externo (o cruzamento honesto) ===\n");
  let tudoVerde = true;
  for (const c of await rodar()) {
    console.log(`${c.feito ? "✅" : "⬜"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
    if (!c.feito) tudoVerde = false;
  }
  console.log();
  if (tudoVerde) {
    console.log("F9 VERDE ✅ — o cruzamento acha ouro quando há dado interno e é honesto quando não há.");
    process.exit(0);
  }
  console.log("F9 ainda NÃO completa — critérios acima em branco.");
  process.exit(1);
}

main().catch((err) => {
  console.error("Smoke falhou com erro:", err);
  process.exit(1);
});
