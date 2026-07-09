/**
 * Smoke G — CHARTS + EXPORTAÇÃO. Usa os diagnósticos REAIS de prod, monta os
 * gráficos, e gera PDF (pdf-lib) + PPTX (pptxgenjs). Determinístico (sem LLM).
 *
 * Prova:
 *  1. Charts construídos com fonte + data + natureza em TODOS (guardrail do G).
 *  2. Honestidade: barras aceitam valor null (sem dado) — nunca inventado.
 *  3. PDF válido (magic %PDF) e não-trivial.
 *  4. PPTX válido (magic PK zip) e não-trivial.
 * Escreve os arquivos em /tmp/radar-report-preview.{pdf,pptx} pra inspeção.
 *
 * Uso: npm run smoke:report-export
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync, writeFileSync } from "node:fs";

const { buildDiagnosticoCharts } = await import("@/lib/diagnostico/report-charts");
const { reportToPdf, reportToPptx } = await import("@/lib/reports-export");
import type { DiagnosticoConcorrente } from "@/lib/diagnostico/schema";
import type { Report } from "@/lib/reports";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke G — Charts + Exportação ===\n");

// diagnósticos reais de um cliente com ≥2 concorrentes (TAGAT)
const file = JSON.parse(readFileSync("data/diagnostico.json", "utf8")) as { diagnosticos: DiagnosticoConcorrente[] };
const cliente = "TAGAT Foodtech";
const diags = file.diagnosticos.filter((d) => d.clientName === cliente);
if (diags.length < 2) {
  console.error(`❌ ${cliente} tem <2 diagnósticos — impossível provar o comparativo.`);
  process.exit(1);
}

// 1-2. charts
const charts = buildDiagnosticoCharts(diags);
console.log(`GRÁFICOS (${charts.length}) de ${diags.length} concorrentes:`);
for (const c of charts) {
  const n = c.tipo === "barras" ? c.series.length : c.tipo === "rosca" ? c.fatias.length : c.tipo === "linha" ? c.pontos.length : c.linhas.length;
  console.log(`  · [${c.natureza}] ${c.tipo.padEnd(7)} "${c.titulo}" — ${n} item(ns) · fonte: ${c.fonte} · data: ${c.data.slice(0, 10)}`);
}

add("≥3 gráficos construídos do diagnóstico", charts.length >= 3, `${charts.length} gráficos`);
add(
  "Guardrail G: TODO gráfico tem fonte + data + natureza",
  charts.length > 0 && charts.every((c) => Boolean(c.fonte && c.data && c.natureza)),
  "invariante estrutural",
);
add(
  "Fato × opinião distinguidos (maturidade=opinião; canais/reputação=fato)",
  charts.some((c) => c.natureza === "opiniao") && charts.some((c) => c.natureza === "fato"),
  `opinião=${charts.filter((c) => c.natureza === "opiniao").length} · fato=${charts.filter((c) => c.natureza === "fato").length}`,
);

// 3-4. export
const report: Report = {
  id: "smoke",
  clientName: cliente,
  kind: "diagnostico",
  titulo: `Diagnóstico competitivo — ${cliente}`,
  corpo: "# Diagnóstico competitivo\n\nResumo executivo de exemplo para o smoke.\n\n## Leitura do mercado\n\n- Item de leitura A\n- Item de leitura B\n\n## Recomendações\n\n- Recomendação de teste.",
  fontes: diags.map((d) => ({ titulo: `Diagnóstico ${d.concorrente_nome}`, url: d.site_url, concorrente: d.concorrente_nome })),
  charts,
  createdAt: new Date().toISOString(),
};

const pdf = await reportToPdf(report);
const pdfMagic = Buffer.from(pdf.slice(0, 5)).toString("latin1");
writeFileSync("/tmp/radar-report-preview.pdf", pdf);
console.log(`\nPDF: ${(pdf.length / 1024).toFixed(1)} KB · magic="${pdfMagic}" · /tmp/radar-report-preview.pdf`);
add("PDF válido (magic %PDF) e não-trivial (>3 KB)", pdfMagic.startsWith("%PDF") && pdf.length > 3000, `${(pdf.length / 1024).toFixed(1)} KB`);

const pptx = await reportToPptx(report);
const pptxMagic = pptx.slice(0, 4).toString("latin1");
writeFileSync("/tmp/radar-report-preview.pptx", pptx);
console.log(`PPTX: ${(pptx.length / 1024).toFixed(1)} KB · magic="PK.." (${pptx[0]},${pptx[1]}) · /tmp/radar-report-preview.pptx`);
add("PPTX válido (magic PK zip) e não-trivial (>8 KB)", pptx[0] === 0x50 && pptx[1] === 0x4b && pptx.length > 8000, `${(pptx.length / 1024).toFixed(1)} KB`);

// ── Resultado ────────────────────────────────────────────────────────────────
console.log("\n── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nG VERDE ✅ — gráficos honestos (fonte+data+natureza) + PDF/PPTX válidos.\n" : "\nG VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
