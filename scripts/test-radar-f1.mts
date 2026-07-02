/**
 * Smoke test do F1 do Radar Hub — o "juiz" do loop mínimo.
 *
 * Roda o loop ponta-a-ponta contra 1 cliente real (Moovefy) + 1 concorrente
 * (RD Station) e confirma que saiu >=1 item de briefing bem-formado, com o
 * "por que importa" ancorado no Brain do cliente.
 *
 * Uso:  npm run smoke   (== tsx scripts/test-radar-f1.mts)
 *
 * ESTADO ATUAL: o loop F1 ainda NÃO está implementado. Este script reporta os
 * critérios de aceite como PENDENTES e sai com código 1 (vermelho honesto).
 * À medida que cada etapa do loop for construída, troque o `feito: false` pela
 * checagem real. Quando os 5 critérios ficarem verdes, o F1 está provado.
 */

import { config } from "dotenv";
import { collectRDStation } from "@/lib/collectors/rdstation";
import { analyze } from "@/lib/analyst";
import { MOOVEFY } from "@/lib/clients/moovefy";
import type { RawEvent } from "@/lib/types";

config({ path: ".env.local" });

const CLIENTE = "Moovefy";
const CONCORRENTE = "RD Station";

/** Formato do item de inteligência que o F1 precisa produzir. */
export type ItemDeInteligencia = {
  sinal: string; // o que aconteceu (o movimento do concorrente)
  porQueImporta: string; // por que importa PRA ESTE cliente — ancorado no Brain
  acao: string; // ação recomendada
  fonte: string; // link da fonte do sinal
  score: number; // score de impacto (0-100)
  brainRefs?: string[]; // ids/trechos do Brain que ancoraram o raciocínio
};

/** Valida que um item tem todos os campos que o F1 exige. */
export function itemValido(item: Partial<ItemDeInteligencia> | null | undefined): boolean {
  if (!item) return false;
  return (
    typeof item.sinal === "string" && item.sinal.trim().length > 0 &&
    typeof item.porQueImporta === "string" && item.porQueImporta.trim().length > 0 &&
    typeof item.acao === "string" && item.acao.trim().length > 0 &&
    typeof item.fonte === "string" && item.fonte.trim().length > 0 &&
    typeof item.score === "number" && Number.isFinite(item.score)
  );
}

type Criterio = { nome: string; feito: boolean; detalhe?: string };

async function rodarLoopF1(): Promise<Criterio[]> {
  const criterios: Criterio[] = [];
  // coletado uma vez no critério 1 e REUSADO no critério 3 (sem coletar duas vezes).
  let eventos: RawEvent[] = [];

  // 1) Coletar >=1 movimento real do concorrente.
  //    Usa o cache do Firecrawl -> reexecuções no mesmo dia custam 0 créditos.
  try {
    eventos = await collectRDStation({ limit: 5 });
    const comTitulo = eventos.filter((e) => e.title?.trim()).length;
    criterios.push({
      nome: `Coletar >=1 movimento real de ${CONCORRENTE}`,
      feito: comTitulo >= 1,
      detalhe: eventos.length
        ? `${eventos.length} coletado(s); ex.: "${eventos[0].title.slice(0, 60)}"`
        : "nenhum evento coletado",
    });
  } catch (err) {
    criterios.push({
      nome: `Coletar >=1 movimento real de ${CONCORRENTE}`,
      feito: false,
      detalhe: `coleta falhou: ${(err as Error).message}`,
    });
  }

  // 2) Ler o Brain do cliente. Por ora é a FIXTURE de teste (substituto provisório
  //    do Brain real do Formare, até a "porta estreita" de leitura existir).
  const temBrain =
    typeof MOOVEFY.brainContext === "string" && MOOVEFY.brainContext.trim().length > 0;
  criterios.push({
    nome: `Ler o Brain de ${CLIENTE} (via porta estreita de leitura)`,
    feito: temBrain,
    detalhe: temBrain
      ? `fixture de teste (${MOOVEFY.brainContext.length} chars) — substituto provisório do Brain real`
      : "brainContext vazio",
  });

  // 3) Analista gera item bem-formado, ancorado no Brain, a partir dos eventos já coletados.
  try {
    const itens = await analyze(eventos, MOOVEFY.clientName, MOOVEFY.brainContext);
    const bons = itens.filter(
      (it) =>
        it.sinal.trim().length > 0 &&
        it.porQueImporta.trim().length > 0 &&
        it.acao.trim().length > 0 &&
        typeof it.score === "number",
    );
    criterios.push({
      nome: "Analista gera item {sinal, por que importa (ancorado), ação, fonte, score}",
      feito: bons.length >= 1,
      detalhe: bons.length
        ? `${bons.length} item(ns); ex.: "${bons[0].sinal.slice(0, 70)}" (score ${bons[0].score})`
        : "nenhum item bem-formado gerado",
    });
  } catch (err) {
    criterios.push({
      nome: "Analista gera item {sinal, por que importa (ancorado), ação, fonte, score}",
      feito: false,
      detalhe: `análise falhou: ${(err as Error).message}`,
    });
  }

  // 4-5) ainda pendentes — próximos passos do F1.
  criterios.push({ nome: "Item aparece no briefing + feed", feito: false, detalhe: "não implementado ainda" });
  criterios.push({ nome: "Botão dispara uma demanda no Formare", feito: false, detalhe: "não implementado ainda" });

  return criterios;
}

async function main(): Promise<void> {
  console.log(`\n=== Smoke F1 — ${CLIENTE} x ${CONCORRENTE} ===\n`);
  const criterios = await rodarLoopF1();
  let tudoVerde = true;
  for (const c of criterios) {
    console.log(`${c.feito ? "✅" : "⬜"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
    if (!c.feito) tudoVerde = false;
  }
  console.log();
  if (tudoVerde) {
    console.log("F1 VERDE ✅ — o loop mínimo funciona ponta-a-ponta.");
    process.exit(0);
  }
  console.log("F1 ainda NÃO completo (esperado nesta fase). Vermelho honesto até o loop existir.");
  process.exit(1);
}

main().catch((err) => {
  console.error("Smoke falhou com erro:", err);
  process.exit(1);
});
