/**
 * Loop do Radar — o "rodar agora" ponta-a-ponta, com CACHE DE DIA.
 *
 * Fluxo: coletar movimentos do concorrente (RD Station) -> o analista cruza com
 * o Brain do cliente (Moovefy) -> devolve `IntelligenceItem[]` ordenado por
 * impacto (score DESC), junto de `ranAt` (quando o loop de fato rodou).
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
import { MOOVEFY } from "@/lib/clients/moovefy";
import { collectRDStation } from "@/lib/collectors/rdstation";
import type { IntelligenceItem } from "@/lib/types";

const CACHE_DIR = join(process.cwd(), ".cache");
const DEFAULT_LIMIT = 5;

export type RadarLoopResult = {
  /** itens de inteligência do dia, ordenados por impacto (score DESC). */
  items: IntelligenceItem[];
  /** ISO de quando o loop de fato rodou (não muda ao reler do cache). */
  ranAt: string;
};

export type RunRadarLoopOptions = {
  /** ignora o cache do dia e roda de novo (o botão "Rodar agora"). */
  force?: boolean;
  /** quantos movimentos do concorrente coletar. Padrão: 5. */
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
 * Roda o loop do Radar para o cliente do F1 (Moovefy).
 * Reusa o resultado do dia quando houver (a menos que `force`).
 */
export async function runRadarLoop(
  opts: RunRadarLoopOptions = {},
): Promise<RadarLoopResult> {
  const force = opts.force ?? false;

  if (!force) {
    const cached = readLoopCache();
    if (cached) {
      return { items: byScoreDesc(cached.items), ranAt: cached.ranAt };
    }
  }

  // Coleta usa o cache diário do Firecrawl (não passamos `force` aqui de
  // propósito — "Rodar agora" re-raciocina sem re-raspar, poupando créditos).
  const events = await collectRDStation({ limit: opts.limit ?? DEFAULT_LIMIT });
  const items = await analyze(events, MOOVEFY.clientName, MOOVEFY.brainContext);

  const result: RadarLoopResult = {
    items: byScoreDesc(items),
    ranAt: new Date().toISOString(),
  };

  writeLoopCache(result);
  return result;
}
