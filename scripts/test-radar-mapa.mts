/**
 * Smoke E1 — MAPA DE POSICIONAMENTO 2x2. Usa os diagnósticos REAIS de prod:
 * constrói o mapa e prova honestidade + exporta no PDF/PPTX (o mapa entra no
 * relatório). Determinístico (sem LLM).
 *
 * Prova:
 *  1. Mapa construído (≥2 pontos) com eixos rotulados + natureza=opinião + fonte/data.
 *  2. Cada ponto tem x (nº de produtos) e y (maturidade 0-100) REAIS — nada inventado.
 *  3. Concorrente sem maturidade avaliada NÃO é plotado (vai pra `ausentes`).
 *  4. O mapa entra em buildDiagnosticoCharts (aparece no relatório) e o PDF/PPTX
 *     com o mapa continuam válidos.
 *
 * Uso: npm run smoke:mapa
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync, writeFileSync } from "node:fs";

const { buildMapaPosicionamento, buildDiagnosticoCharts } = await import("@/lib/diagnostico/report-charts");
const { reportToPdf, reportToPptx } = await import("@/lib/reports-export");
import type { DiagnosticoConcorrente } from "@/lib/diagnostico/schema";
import type { Report } from "@/lib/reports";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke E1 — Mapa de posicionamento 2x2 ===\n");

const file = JSON.parse(readFileSync("data/diagnostico.json", "utf8")) as { diagnosticos: DiagnosticoConcorrente[] };
const diags = file.diagnosticos.filter((d) => d.clientName === "TAGAT Foodtech");
if (diags.length < 2) {
  console.error("❌ <2 diagnósticos TAGAT.");
  process.exit(1);
}

const mapa = buildMapaPosicionamento(diags);
if (!mapa) {
  console.error("❌ mapa nulo — <2 concorrentes com maturidade avaliada.");
  process.exit(1);
}

console.log(`MAPA: ${mapa.titulo}`);
console.log(`  X = ${mapa.eixoX.label} (${mapa.eixoX.min} → ${mapa.eixoX.max}, max ${mapa.eixoX.maxVal})`);
console.log(`  Y = ${mapa.eixoY.label} (${mapa.eixoY.min} → ${mapa.eixoY.max}, max ${mapa.eixoY.maxVal})`);
console.log(`  natureza: ${mapa.natureza} · fonte: ${mapa.fonte}`);
console.log("  PONTOS (posição real de cada concorrente):");
for (const p of mapa.pontos) console.log(`    · ${p.label.padEnd(10)} X=${p.x} (${p.notaX})  Y=${p.y} (${p.notaY})`);
if (mapa.ausentes?.length) console.log(`  FORA DO MAPA: ${mapa.ausentes.join(", ")}`);

add("Mapa com ≥2 pontos + eixos rotulados + natureza opinião + fonte/data", mapa.pontos.length >= 2 && Boolean(mapa.eixoX.label && mapa.eixoY.label && mapa.fonte && mapa.data) && mapa.natureza === "opiniao", `${mapa.pontos.length} pontos`);
add(
  "Cada ponto tem X (nº produtos) e Y (maturidade 0-100) reais",
  mapa.pontos.every((p) => Number.isFinite(p.x) && p.x >= 0 && Number.isFinite(p.y) && p.y >= 0 && p.y <= 100),
  "invariante",
);
add(
  "Só concorrentes com maturidade avaliada são plotados (resto em ausentes)",
  mapa.pontos.length === diags.filter((d) => d.maturidade?.status === "avaliado").length,
  `plotados=${mapa.pontos.length} · avaliados=${diags.filter((d) => d.maturidade?.status === "avaliado").length}`,
);

// mapa entra no relatório + export válido
const charts = buildDiagnosticoCharts(diags);
add("Mapa aparece em buildDiagnosticoCharts (vai pro relatório)", charts.some((c) => c.tipo === "dispersao"), `charts=${charts.map((c) => c.tipo).join(",")}`);

const report: Report = {
  id: "smoke", clientName: "TAGAT Foodtech", kind: "diagnostico",
  titulo: "Mapa — TAGAT", corpo: "# Mapa\n\nTeste do 2x2 no export.", fontes: [], charts, createdAt: new Date().toISOString(),
};
const pdf = await reportToPdf(report);
writeFileSync("/tmp/radar-mapa-preview.pdf", pdf);
add("PDF com o mapa válido (%PDF)", Buffer.from(pdf.slice(0, 5)).toString("latin1").startsWith("%PDF"), `${(pdf.length / 1024).toFixed(1)} KB → /tmp/radar-mapa-preview.pdf`);
const pptx = await reportToPptx(report);
writeFileSync("/tmp/radar-mapa-preview.pptx", pptx);
add("PPTX com o mapa válido (PK zip)", pptx[0] === 0x50 && pptx[1] === 0x4b, `${(pptx.length / 1024).toFixed(1)} KB → /tmp/radar-mapa-preview.pptx`);

console.log("\n── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nE1 VERDE ✅ — 2x2 honesto (posição real; opinião rotulada; ausentes declarados).\n" : "\nE1 VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
