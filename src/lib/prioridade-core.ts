/**
 * P7 — RÉGUA DE PRIORIDADE (núcleo PURO, browser-safe). Os cortes que traduzem
 * o score (0-100) em palavra (Alta · Média · Baixa). Sem fs, sem rede — o
 * CLIENTE importa daqui (via contexto) e o servidor também. O store org-scoped
 * (org_docs / JSON) vive em `@/lib/prioridade`, que re-exporta este núcleo.
 */

export type CortePrioridade = { alta: number; media: number };
export type NivelPrioridade = "Alta" | "Média" | "Baixa";

/** Padrão do sistema — o que sempre valeu antes da agência afinar (70 / 40). */
export const CORTE_PADRAO: CortePrioridade = { alta: 70, media: 40 };

/** Nível em palavra pelos cortes da agência (ou o padrão). Núcleo determinístico. */
export function nivelPorCorte(score: number, corte: CortePrioridade = CORTE_PADRAO): NivelPrioridade {
  if (score >= corte.alta) return "Alta";
  if (score >= corte.media) return "Média";
  return "Baixa";
}

/**
 * Garante 1 ≤ media < alta ≤ 100. Sem isso a palavra fica incoerente (ex.:
 * media ≥ alta esconderia "Média" pra sempre). Valor inválido cai no padrão.
 */
export function sanitizarCorte(bruto: unknown): CortePrioridade {
  const o = (bruto ?? {}) as Partial<CortePrioridade>;
  let alta = Math.round(Number(o.alta));
  let media = Math.round(Number(o.media));
  if (!Number.isFinite(alta)) alta = CORTE_PADRAO.alta;
  if (!Number.isFinite(media)) media = CORTE_PADRAO.media;
  alta = Math.min(100, Math.max(2, alta)); // alta tem de deixar espaço pra media (≥1)
  media = Math.min(alta - 1, Math.max(1, media));
  return { alta, media };
}

/** true quando a agência afinou os cortes (difere do padrão do sistema). */
export function corteCustomizado(c: CortePrioridade): boolean {
  return c.alta !== CORTE_PADRAO.alta || c.media !== CORTE_PADRAO.media;
}
