/**
 * 0a — VARREDURA AGENDADA do diagnóstico. Faz a F1a (movimento + alerta) viver
 * sozinha: uma vez por semana, re-roda o diagnóstico de cada concorrente JÁ
 * DIAGNOSTICADO — o que gera snapshot → diff → movimentos → alertas sem clique.
 *
 * Reusa a infra de agendamento (mesmo timer horário radar-schedules; helpers de
 * fuso/dia de `schedules.ts`). Config POR CLIENTE (não por concorrente
 * individual — o cliente escolhe o dia; a varredura cobre todos os concorrentes
 * dele que já têm ficha). Default: LIGADO, segunda-feira.
 *
 * HONESTIDADE / não-surpresa:
 * - Só re-varre quem JÁ TEM diagnóstico (o usuário escolheu diagnosticar) e
 *   ainda é concorrente com site. NUNCA cria diagnóstico novo sozinho.
 * - Idempotente: no máximo 1x por dia local (Brasil), como os relatórios.
 * - Uma falha isolada num concorrente não derruba os outros.
 *
 * Store: data/diagnostico-schedule.json (escrita atômica, RADAR_DATA_DIR p/ teste).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { listDiagnosticos } from "@/lib/diagnostico/store";
import { runDiagnostico as runDiagnosticoReal } from "@/lib/diagnostico/run";
import { localDayKey, localWeekday } from "@/lib/schedules";
import { pillarOf, readWatchlist } from "@/lib/watchlist";
import type { DiagnosticoConcorrente } from "@/lib/diagnostico/schema";

/** Config de varredura de UM cliente. Ausente ⇒ DEFAULT (ligado, segunda). */
export type DiagScheduleClient = {
  enabled: boolean;
  /** 0=domingo … 6=sábado. */
  weekday: number;
  lastRunDay?: string;
  lastRunAt?: string;
};

export const DIAG_SCHEDULE_DEFAULT: DiagScheduleClient = { enabled: true, weekday: 1 };

type DiagScheduleFile = { clients: Record<string, DiagScheduleClient> };

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function filePath(): string {
  return join(dataDir(), "diagnostico-schedule.json");
}

function readFileSafe(): DiagScheduleFile {
  const path = filePath();
  if (!existsSync(path)) return { clients: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as DiagScheduleFile;
    if (parsed && parsed.clients && typeof parsed.clients === "object") return parsed;
    return { clients: {} };
  } catch {
    return { clients: {} };
  }
}

function writeFileSafe(file: DiagScheduleFile): void {
  mkdirSync(dataDir(), { recursive: true });
  const path = filePath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2), "utf8");
  renameSync(tmp, path);
}

/** Config do cliente, com o default aplicado (nunca null). */
export function getDiagSchedule(clientName: string): DiagScheduleClient {
  const saved = readFileSafe().clients[clientName];
  return saved ? { ...DIAG_SCHEDULE_DEFAULT, ...saved } : { ...DIAG_SCHEDULE_DEFAULT };
}

export function setDiagSchedule(clientName: string, input: { enabled: boolean; weekday: number }): DiagScheduleClient {
  const weekday = Number.isInteger(input.weekday) && input.weekday >= 0 && input.weekday <= 6 ? input.weekday : 1;
  const file = readFileSafe();
  const atual = file.clients[clientName] ?? {};
  file.clients[clientName] = { ...DIAG_SCHEDULE_DEFAULT, ...atual, enabled: input.enabled === true, weekday };
  writeFileSafe(file);
  return getDiagSchedule(clientName);
}

/** A varredura do cliente está VENCIDA agora? (ligada, no dia certo, ainda não hoje) */
export function isDiagDue(clientName: string, now: Date): boolean {
  const cfg = getDiagSchedule(clientName);
  if (!cfg.enabled) return false;
  if (cfg.lastRunDay === localDayKey(now)) return false;
  return localWeekday(now) === cfg.weekday;
}

function markRan(clientName: string, now: Date): void {
  const file = readFileSafe();
  const atual = file.clients[clientName] ?? { ...DIAG_SCHEDULE_DEFAULT };
  file.clients[clientName] = { ...DIAG_SCHEDULE_DEFAULT, ...atual, lastRunDay: localDayKey(now), lastRunAt: now.toISOString() };
  writeFileSafe(file);
}

/** Os concorrentes de um cliente que a varredura deve re-rodar (já com ficha + site + pilar). */
export function alvosDaVarredura(clientName: string): Array<{ competitorId: string; name: string; siteUrl: string }> {
  const client = readWatchlist().clients.find((c) => c.name === clientName);
  if (!client) return [];
  const comDiagnostico = new Set(listDiagnosticos(clientName).map((d) => d.concorrente_id));
  const alvos: Array<{ competitorId: string; name: string; siteUrl: string }> = [];
  for (const comp of client.competitors) {
    if (!comDiagnostico.has(comp.id)) continue; // nunca cria sozinho
    if (pillarOf(comp, client.mode) !== "concorrente") continue;
    if (!comp.enabled || !comp.siteUrl) continue;
    alvos.push({ competitorId: comp.id, name: comp.name, siteUrl: comp.siteUrl });
  }
  return alvos;
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
 * Roda as varreduras VENCIDAS. Sequencial de propósito (gentil com
 * gateway/Firecrawl). `runner` é injetável só p/ teste; em produção é o real.
 */
export async function runDueDiagnosticos(
  now: Date,
  opts: { runner?: Runner; clients?: string[] } = {},
): Promise<DiagScheduleRunResult> {
  const runner = opts.runner ?? runDiagnosticoReal;
  const nomes = opts.clients ?? readWatchlist().clients.map((c) => c.name);
  const result: DiagScheduleRunResult = {
    clientesRodados: 0,
    concorrentesVarridos: 0,
    comMovimento: 0,
    erros: [],
    detalhe: [],
  };

  for (const clientName of nomes) {
    if (!isDiagDue(clientName, now)) continue;
    const alvos = alvosDaVarredura(clientName);
    if (alvos.length === 0) {
      markRan(clientName, now); // marca mesmo sem alvo (não fica "vencido" o dia todo)
      continue;
    }
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
    markRan(clientName, now);
  }

  return result;
}
