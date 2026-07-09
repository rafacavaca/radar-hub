/**
 * Smoke C2/C4 — VAGAS + RELEASES/NOTÍCIAS alimentando o motor de movimento.
 * Lógica determinística (sem rede): diff de vagas (total varia + área nova) e de
 * news (item novo = movimento; item repetido = silêncio) + regras.
 *
 * Prova:
 *  1. 1ª coleta de vagas/news = primeira_coleta (baseline, não alerta).
 *  2. Total de vagas 5→12 = movimento; regra vagas_variacao (≥50%) dispara.
 *  3. Área nova contratando (janela: confirma em 2) = movimento de expansão.
 *  4. Release NOVO = movimento "novo"; regra release_novo dispara.
 *  5. Release REPETIDO na varredura seguinte = SILÊNCIO (não realerta).
 *
 * Uso: npm run smoke:vagas-news
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-vn-"));

const { diffSnapshots, avaliarRegras, REGRAS_PADRAO } = await import("@/lib/diagnostico/movimento");
const { campoNaoEncontrado, canalNaoLocalizado } = await import("@/lib/diagnostico/schema");

import type { BlocoNews, BlocoVagas, Snapshot } from "@/lib/diagnostico/schema";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke C2/C4 — Vagas + Releases ===\n");

function snap(data: string, vagas?: BlocoVagas, news?: BlocoNews): Snapshot {
  return {
    data,
    posicionamento: {
      tagline: campoNaoEncontrado(data), proposito: campoNaoEncontrado(data), posicionamento: campoNaoEncontrado(data),
      diferenciais: [], produtos: [], provas: { clientes_citados: [], depoimentos: campoNaoEncontrado(data), premiacoes: [], big_numbers: [] },
    },
    canais: {
      site: { presente: true, url: "https://x.com", frequencia: null, recencia: null, tipo_conteudo: null, engajamento: null, status: "encontrado" },
      linkedin: canalNaoLocalizado(), youtube: canalNaoLocalizado(), instagram: canalNaoLocalizado(), facebook: canalNaoLocalizado(), blog: canalNaoLocalizado(),
    },
    vagas, news,
  };
}
const vagas = (data: string, total: number, areas: string[]): BlocoVagas => ({ status: "encontrado", total, areas, exemplos: [], fonte_url: "https://x.com/careers", data_coleta: data });
const news = (data: string, titulos: string[]): BlocoNews => ({ status: "encontrado", itens: titulos.map((t) => ({ titulo: t, data_publicacao: null, fonte_url: "https://x.com/news", resumo: null })), fonte_url: "https://x.com/news", data_coleta: data });

const d1 = "2026-07-01T10:00:00.000Z", d2 = "2026-07-08T10:00:00.000Z", d3 = "2026-07-15T10:00:00.000Z";

// baseline
const s1 = snap(d1, vagas(d1, 5, ["Engenharia"]), news(d1, ["Release A"]));
// v2: total 5→12, área nova "Vendas" (aparece 1ª vez → pendente na janela), release novo "B"
const s2 = snap(d2, vagas(d2, 12, ["Engenharia", "Vendas"]), news(d2, ["Release A", "Release B"]));

const m2 = diffSnapshots([s1], s2, d2);
console.log("Movimentos v2:");
for (const m of m2) console.log(`  [${m.severidade}] ${m.campo_label} ${m.tipo}: ${m.de ?? "—"} → ${m.para ?? "—"}`);

const movTotal = m2.find((m) => m.campo === "vagas.total");
add("Total de vagas 5→12 = movimento (mudança, alta ≥50%)", movTotal?.tipo === "mudança" && movTotal.de === 5 && movTotal.para === 12 && movTotal.severidade === "alta", movTotal ? `${movTotal.de}→${movTotal.para}` : "NÃO");

const movReleaseB = m2.find((m) => m.campo === "news.item" && m.para === "Release B");
add("Release NOVO (B) = movimento 'novo' com fonte", movReleaseB?.tipo === "novo" && Boolean(movReleaseB.fonte_url_para), movReleaseB ? "ok" : "NÃO");
add("Release repetido (A) NÃO vira movimento", !m2.some((m) => m.campo === "news.item" && m.para === "Release A"), "A não realertou");

const disparos2 = avaliarRegras(REGRAS_PADRAO, m2, { clientName: "X", concorrenteId: "x", concorrenteNome: "X" });
add("Regras vagas_variacao + release_novo dispararam", ["vagas_variacao", "release_novo"].every((r) => disparos2.some((d) => d.regra === r)), disparos2.map((d) => d.regra).join(", ") || "nenhum");

// v3: "Vendas" confirma (janela) → área nova; release novo "C"; A/B repetem
const s3 = snap(d3, vagas(d3, 12, ["Engenharia", "Vendas"]), news(d3, ["Release A", "Release B", "Release C"]));
const m3 = diffSnapshots([s1, s2], s3, d3);
console.log("\nMovimentos v3:");
for (const m of m3) console.log(`  [${m.severidade}] ${m.campo_label} ${m.tipo}: ${m.de ?? "—"} → ${m.para ?? "—"}`);
const areaNova = m3.find((m) => m.campo === "vagas.areas" && m.para === "Vendas");
add("Área nova 'Vendas' confirmada em 2 varreduras = movimento (expansão)", areaNova?.tipo === "novo", areaNova ? "ok" : "NÃO");
add("Release C novo; A e B silenciam", m3.some((m) => m.para === "Release C") && !m3.some((m) => m.para === "Release A" || m.para === "Release B"), "só C");

// baseline: 1ª coleta não alerta
const primeira = diffSnapshots([], s1, d1);
add("1ª varredura de todas = zero movimentos (baseline)", primeira.length === 0, `${primeira.length}`);

// ── Resultado ────────────────────────────────────────────────────────────────
console.log("\n── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nC2/C4 VERDE ✅ — vagas e releases alimentam o motor de movimento, honesto.\n" : "\nC2/C4 VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
