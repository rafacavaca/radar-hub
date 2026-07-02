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
  // TODO(F1): substituir cada `feito: false` pela checagem real conforme o loop for construído.
  return [
    { nome: `Coletar >=1 movimento real de ${CONCORRENTE}`, feito: false, detalhe: "coletor ainda não implementado" },
    { nome: `Ler o Brain de ${CLIENTE} (via porta estreita de leitura)`, feito: false, detalhe: "leitura do Brain ainda não implementada" },
    { nome: "Analista gera >=1 item bem-formado {sinal, por que importa (ancorado), ação, fonte, score}", feito: false, detalhe: "analista ainda não implementado" },
    { nome: "Item aparece no briefing + feed", feito: false, detalhe: "entrega ainda não implementada" },
    { nome: "Botão dispara uma demanda no Formare", feito: false, detalhe: "ponte com o Formare ainda não implementada" },
  ];
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
