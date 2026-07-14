/**
 * ROTAÇÃO DE CHAVES FIRECRAWL — o Rafael tem VÁRIAS contas (cada ~1000
 * consultas/mês, cada uma renova numa data própria). Este módulo usa as chaves
 * de forma ORGANIZADA: preenche uma até a cota, aí passa pra próxima; quando a
 * API recusa por cota (402/429), marca a chave esgotada e rotaciona na hora.
 * Cada chave reseta seu contador quando o dia de renovação dela passa.
 *
 * As CHAVES (segredo) vêm do .env.local (slots 1-3); a cota/renovação por chave
 * também (env), com defaults. O CONTADOR persiste em data/firecrawl-keys.json —
 * é estado de infra (global ao deploy, não é dado de org).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const QUOTA_PADRAO = 1000;

export type ChaveFirecrawl = {
  id: string; // hash estável do valor da chave (contador segue a chave, não o slot)
  slot: number;
  label: string;
  key: string;
  quota: number;
  /** dia do mês (1-31) em que a cota renova; ausente ⇒ reseta no dia 1 (conservador). */
  renovaDia?: number;
};

type EstadoChave = { usados: number; cicloDesde: string /* YYYY-MM-DD */ };
type EstadoFile = Record<string, EstadoChave>;

// ── chaves do env (slots) ───────────────────────────────────────────────────

function num(v: string | undefined): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Quantos slots o env pode ter. Adicionar um 4º basta o env — sem tocar código. */
const MAX_SLOTS = 8;

/**
 * Lê os slots do env. Slot 1 = FIRECRAWL_API_KEY (compat com o setup antigo),
 * slot N = FIRECRAWL_API_KEY_N. Cota/renovação por slot: FIRECRAWL_KEY{N}_QUOTA /
 * _RENOVA (defaults: 1000 / dia 1). Só entram os slots que TÊM chave no env.
 */
export function carregarChaves(): ChaveFirecrawl[] {
  const chaves: ChaveFirecrawl[] = [];
  for (let slot = 1; slot <= MAX_SLOTS; slot++) {
    const key = process.env[slot === 1 ? "FIRECRAWL_API_KEY" : `FIRECRAWL_API_KEY_${slot}`];
    if (!key) continue;
    const renova = num(process.env[`FIRECRAWL_KEY${slot}_RENOVA`]);
    chaves.push({
      id: "fc-" + createHash("sha1").update(key).digest("hex").slice(0, 8),
      slot,
      label: `chave ${slot}`,
      key,
      quota: num(process.env[`FIRECRAWL_KEY${slot}_QUOTA`]) ?? QUOTA_PADRAO,
      renovaDia: renova && renova >= 1 && renova <= 31 ? renova : undefined,
    });
  }
  return chaves;
}

// ── estado (contador persistido) ────────────────────────────────────────────

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function statePath(): string {
  return join(dataDir(), "firecrawl-keys.json");
}
function readState(): EstadoFile {
  const p = statePath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8")) as EstadoFile;
  } catch {
    return {};
  }
}
function writeState(s: EstadoFile): void {
  mkdirSync(dataDir(), { recursive: true });
  const p = statePath();
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2), "utf8");
  renameSync(tmp, p);
}

// ── ciclo de cota (reset por dia de renovação) ──────────────────────────────

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Início do ciclo ATUAL de uma chave (YYYY-MM-DD, UTC). */
export function inicioCicloAtual(now: Date, renovaDia?: number): string {
  if (!renovaDia) {
    return ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  }
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const diaHoje = now.getUTCDate();
  // mês de referência: este mês se já passou o dia de renovação, senão o anterior.
  const refMes = diaHoje >= renovaDia ? m : m - 1;
  const base = new Date(Date.UTC(y, refMes, 1));
  const ultimoDia = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  const dia = Math.min(renovaDia, ultimoDia); // renova 31 em fev → último dia
  return ymd(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), dia)));
}

/** Estado da chave com o ciclo aplicado (reseta usados se venceu). Puro. */
function estadoNoCiclo(estado: EstadoChave | undefined, chave: ChaveFirecrawl, now: Date): EstadoChave {
  const ciclo = inicioCicloAtual(now, chave.renovaDia);
  if (!estado || estado.cicloDesde < ciclo) return { usados: 0, cicloDesde: ciclo };
  return estado;
}

// ── seleção + contagem ──────────────────────────────────────────────────────

export type EscolhaChave = { chave: ChaveFirecrawl; restante: number } | null;

/**
 * A ordem de chaves a TENTAR agora: primeiro as com cota no ciclo atual (por
 * slot), depois as esgotadas (última tentativa — a API é o juiz final). Vazio
 * se não há chave configurada.
 */
export function ordemDeTentativa(now: Date = new Date()): ChaveFirecrawl[] {
  const chaves = carregarChaves();
  const estado = readState();
  const comCota: ChaveFirecrawl[] = [];
  const esgotadas: ChaveFirecrawl[] = [];
  for (const c of chaves) {
    const e = estadoNoCiclo(estado[c.id], c, now);
    (e.usados < c.quota ? comCota : esgotadas).push(c);
  }
  return [...comCota, ...esgotadas];
}

/** Registra +1 uso bem-sucedido na chave (persiste, aplicando o ciclo). */
export function registrarUso(chaveId: string, now: Date = new Date()): void {
  const chave = carregarChaves().find((c) => c.id === chaveId);
  if (!chave) return;
  const s = readState();
  const e = estadoNoCiclo(s[chaveId], chave, now);
  s[chaveId] = { usados: e.usados + 1, cicloDesde: e.cicloDesde };
  writeState(s);
}

/** Marca a chave como ESGOTADA no ciclo (a API recusou por cota). */
export function marcarEsgotada(chaveId: string, now: Date = new Date()): void {
  const chave = carregarChaves().find((c) => c.id === chaveId);
  if (!chave) return;
  const s = readState();
  const e = estadoNoCiclo(s[chaveId], chave, now);
  s[chaveId] = { usados: Math.max(e.usados, chave.quota), cicloDesde: e.cicloDesde };
  writeState(s);
}

// ── status (para o painel) ──────────────────────────────────────────────────

export type StatusChave = { label: string; slot: number; usados: number; quota: number; restante: number; renovaDia?: number; proximaRenovacao: string; esgotada: boolean };

export function statusChaves(now: Date = new Date()): StatusChave[] {
  const chaves = carregarChaves();
  const estado = readState();
  return chaves.map((c) => {
    const e = estadoNoCiclo(estado[c.id], c, now);
    const restante = Math.max(0, c.quota - e.usados);
    return {
      label: c.label,
      slot: c.slot,
      usados: e.usados,
      quota: c.quota,
      restante,
      renovaDia: c.renovaDia,
      proximaRenovacao: proximaRenovacao(now, c.renovaDia),
      esgotada: restante === 0,
    };
  });
}

function proximaRenovacao(now: Date, renovaDia?: number): string {
  if (!renovaDia) {
    const prox = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return ymd(prox);
  }
  const inicio = inicioCicloAtual(now, renovaDia); // este ciclo começou aqui
  const d = new Date(inicio + "T00:00:00Z");
  const prox = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const ultimoDia = new Date(Date.UTC(prox.getUTCFullYear(), prox.getUTCMonth() + 1, 0)).getUTCDate();
  return ymd(new Date(Date.UTC(prox.getUTCFullYear(), prox.getUTCMonth(), Math.min(renovaDia, ultimoDia))));
}
