/**
 * Smoke F1c — REVIEWS/REPUTAÇÃO. Duas metades:
 *
 * AO VIVO (cobertura real): RD Station (presença pública de reviews no BR) →
 *   imprime POR FONTE o que foi alcançável (Reclame Aqui / G2 / Capterra /
 *   Google) e o bloco real: nota (fato, escala da fonte) + nº + temas
 *   (derivados, SÓ com citação de evidência). Fonte bloqueada = nao_coletado
 *   com o porquê — nunca nota inventada, nunca fingir cobertura.
 *
 * SEMEADO (motor determinístico): nota RA 7.8 → 6.9 = movimento "mudança" +
 *   disparo nota_caiu (queda 0.9 ≥ limiar 0.5); nota que SOBE não dispara.
 *
 * Uso: npm run smoke:reputacao
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-reput-"));

const { runLenteReputacao } = await import("@/lib/diagnostico/lente-reputacao");
const { aplicarMovimentos, disparosDaVarredura } = await import("@/lib/diagnostico/run");
const { saveDiagnostico } = await import("@/lib/diagnostico/store");
const { appendDisparos, getRegras, listDisparos } = await import("@/lib/diagnostico/alertas-store");
// espelha o runDiagnostico: diff puro + alertas avaliados fora e anexados.
const aplica = (d: DiagnosticoConcorrente): DiagnosticoConcorrente => {
  const out = aplicarMovimentos(d);
  appendDisparos(disparosDaVarredura(out, getRegras(out.clientName)));
  return out;
};
const { campoFato, campoNaoEncontrado, canalNaoLocalizado, reviewNaoColetado } = await import("@/lib/diagnostico/schema");

import type { BlocoReputacao, DiagnosticoConcorrente, ReviewFonte } from "@/lib/diagnostico/schema";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke F1c — Reviews/Reputação ===\n");

// ── 1. AO VIVO: RD Station ───────────────────────────────────────────────────
const rep = await runLenteReputacao("RD Station", "https://www.rdstation.com/");
console.log("COBERTURA REAL (RD Station):");
for (const f of rep.fontes) {
  if (f.status === "coletado") {
    console.log(`  ✔ ${f.fonte}: nota=${f.nota ?? "—"} (${f.escala ?? "?"}) · ${f.n_avaliacoes ?? "?"} avaliações · ${f.fonte_url}`);
    if (f.temas_elogio.length) console.log(`     elogios: ${f.temas_elogio.join(" · ")}`);
    if (f.temas_reclamacao.length) console.log(`     reclamações: ${f.temas_reclamacao.join(" · ")}`);
    for (const c of f.citacoes.slice(0, 2)) console.log(`     “${c.slice(0, 110)}”`);
  } else {
    console.log(`  ✖ ${f.fonte}: não coletado — ${f.observacao}`);
  }
}

const coletadas = rep.fontes.filter((f) => f.status === "coletado");
add(
  "≥1 fonte alcançada com nota/nº + fonte_url + data (fato citável)",
  coletadas.length >= 1 && coletadas.every((f) => (f.nota !== null || f.n_avaliacoes !== null || f.citacoes.length > 0) && Boolean(f.fonte_url && f.data_coleta)),
  `coletadas=${coletadas.map((f) => f.fonte).join(", ") || "nenhuma"}`,
);
add(
  "Fonte inalcançável = nao_coletado COM o porquê (não finge cobertura)",
  rep.fontes.filter((f) => f.status === "nao_coletado").every((f) => Boolean(f.observacao)),
  `nao_coletadas=${rep.fontes.filter((f) => f.status === "nao_coletado").map((f) => f.fonte).join(", ") || "nenhuma"}`,
);
add(
  "Temas SÓ com citação de evidência (derivado com lastro, nunca solto)",
  rep.fontes.every((f) => (f.temas_elogio.length + f.temas_reclamacao.length === 0) || f.citacoes.length > 0),
  "invariante estrutural da lente",
);
add(
  "Nota sempre na escala da fonte (0-10 RA / 0-5 demais), nunca inventada",
  coletadas.every((f) => f.nota === null || (f.nota >= 0 && f.nota <= (f.escala === "0-10" ? 10 : 5))),
  coletadas.map((f) => `${f.fonte}=${f.nota ?? "—"}`).join(" · ") || "—",
);

// ── 2. SEMEADO: nota cai → alerta; nota sobe → sem alerta ───────────────────
function varredura(data: string, ra: ReviewFonte): DiagnosticoConcorrente {
  const reputacao: BlocoReputacao = { fontes: [ra, reviewNaoColetado("google", data), reviewNaoColetado("g2", data), reviewNaoColetado("capterra", data)], data_coleta: data };
  return {
    clientName: "Moovefy",
    concorrente_id: "ploomes",
    concorrente_nome: "Ploomes",
    site_url: "https://www.ploomes.com",
    atualizado_em: data,
    paginas_rastreadas: [],
    posicionamento: {
      tagline: campoFato("CRM", "https://www.ploomes.com", data),
      proposito: campoNaoEncontrado(data),
      posicionamento: campoNaoEncontrado(data),
      diferenciais: [],
      produtos: [],
      provas: { clientes_citados: [], depoimentos: campoNaoEncontrado(data), premiacoes: [], big_numbers: [] },
    },
    canais: {
      site: { presente: true, url: "https://www.ploomes.com", frequencia: null, recencia: null, tipo_conteudo: null, engajamento: null, status: "encontrado" },
      linkedin: canalNaoLocalizado(), youtube: canalNaoLocalizado(), instagram: canalNaoLocalizado(), facebook: canalNaoLocalizado(), blog: canalNaoLocalizado(),
    },
    reputacao,
  };
}
const ra = (data: string, nota: number): ReviewFonte => ({
  fonte: "reclame_aqui",
  status: "coletado",
  nota,
  escala: "0-10",
  n_avaliacoes: 320,
  temas_elogio: [],
  temas_reclamacao: [],
  citacoes: ["exemplo de review"],
  fonte_url: "https://www.reclameaqui.com.br/empresa/ploomes/",
  data_coleta: data,
});

saveDiagnostico(aplica(varredura("2026-07-01T10:00:00.000Z", ra("2026-07-01T10:00:00.000Z", 7.8))));
const q2 = aplica(varredura("2026-07-08T10:00:00.000Z", ra("2026-07-08T10:00:00.000Z", 6.9)));
saveDiagnostico(q2);
const movNota = (q2.movimentos ?? []).find((m) => m.campo === "reputacao.reclame_aqui.nota");
console.log(`\n· Semeado: ${movNota ? `${movNota.campo_label}: ${movNota.de} → ${movNota.para} [${movNota.severidade}]` : "NÃO DETECTADO"}`);
add(
  "Nota 7.8 → 6.9 = movimento 'mudança' com 2 fontes/datas",
  movNota?.tipo === "mudança" && movNota.de === 7.8 && movNota.para === 6.9 && Boolean(movNota.fonte_url_de && movNota.fonte_url_para),
  movNota ? `${movNota.de} → ${movNota.para}` : "NÃO DETECTADO",
);
add(
  "Regra nota_caiu (queda 0.9 ≥ limiar 0.5) disparou",
  listDisparos("Moovefy").some((d) => d.regra === "nota_caiu"),
  listDisparos("Moovefy").map((d) => d.regra).join(", ") || "nenhum",
);

const q3 = aplica(varredura("2026-07-15T10:00:00.000Z", ra("2026-07-15T10:00:00.000Z", 7.4)));
saveDiagnostico(q3);
const disparosSubida = listDisparos("Moovefy").filter((d) => d.regra === "nota_caiu");
add(
  "Nota que SOBE (6.9 → 7.4) = movimento baixa, SEM alerta",
  disparosSubida.length === 1 && (q3.movimentos ?? []).some((m) => m.campo === "reputacao.reclame_aqui.nota" && m.para === 7.4 && m.severidade === "baixa"),
  `disparos nota_caiu=${disparosSubida.length} (só o da queda)`,
);

// ── Resultado ────────────────────────────────────────────────────────────────
console.log("\n── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nF1c VERDE ✅ — reputação honesta (fato com fonte; derivado com evidência; bloqueio declarado).\n" : "\nF1c VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
