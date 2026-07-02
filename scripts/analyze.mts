/**
 * Runner de análise — coleta os movimentos do concorrente e roda o Analista
 * sobre eles ancorado no contexto da Moovefy, imprimindo cada item de
 * inteligência gerado.
 *
 * Uso:  npm run analyze   (== tsx scripts/analyze.mts)
 *
 * IMPORTANTE: scripts tsx avulsos NÃO carregam .env.local sozinhos. Por isso
 * carregamos via dotenv logo no topo, ANTES de qualquer módulo ler as chaves
 * (Firecrawl para coletar, gateway Claude para raciocinar).
 */

import { config } from "dotenv";

config({ path: ".env.local" });

async function main(): Promise<void> {
  // import dinâmico: garante que o .env já foi carregado antes de os módulos
  // do coletor e do analista serem avaliados.
  const { collectRDStation } = await import("@/lib/collectors/rdstation");
  const { analyze } = await import("@/lib/analyst");
  const { MOOVEFY } = await import("@/lib/clients/moovefy");

  const events = await collectRDStation({ limit: 5 });
  console.log(`\nColetados ${events.length} movimento(s). Analisando para ${MOOVEFY.clientName}...\n`);

  const items = await analyze(events, MOOVEFY.clientName, MOOVEFY.brainContext);

  console.log(`=== Inteligência — ${items.length} item(ns) para ${MOOVEFY.clientName} ===\n`);
  for (const [index, item] of items.entries()) {
    console.log(`${index + 1}. [score ${item.score}] ${item.sinal}`);
    console.log(`   por que importa: ${item.porQueImporta}`);
    console.log(`   ação:            ${item.acao}`);
    console.log(`   fonte:           ${item.fonte.titulo}`);
    console.log(`                    ${item.fonte.url}`);
    console.log();
  }

  if (items.length === 0) {
    console.error("Nenhum item de inteligência gerado — verifique o gateway / o contexto do cliente.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Análise falhou:", err instanceof Error ? err.message : err);
  process.exit(1);
});
