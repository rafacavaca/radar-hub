/**
 * RATE LIMIT (abuso) — janela deslizante em memória, por CHAVE (normalmente
 * `acao:orgId`). Barra um usuário/org que dispara ações caras em loop (gerar
 * dossiê, rodar varredura, diagnóstico, visão) e drena o pool compartilhado de
 * Firecrawl/LLM — o que, além do custo, envenena o cache do dia de TODAS as orgs.
 *
 * Escopo: 1 instância (VPS single-process) — o Map basta e reseta no restart, o
 * que é aceitável pra prevenção de abuso (o teto do provedor é o backstop final).
 * NÃO é cota de faturamento; é freio de loop. Limites GENEROSOS: uso real passa,
 * loop é barrado.
 */

const hits = new Map<string, number[]>();
let ultimaLimpeza = 0;

/** Poda chaves velhas de vez em quando (evita o Map crescer sem fim). */
function limpar(now: number, windowMs: number): void {
  if (now - ultimaLimpeza < 5 * 60_000) return;
  ultimaLimpeza = now;
  for (const [k, arr] of hits) {
    const vivos = arr.filter((t) => now - t < windowMs);
    if (vivos.length === 0) hits.delete(k);
    else hits.set(k, vivos);
  }
}

export type RateResult = { limited: boolean; retryAfterS: number; restante: number };

/**
 * Registra uma tentativa e diz se ESTOUROU o limite (`limit` ações por
 * `windowMs`). Se estourou, NÃO conta a tentativa (não empurra a janela) e
 * devolve quantos segundos faltam pra liberar.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  limpar(now, windowMs);
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    const retryAfterS = Math.max(1, Math.ceil((windowMs - (now - arr[0])) / 1000));
    hits.set(key, arr);
    return { limited: true, retryAfterS, restante: 0 };
  }
  arr.push(now);
  hits.set(key, arr);
  return { limited: false, retryAfterS: 0, restante: limit - arr.length };
}

/** Limites por AÇÃO (por org, por janela). Generosos p/ uso real, apertam loop. */
export const LIMITES = {
  run: { limit: 40, windowMs: 60 * 60_000 }, // varredura: 40/h por org
  dossie: { limit: 20, windowMs: 60 * 60_000 }, // dossiê (Firecrawl+LLM pesado): 20/h
  diagnostico: { limit: 30, windowMs: 60 * 60_000 },
  visual: { limit: 30, windowMs: 60 * 60_000 },
  upload: { limit: 60, windowMs: 60 * 60_000 }, // upload de contexto: 60/h
} as const;

/** Resposta 429 padrão (JSON + Retry-After) pra usar nas rotas. */
export function respostaRateLimit(r: RateResult): Response {
  return new Response(
    JSON.stringify({ error: "Muitas ações seguidas — aguarde um instante e tente de novo." }),
    { status: 429, headers: { "content-type": "application/json", "Retry-After": String(r.retryAfterS) } },
  );
}
