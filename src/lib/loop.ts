/**
 * Loop do Radar — o "rodar agora" ponta-a-ponta, com CACHE DE DIA.
 *
 * Desde a F2 quem dirige o loop é a WATCHLIST (`data/watchlist.json`): para
 * cada cliente, coleta os movimentos de CADA concorrente habilitado, e o
 * analista cruza tudo com o Brain do cliente -> `IntelligenceItem[]` ordenado
 * por impacto (score DESC), junto de `ranAt` (quando o loop de fato rodou).
 *
 * TOLERÂNCIA A FALHA (um bloco com falha não contamina o resto):
 *   Um concorrente cuja coleta falhe é registrado e PULADO — os outros seguem.
 *   Só lançamos quando NADA foi coletado e houve pelo menos uma falha (aí a
 *   tela mostra o erro real, em vez de fingir "nenhum movimento").
 *
 * POR QUE O CACHE IMPORTA (custo):
 *   Cada rodada gasta gateway (raciocínio Claude) e potencialmente Firecrawl.
 *   Abrir a página de briefing/feed NÃO pode disparar uma rodada nova a cada
 *   visita. Por isso guardamos o resultado do dia em `.cache/loop-<YYYY-MM-DD>.json`
 *   e reusamos no mesmo dia. Só `force: true` (o botão "Rodar agora") ignora o
 *   cache e roda de novo. No dia seguinte, o nome do arquivo muda e o loop roda.
 *
 * Nota de custo: mesmo com `force`, NÃO forçamos o Firecrawl — o coletor tem o
 * próprio cache diário por URL, então "Rodar agora" re-raciocina (1 chamada ao
 * gateway) sem re-raspar (0 créditos Firecrawl no mesmo dia).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { analyze } from "@/lib/analyst";
import { fetchClientBrain } from "@/lib/brain";
import { collectBlog } from "@/lib/collectors/blog";
import { planCollection, readWatchlist } from "@/lib/watchlist";
import type { IntelligenceItem, RawEvent } from "@/lib/types";

const CACHE_DIR = join(process.cwd(), ".cache");
const DEFAULT_LIMIT = 5;

/** De onde veio o contexto que ancorou o analista (transparência na UI). */
export type BrainSourceNote = {
  clientName: string;
  /** live = Brain real do Formare; fixture = resumo local; none = sem contexto. */
  mode: "live" | "fixture" | "none";
  /** nº de fatos confirmados usados (só em mode=live). */
  nodeCount?: number;
};

export type RadarLoopResult = {
  /** itens de inteligência do dia, ordenados por impacto (score DESC). */
  items: IntelligenceItem[];
  /** ISO de quando o loop de fato rodou (não muda ao reler do cache). */
  ranAt: string;
  /** por cliente: o contexto veio do Brain real ou de fallback? (honestidade) */
  brainSources?: BrainSourceNote[];
};

export type RunRadarLoopOptions = {
  /** ignora o cache do dia e roda de novo (o botão "Rodar agora"). */
  force?: boolean;
  /** quantos movimentos coletar POR CONCORRENTE. Padrão: 5. */
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
function byScoreDesc(items: IntelligenceItem[]): IntelligenceItem[] {
  return [...items].sort((a, b) => b.score - a.score);
}

/**
 * Roda o loop do Radar dirigido pela watchlist.
 * Reusa o resultado do dia quando houver (a menos que `force`).
 */
export async function runRadarLoop(
  opts: RunRadarLoopOptions = {},
): Promise<RadarLoopResult> {
  const force = opts.force ?? false;

  if (!force) {
    const cached = readLoopCache();
    if (cached) {
      // preserva TUDO do cache (inclusive brainSources), só reordenando os itens.
      return { ...cached, items: byScoreDesc(cached.items) };
    }
  }

  const watchlist = readWatchlist();
  const targets = planCollection(watchlist);

  // Coleta POR CONCORRENTE, tolerando falha individual. A coleta usa o cache
  // diário do Firecrawl (não passamos `force` aqui de propósito — "Rodar agora"
  // re-raciocina sem re-raspar, poupando créditos).
  const eventsByClient = new Map<string, RawEvent[]>();
  const failures: string[] = [];
  let collectedTotal = 0;

  for (const target of targets) {
    try {
      const events = await collectBlog(target.competitor, target.source, {
        limit: opts.limit ?? DEFAULT_LIMIT,
      });
      const bucket = eventsByClient.get(target.clientName) ?? [];
      // dedupe por id (fontes do mesmo concorrente podem repetir um artigo).
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
      failures.push(`${target.competitor.name} (${target.source.kind}): ${message}`);
      console.warn(
        `[loop] coleta de ${target.competitor.name}/${target.source.kind} falhou: ${message}`,
      );
    }
  }

  // Nada coletado E houve falha -> erro real (a tela mostra o motivo).
  if (collectedTotal === 0 && failures.length > 0) {
    throw new Error(`Nenhuma coleta funcionou — ${failures.join(" | ")}`);
  }

  // Analisa por cliente (1 chamada ao gateway por cliente com eventos),
  // ancorado no Brain REAL quando a porta de leitura está de pé (F3).
  const items: IntelligenceItem[] = [];
  const brainSources: BrainSourceNote[] = [];
  for (const [clientName, events] of eventsByClient) {
    if (events.length === 0) continue;
    const brain = await fetchClientBrain(clientName);
    brainSources.push({
      clientName,
      mode: brain.mode,
      nodeCount: brain.mode === "live" ? brain.nodeCount : undefined,
    });
    items.push(...(await analyze(events, clientName, brain.context)));
  }

  const result: RadarLoopResult = {
    items: byScoreDesc(items),
    ranAt: new Date().toISOString(),
    brainSources,
  };

  writeLoopCache(result);
  return result;
}
