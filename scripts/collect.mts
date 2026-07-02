/**
 * Runner de coleta — dispara o coletor RD Station "na mão" (sem esperar cron)
 * e imprime cada movimento coletado.
 *
 * Uso:  npm run collect   (== tsx scripts/collect.mts)
 *
 * IMPORTANTE: scripts tsx avulsos NÃO carregam .env.local sozinhos. Por isso
 * carregamos via dotenv logo no topo, ANTES de qualquer coisa ler a chave.
 */

import { config } from "dotenv";

config({ path: ".env.local" });

async function main(): Promise<void> {
  // import dinâmico: garante que o .env já foi carregado antes de o módulo
  // do coletor (e do cliente Firecrawl) ser avaliado.
  const { collectRDStation } = await import("@/lib/collectors/rdstation");

  const events = await collectRDStation();

  console.log(`\n=== Coleta RD Station — ${events.length} movimento(s) ===\n`);
  for (const [index, event] of events.entries()) {
    console.log(`${index + 1}. ${event.title}`);
    console.log(`   url:       ${event.url}`);
    console.log(`   categoria: ${event.category ?? "(sem)"}`);
    console.log(`   excerpt:   ${event.excerpt?.length ?? 0} chars`);
    console.log();
  }

  if (events.length === 0) {
    console.error("Nenhum movimento coletado — verifique a listagem do blog / créditos Firecrawl.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Coleta falhou:", err instanceof Error ? err.message : err);
  process.exit(1);
});
