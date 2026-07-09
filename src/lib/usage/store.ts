/**
 * STORE dos usage_events — a medição de custo (item 1).
 *
 * Forma: JSONL append-only em `data/usage-events.jsonl` (uma linha por evento).
 * Por que JSONL e não o JSON atômico do resto: eventos são APPEND-pesados e
 * lidos-agregados; `appendFile` é O(1) e não reescreve o arquivo todo a cada
 * chamada. Leitura tolera linha corrompida (pula), nunca lança.
 *
 * INVISÍVEL: `recordUsage` é fire-and-forget — NÃO é aguardado no caminho
 * quente, então não adiciona latência à resposta ao usuário. Falha de disco é
 * engolida (a medição jamais derruba uma feature).
 *
 * PRIVACIDADE: só metadados (tokens, feature, ids, custo). Nunca o conteúdo do
 * prompt nem do sinal.
 */

import { appendFile, readFile } from "node:fs/promises";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { custoColeta, custoLLM, getPrecos } from "@/lib/usage/precos";
import { getUsageContext, providerDoModelo } from "@/lib/usage/context";

export type UsageEvent = {
  ts: string;
  orgId?: string;
  clientName?: string;
  feature: string;
  etapa?: string;
  entidadeTipo?: "concorrente" | "conta" | "geral";
  entidadeId?: string;
  entidadeNome?: string;
  provider: string;
  modelo?: string;
  tokensIn?: number;
  tokensOut?: number;
  cacheRead?: number;
  cacheWrite?: number;
  /** unidades de coleta (páginas Firecrawl / buscas). */
  unidades?: number;
  /** custo estimado (USD) pela TABELA vigente — estimativa, não fatura. */
  custoEstimado: number;
  /** custo (USD) reportado pelo PROVEDOR (SDK), quando houver — cross-check. */
  custoProvedor?: number;
  latenciaMs?: number;
  estimativa: true;
};

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function filePath(): string {
  return join(dataDir(), "usage-events.jsonl");
}

/**
 * Grava um usage_event de LLM. FIRE-AND-FORGET: não retorna promise pra
 * aguardar; puxa a atribuição do contexto ambiente. Nunca lança.
 */
export function recordLLMUsage(input: {
  modelo?: string;
  tokensIn?: number;
  tokensOut?: number;
  cacheRead?: number;
  cacheWrite?: number;
  custoProvedor?: number;
  latenciaMs?: number;
  /** sobrescreve a feature do contexto (ex.: vision força "identidade"). */
  featureOverride?: string;
}): void {
  const ctx = getUsageContext() ?? {};
  const tabela = getPrecos();
  const event: UsageEvent = {
    ts: new Date().toISOString(),
    orgId: ctx.orgId,
    clientName: ctx.clientName,
    feature: input.featureOverride ?? ctx.feature ?? "outro",
    etapa: ctx.etapa,
    entidadeTipo: ctx.entidadeTipo,
    entidadeId: ctx.entidadeId,
    entidadeNome: ctx.entidadeNome,
    provider: providerDoModelo(input.modelo),
    modelo: input.modelo,
    tokensIn: input.tokensIn,
    tokensOut: input.tokensOut,
    cacheRead: input.cacheRead,
    cacheWrite: input.cacheWrite,
    custoEstimado: custoLLM(
      input.modelo,
      { in: input.tokensIn, out: input.tokensOut, cache_read: input.cacheRead, cache_write: input.cacheWrite },
      tabela,
    ),
    custoProvedor: input.custoProvedor,
    latenciaMs: input.latenciaMs,
    estimativa: true,
  };
  track(append(event));
}

/**
 * Grava um usage_event de COLETA (Firecrawl). Feature SEMPRE "coleta" (é
 * coleta, seja qual for a etapa ambiente); herda cliente/entidade do contexto.
 */
export function recordColetaUsage(input: {
  unidades: number;
  tipo: "pagina" | "busca";
  provider?: string;
  latenciaMs?: number;
}): void {
  const ctx = getUsageContext() ?? {};
  const event: UsageEvent = {
    ts: new Date().toISOString(),
    orgId: ctx.orgId,
    clientName: ctx.clientName,
    feature: "coleta",
    etapa: ctx.feature ? `${ctx.feature}${ctx.etapa ? `/${ctx.etapa}` : ""}` : undefined,
    entidadeTipo: ctx.entidadeTipo,
    entidadeId: ctx.entidadeId,
    entidadeNome: ctx.entidadeNome,
    provider: input.provider ?? "firecrawl",
    unidades: input.unidades,
    custoEstimado: custoColeta(input.unidades, input.tipo),
    latenciaMs: input.latenciaMs,
    estimativa: true,
  };
  track(append(event));
}

/** appends em voo — pra `flushUsage()` (scripts/cron/smoke) esperarem o disco. */
const pendentes = new Set<Promise<void>>();

/** Registra um append fire-and-forget e o remove ao concluir. */
function track(p: Promise<void>): void {
  pendentes.add(p);
  void p.finally(() => pendentes.delete(p));
}

async function append(event: UsageEvent): Promise<void> {
  try {
    mkdirSync(dataDir(), { recursive: true });
    await appendFile(filePath(), JSON.stringify(event) + "\n", "utf8");
  } catch {
    /* medição nunca derruba feature */
  }
}

/** Espera os appends fire-and-forget terminarem (uso: fim de script/smoke). */
export async function flushUsage(): Promise<void> {
  await Promise.all([...pendentes]);
}

function parseLines(raw: string): UsageEvent[] {
  const out: UsageEvent[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t) as UsageEvent;
      if (e && typeof e.ts === "string" && typeof e.custoEstimado === "number") out.push(e);
    } catch {
      /* pula linha corrompida */
    }
  }
  return out;
}

export type UsageFilter = {
  clientName?: string;
  orgId?: string;
  /** ISO inclusivo (ts >= desde). */
  desde?: string;
  /** ISO exclusivo (ts < ate). */
  ate?: string;
};

function matches(e: UsageEvent, f: UsageFilter): boolean {
  if (f.clientName && e.clientName !== f.clientName) return false;
  if (f.orgId && e.orgId !== f.orgId) return false;
  if (f.desde && e.ts < f.desde) return false;
  if (f.ate && e.ts >= f.ate) return false;
  return true;
}

/** Lê os eventos (síncrono — usado nas rotas server; nunca lança). */
export function readUsageEvents(filter: UsageFilter = {}): UsageEvent[] {
  const path = filePath();
  if (!existsSync(path)) return [];
  try {
    return parseLines(readFileSync(path, "utf8")).filter((e) => matches(e, filter));
  } catch {
    return [];
  }
}

/** Versão assíncrona da leitura (pro painel, fora do caminho quente). */
export async function readUsageEventsAsync(filter: UsageFilter = {}): Promise<UsageEvent[]> {
  const path = filePath();
  if (!existsSync(path)) return [];
  try {
    return parseLines(await readFile(path, "utf8")).filter((e) => matches(e, filter));
  } catch {
    return [];
  }
}
