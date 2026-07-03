/**
 * Loop do Radar — o "rodar agora" ponta-a-ponta, com CACHE DE DIA.
 *
 * Desde a F6 o raciocínio é POR LENTE (analistas por ótica): a watchlist diz o
 * que coletar; cada cliente tem lentes ATIVAS (comercial/produto/marketing,
 * config editável) e cada lente lê os mesmos movimentos pela sua régua ->
 * `LensReading[]`. A visão GERAL (do Rafael) é DERIVADA das leituras: os itens
 * mais fortes across as lentes, deduplicados por movimento.
 *
 * TOLERÂNCIA A FALHA (um bloco com falha não contamina o resto):
 *   - coleta: um concorrente/fonte que falhe é registrado e pulado;
 *   - lentes: uma lente que falhe (gateway) é registrada e pulada — as outras
 *     leituras do cliente seguem valendo.
 *
 * POR QUE O CACHE IMPORTA (custo):
 *   Cada rodada gasta gateway (1 chamada POR LENTE ATIVA por cliente) e
 *   potencialmente Firecrawl. Abrir a página NÃO dispara rodada nova: o
 *   resultado do dia fica em `.cache/loop-<YYYY-MM-DD>.json`. Só `force: true`
 *   (o botão "Rodar agora") re-raciocina — e mesmo assim NÃO re-raspa (o
 *   coletor tem cache diário próprio por URL).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { analyzeLens } from "@/lib/analyst-lens";
import { fetchClientBrain } from "@/lib/brain";
import { collectBlog } from "@/lib/collectors/blog";
import { collectByDiff } from "@/lib/collectors/content-diff";
import { crossReference, type CrossInsight } from "@/lib/cross-reference";
import { activeLensesFor } from "@/lib/lenses";
import { collectionMethod, planCollection, readWatchlist } from "@/lib/watchlist";
import type { IntelligenceItem, LensReading, RawEvent } from "@/lib/types";

const CACHE_DIR = join(process.cwd(), ".cache");
const DEFAULT_LIMIT = 5;

/** De onde veio o contexto que ancorou os analistas (transparência na UI). */
export type BrainSourceNote = {
  clientName: string;
  /** live = Brain real do Formare; fixture = resumo local; none = sem contexto. */
  mode: "live" | "fixture" | "none";
  /** nº de fatos confirmados usados (só em mode=live). */
  nodeCount?: number;
};

/** Evento cru com o cliente a quem interessa (pro Feed transversal). */
export type ClientEvent = RawEvent & { clientName: string };

export type RadarLoopResult = {
  /** visão GERAL: os itens mais fortes across as lentes (dedupe por sinal). */
  items: IntelligenceItem[];
  /** TODAS as leituras por lente (as visões de time filtram daqui). */
  readings?: LensReading[];
  /** F9: cruzamentos interno×externo (a aba "Interno × Externo"). */
  crossInsights?: CrossInsight[];
  /** sinais crus coletados (o Feed mostra isto, sem lente). */
  events?: ClientEvent[];
  /** ISO de quando o loop de fato rodou (não muda ao reler do cache). */
  ranAt: string;
  /** por cliente: o contexto veio do Brain real ou de fallback? (honestidade) */
  brainSources?: BrainSourceNote[];
  /** falhas parciais da rodada (coleta/lente), pra UI ser honesta. */
  failures?: string[];
};

export type RunRadarLoopOptions = {
  /** ignora o cache do dia e roda de novo (o botão "Rodar agora"). */
  force?: boolean;
  /** quantos movimentos coletar POR FONTE. Padrão: 5. */
  limit?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chama o gateway com RECUO: até 2 tentativas. Se o erro for do DISJUNTOR do
 * gateway (503 "degradado", circuito aberto por uma chamada anterior que
 * estourou 40s), espera ele fechar antes de tentar de novo — insistir na hora
 * só devolve 503. Falha final -> registra e devolve null (não derruba a rodada).
 */
async function withGatewayRetry<T>(
  label: string,
  fn: () => Promise<T>,
  failures: string[],
): Promise<T | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const message = (err as Error).message;
      console.warn(`[loop] ${label} falhou (tentativa ${attempt}): ${message}`);
      if (attempt === 2) {
        failures.push(`${label}: ${message}`);
        return null;
      }
      // disjuntor aberto precisa de mais tempo pra fechar; timeout comum, menos.
      await sleep(/degradado|503|circuito/i.test(message) ? 20000 : 4000);
    }
  }
  return null;
}

/** Carimbo do dia (YYYY-MM-DD, UTC) — mesma convenção do cache do Firecrawl. */
function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function cachePathForToday(): string {
  return join(CACHE_DIR, `loop-${todayStamp()}.json`);
}

/** Lê o cache do dia; null se não existe, está ilegível ou malformado. */
function readLoopCache(): RadarLoopResult | null {
  const path = cachePathForToday();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as RadarLoopResult;
    if (!parsed || !Array.isArray(parsed.items) || typeof parsed.ranAt !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeLoopCache(result: RadarLoopResult): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePathForToday(), JSON.stringify(result, null, 2), "utf8");
}

/** Ordena por impacto (score DESC) sem mutar o array de entrada. */
function byScoreDesc<T extends { score: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => b.score - a.score);
}

/**
 * VISÃO GERAL derivada das leituras: 1 item por MOVIMENTO (evento), com a
 * leitura da lente mais forte como corpo e as demais lentes como marcação.
 * Função pura — o smoke testa o dedupe direto aqui.
 */
export function buildGeneralItems(readings: LensReading[]): IntelligenceItem[] {
  const byEvent = new Map<string, LensReading[]>();
  for (const reading of readings) {
    const key = `${reading.clientName}:${reading.eventIds[0] ?? reading.id}`;
    const bucket = byEvent.get(key) ?? [];
    bucket.push(reading);
    byEvent.set(key, bucket);
  }

  const items: IntelligenceItem[] = [];
  for (const bucket of byEvent.values()) {
    const best = byScoreDesc(bucket)[0];
    const lentes = [...new Set(bucket.map((r) => r.lens))].sort() as IntelligenceItem["lentes"];
    items.push({
      id: best.id,
      clientName: best.clientName,
      sinal: best.sinal,
      porQueImporta: best.leitura,
      acao: best.acao,
      fonte: best.fonte,
      concorrente: best.concorrente,
      score: best.score,
      eventIds: best.eventIds,
      lentes,
      createdAt: best.createdAt,
    });
  }
  return byScoreDesc(items);
}

// ─────────────────────────────────────────────────────────────────────────────
// RODADA PARCIAL (F16) — por cliente ou por concorrente, com MERGE no dia.
// Evita rodar TUDO pra ver uma novidade pontual: atualiza só o escopo pedido
// e preserva o resto do resultado do dia.
// ─────────────────────────────────────────────────────────────────────────────

export type RunScope = {
  clientName: string;
  /** limita a UM concorrente do cliente (id da watchlist). */
  competitorId?: string;
};

type ScopeNames = { clientName: string; competitorId?: string; competitorName?: string };

type FreshPatch = {
  events: ClientEvent[];
  readings: LensReading[];
  crossInsights: CrossInsight[];
  brainSource: BrainSourceNote;
  failures: string[];
};

/**
 * MERGE de uma rodada parcial no resultado do dia (função PURA — o smoke testa
 * direto aqui): troca SÓ os dados do escopo (cliente, e opcionalmente um
 * concorrente dele) pelos frescos; o resto fica intacto. A visão Geral é
 * re-derivada das leituras já mescladas.
 *
 * Honestidade: se a rodada fresca veio VAZIA e sem falhas (ex.: fontes por
 * mudança sem nada novo), NADA é apagado — só o carimbo/brain atualizam.
 */
export function mergeLoopResult(
  base: RadarLoopResult | null,
  scope: ScopeNames,
  fresh: FreshPatch,
): RadarLoopResult {
  const inScopeEvent = (e: ClientEvent): boolean =>
    e.clientName === scope.clientName && (!scope.competitorId || e.source === scope.competitorId);
  const inScopeReading = (r: { clientName: string; concorrente?: string }): boolean =>
    r.clientName === scope.clientName &&
    (!scope.competitorName || r.concorrente === scope.competitorName);

  const baseEvents = base?.events ?? [];
  const baseReadings = base?.readings ?? [];
  const baseCross = base?.crossInsights ?? [];

  const nothingNew =
    fresh.events.length === 0 && fresh.readings.length === 0 && fresh.failures.length === 0;

  const events = nothingNew
    ? baseEvents
    : [...baseEvents.filter((e) => !inScopeEvent(e)), ...fresh.events];
  const readings = nothingNew
    ? baseReadings
    : [...baseReadings.filter((r) => !inScopeReading(r)), ...fresh.readings];
  const crossInsights = nothingNew
    ? baseCross
    : [...baseCross.filter((c) => !inScopeReading(c)), ...fresh.crossInsights];

  const brainSources = [
    ...(base?.brainSources ?? []).filter((b) => b.clientName !== scope.clientName),
    fresh.brainSource,
  ];

  return {
    items: buildGeneralItems(readings),
    readings: byScoreDesc(readings),
    crossInsights: byScoreDesc(crossInsights),
    events,
    ranAt: new Date().toISOString(),
    brainSources,
    failures: fresh.failures.length > 0 ? fresh.failures : undefined,
  };
}

/**
 * Roda SÓ um escopo (cliente, ou um concorrente do cliente) e mescla no dia.
 * Custo: coleta só os alvos do escopo + lentes/cruzamento só sobre os eventos
 * frescos (1 chamada por lente ativa + 1 do cruzamento).
 */
export async function runRadarPartial(scope: RunScope, opts: { limit?: number } = {}): Promise<{
  result: RadarLoopResult;
  summary: { eventos: number; leituras: number; cruzamentos: number; falhas: string[] };
}> {
  const watchlist = readWatchlist();
  const client = watchlist.clients.find((c) => c.name === scope.clientName);
  if (!client) throw new Error(`Cliente não encontrado: ${scope.clientName}`);

  let competitorName: string | undefined;
  if (scope.competitorId) {
    const competitor = client.competitors.find((c) => c.id === scope.competitorId);
    if (!competitor) throw new Error(`Concorrente não encontrado: ${scope.competitorId}`);
    competitorName = competitor.name;
  }

  const targets = planCollection(watchlist).filter(
    (t) =>
      t.clientName === scope.clientName &&
      (!scope.competitorId || t.competitor.id === scope.competitorId),
  );
  if (targets.length === 0) {
    throw new Error(
      "Nada pra coletar nesse escopo — o concorrente está pausado ou sem fontes coletáveis.",
    );
  }

  // 1) COLETA só do escopo (mesma tolerância a falha do loop cheio).
  const failures: string[] = [];
  const freshEvents: ClientEvent[] = [];
  const seen = new Set<string>();
  for (const target of targets) {
    try {
      const method = collectionMethod(target.source.kind);
      const events =
        method === "diff"
          ? await collectByDiff(target.competitor, target.source)
          : await collectBlog(target.competitor, target.source, { limit: opts.limit ?? DEFAULT_LIMIT });
      for (const event of events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        freshEvents.push({ ...event, clientName: scope.clientName });
      }
    } catch (err) {
      const message = (err as Error).message;
      failures.push(`coleta ${target.competitor.name} (${target.source.kind}): ${message}`);
      console.warn(`[loop:parcial] coleta falhou: ${message}`);
    }
  }

  // 2) ANÁLISE só dos eventos frescos (lentes ativas + cruzamento).
  const brain = await fetchClientBrain(scope.clientName);
  const brainSource: BrainSourceNote = {
    clientName: scope.clientName,
    mode: brain.mode,
    nodeCount: brain.mode === "live" ? brain.nodeCount : undefined,
  };

  const readings: LensReading[] = [];
  const crossInsights: CrossInsight[] = [];
  if (freshEvents.length > 0) {
    for (const lens of activeLensesFor(scope.clientName)) {
      const out = await withGatewayRetry(
        `lente ${lens.id} (${scope.clientName})`,
        () => analyzeLens(lens, freshEvents, scope.clientName, brain.context),
        failures,
      );
      if (out) readings.push(...out);
    }
    const cross = await withGatewayRetry(
      `cruzamento (${scope.clientName})`,
      () => crossReference(freshEvents, scope.clientName, brain.context),
      failures,
    );
    if (cross) crossInsights.push(...cross);
  }

  // 3) MERGE no resultado do dia e persiste.
  const merged = mergeLoopResult(
    readLoopCache(),
    { clientName: scope.clientName, competitorId: scope.competitorId, competitorName },
    { events: freshEvents, readings, crossInsights, brainSource, failures },
  );
  writeLoopCache(merged);

  return {
    result: merged,
    summary: {
      eventos: freshEvents.length,
      leituras: readings.length,
      cruzamentos: crossInsights.length,
      falhas: failures,
    },
  };
}

/**
 * Roda o loop do Radar: coleta pela watchlist, lê com as lentes ativas de
 * cada cliente, deriva a visão geral. Reusa o resultado do dia (a menos que
 * `force`).
 */
export async function runRadarLoop(
  opts: RunRadarLoopOptions = {},
): Promise<RadarLoopResult> {
  const force = opts.force ?? false;

  if (!force) {
    const cached = readLoopCache();
    if (cached) {
      // preserva TUDO do cache (readings/events/brainSources), só reordenando.
      return { ...cached, items: byScoreDesc(cached.items) };
    }
  }

  const watchlist = readWatchlist();
  const targets = planCollection(watchlist);

  // 1) COLETA por (cliente, concorrente, fonte), tolerando falha individual.
  const eventsByClient = new Map<string, RawEvent[]>();
  const failures: string[] = [];
  let collectedTotal = 0;

  for (const target of targets) {
    try {
      // despacha por método: listagem (blog/notícias) ou mudança (produto/vagas).
      const method = collectionMethod(target.source.kind);
      const events =
        method === "diff"
          ? await collectByDiff(target.competitor, target.source)
          : await collectBlog(target.competitor, target.source, { limit: opts.limit ?? DEFAULT_LIMIT });
      const bucket = eventsByClient.get(target.clientName) ?? [];
      const seen = new Set(bucket.map((e) => e.id));
      for (const event of events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        bucket.push(event);
        collectedTotal++;
      }
      eventsByClient.set(target.clientName, bucket);
    } catch (err) {
      const message = (err as Error).message;
      failures.push(`coleta ${target.competitor.name} (${target.source.kind}): ${message}`);
      console.warn(
        `[loop] coleta de ${target.competitor.name}/${target.source.kind} falhou: ${message}`,
      );
    }
  }

  if (collectedTotal === 0 && failures.length > 0) {
    throw new Error(`Nenhuma coleta funcionou — ${failures.join(" | ")}`);
  }

  // 2) LENTES + CRUZAMENTO: cada lente ativa lê os movimentos pela sua régua;
  //    o cruzamento interno×externo roda uma vez por cliente.
  const readings: LensReading[] = [];
  const crossInsights: CrossInsight[] = [];
  const brainSources: BrainSourceNote[] = [];
  const allEvents: ClientEvent[] = [];

  for (const [clientName, events] of eventsByClient) {
    if (events.length === 0) continue;
    allEvents.push(...events.map((e) => ({ ...e, clientName })));

    const brain = await fetchClientBrain(clientName);
    brainSources.push({
      clientName,
      mode: brain.mode,
      nodeCount: brain.mode === "live" ? brain.nodeCount : undefined,
    });

    for (const lens of activeLensesFor(clientName)) {
      const out = await withGatewayRetry(
        `lente ${lens.id} (${clientName})`,
        () => analyzeLens(lens, events, clientName, brain.context),
        failures,
      );
      if (out) readings.push(...out);
    }

    // Cruzamento interno×externo (mesma disciplina de recuo).
    const cross = await withGatewayRetry(
      `cruzamento (${clientName})`,
      () => crossReference(events, clientName, brain.context),
      failures,
    );
    if (cross) crossInsights.push(...cross);
  }

  const result: RadarLoopResult = {
    items: buildGeneralItems(readings),
    readings: byScoreDesc(readings),
    crossInsights: byScoreDesc(crossInsights),
    events: allEvents,
    ranAt: new Date().toISOString(),
    brainSources,
    failures: failures.length > 0 ? failures : undefined,
  };

  writeLoopCache(result);
  return result;
}
