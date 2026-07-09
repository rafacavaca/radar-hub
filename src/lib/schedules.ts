/**
 * RELATÓRIOS AGENDADOS (F10) — a 3ª forma dos Relatórios: o mesmo pedido em
 * linguagem natural vira RECORRENTE ("toda segunda, o relatório comercial dos
 * concorrentes").
 *
 * Como roda: um timer do sistema (systemd, de hora em hora) chama
 * `scripts/run-schedules.mts` -> `runDueSchedules(now)`, que descobre os
 * agendamentos VENCIDOS, garante que o material do dia existe (roda o loop, que
 * é cacheado), compõe cada relatório (reusa `composeReport`) e guarda como
 * relatório kind="agendado" (aparece na tela /relatorios).
 *
 * Fuso: a cadência é avaliada em HORÁRIO DE BRASÍLIA (o timer roda em UTC no
 * VPS). "Já rodou hoje?" usa a data local — cada agendamento roda no máximo 1x
 * por dia local.
 *
 * Store: data/schedules.json — mesmo padrão dos outros (escrita atômica, seed
 * implícito, RADAR_DATA_DIR pra teste). Nunca lança na leitura.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { supabaseEnabled } from "@/lib/db/supabase";
import { sbDeleteDoc, sbGetDoc, sbListDocs, sbSetDoc } from "@/lib/db/repo-org-docs";
import { composeReport, persistReport } from "@/lib/reports";
import { runRadarLoop } from "@/lib/loop";

const TZ = "America/Sao_Paulo";

/** Cadência: todo dia, ou um dia da semana (0=domingo … 6=sábado). */
export type Cadence = { kind: "daily" } | { kind: "weekly"; weekday: number };

export type Schedule = {
  id: string;
  clientName: string;
  /** o pedido em linguagem natural (igual ao compositor sob medida). */
  request: string;
  cadence: Cadence;
  enabled: boolean;
  /** dia local (YYYY-MM-DD, TZ Brasil) da última execução — trava o "1x/dia". */
  lastRunDay?: string;
  lastRunAt?: string;
  createdAt: string;
};

type SchedulesFile = { schedules: Schedule[] };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LABEL = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function schedulesPath(): string {
  return join(dataDir(), "schedules.json");
}

/** Dia local (YYYY-MM-DD) no fuso do Brasil. */
export function localDayKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Dia da semana local (0=domingo … 6=sábado) no fuso do Brasil. */
export function localWeekday(now: Date): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);
  return WEEKDAYS.indexOf(short);
}

function readFileSafe(): SchedulesFile {
  const path = schedulesPath();
  if (!existsSync(path)) return { schedules: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as SchedulesFile;
    if (parsed && Array.isArray(parsed.schedules)) return parsed;
    return { schedules: [] };
  } catch {
    return { schedules: [] };
  }
}

function writeFileSafe(file: SchedulesFile): void {
  mkdirSync(dataDir(), { recursive: true });
  const path = schedulesPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2), "utf8");
  renameSync(tmp, path);
}

/** Rótulo humano da cadência (ex.: "toda segunda", "todo dia"). */
export function cadenceLabel(cadence: Cadence): string {
  return cadence.kind === "daily" ? "todo dia" : `toda ${WEEKDAY_LABEL[cadence.weekday]}`;
}

export function listSchedules(): Schedule[] {
  return [...readFileSafe().schedules].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export type CreateScheduleInput = { clientName: string; request: string; cadence: Cadence };

/** Valida e monta um agendamento novo (puro). Lança Error pt-BR se inválido. */
function buildSchedule(input: CreateScheduleInput): Schedule {
  const clientName = (input.clientName ?? "").trim();
  const request = (input.request ?? "").trim();
  if (!clientName) throw new Error("Escolha o cliente do relatório.");
  if (request.length < 5) throw new Error("Descreva o que o relatório recorrente deve cobrir.");
  const c = input.cadence;
  if (!c || (c.kind !== "daily" && c.kind !== "weekly")) {
    throw new Error("Escolha a frequência (todo dia ou semanal).");
  }
  if (c.kind === "weekly" && !(Number.isInteger(c.weekday) && c.weekday >= 0 && c.weekday <= 6)) {
    throw new Error("Escolha o dia da semana.");
  }

  const id = createHash("sha1")
    .update(`${clientName}:${request}:${JSON.stringify(c)}:${Math.random()}`)
    .digest("hex")
    .slice(0, 16);

  return { id, clientName, request, cadence: c, enabled: true, createdAt: new Date().toISOString() };
}

/** Cria um agendamento. Lança Error pt-BR se inválido. */
export function createSchedule(input: CreateScheduleInput): Schedule {
  const schedule = buildSchedule(input);
  const file = readFileSafe();
  file.schedules.push(schedule);
  writeFileSafe(file);
  return schedule;
}

export function setScheduleEnabled(id: string, enabled: boolean): Schedule {
  const file = readFileSafe();
  const s = file.schedules.find((x) => x.id === id);
  if (!s) throw new Error("Agendamento não encontrado.");
  s.enabled = enabled;
  writeFileSafe(file);
  return s;
}

export function deleteSchedule(id: string): void {
  const file = readFileSafe();
  const before = file.schedules.length;
  file.schedules = file.schedules.filter((x) => x.id !== id);
  if (file.schedules.length === before) throw new Error("Agendamento não encontrado.");
  writeFileSafe(file);
}

// ─── MULTI-TENANT (item 2): API org-scoped (Supabase/org_docs ou JSON). ──
// Um doc por agendamento (kind `schedules`, key = id). A EXECUÇÃO
// (runDueSchedules, timer) segue no JSON — vira por-org no rework do loop.

const DOC_KIND = "schedules";

/** Agendamentos da org da sessão (ou JSON), mais antigos primeiro. */
export async function loadSchedules(): Promise<Schedule[]> {
  if (!supabaseEnabled()) return listSchedules();
  const docs = await sbListDocs<Schedule>(DOC_KIND);
  return docs
    .map((d) => d.data)
    .filter(Boolean)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Cria um agendamento na org da sessão (ou JSON). Lança pt-BR se inválido. */
export async function persistSchedule(input: CreateScheduleInput): Promise<Schedule> {
  if (!supabaseEnabled()) return createSchedule(input);
  const schedule = buildSchedule(input);
  await sbSetDoc(DOC_KIND, schedule.id, schedule);
  return schedule;
}

/** Liga/desliga um agendamento na org da sessão (ou JSON). */
export async function persistScheduleEnabled(id: string, enabled: boolean): Promise<Schedule> {
  if (!supabaseEnabled()) return setScheduleEnabled(id, enabled);
  const s = await sbGetDoc<Schedule | null>(DOC_KIND, id, null);
  if (!s) throw new Error("Agendamento não encontrado.");
  const novo = { ...s, enabled };
  await sbSetDoc(DOC_KIND, id, novo);
  return novo;
}

/** Apaga um agendamento na org da sessão (ou JSON). */
export async function removeSchedule(id: string): Promise<void> {
  if (!supabaseEnabled()) return deleteSchedule(id);
  const s = await sbGetDoc<Schedule | null>(DOC_KIND, id, null);
  if (!s) throw new Error("Agendamento não encontrado.");
  await sbDeleteDoc(DOC_KIND, id);
}

/** Um agendamento está VENCIDO agora? (habilitado, no dia certo, e ainda não rodou hoje) */
export function isDue(schedule: Schedule, now: Date): boolean {
  if (!schedule.enabled) return false;
  const day = localDayKey(now);
  if (schedule.lastRunDay === day) return false; // já rodou hoje (local)
  if (schedule.cadence.kind === "daily") return true;
  return localWeekday(now) === schedule.cadence.weekday;
}

/** Marca um agendamento como executado hoje (JSON). */
function markRan(id: string, now: Date): void {
  const file = readFileSafe();
  const s = file.schedules.find((x) => x.id === id);
  if (!s) return;
  s.lastRunDay = localDayKey(now);
  s.lastRunAt = now.toISOString();
  writeFileSafe(file);
}

/** Marca como executado hoje, na org do contexto (ou JSON). */
async function persistScheduleRan(schedule: Schedule, now: Date): Promise<void> {
  if (!supabaseEnabled()) return markRan(schedule.id, now);
  await sbSetDoc(DOC_KIND, schedule.id, {
    ...schedule,
    lastRunDay: localDayKey(now),
    lastRunAt: now.toISOString(),
  });
}

export type RunSchedulesResult = {
  ran: number;
  skipped: number;
  reports: Array<{ scheduleId: string; reportId: string; titulo: string }>;
  errors: Array<{ scheduleId: string; error: string }>;
};

/**
 * Roda os agendamentos VENCIDOS agora. Garante o material do dia (loop cacheado),
 * compõe cada relatório e o guarda (kind="agendado"). Marca cada um como rodado
 * pra não repetir no mesmo dia. Uma falha isolada não derruba os outros.
 *
 * ORG-AWARE: usa os dispatchers (loadSchedules/persistReport/persistScheduleRan);
 * no cron roda dentro de runAsOrgCollector — os agendamentos, o material do loop
 * e os relatórios são TODOS da org do contexto.
 */
export async function runDueSchedules(now: Date): Promise<RunSchedulesResult> {
  const all = await loadSchedules();
  const due = all.filter((s) => isDue(s, now));
  const result: RunSchedulesResult = {
    ran: 0,
    skipped: all.length - due.length,
    reports: [],
    errors: [],
  };
  if (due.length === 0) return result;

  // Garante que o material do dia existe (o loop é cacheado — só roda se preciso).
  try {
    await runRadarLoop();
  } catch (err) {
    console.warn(`[schedules] loop indisponível: ${(err as Error).message} — segue com o material recente.`);
  }

  for (const schedule of due) {
    try {
      const draft = await composeReport(schedule.clientName, schedule.request);
      const report = await persistReport({
        clientName: schedule.clientName,
        kind: "agendado",
        titulo: draft.titulo,
        corpo: draft.corpo,
        fontes: draft.fontes,
        origem: schedule.request,
      });
      await persistScheduleRan(schedule, now);
      result.ran++;
      result.reports.push({ scheduleId: schedule.id, reportId: report.id, titulo: report.titulo });
    } catch (err) {
      result.errors.push({ scheduleId: schedule.id, error: (err as Error).message });
      console.warn(`[schedules] ${schedule.id} falhou: ${(err as Error).message}`);
    }
  }
  return result;
}
