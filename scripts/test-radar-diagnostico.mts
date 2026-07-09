/**
 * Smoke do DIAGNÓSTICO DE CONCORRENTE (F1) — o juiz das Lentes 1-2.
 * Roda o diagnóstico real de UM concorrente (Intelia) e prova:
 *   1. Posicionamento preenchido (tagline/propósito/diferenciais/produtos) com
 *      fonte_url + data_coleta em cada campo achado.
 *   2. Ao menos um campo aparece como nao_encontrado (prova que não alucina).
 *   3. Toda recência de canal presente é data ABSOLUTA (não 1969).
 *
 * Custo: Firecrawl (scrape das páginas) + 1 LLM (extração). Data dir isolado.
 * Uso: npm run smoke:diagnostico
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-diag-"));

const { runDiagnostico } = await import("@/lib/diagnostico/run");
import type { Campo, CanalAudit } from "@/lib/diagnostico/schema";

const SITE = process.env.DIAG_SITE || "https://intelia.com";
const NAME = process.env.DIAG_NAME || "Intelia";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log(`\n=== Smoke Diagnóstico — ${NAME} (${SITE}) ===\n`);

const diag = await runDiagnostico({
  clientName: "TAGAT Foodtech",
  competitorId: "intelia",
  name: NAME,
  siteUrl: SITE,
});

// ── Imprime a FICHA real (o que a tela mostraria) ───────────────────────────
const p = diag.posicionamento;
const show = (label: string, c: Campo) =>
  console.log(`  ${label}: ${c.status === "encontrado" ? `${c.valor}   ⟵ ${c.fonte_url ?? "?"}` : "— (não encontrado)"}`);

console.log("PÁGINAS RASTREADAS:");
for (const u of diag.paginas_rastreadas) console.log(`  · ${u}`);
console.log("\n── POSICIONAMENTO ──");
show("Tagline", p.tagline);
show("Propósito", p.proposito);
show("Posicionamento", p.posicionamento);
console.log(`  Diferenciais (${p.diferenciais.length}): ${p.diferenciais.map((d) => d.valor).join(" · ") || "—"}`);
console.log(`  Produtos (${p.produtos.length}):`);
for (const pr of p.produtos) console.log(`    • ${pr.nome}: ${pr.descricao ?? "(sem descrição)"}`);
console.log(`  Provas — clientes citados (${p.provas.clientes_citados.length}): ${p.provas.clientes_citados.map((c) => c.valor).join(", ") || "—"}`);
show("  Depoimentos", p.provas.depoimentos);
console.log(`  Provas — premiações (${p.provas.premiacoes.length}): ${p.provas.premiacoes.map((c) => c.valor).join(", ") || "—"}`);
console.log(`  Provas — big numbers (${p.provas.big_numbers.length}): ${p.provas.big_numbers.map((c) => c.valor).join(", ") || "—"}`);

console.log("\n── CANAIS ──");
for (const [k, ch] of Object.entries(diag.canais) as [string, CanalAudit][]) {
  const rec = ch.recencia?.data_publicacao ? ` · último: ${ch.recencia.data_publicacao.slice(0, 10)}` : "";
  console.log(`  ${k}: ${ch.presente ? "presente" : "—"} ${ch.url ?? ""} [${ch.status}]${rec}`);
}

console.log("\n── MÍDIA PAGA (Lente 3, F2) ──");
for (const [plat, m] of Object.entries(diag.midia_paga ?? {})) {
  const est = m.status === "nao_localizado" ? "não localizado" : m.anuncia === false ? "não anuncia" : m.anuncia ? `anunciando (${m.n_anuncios_ativos ?? "?"})` : "—";
  console.log(`  ${plat}: ${est}`);
}
console.log("\n── MATURIDADE (Lente 4, F3 — opinião) ──");
console.log(
  diag.maturidade?.status === "avaliado"
    ? `  ${diag.maturidade.nivel} · ${diag.maturidade.score}/100 — ${diag.maturidade.evidencia}`
    : "  não avaliado",
);
console.log("\n── ESTRATÉGIA (F3 — rascunho) ──");
if (diag.estrategia?.status === "rascunhado") {
  console.log(`  Percepção atual: ${diag.estrategia.percepcao_atual ?? "—"}`);
  console.log(`  Caminhos: ${diag.estrategia.caminhos.join(" | ") || "—"}`);
  console.log(`  Recomendações: ${diag.estrategia.recomendacoes.join(" | ") || "—"}`);
} else {
  console.log("  não rascunhado");
}

// ── Critérios ────────────────────────────────────────────────────────────────
const todosCampos: Campo[] = [
  p.tagline, p.proposito, p.posicionamento, p.provas.depoimentos,
  ...p.diferenciais, ...p.provas.clientes_citados, ...p.provas.premiacoes, ...p.provas.big_numbers,
];
const achados = todosCampos.filter((c) => c.status === "encontrado");
const comFonteEData = achados.filter((c) => c.fonte_url && c.data_coleta);

add(
  "Posicionamento preenchido: ≥3 campos achados, cada um com fonte_url + data_coleta",
  achados.length >= 3 && comFonteEData.length === achados.length && (p.produtos.length > 0 || p.diferenciais.length > 0),
  `achados=${achados.length} (c/ fonte+data=${comFonteEData.length}) · produtos=${p.produtos.length} · diferenciais=${p.diferenciais.length}`,
);

const naoEncontrados = todosCampos.filter((c) => c.status === "nao_encontrado");
add(
  "≥1 campo nao_encontrado (não alucina o que não achou)",
  naoEncontrados.length >= 1,
  `nao_encontrados=${naoEncontrados.length}`,
);

const recencias = (Object.values(diag.canais) as CanalAudit[])
  .map((c) => c.recencia?.data_publicacao)
  .filter(Boolean) as string[];
const anoAtual = new Date().getUTCFullYear();
const recenciasAbsolutas = recencias.every((d) => {
  const y = new Date(d).getUTCFullYear();
  return y >= 2000 && y <= anoAtual;
});
add(
  "Toda recência de canal é data ABSOLUTA (nunca 1969)",
  recenciasAbsolutas,
  recencias.length ? recencias.map((d) => d.slice(0, 10)).join(", ") : "nenhum canal com recência (ok)",
);

add("Site rastreado (≥1 página)", diag.paginas_rastreadas.length >= 1, `${diag.paginas_rastreadas.length} página(s)`);

// F2/F3: os blocos existem e são honestos (mídia paga best-effort; maturidade=opinião).
add(
  "F2/F3: blocos midia_paga + maturidade(opinião) + estrategia(rascunho) presentes",
  Boolean(diag.midia_paga && diag.maturidade && diag.estrategia) &&
    diag.maturidade!.tipo === "opiniao",
  `maturidade=${diag.maturidade?.status} · estrategia=${diag.estrategia?.status} · midia=${diag.midia_paga?.meta.status}/${diag.midia_paga?.linkedin.status}`,
);

console.log("\n── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nDiagnóstico VERDE ✅ — fato com fonte+data, honesto no que falta.\n" : "\nDiagnóstico VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
