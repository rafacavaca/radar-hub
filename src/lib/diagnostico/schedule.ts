/**
 * VARREDURA do diagnóstico (F1a) — re-roda o diagnóstico de cada concorrente JÁ
 * DIAGNOSTICADO de um cliente, gerando snapshot → diff → movimentos → alertas
 * sem clique. NUNCA cria diagnóstico novo sozinho.
 *
 * QUANDO roda é decidido pelo painel de **Automações** (cadência global por org):
 * o cron (`scripts/run-schedules.mts`) só chama `runDueDiagnosticos` quando
 * `automacaoDevida(auto.diagnostico)` e marca `marcarRodou("diagnostico")` — a
 * idempotência (1x/dia) e o agendamento vivem lá. (O antigo toggle/agenda
 * POR-CLIENTE foi aposentado e removido.)
 *
 * Uma falha isolada num concorrente não derruba os outros.
 */

import { listDiagnosticos, loadDiagnosticos } from "@/lib/diagnostico/store";
import { runDiagnostico as runDiagnosticoReal } from "@/lib/diagnostico/run";
import { pillarOf, readWatchlist, loadWatchlist, type Watchlist } from "@/lib/watchlist";
import type { DiagnosticoConcorrente } from "@/lib/diagnostico/schema";

/** Os alvos da varredura dado o estado (puro — serve o caminho sync e o org-scoped). */
function alvosDe(
  watchlist: Watchlist,
  clientName: string,
  diagnosticos: DiagnosticoConcorrente[],
): Array<{ competitorId: string; name: string; siteUrl: string }> {
  const client = watchlist.clients.find((c) => c.name === clientName);
  if (!client) return [];
  const comDiagnostico = new Set(diagnosticos.map((d) => d.concorrente_id));
  const alvos: Array<{ competitorId: string; name: string; siteUrl: string }> = [];
  for (const comp of client.competitors) {
    if (!comDiagnostico.has(comp.id)) continue; // nunca cria sozinho
    if (pillarOf(comp, client.mode) !== "concorrente") continue;
    if (!comp.enabled || !comp.siteUrl) continue;
    alvos.push({ competitorId: comp.id, name: comp.name, siteUrl: comp.siteUrl });
  }
  return alvos;
}

/** Os concorrentes de um cliente que a varredura deve re-rodar (já com ficha + site + pilar). */
export function alvosDaVarredura(clientName: string): Array<{ competitorId: string; name: string; siteUrl: string }> {
  return alvosDe(readWatchlist(), clientName, listDiagnosticos(clientName));
}

/** Alvos da varredura, org-scoped (watchlist + diagnósticos da org da sessão). */
export async function loadAlvosDaVarredura(
  clientName: string,
): Promise<Array<{ competitorId: string; name: string; siteUrl: string }>> {
  return alvosDe(await loadWatchlist(), clientName, await loadDiagnosticos(clientName));
}

export type DiagScheduleRunResult = {
  clientesRodados: number;
  concorrentesVarridos: number;
  comMovimento: number;
  erros: Array<{ clientName: string; competitorId: string; error: string }>;
  detalhe: Array<{ clientName: string; competitorId: string; movimentosNovos: number }>;
};

type Runner = (input: { clientName: string; competitorId: string; name: string; siteUrl: string }) => Promise<DiagnosticoConcorrente>;

/**
 * Re-roda o diagnóstico de todos os concorrentes com ficha (dos clientes dados,
 * ou de todos). Sequencial de propósito (gentil com gateway/Firecrawl). O QUANDO
 * é do cron (Automações); aqui apenas EXECUTA. `runner` é injetável só p/ teste.
 *
 * ORG-AWARE: alvos vêm dos dispatchers — no cron roda dentro de runAsOrgCollector.
 */
export async function runDueDiagnosticos(
  now: Date,
  opts: { runner?: Runner; clients?: string[] } = {},
): Promise<DiagScheduleRunResult> {
  void now; // mantido na assinatura por compatibilidade com o chamador do cron
  const runner = opts.runner ?? runDiagnosticoReal;
  const nomes = opts.clients ?? (await loadWatchlist()).clients.map((c) => c.name);
  const result: DiagScheduleRunResult = {
    clientesRodados: 0,
    concorrentesVarridos: 0,
    comMovimento: 0,
    erros: [],
    detalhe: [],
  };

  for (const clientName of nomes) {
    const alvos = await loadAlvosDaVarredura(clientName);
    if (alvos.length === 0) continue;
    result.clientesRodados++;
    for (const alvo of alvos) {
      try {
        const diag = await runner({ clientName, ...alvo });
        const novos = (diag.movimentos ?? []).filter((m) => m.data_deteccao === diag.atualizado_em);
        result.concorrentesVarridos++;
        if (novos.length > 0) result.comMovimento++;
        result.detalhe.push({ clientName, competitorId: alvo.competitorId, movimentosNovos: novos.length });
      } catch (err) {
        result.erros.push({ clientName, competitorId: alvo.competitorId, error: (err as Error).message });
      }
    }
  }

  return result;
}
