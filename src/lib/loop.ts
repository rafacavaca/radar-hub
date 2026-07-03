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
import { activeLensesFor } from "@/lib/lenses";
import { planCollection, readWatchlist } from "@/lib/watchlist";
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
      const events = await collectBlog(target.competitor, target.source, {
        limit: opts.limit ?? DEFAULT_LIMIT,
      });
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

  // 2) LENTES: cada lente ativa lê os movimentos do cliente pela sua régua.
  const readings: LensReading[] = [];
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
      // 1 retry por lente: o gateway tem timeout de 40s e às vezes um pico
      // derruba UMA chamada — perder a visão de um time por isso é caro.
      let done = false;
      for (let attempt = 1; attempt <= 2 && !done; attempt++) {
        try {
          readings.push(...(await analyzeLens(lens, events, clientName, brain.context)));
          done = true;
        } catch (err) {
          const message = (err as Error).message;
          console.warn(
            `[loop] lente ${lens.id} de ${clientName} falhou (tentativa ${attempt}): ${message}`,
          );
          if (attempt === 2) failures.push(`lente ${lens.id} (${clientName}): ${message}`);
        }
      }
    }
  }

  const result: RadarLoopResult = {
    items: buildGeneralItems(readings),
    readings: byScoreDesc(readings),
    events: allEvents,
    ranAt: new Date().toISOString(),
    brainSources,
    failures: failures.length > 0 ? failures : undefined,
  };

  writeLoopCache(result);
  return result;
}
