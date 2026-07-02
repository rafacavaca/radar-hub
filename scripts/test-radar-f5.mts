/**
 * Smoke test da F5 — o "juiz" do PERGUNTE AO RADAR.
 *
 * Prova as duas virtudes que o Rafael exigiu — FONTES e HONESTIDADE:
 *   1. o material junta os itens recentes dos caches diários (sem coleta nova);
 *   2. pergunta COBERTA pelo material -> resposta com >=1 fonte REAL (mapeada
 *      de um item que existe — nunca inventada);
 *   3. pergunta FORA do material (concorrente que não vigiamos) -> resposta
 *      honesta, SEM fontes inventadas;
 *   4. resposta malformada do LLM nunca derruba (parsing defensivo — unit).
 *
 * Custo: 2 chamadas ao gateway (uma por pergunta). 0 créditos Firecrawl.
 * Uso: npm run smoke:f5
 */

import { config } from "dotenv";

config({ path: ".env.local" });

const { askRadar, collectRecentItems } = await import("@/lib/ask");

type Criterio = { nome: string; feito: boolean; detalhe?: string };

async function rodar(): Promise<Criterio[]> {
  const criterios: Criterio[] = [];

  // 1) Material existe (itens recentes dos caches do loop).
  const items = collectRecentItems();
  criterios.push({
    nome: "Material reúne itens recentes dos caches diários",
    feito: items.length >= 1,
    detalhe: `${items.length} item(ns); ex.: "${items[0]?.sinal.slice(0, 50) ?? "-"}"`,
  });
  if (items.length === 0) return criterios; // sem material não dá pra julgar o resto.

  // 2) Pergunta COBERTA -> cita fonte real.
  const concorrente = items[0].concorrente ?? "o concorrente";
  try {
    const resposta = await askRadar(
      `O que ${concorrente} fez recentemente que importa pra Moovefy?`,
    );
    const fontesReais = resposta.fontes.every((f) =>
      items.some((it) => it.fonte.url === f.url),
    );
    criterios.push({
      nome: "Pergunta coberta -> resposta com fonte REAL (mapeada do material)",
      feito: resposta.fontes.length >= 1 && fontesReais && resposta.resposta.length > 50,
      detalhe: `${resposta.fontes.length} fonte(s), todas do material=${fontesReais}`,
    });
  } catch (err) {
    criterios.push({
      nome: "Pergunta coberta -> resposta com fonte REAL (mapeada do material)",
      feito: false,
      detalhe: (err as Error).message,
    });
  }

  // 3) Pergunta FORA do material -> honesto, sem fontes inventadas.
  try {
    const resposta = await askRadar(
      "O que a Coca-Cola lançou de novo em refrigerantes este mês?",
    );
    const semFontes = resposta.fontes.length === 0;
    // honesto = nega ter o dado (frases variam) OU aponta a tela Vigiar.
    const nega =
      /não (vigi|monitor|coletou|coletamos|acompanh|tenho|temos|há|cobre|está sendo)|ainda não|fora do (escopo|que|material)|sem (dados|informaç)|nenhuma informaç/i.test(
        resposta.resposta,
      );
    const apontaVigiar = /vigiar/i.test(resposta.resposta);
    const admite = nega || apontaVigiar;
    criterios.push({
      nome: "Pergunta fora do material -> honesto (sem fontes inventadas)",
      feito: semFontes && admite,
      detalhe: `fontes=${resposta.fontes.length}, admite não saber=${admite}`,
    });
  } catch (err) {
    criterios.push({
      nome: "Pergunta fora do material -> honesto (sem fontes inventadas)",
      feito: false,
      detalhe: (err as Error).message,
    });
  }

  return criterios;
}

async function main(): Promise<void> {
  console.log("\n=== Smoke F5 — Pergunte ao Radar (fontes + honestidade) ===\n");
  let tudoVerde = true;
  for (const c of await rodar()) {
    console.log(`${c.feito ? "✅" : "⬜"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
    if (!c.feito) tudoVerde = false;
  }
  console.log();
  if (tudoVerde) {
    console.log("F5 VERDE ✅ — o Radar responde com fontes e admite o que não sabe.");
    process.exit(0);
  }
  console.log("F5 ainda NÃO completa — critérios acima em branco.");
  process.exit(1);
}

main().catch((err) => {
  console.error("Smoke falhou com erro:", err);
  process.exit(1);
});
