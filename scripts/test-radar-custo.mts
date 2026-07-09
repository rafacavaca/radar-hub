/**
 * Smoke — MEDIÇÃO DE CUSTO (item 1). Determinístico e isolado (RADAR_DATA_DIR
 * temporário — não toca nos dados reais). Prova:
 *  1. atribuição pelo CONTEXTO ambiente (cliente/feature/entidade) via ALS;
 *  2. custo pela TABELA (LLM por tokens + coleta por página);
 *  3. coleta força feature "coleta" herdando cliente/entidade;
 *  4. provider derivado do modelo (Claude × DeepSeek no mix);
 *  5. agregações somam por cliente/feature/entidade + custo marginal;
 *  6. PRIVACIDADE — o evento gravado não carrega conteúdo de prompt;
 *  7. tabela configurável (opus ≠ sonnet; prefixo mais longo vence).
 *
 * Uso: npm run smoke:custo
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-custo-"));

const { runWithUsage } = await import("@/lib/usage/context");
const { recordLLMUsage, recordColetaUsage, readUsageEvents, flushUsage } = await import("@/lib/usage/store");
const { custoLLM, precoDoModelo } = await import("@/lib/usage/precos");
const agg = await import("@/lib/usage/aggregate");

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });
const perto = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;

console.log("\n=== Smoke — medição de custo (item 1) ===\n");

// ── Simula UM diagnóstico da Moovefy sobre 2 concorrentes + 1 briefing ──
// (é exatamente o que os wrappers gravam: recordLLMUsage / recordColetaUsage
//  dentro do contexto que os pontos de entrada estabelecem.)
await runWithUsage(
  { clientName: "Moovefy", feature: "diagnostico", entidadeTipo: "concorrente", entidadeId: "rd", entidadeNome: "RD Station" },
  async () => {
    await runWithUsage({ feature: "lente_1" }, async () => {
      recordLLMUsage({ modelo: "claude-sonnet-4-6", tokensIn: 12_000, tokensOut: 1_500 });
    });
    // coleta dentro de um contexto lente_1 → feature "coleta", entidade preservada
    await runWithUsage({ feature: "lente_1" }, async () => {
      recordColetaUsage({ unidades: 1, tipo: "pagina" });
      recordColetaUsage({ unidades: 1, tipo: "pagina" });
    });
    await runWithUsage({ feature: "lente_4" }, async () => {
      recordLLMUsage({ modelo: "claude-sonnet-4-6", tokensIn: 3_000, tokensOut: 800 });
    });
  },
);
await runWithUsage(
  { clientName: "Moovefy", feature: "diagnostico", entidadeTipo: "concorrente", entidadeId: "pl", entidadeNome: "Ploomes" },
  async () => {
    recordLLMUsage({ modelo: "claude-sonnet-4-6", tokensIn: 10_000, tokensOut: 1_200 });
    recordColetaUsage({ unidades: 1, tipo: "pagina" });
  },
);
// um briefing (loop) — provider DeepSeek pra provar o mix
await runWithUsage({ clientName: "Moovefy", feature: "briefing" }, async () => {
  recordLLMUsage({ modelo: "deepseek-chat", tokensIn: 8_000, tokensOut: 900 });
});
// um evento de OUTRO cliente — pra provar o filtro por cliente
await runWithUsage({ clientName: "TAGAT", feature: "briefing" }, async () => {
  recordLLMUsage({ modelo: "claude-sonnet-4-6", tokensIn: 5_000, tokensOut: 500 });
});

await flushUsage();

const todos = readUsageEvents();
const moovefy = readUsageEvents({ clientName: "Moovefy" });

// 1) atribuição
add("Gravou 8 eventos (5 LLM + 3 coleta)", todos.length === 8, `${todos.length} eventos`);
add("Filtro por cliente isola Moovefy (7 eventos, sem TAGAT)", moovefy.length === 7 && moovefy.every((e) => e.clientName === "Moovefy"), `${moovefy.length}`);

// 2) custo pela tabela (sonnet: $3/M in, $15/M out)
const lente1 = moovefy.find((e) => e.feature === "lente_1" && e.provider === "claude");
const custoLente1Esperado = (12_000 / 1e6) * 3 + (1_500 / 1e6) * 15; // 0.036 + 0.0225 = 0.0585
add("Custo LLM lente_1 = tabela (12k in + 1.5k out sonnet)", !!lente1 && perto(lente1.custoEstimado, custoLente1Esperado), `${lente1?.custoEstimado?.toFixed(4)} vs ${custoLente1Esperado.toFixed(4)}`);

// 3) coleta força feature "coleta", herda entidade RD Station, etapa reflete lente_1
const coletas = moovefy.filter((e) => e.feature === "coleta");
const coletaRD = coletas.find((e) => e.entidadeNome === "RD Station");
add("Coleta força feature 'coleta' (3 eventos)", coletas.length === 3, `${coletas.length}`);
add("Coleta herda entidade e marca etapa de origem", !!coletaRD && coletaRD.entidadeNome === "RD Station" && coletaRD.etapa === "lente_1", `etapa=${coletaRD?.etapa}`);

// 4) provider derivado — mix Claude × DeepSeek
const porProv = agg.porProvider(todos);
const claude = porProv.find((b) => b.chave === "claude");
const deepseek = porProv.find((b) => b.chave === "deepseek");
const firecrawl = porProv.find((b) => b.chave === "firecrawl");
add("Mix distingue claude, deepseek e firecrawl", !!claude && !!deepseek && !!firecrawl, porProv.map((b) => b.chave).join(", "));

// 5) agregações somam
const totalMoovefy = agg.totais(moovefy).custo;
const somaFeatures = agg.porFeature(moovefy).reduce((s, b) => s + b.custo, 0);
add("Soma por feature == total do cliente", perto(totalMoovefy, somaFeatures, 1e-9), `${totalMoovefy.toFixed(4)}`);
const marginal = agg.custoMarginalEntidade(moovefy);
add("Custo marginal: 2 concorrentes (RD, Ploomes) com média > 0", marginal.entidades === 2 && marginal.custoMedioPorEntidade > 0, `${marginal.entidades} ent · média ${agg.fmtUSD(marginal.custoMedioPorEntidade)}`);

// 6) PRIVACIDADE — nenhum campo carrega conteúdo de prompt/sinal
const chavesPermitidas = new Set(["ts", "orgId", "clientName", "feature", "etapa", "entidadeTipo", "entidadeId", "entidadeNome", "provider", "modelo", "tokensIn", "tokensOut", "cacheRead", "cacheWrite", "unidades", "custoEstimado", "custoProvedor", "latenciaMs", "estimativa"]);
const semVazamento = todos.every((e) => Object.keys(e).every((k) => chavesPermitidas.has(k)));
add("Privacidade: evento só tem metadados (sem prompt/conteúdo)", semVazamento, "só chaves conhecidas");

// 7) tabela configurável — opus ≠ sonnet; prefixo mais longo vence
const cOpus = custoLLM("claude-opus-4-8", { in: 1e6, out: 0 });
const cSonnet = custoLLM("claude-sonnet-4-6", { in: 1e6, out: 0 });
add("Opus mais caro que Sonnet no mesmo uso", cOpus > cSonnet, `opus $${cOpus} > sonnet $${cSonnet}`);
add("Modelo desconhecido cai no preço padrão (não zero)", custoLLM("modelo-x", { in: 1e6, out: 0 }) > 0, `$${custoLLM("modelo-x", { in: 1e6, out: 0 })}`);
add("Prefixo mais longo vence (claude-haiku ≠ genérico)", precoDoModelo("claude-haiku-4-5").input_usd_mtok === 1, `${precoDoModelo("claude-haiku-4-5").input_usd_mtok}`);

// ── impressão de um breakdown de exemplo (o que o painel mostra) ──
console.log("Breakdown de exemplo (cliente Moovefy):");
console.log("  por feature:");
for (const b of agg.porFeature(moovefy)) console.log(`    ${b.rotulo.padEnd(14)} ${agg.fmtUSD(b.custo).padStart(9)}  (${b.chamadas} chamada(s))`);
console.log("  por concorrente:");
for (const b of agg.porEntidade(moovefy)) console.log(`    ${b.rotulo.padEnd(24)} ${agg.fmtUSD(b.custo).padStart(9)}`);
console.log("  por provider:");
for (const b of agg.porProvider(moovefy)) console.log(`    ${b.rotulo.padEnd(12)} ${agg.fmtUSD(b.custo).padStart(9)}`);

console.log("\n── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nCusto VERDE ✅ — medição atribui, calcula e agrega honestamente.\n" : "\nCusto VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
