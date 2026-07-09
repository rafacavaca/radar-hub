/**
 * DEMO REAL — breakdown de custo do cliente Moovefy (checkpoint do item 1).
 * Roda contra o gateway/Firecrawl DE VERDADE (usa data/ real), gera
 * usage_events e imprime o breakdown por feature/entidade/provider.
 *
 * Faz duas coisas reais e honestas:
 *  1) reavalia a maturidade (lente_4) dos concorrentes salvos da Moovefy — 1
 *     chamada LLM por concorrente, SEM re-scrape (barato), atribuída a cada
 *     entidade → prova "custo por concorrente";
 *  2) um briefing PARCIAL da Moovefy (coleta em cache + lentes) → prova a
 *     feature "briefing" e "coleta".
 *
 * Uso: npm run demo:custo   (== tsx scripts/demo-custo-moovefy.mts)
 */

import { config } from "dotenv";

import type { Bucket } from "@/lib/usage/aggregate";

config({ path: ".env.local" });

const CLIENTE = "Moovefy";

async function main(): Promise<void> {
  const { reavaliarMaturidadeCliente } = await import("@/lib/diagnostico/run");
  const { runRadarPartial } = await import("@/lib/loop");
  const { flushUsage, readUsageEvents } = await import("@/lib/usage/store");
  const agg = await import("@/lib/usage/aggregate");

  console.log(`\n=== DEMO custo — ${CLIENTE} (chamadas reais) ===\n`);

  // 1) maturidade real (lente_4) por concorrente — sem re-scrape.
  console.log("→ reavaliando maturidade dos concorrentes (lente_4, real)…");
  try {
    const r = await reavaliarMaturidadeCliente(CLIENTE);
    console.log(`  ok: ${r.map((x) => `${x.nome} ${x.score ?? "—"}`).join(" · ")}`);
  } catch (e) {
    console.warn(`  (maturidade falhou: ${(e as Error).message})`);
  }

  // 2) briefing parcial real (coleta do dia em cache + lentes).
  console.log("→ rodando briefing parcial da Moovefy (lentes, real)…");
  try {
    const { summary } = await runRadarPartial({ clientName: CLIENTE });
    console.log(`  ok: ${summary.eventos} evento(s), ${summary.leituras} leitura(s), ${summary.falhas.length} falha(s)`);
  } catch (e) {
    console.warn(`  (briefing falhou: ${(e as Error).message})`);
  }

  await flushUsage();

  // ── BREAKDOWN ──
  const eventos = readUsageEvents({ clientName: CLIENTE });
  const t = agg.totais(eventos);
  console.log(`\n──────── BREAKDOWN REAL · ${CLIENTE} ────────`);
  console.log(`Total estimado: ${agg.fmtUSD(t.custo)}  ·  ${t.chamadas} chamada(s)  ·  in ${t.tokensIn} / out ${t.tokensOut} tokens  ·  ${t.unidades} página(s) de coleta`);
  if (t.custoProvedor > 0) console.log(`Cross-check do provedor (SDK): ${agg.fmtUSD(t.custoProvedor)}`);

  const linha = (b: Bucket) => `  ${b.rotulo.padEnd(28)} ${agg.fmtUSD(b.custo).padStart(9)}  ${String(b.chamadas).padStart(3)} ch${b.tokensIn + b.tokensOut > 0 ? ` · ${b.tokensIn + b.tokensOut} tok` : b.unidades ? ` · ${b.unidades} un` : ""}`;

  console.log("\nPor feature:");
  agg.porFeature(eventos).forEach((b) => console.log(linha(b)));
  console.log("\nPor concorrente/conta (o custo marginal):");
  const ent = agg.porEntidade(eventos);
  ent.length ? ent.forEach((b) => console.log(linha(b))) : console.log("  (sem entidade atribuída)");
  console.log("\nPor provider (Claude × DeepSeek × Firecrawl):");
  agg.porProvider(eventos).forEach((b) => console.log(linha(b)));
  console.log("\nPor modelo:");
  agg.porModelo(eventos).forEach((b) => console.log(linha(b)));

  const marg = agg.custoMarginalEntidade(eventos);
  console.log(`\nCusto marginal médio por entidade monitorada: ${agg.fmtUSD(marg.custoMedioPorEntidade)}  (${marg.entidades} entidade(s))`);
  console.log("\n(estimativa por tabela — não é fatura; Claude por subscrição = equivalente-API)\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
