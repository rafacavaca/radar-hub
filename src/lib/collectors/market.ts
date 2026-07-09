/**
 * COLETOR DE MERCADO (F4) — o ingrediente "mercado" deixa de ser DERIVADO e vira
 * FONTE PRÓPRIA. Para cada cliente com `market` (queries de setor) na watchlist,
 * roda uma BUSCA WEB (Firecrawl search) por tendência/tema e normaliza os
 * resultados em sinais de mercado — que o analista de relacionamento passa a
 * CITAR no reforço (com fonte real), em vez de inferir.
 *
 * HONESTIDADE:
 *  - hit de busca raramente traz data confiável -> `publishedAt: null` ("sem data
 *    de publicação"); NUNCA fabricamos data (nada de "31 dez 1969").
 *  - fonte = a URL real do resultado; nunca inventada.
 *
 * CUSTO: cada query gasta 1 crédito de busca. CACHE DE DIA por cliente
 * (.cache/market-<cliente>-<dia>.json) — reexecuções e "rodar de novo" reusam.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { searchWeb } from "@/lib/firecrawl";
import { slugify } from "@/lib/watchlist";
import type { RawEvent } from "@/lib/types";

const CACHE_DIR = join(process.cwd(), ".cache");
/** teto de sinais de mercado por cliente (poucos e certeiros; o analista não precisa de muitos). */
const MAX_MARKET = 8;
/** resultados por query. */
const PER_QUERY = 4;

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function cachePathFor(clientName: string): string {
  return join(CACHE_DIR, `market-${slugify(clientName)}-${todayStamp()}.json`);
}

function readCache(clientName: string): RawEvent[] | null {
  const path = cachePathFor(clientName);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as RawEvent[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(clientName: string, events: RawEvent[]): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePathFor(clientName), JSON.stringify(events, null, 2), "utf8");
  } catch {
    // cache é conveniência — falha de escrita não derruba a coleta.
  }
}

/**
 * Coleta sinais de mercado do cliente (busca web pelas queries). Cache de dia.
 * Nunca lança: falha de busca -> devolve o que já tiver (ou []).
 */
export async function collectMarket(
  clientName: string,
  queries: string[],
  opts: { noCache?: boolean } = {},
): Promise<RawEvent[]> {
  const clean = (queries ?? []).map((q) => q.trim()).filter(Boolean);
  if (clean.length === 0) return [];

  if (!opts.noCache) {
    const cached = readCache(clientName);
    if (cached) return cached;
  }

  const now = new Date().toISOString();
  const seen = new Set<string>();
  const events: RawEvent[] = [];

  for (const query of clean) {
    if (events.length >= MAX_MARKET) break;
    const hits = await searchWeb(query, PER_QUERY);
    for (const hit of hits) {
      if (events.length >= MAX_MARKET) break;
      const url = hit.url.trim();
      const key = url.replace(/\/$/, "");
      if (!url || seen.has(key)) continue;
      seen.add(key);
      events.push({
        id: createHash("sha1").update(`market:${url}`).digest("hex").slice(0, 16),
        source: "mercado",
        competitorName: "Mercado", // rótulo do sinal de mercado (não é um concorrente)
        kind: "market",
        url,
        title: hit.title || url,
        description: hit.description,
        // hit de busca não traz data confiável — honesto: sem data de publicação.
        publishedAt: null,
        collectedAt: now,
      });
    }
  }

  if (events.length > 0) writeCache(clientName, events);
  return events;
}
