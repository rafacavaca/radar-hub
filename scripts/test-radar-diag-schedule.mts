/**
 * Smoke 0a — VARREDURA do diagnóstico. Testa a LÓGICA de execução com runner
 * INJETADO — zero rede/LLM. Data dir isolado. (O QUANDO é do painel de
 * Automações; aqui prova o QUE roda e como.)
 *
 * Prova:
 *  1. Alvos = SÓ concorrentes JÁ diagnosticados (com site + pilar concorrente) —
 *     NUNCA cria diagnóstico novo sozinho.
 *  2. runDueDiagnosticos re-roda cada alvo pelo runner, conta varridos + movimento.
 *  3. Erro isolado num concorrente não derruba os outros (vira linha em `erros`).
 *
 * Uso: npm run smoke:diag-schedule
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-diagsched-"));

const { runDueDiagnosticos, alvosDaVarredura } = await import("@/lib/diagnostico/schedule");
const { saveDiagnostico } = await import("@/lib/diagnostico/store");
const { readWatchlist } = await import("@/lib/watchlist");
const { campoFato, campoNaoEncontrado, canalNaoLocalizado } = await import("@/lib/diagnostico/schema");

import type { DiagnosticoConcorrente } from "@/lib/diagnostico/schema";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke 0a — Varredura do diagnóstico ===\n");

// ── escolhe um cliente REAL da watchlist com concorrentes ────────────────────
const wl = readWatchlist();
const cliente = wl.clients.find((c) => c.mode !== "carteira" && c.competitors.some((k) => k.siteUrl))?.name;
if (!cliente) {
  console.error("❌ sem cliente com concorrentes na watchlist — impossível testar seleção.");
  process.exit(1);
}
const comp = wl.clients.find((c) => c.name === cliente)!.competitors.find((k) => k.siteUrl)!;

const fichaMinima = (data: string): DiagnosticoConcorrente => ({
  clientName: cliente,
  concorrente_id: comp.id,
  concorrente_nome: comp.name,
  site_url: comp.siteUrl!,
  atualizado_em: data,
  paginas_rastreadas: [comp.siteUrl!],
  posicionamento: {
    tagline: campoFato("tag", comp.siteUrl!, data),
    proposito: campoNaoEncontrado(data),
    posicionamento: campoNaoEncontrado(data),
    diferenciais: [],
    produtos: [],
    provas: { clientes_citados: [], depoimentos: campoNaoEncontrado(data), premiacoes: [], big_numbers: [] },
  },
  canais: {
    site: { presente: true, url: comp.siteUrl!, frequencia: null, recencia: null, tipo_conteudo: null, engajamento: null, status: "encontrado" },
    linkedin: canalNaoLocalizado(), youtube: canalNaoLocalizado(), instagram: canalNaoLocalizado(), facebook: canalNaoLocalizado(), blog: canalNaoLocalizado(),
  },
});

const hoje = new Date("2026-07-08T13:00:00.000Z");

// ── 1. Antes de qualquer ficha: NADA a varrer (nunca cria sozinho) ───────────
add("Sem ficha ⇒ zero alvos (nunca cria diagnóstico sozinho)", alvosDaVarredura(cliente).length === 0);

// dá ficha a UM concorrente (pré-condição pra entrar na varredura)
saveDiagnostico(fichaMinima("2026-07-01T10:00:00.000Z"));
const alvos = alvosDaVarredura(cliente);
add("Alvos = só concorrentes JÁ diagnosticados (com site + pilar)", alvos.length === 1 && alvos[0].competitorId === comp.id, `alvos=${alvos.map((a) => a.competitorId).join(",")}`);

// ── 2. runDueDiagnosticos com runner injetado (conta chamadas + movimento) ────
const chamadas: string[] = [];
const runnerFake = async (input: { clientName: string; competitorId: string; name: string; siteUrl: string }) => {
  chamadas.push(input.competitorId);
  const d = fichaMinima("2026-07-08T13:00:00.000Z");
  d.movimentos = [{ campo: "posicionamento.tagline", campo_label: "Tagline", de: "tag", para: "novo", tipo: "mudança", data_deteccao: d.atualizado_em, severidade: "alta" }];
  saveDiagnostico(d);
  return d;
};

const r1 = await runDueDiagnosticos(hoje, { runner: runnerFake, clients: [cliente] });
console.log(`  execução: clientes=${r1.clientesRodados} concorrentes=${r1.concorrentesVarridos} com-movimento=${r1.comMovimento} (chamadas: ${chamadas.join(",")})`);
add("Re-varre o concorrente com ficha e conta o movimento", r1.concorrentesVarridos === 1 && r1.comMovimento === 1 && chamadas.length === 1, `varridos=${r1.concorrentesVarridos} mov=${r1.comMovimento}`);

// ── 3. Erro isolado: um concorrente que falha não derruba a varredura ─────────
const runnerQuebra = async () => { throw new Error("gateway fora do ar"); };
const rErro = await runDueDiagnosticos(hoje, { runner: runnerQuebra, clients: [cliente] });
add("Erro num concorrente vira linha em `erros` (não derruba)", rErro.erros.length === 1 && rErro.concorrentesVarridos === 0, `erros=${rErro.erros.length}`);

// ── Resultado ────────────────────────────────────────────────────────────────
console.log("\n── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\n0a VERDE ✅ — varredura só de quem tem ficha, executa e conta, erro isolado.\n" : "\n0a VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
