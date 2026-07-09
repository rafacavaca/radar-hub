/**
 * Smoke Onda 3 · F — Relatório "o que mudou". Determinístico: monta os gráficos
 * do digest a partir de diagnósticos sintéticos com movimentos datados.
 *
 * Prova:
 *  1. Janela respeitada: movimento fora dos N dias NÃO entra.
 *  2. primeira_coleta NÃO conta como "mudança".
 *  3. Charts (por concorrente + por tipo) refletem só os movimentos da janela.
 *  4. Zero movimento na janela → total=0 (o compositor dirá isso honestamente).
 *  5. Export do relatório de movimentos válido (PDF %PDF).
 *
 * Uso: npm run smoke:mov-report
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const { buildMovimentosCharts } = await import("@/lib/diagnostico/report-charts");
const { reportToPdf } = await import("@/lib/reports-export");
import type { DiagnosticoConcorrente, Movimento } from "@/lib/diagnostico/schema";
import type { Report } from "@/lib/reports";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke F (Onda 3) — Relatório 'o que mudou' ===\n");

const AGORA = "2026-07-09T12:00:00.000Z";
const mov = (label: string, tipo: Movimento["tipo"], data: string): Movimento => ({
  campo: label, campo_label: label, de: "x", para: "y", tipo, data_deteccao: data, severidade: "média", fonte_url_para: "https://x.com",
});
function diag(id: string, nome: string, movs: Movimento[]): DiagnosticoConcorrente {
  return {
    clientName: "TAGAT Foodtech", concorrente_id: id, concorrente_nome: nome, site_url: "https://x.com", atualizado_em: AGORA,
    paginas_rastreadas: [], posicionamento: { tagline: { valor: null, data_coleta: AGORA, tipo: "fato", status: "nao_encontrado" }, proposito: { valor: null, data_coleta: AGORA, tipo: "fato", status: "nao_encontrado" }, posicionamento: { valor: null, data_coleta: AGORA, tipo: "fato", status: "nao_encontrado" }, diferenciais: [], produtos: [], provas: { clientes_citados: [], depoimentos: { valor: null, data_coleta: AGORA, tipo: "fato", status: "nao_encontrado" }, premiacoes: [], big_numbers: [] } },
    canais: { site: { presente: true, url: "https://x.com", frequencia: null, recencia: null, tipo_conteudo: null, engajamento: null, status: "encontrado" }, linkedin: { presente: false, url: null, frequencia: null, recencia: null, tipo_conteudo: null, engajamento: null, status: "nao_localizado" }, youtube: { presente: false, url: null, frequencia: null, recencia: null, tipo_conteudo: null, engajamento: null, status: "nao_localizado" }, instagram: { presente: false, url: null, frequencia: null, recencia: null, tipo_conteudo: null, engajamento: null, status: "nao_localizado" }, facebook: { presente: false, url: null, frequencia: null, recencia: null, tipo_conteudo: null, engajamento: null, status: "nao_localizado" }, blog: { presente: false, url: null, frequencia: null, recencia: null, tipo_conteudo: null, engajamento: null, status: "nao_localizado" } },
    movimentos: movs,
  };
}

const diags = [
  diag("a", "Alfa", [
    mov("Tagline", "mudança", "2026-07-05T00:00:00.000Z"), // dentro de 30d
    mov("Preço", "mudança", "2026-04-01T00:00:00.000Z"), // fora de 30d, dentro de 90/180
    mov("Produto", "primeira_coleta", "2026-07-06T00:00:00.000Z"), // não conta
  ]),
  diag("b", "Beta", [mov("Release/notícia", "novo", "2026-07-08T00:00:00.000Z")]),
];

// janela 30 dias
const r30 = buildMovimentosCharts(diags, 30, AGORA);
console.log(`30 dias: total=${r30.total} · charts=${r30.charts.map((c) => c.tipo).join(",")}`);
for (const c of r30.porConcorrente) console.log(`  ${c.nome}: ${c.movs.map((m) => `${m.label}[${m.tipo}]`).join(", ")}`);
add("Janela 30d: só 2 movimentos (tagline Alfa + release Beta); preço antigo e primeira_coleta FORA", r30.total === 2, `total=${r30.total}`);
add("primeira_coleta não conta como mudança", !r30.porConcorrente.some((c) => c.movs.some((m) => m.tipo === "primeira_coleta")), "ok");

// janela 180 dias → o preço de abril entra
const r180 = buildMovimentosCharts(diags, 180, AGORA);
add("Janela 180d: 3 movimentos (o preço de abril entra)", r180.total === 3, `total=${r180.total}`);
add("Chart 'por concorrente' presente quando há movimento", r180.charts.some((c) => c.tipo === "barras"), r180.charts.map((c) => c.tipo).join(","));

// zero movimento
const semMov = [diag("c", "Gama", [mov("Tagline", "mudança", "2020-01-01T00:00:00.000Z")])];
const r0 = buildMovimentosCharts(semMov, 30, AGORA);
add("Zero movimento na janela → total=0, sem charts (compositor dirá honesto)", r0.total === 0 && r0.charts.length === 0, `total=${r0.total} charts=${r0.charts.length}`);

// export
const report: Report = { id: "smoke", clientName: "TAGAT Foodtech", kind: "movimentos", titulo: "O que mudou — TAGAT", corpo: "# O que mudou\n\nDigest de teste.", fontes: [], charts: r180.charts, createdAt: AGORA };
const pdf = await reportToPdf(report);
add("PDF do relatório de movimentos válido (%PDF)", Buffer.from(pdf.slice(0, 5)).toString("latin1").startsWith("%PDF"), `${(pdf.length / 1024).toFixed(1)} KB`);

console.log("\n── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nF (o que mudou) VERDE ✅ — janela respeitada, esparsidade honesta, export ok.\n" : "\nF VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
