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

import { supabaseEnabled } from "@/lib/db/supabase";
import { sbGetDoc, sbSetDoc } from "@/lib/db/repo-org-docs";
import { listDiagnosticos, loadDiagnosticos } from "@/lib/diagnostico/store";
import { runDiagnostico as runDiagnosticoReal } from "@/lib/diagnostico/run";
import { localDayKey, localWeekday } from "@/lib/schedules";
import { pillarOf, readWatchlist, loadWatchlist, type Watchlist } from "@/lib/watchlist";
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

/** A config está VENCIDA agora? (ligada, no dia certo, ainda não hoje) — puro. */
function dueNow(cfg: DiagScheduleClient, now: Date): boolean {
  if (!cfg.enabled) return false;
  if (cfg.lastRunDay === localDayKey(now)) return false;
  return localWeekday(now) === cfg.weekday;
}

/** A varredura do cliente está VENCIDA agora? (JSON síncrono). */
export function isDiagDue(clientName: string, now: Date): boolean {
  return dueNow(getDiagSchedule(clientName), now);
}

function markRan(clientName: string, now: Date): void {
  const file = readFileSafe();
  const atual = file.clients[clientName] ?? { ...DIAG_SCHEDULE_DEFAULT };
  file.clients[clientName] = { ...DIAG_SCHEDULE_DEFAULT, ...atual, lastRunDay: localDayKey(now), lastRunAt: now.toISOString() };
  writeFileSafe(file);
}

/** Marca a varredura do cliente como rodada hoje, na org do contexto (ou JSON). */
async function persistDiagRan(clientName: string, cfg: DiagScheduleClient, now: Date): Promise<void> {
  if (!supabaseEnabled()) return markRan(clientName, now);
  await sbSetDoc(DOC_KIND, clientName, {
    ...DIAG_SCHEDULE_DEFAULT,
    ...cfg,
    lastRunDay: localDayKey(now),
    lastRunAt: now.toISOString(),
  });
}

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
 *
 * ORG-AWARE: config, alvos e a marca de "rodou hoje" vêm dos dispatchers — no
 * cron roda dentro de runAsOrgCollector (tudo da org do contexto).
 *
 * `ignorarAgenda`: quando o PAINEL de Automações já decidiu que hoje é dia
 * (cadência global), o cron passa `true` — a varredura roda pra todos os
 * clientes com ficha, sem depender do toggle por-cliente (que foi aposentado).
 */
export async function runDueDiagnosticos(
  now: Date,
  opts: { runner?: Runner; clients?: string[]; ignorarAgenda?: boolean } = {},
): Promise<DiagScheduleRunResult> {
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
    const cfg = await loadDiagSchedule(clientName);
    if (!opts.ignorarAgenda && !dueNow(cfg, now)) continue;
    const alvos = await loadAlvosDaVarredura(clientName);
    if (alvos.length === 0) {
      await persistDiagRan(clientName, cfg, now); // marca mesmo sem alvo (não fica "vencido" o dia todo)
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
    await persistDiagRan(clientName, cfg, now);
  }

  return result;
}

// ─── MULTI-TENANT (item 2): API org-scoped (Supabase/org_docs ou JSON). ──
// O timer (runDueDiagnosticos/isDiagDue/markRan) segue no JSON — vira por-org
// no rework do loop, junto com a coleta.

const DOC_KIND = "diag-schedule";

/** Config de varredura do cliente, na org da sessão (ou JSON). Nunca null. */
export async function loadDiagSchedule(clientName: string): Promise<DiagScheduleClient> {
  if (!supabaseEnabled()) return getDiagSchedule(clientName);
  const saved = await sbGetDoc<DiagScheduleClient | null>(DOC_KIND, clientName, null);
  return saved ? { ...DIAG_SCHEDULE_DEFAULT, ...saved } : { ...DIAG_SCHEDULE_DEFAULT };
}

/** Salva a config de varredura na org da sessão (ou JSON). */
export async function persistDiagSchedule(
  clientName: string,
  input: { enabled: boolean; weekday: number },
): Promise<DiagScheduleClient> {
  if (!supabaseEnabled()) return setDiagSchedule(clientName, input);
  const weekday = Number.isInteger(input.weekday) && input.weekday >= 0 && input.weekday <= 6 ? input.weekday : 1;
  const atual = await sbGetDoc<DiagScheduleClient | null>(DOC_KIND, clientName, null);
  const nova = { ...DIAG_SCHEDULE_DEFAULT, ...(atual ?? {}), enabled: input.enabled === true, weekday };
  await sbSetDoc(DOC_KIND, clientName, nova);
  return nova;
}

/** Alvos da varredura, org-scoped (watchlist + diagnósticos da org da sessão). */
export async function loadAlvosDaVarredura(
  clientName: string,
): Promise<Array<{ competitorId: string; name: string; siteUrl: string }>> {
  return alvosDe(await loadWatchlist(), clientName, await loadDiagnosticos(clientName));
}
