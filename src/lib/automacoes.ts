/**
 * AUTOMAÇÕES (org-scoped) — o painel único onde o Rafael LIGA cada rotina e
 * escolhe a frequência/dia. Pedido dele: nada varre sozinho até ser ligado, e
 * um lugar claro pra controlar (no lugar dos toggles espalhados).
 *
 * DEFAULT: TUDO DESLIGADO. As duas rotinas que "varrem sozinhas" ficam aqui:
 *   - `digest`      → o resumo do dia (tela Hoje + e-mail), de manhã;
 *   - `diagnostico` → o reexame dos concorrentes (gera alertas de mudança).
 * (Relatórios agendados e dossiês de reunião seguem opt-in POR ITEM, nas telas
 *  Relatórios/Prospects — o painel só os aponta.)
 *
 * Store: org_docs (kind `automacoes`, key `config`) em modo Supabase, ou JSON
 * (data/automacoes.json) no clássico — mesmo padrão dos outros stores.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { sbGetDoc, sbSetDoc } from "@/lib/db/repo-org-docs";
import { supabaseEnabled } from "@/lib/db/supabase";
import { localDayKey, localWeekday } from "@/lib/schedules";

export type Cadencia = { tipo: "diaria" } | { tipo: "semanal"; weekday: number };

export type Automacao = {
  enabled: boolean;
  cadencia: Cadencia;
  /** dia local (YYYY-MM-DD, Brasil) da última execução — trava o "1x/dia". */
  lastRunDay?: string;
};

export type AutomacaoKind = "digest" | "diagnostico";

export type AutomacoesConfig = {
  digest: Automacao;
  diagnostico: Automacao;
};

/** Fábrica DESLIGADA (nada roda até ligar). */
export function automacoesOff(): AutomacoesConfig {
  return {
    digest: { enabled: false, cadencia: { tipo: "diaria" } },
    diagnostico: { enabled: false, cadencia: { tipo: "semanal", weekday: 1 } },
  };
}

const DOC_KIND = "automacoes";
const DOC_KEY = "config";

// ── JSON fallback (clássico/testes) ─────────────────────────────────────────

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function filePath(): string {
  return join(dataDir(), "automacoes.json");
}
function readJson(): AutomacoesConfig {
  const p = filePath();
  if (!existsSync(p)) return automacoesOff();
  try {
    return mesclar(JSON.parse(readFileSync(p, "utf8")) as Partial<AutomacoesConfig>);
  } catch {
    return automacoesOff();
  }
}
function writeJson(cfg: AutomacoesConfig): void {
  mkdirSync(dataDir(), { recursive: true });
  const p = filePath();
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(cfg, null, 2), "utf8");
  renameSync(tmp, p);
}

/** Mescla o salvo sobre o default OFF (campo novo de versão futura fica seguro). */
function mesclar(saved: Partial<AutomacoesConfig> | null): AutomacoesConfig {
  const base = automacoesOff();
  if (!saved) return base;
  return {
    digest: { ...base.digest, ...(saved.digest ?? {}) },
    diagnostico: { ...base.diagnostico, ...(saved.diagnostico ?? {}) },
  };
}

// ── API org-scoped ──────────────────────────────────────────────────────────

/** A config de automações da org (ou default OFF). Nunca lança. */
export async function loadAutomacoes(): Promise<AutomacoesConfig> {
  if (!supabaseEnabled()) return readJson();
  return mesclar(await sbGetDoc<Partial<AutomacoesConfig> | null>(DOC_KIND, DOC_KEY, null));
}

/** Salva a config inteira (sanitizada). */
export async function saveAutomacoes(cfg: AutomacoesConfig): Promise<AutomacoesConfig> {
  const sane = sanitizar(cfg);
  if (!supabaseEnabled()) writeJson(sane);
  else await sbSetDoc(DOC_KIND, DOC_KEY, sane);
  return sane;
}

/** Marca uma rotina como executada hoje (idempotência 1x/dia). */
export async function marcarRodou(kind: AutomacaoKind, now: Date): Promise<void> {
  const cfg = await loadAutomacoes();
  cfg[kind] = { ...cfg[kind], lastRunDay: localDayKey(now) };
  await saveAutomacoes(cfg);
}

// ── regras (puras — o smoke testa direto) ───────────────────────────────────

/** Cadência sanitizada (weekday 0-6; tipo válido). */
export function sanitizarCadencia(c: Cadencia | undefined): Cadencia {
  if (c?.tipo === "semanal") {
    const wd = Number.isInteger(c.weekday) && c.weekday >= 0 && c.weekday <= 6 ? c.weekday : 1;
    return { tipo: "semanal", weekday: wd };
  }
  return { tipo: "diaria" };
}

function sanitizar(cfg: AutomacoesConfig): AutomacoesConfig {
  const one = (a: Automacao, def: Automacao): Automacao => ({
    enabled: a?.enabled === true,
    cadencia: sanitizarCadencia(a?.cadencia),
    ...(a?.lastRunDay ? { lastRunDay: a.lastRunDay } : def.lastRunDay ? { lastRunDay: def.lastRunDay } : {}),
  });
  const base = automacoesOff();
  return { digest: one(cfg.digest, base.digest), diagnostico: one(cfg.diagnostico, base.diagnostico) };
}

/**
 * A rotina está DEVIDA agora? Ligada, ainda não rodou hoje (local Brasil) e no
 * dia certo da cadência. PURO — o chamador (cron) executa e marca.
 */
export function automacaoDevida(a: Automacao, now: Date): boolean {
  if (!a.enabled) return false;
  if (a.lastRunDay === localDayKey(now)) return false;
  if (a.cadencia.tipo === "diaria") return true;
  return localWeekday(now) === a.cadencia.weekday;
}

/** Rótulo humano da cadência (ex.: "todo dia", "toda segunda"). */
const WEEKDAY_LABEL = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export function cadenciaLabel(c: Cadencia): string {
  return c.tipo === "diaria" ? "todo dia" : `toda ${WEEKDAY_LABEL[c.weekday]}`;
}

/** Próxima execução legível (a partir de agora, fuso Brasil). */
export function proximaExecucao(a: Automacao, now: Date): string {
  if (!a.enabled) return "desligada";
  const hoje = localWeekday(now);
  if (a.cadencia.tipo === "diaria") {
    return a.lastRunDay === localDayKey(now) ? "amanhã de manhã" : "hoje de manhã";
  }
  const alvo = a.cadencia.weekday;
  const faltam = (alvo - hoje + 7) % 7;
  if (faltam === 0) return a.lastRunDay === localDayKey(now) ? `próxima ${WEEKDAY_LABEL[alvo]}` : "hoje de manhã";
  return faltam === 1 ? "amanhã de manhã" : `${WEEKDAY_LABEL[alvo]} de manhã`;
}
