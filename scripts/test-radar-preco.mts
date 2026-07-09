/**
 * Smoke F1b — PREÇO/PLANOS. Duas metades:
 *
 * AO VIVO (cobertura real):
 *   1. RD Station (preço público em R$) → bloco "encontrado" com planos+valores
 *      LITERAIS + fonte/data. Imprime COMO a página foi descoberta (link da home).
 *   2. Intelia (B2B enterprise, sem página de preço) → "nao_encontrado"/"sob_consulta"
 *      — NUNCA um preço inventado.
 *
 * SEMEADO (motor determinístico, data dir isolado):
 *   3. Preço R$ 50 → R$ 79 no MESMO plano = movimento "mudança" alta + disparo
 *      preco_mudou. 4. Falha de coleta de um lado = SILÊNCIO (não vira "removeu preço").
 *
 * Uso: npm run smoke:preco
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-preco-"));

const { runLentePreco, pickPricingLink } = await import("@/lib/diagnostico/lente-preco");
const { aplicarMovimentos, disparosDaVarredura } = await import("@/lib/diagnostico/run");
const { saveDiagnostico } = await import("@/lib/diagnostico/store");
const { appendDisparos, getRegras, listDisparos } = await import("@/lib/diagnostico/alertas-store");
// espelha o runDiagnostico: diff puro + alertas avaliados fora e anexados.
const aplica = (d: DiagnosticoConcorrente): DiagnosticoConcorrente => {
  const out = aplicarMovimentos(d);
  appendDisparos(disparosDaVarredura(out, getRegras(out.clientName)));
  return out;
};
const { campoFato, campoNaoEncontrado, canalNaoLocalizado, precoNaoEncontrado } = await import("@/lib/diagnostico/schema");
const { scrape } = await import("@/lib/firecrawl");

import type { BlocoPreco, DiagnosticoConcorrente } from "@/lib/diagnostico/schema";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke F1b — Preço/Planos ===\n");

// ── 1. AO VIVO: RD Station (preço público) ───────────────────────────────────
const RD = "https://www.rdstation.com/";
const homeMd = (await scrape(RD, { onlyMainContent: false })).markdown;
const linkDescoberto = pickPricingLink(homeMd, RD);
console.log(`· Descoberta (RD Station): link de preço na home → ${linkDescoberto ?? "NENHUM"}`);

const rd = await runLentePreco("RD Station", RD);
console.log(`· RD Station: status=${rd.status} · planos=${rd.planos.length}`);
for (const p of rd.planos) console.log(`   - ${p.plano}: ${p.preco ?? "sob consulta"}${p.periodicidade ? ` (${p.periodicidade})` : ""}${p.features.length ? ` · ${p.features.slice(0, 2).join("; ")}` : ""}`);
if (rd.resumo) console.log(`   resumo: ${rd.resumo}`);
console.log(`   fonte: ${rd.fonte_url ?? "—"}`);

add(
  "RD Station: preço público estruturado (≥1 plano com valor literal) + fonte/data",
  rd.status === "encontrado" && rd.planos.some((p) => p.preco && /\d/.test(p.preco)) && Boolean(rd.fonte_url && rd.data_coleta),
  `status=${rd.status} · planos com valor=${rd.planos.filter((p) => p.preco).length}`,
);

// ── 2. AO VIVO: Intelia (sem preço público) ─────────────────────────────────
const intelia = await runLentePreco("Intelia", "https://intelia.com");
console.log(`\n· Intelia: status=${intelia.status} · planos=${intelia.planos.length}${intelia.resumo ? ` · ${intelia.resumo}` : ""}`);
add(
  "Intelia: sem preço público = sob_consulta/nao_encontrado (NUNCA inventado)",
  (intelia.status === "nao_encontrado" || intelia.status === "sob_consulta") && !intelia.planos.some((p) => p.preco),
  `status=${intelia.status}`,
);

// ── 3-4. SEMEADO: diff de preço ──────────────────────────────────────────────
function varredura(data: string, preco: BlocoPreco): DiagnosticoConcorrente {
  return {
    clientName: "Moovefy",
    concorrente_id: "rush",
    concorrente_nome: "Rush",
    site_url: "https://rushcrm.com.br",
    atualizado_em: data,
    paginas_rastreadas: [],
    posicionamento: {
      tagline: campoFato("CRM simples", "https://rushcrm.com.br", data),
      proposito: campoNaoEncontrado(data),
      posicionamento: campoNaoEncontrado(data),
      diferenciais: [],
      produtos: [],
      provas: { clientes_citados: [], depoimentos: campoNaoEncontrado(data), premiacoes: [], big_numbers: [] },
    },
    canais: {
      site: { presente: true, url: "https://rushcrm.com.br", frequencia: null, recencia: null, tipo_conteudo: null, engajamento: null, status: "encontrado" },
      linkedin: canalNaoLocalizado(), youtube: canalNaoLocalizado(), instagram: canalNaoLocalizado(), facebook: canalNaoLocalizado(), blog: canalNaoLocalizado(),
    },
    preco,
  };
}
const bloco = (data: string, valor: string): BlocoPreco => ({
  status: "encontrado",
  planos: [{ plano: "Pro", preco: valor, periodicidade: "mensal", features: [], fonte_url: "https://rushcrm.com.br/precos", data_coleta: data }],
  resumo: null,
  fonte_url: "https://rushcrm.com.br/precos",
  data_coleta: data,
  tipo: "fato",
});

saveDiagnostico(aplica(varredura("2026-07-01T10:00:00.000Z", bloco("2026-07-01T10:00:00.000Z", "R$ 50/mês"))));
const s2 = aplica(varredura("2026-07-08T10:00:00.000Z", bloco("2026-07-08T10:00:00.000Z", "R$ 79/mês")));
saveDiagnostico(s2);
const movPreco = (s2.movimentos ?? []).find((m) => m.campo.startsWith("preco.plano"));
console.log(`\n· Semeado: ${movPreco ? `${movPreco.campo_label}: ${movPreco.de} → ${movPreco.para} [${movPreco.severidade}]` : "NÃO DETECTADO"}`);
add(
  "Mudança de preço no mesmo plano = movimento 'mudança' alta com 2 fontes/datas",
  movPreco?.tipo === "mudança" && movPreco.de === "R$ 50/mês" && movPreco.para === "R$ 79/mês" && movPreco.severidade === "alta" && Boolean(movPreco.fonte_url_de && movPreco.fonte_url_para),
  movPreco ? `${movPreco.de} → ${movPreco.para}` : "NÃO DETECTADO",
);
add(
  "Regra preco_mudou (padrão ON) disparou",
  listDisparos("Moovefy").some((d) => d.regra === "preco_mudou"),
  listDisparos("Moovefy").map((d) => d.regra).join(", ") || "nenhum",
);

// falha de coleta de um lado = silêncio
const s3 = aplica(varredura("2026-07-15T10:00:00.000Z", { ...precoNaoEncontrado("2026-07-15T10:00:00.000Z"), resumo: "página de preço inacessível nesta varredura" }));
saveDiagnostico(s3);
const movFalha = (s3.movimentos ?? []).filter((m) => m.data_deteccao === "2026-07-15T10:00:00.000Z" && m.campo.startsWith("preco"));
add(
  "Falha de coleta NÃO vira 'removeu preço' (diff só entre lados lidos)",
  movFalha.length === 0,
  `movimentos de preço na falha=${movFalha.length}`,
);

// ── Resultado ────────────────────────────────────────────────────────────────
console.log("\n── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nF1b VERDE ✅ — preço honesto (literal com fonte; oculto=sob consulta; falha≠remoção).\n" : "\nF1b VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
