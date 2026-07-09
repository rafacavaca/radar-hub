/**
 * Smoke 0a — VARREDURA AGENDADA do diagnóstico. Testa a LÓGICA de agendamento
 * (config, vencimento, seleção de alvos, idempotência) com runner INJETADO —
 * zero rede/LLM. Data dir isolado.
 *
 * Prova:
 *  1. Default: ligado, segunda-feira (sem config salva).
 *  2. isDiagDue só no dia certo, ligado, e não-rodado-hoje.
 *  3. runDueDiagnosticos re-varre SÓ concorrentes com ficha (nunca cria) e marca
 *     rodado (idempotente: 2ª chamada no mesmo dia não re-roda).
 *  4. Cliente DESLIGADO é pulado.
 *  5. Movimento detectado pelo runner é contado (o que alimenta a timeline/alerta).
 *
 * Uso: npm run smoke:diag-schedule
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-diagsched-"));

const { getDiagSchedule, setDiagSchedule, isDiagDue, runDueDiagnosticos, alvosDaVarredura, DIAG_SCHEDULE_DEFAULT } =
  await import("@/lib/diagnostico/schedule");
const { localWeekday } = await import("@/lib/schedules");
const { saveDiagnostico } = await import("@/lib/diagnostico/store");
const { readWatchlist } = await import("@/lib/watchlist");
const { campoFato, campoNaoEncontrado, canalNaoLocalizado } = await import("@/lib/diagnostico/schema");

import type { DiagnosticoConcorrente } from "@/lib/diagnostico/schema";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke 0a — Varredura agendada ===\n");

// ── 1. Default ────────────────────────────────────────────────────────────────
const def = getDiagSchedule("Qualquer Cliente");
add("Default: ligado + segunda-feira (weekday 1)", def.enabled === true && def.weekday === 1, `enabled=${def.enabled} weekday=${def.weekday}`);
void DIAG_SCHEDULE_DEFAULT;

// ── escolhe um cliente REAL da watchlist com concorrentes ────────────────────
const wl = readWatchlist();
const cliente = wl.clients.find((c) => c.mode !== "carteira" && c.competitors.some((k) => k.siteUrl))?.name;
if (!cliente) {
  console.error("❌ sem cliente com concorrentes na watchlist — impossível testar seleção.");
  process.exit(1);
}
const comp = wl.clients.find((c) => c.name === cliente)!.competitors.find((k) => k.siteUrl)!;

// dá ficha a UM concorrente (pré-condição pra entrar na varredura)
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
saveDiagnostico(fichaMinima("2026-07-01T10:00:00.000Z"));

const alvos = alvosDaVarredura(cliente);
add("Alvos = só concorrentes JÁ diagnosticados (com site + pilar)", alvos.length === 1 && alvos[0].competitorId === comp.id, `alvos=${alvos.map((a) => a.competitorId).join(",")}`);

// ── 2. Vencimento: alinha o weekday da config ao dia de HOJE ──────────────────
const hoje = new Date("2026-07-08T13:00:00.000Z"); // qualquer instante
const hojeWeekday = localWeekday(hoje);
setDiagSchedule(cliente, { enabled: true, weekday: hojeWeekday });
add("isDiagDue = true quando ligado + dia certo + não rodou hoje", isDiagDue(cliente, hoje), `weekday hoje=${hojeWeekday}`);
setDiagSchedule(cliente, { enabled: true, weekday: (hojeWeekday + 1) % 7 });
add("isDiagDue = false em outro dia da semana", !isDiagDue(cliente, hoje), "weekday deslocado");

// ── 3. runDueDiagnosticos com runner injetado (conta chamadas + movimento) ────
setDiagSchedule(cliente, { enabled: true, weekday: hojeWeekday });
const chamadas: string[] = [];
const runnerFake = async (input: { clientName: string; competitorId: string; name: string; siteUrl: string }) => {
  chamadas.push(input.competitorId);
  const d = fichaMinima("2026-07-08T13:00:00.000Z");
  // simula 1 movimento detectado nesta varredura
  d.movimentos = [{ campo: "posicionamento.tagline", campo_label: "Tagline", de: "tag", para: "novo", tipo: "mudança", data_deteccao: d.atualizado_em, severidade: "alta" }];
  saveDiagnostico(d);
  return d;
};

const r1 = await runDueDiagnosticos(hoje, { runner: runnerFake, clients: [cliente] });
console.log(`  1ª execução: clientes=${r1.clientesRodados} concorrentes=${r1.concorrentesVarridos} com-movimento=${r1.comMovimento} (chamadas: ${chamadas.join(",")})`);
add("Re-varre o concorrente com ficha e conta o movimento", r1.concorrentesVarridos === 1 && r1.comMovimento === 1 && chamadas.length === 1, `varridos=${r1.concorrentesVarridos} mov=${r1.comMovimento}`);

const r2 = await runDueDiagnosticos(hoje, { runner: runnerFake, clients: [cliente] });
add("Idempotente: 2ª execução no mesmo dia NÃO re-roda", r2.concorrentesVarridos === 0 && chamadas.length === 1, `2ª varridos=${r2.concorrentesVarridos} · chamadas totais=${chamadas.length}`);

// ── 4. Cliente desligado é pulado ────────────────────────────────────────────
const outroDia = new Date("2026-07-15T13:00:00.000Z"); // 1 semana depois, mesmo weekday
setDiagSchedule(cliente, { enabled: false, weekday: hojeWeekday });
const r3 = await runDueDiagnosticos(outroDia, { runner: runnerFake, clients: [cliente] });
add("Cliente DESLIGADO é pulado (nada re-roda)", r3.concorrentesVarridos === 0, `varridos=${r3.concorrentesVarridos}`);

// ── Resultado ────────────────────────────────────────────────────────────────
console.log("\n── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\n0a VERDE ✅ — varredura semanal agendada (só quem tem ficha, idempotente, honesta).\n" : "\n0a VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
