/**
 * Briefing e Feed — funções PURAS (sem I/O) sobre `IntelligenceItem[]`.
 *
 * - `buildBriefing` = o RITUAL do dia: os N itens de maior impacto.
 * - `buildFeed`     = tudo, ordenado por impacto (a lista completa).
 * - helpers de filtro (`filterFeed`) e derivação de categoria (`categoryOf`)
 *   para a UI do feed.
 *
 * Não faz rede, disco nem LLM: recebe itens já produzidos pelo loop e apenas os
 * ordena/corta/filtra. Isso deixa briefing e feed triviais de testar.
 */

import type { IntelligenceItem } from "@/lib/types";

const DEFAULT_BRIEFING_MAX = 5;

/** Ordena por impacto (score DESC) sem mutar a entrada. */
function byScoreDesc(items: IntelligenceItem[]): IntelligenceItem[] {
  return [...items].sort((a, b) => b.score - a.score);
}

/**
 * O briefing do dia: os `max` itens de maior impacto (score DESC).
 * É o ritual — o Rafael abre e vê primeiro o que mais mexe com o cliente.
 */
export function buildBriefing(
  items: IntelligenceItem[],
  max: number = DEFAULT_BRIEFING_MAX,
): IntelligenceItem[] {
  return byScoreDesc(items).slice(0, Math.max(0, max));
}

/** O feed: todos os itens, ordenados por impacto (score DESC). */
export function buildFeed(items: IntelligenceItem[]): IntelligenceItem[] {
  return byScoreDesc(items);
}

export type FeedFilter = {
  /** só itens desta categoria (derivada da URL da fonte). */
  category?: string;
  /** só itens com score >= este mínimo. */
  minScore?: number;
};

/** Filtra o feed por categoria e/ou score mínimo (ambos opcionais). */
export function filterFeed(
  items: IntelligenceItem[],
  filter: FeedFilter = {},
): IntelligenceItem[] {
  const { category, minScore } = filter;
  return buildFeed(items).filter((item) => {
    if (typeof minScore === "number" && item.score < minScore) return false;
    if (category && categoryOf(item) !== category) return false;
    return true;
  });
}

/**
 * Categoria do item, derivada do caminho da URL da fonte
 * (ex.: https://www.rdstation.com/blog/marketing/... -> "marketing").
 *
 * O `IntelligenceItem` não guarda categoria própria; ela vem do RawEvent de
 * origem, cuja URL fica em `fonte.url`. Derivar aqui mantém a função pura.
 */
export function categoryOf(item: IntelligenceItem): string | undefined {
  try {
    const { pathname } = new URL(item.fonte.url);
    const prefix = "/blog/";
    if (!pathname.startsWith(prefix)) return undefined;
    const segments = pathname
      .slice(prefix.length)
      .split("/")
      .filter((segment) => segment.length > 0);
    return segments[0];
  } catch {
    return undefined;
  }
}
