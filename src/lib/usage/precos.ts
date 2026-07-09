/**
 * TABELA DE PREÇOS da medição de custo — CONFIGURÁVEL, não hardcode espalhado.
 *
 * Vive em `data/config/precos.json` (mesclada sobre os padrões abaixo; editar o
 * arquivo OU o painel /custo muda o cálculo dos PRÓXIMOS eventos). Cada
 * usage_event grava o custo calculado COM A TABELA DO MOMENTO — é uma
 * ESTIMATIVA de tabela, não fatura.
 *
 * Honestidade dos padrões:
 *  - LLM: preço de TABELA da API (USD por 1M tokens). O Claude do Radar roda
 *    por SUBSCRIÇÃO (custo marginal real ≈ 0 até o teto do plano) — o valor
 *    aqui é o EQUIVALENTE-API, que é o número certo pra decidir preço (na
 *    escala, subscrição vira API).
 *  - Firecrawl: aproximação por crédito (plano ~USD 16 / 3.000 créditos).
 *  - Todos os valores são editáveis; se o preço real mudou, ajuste a tabela.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type PrecoLLM = {
  /** USD por 1M tokens de entrada (não-cache). */
  input_usd_mtok: number;
  /** USD por 1M tokens de saída. */
  output_usd_mtok: number;
  /** USD por 1M tokens LIDOS do cache (Anthropic: ~0,1× o input). */
  cache_read_usd_mtok?: number;
  /** USD por 1M tokens ESCRITOS no cache (Anthropic: ~1,25× o input). */
  cache_write_usd_mtok?: number;
  nota?: string;
};

export type TabelaPrecos = {
  moeda: "USD";
  /** chave = PREFIXO do id do modelo; casa o prefixo mais longo. */
  llm: Record<string, PrecoLLM>;
  coleta: {
    /** USD por página raspada (1 crédito Firecrawl). */
    firecrawl_pagina_usd: number;
    /** USD por resultado de busca (≈1 crédito Firecrawl). */
    firecrawl_busca_usd: number;
    nota?: string;
  };
  nota: string;
};

export const PRECOS_PADRAO: TabelaPrecos = {
  moeda: "USD",
  llm: {
    "claude-opus": { input_usd_mtok: 15, output_usd_mtok: 75, cache_read_usd_mtok: 1.5, cache_write_usd_mtok: 18.75, nota: "tabela API Anthropic" },
    "claude-sonnet": { input_usd_mtok: 3, output_usd_mtok: 15, cache_read_usd_mtok: 0.3, cache_write_usd_mtok: 3.75, nota: "tabela API Anthropic" },
    "claude-haiku": { input_usd_mtok: 1, output_usd_mtok: 5, cache_read_usd_mtok: 0.1, cache_write_usd_mtok: 1.25, nota: "tabela API Anthropic" },
    deepseek: { input_usd_mtok: 0.27, output_usd_mtok: 1.1, cache_read_usd_mtok: 0.07, nota: "tabela API DeepSeek — confira" },
    padrao: { input_usd_mtok: 3, output_usd_mtok: 15, nota: "modelo desconhecido → assume preço de sonnet" },
  },
  coleta: {
    firecrawl_pagina_usd: 0.0053,
    firecrawl_busca_usd: 0.0053,
    nota: "≈ USD 16 / 3.000 créditos (plano Firecrawl) — ajuste ao seu plano",
  },
  nota:
    "ESTIMATIVA por tabela de preço — não é fatura. Claude roda por subscrição " +
    "(marginal real ≈ 0 até o teto do plano); o valor é o equivalente-API, a base honesta pra precificar.",
};

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function precosPath(): string {
  return join(dataDir(), "config", "precos.json");
}

/** Tabela vigente: padrões + overrides do arquivo (nunca lança). */
export function getPrecos(): TabelaPrecos {
  const path = precosPath();
  if (!existsSync(path)) return PRECOS_PADRAO;
  try {
    const saved = JSON.parse(readFileSync(path, "utf8")) as Partial<TabelaPrecos>;
    return {
      ...PRECOS_PADRAO,
      ...saved,
      llm: { ...PRECOS_PADRAO.llm, ...(saved.llm ?? {}) },
      coleta: { ...PRECOS_PADRAO.coleta, ...(saved.coleta ?? {}) },
    };
  } catch {
    return PRECOS_PADRAO;
  }
}

export function savePrecos(tabela: TabelaPrecos): void {
  const path = precosPath();
  mkdirSync(join(dataDir(), "config"), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(tabela, null, 2), "utf8");
  renameSync(tmp, path);
}

/** Preço do modelo: casa o PREFIXO mais longo; desconhecido → "padrao". */
export function precoDoModelo(modelo: string | undefined, tabela: TabelaPrecos = getPrecos()): PrecoLLM {
  const id = (modelo ?? "").toLowerCase();
  let melhor: { chave: string; preco: PrecoLLM } | null = null;
  for (const [chave, preco] of Object.entries(tabela.llm)) {
    if (chave === "padrao") continue;
    if (id.startsWith(chave) && (!melhor || chave.length > melhor.chave.length)) {
      melhor = { chave, preco };
    }
  }
  return melhor?.preco ?? tabela.llm.padrao ?? PRECOS_PADRAO.llm.padrao;
}

/** Custo estimado (USD) de uma chamada LLM pela tabela vigente. */
export function custoLLM(
  modelo: string | undefined,
  tokens: { in?: number; out?: number; cache_read?: number; cache_write?: number },
  tabela: TabelaPrecos = getPrecos(),
): number {
  const p = precoDoModelo(modelo, tabela);
  const M = 1_000_000;
  return (
    ((tokens.in ?? 0) / M) * p.input_usd_mtok +
    ((tokens.out ?? 0) / M) * p.output_usd_mtok +
    ((tokens.cache_read ?? 0) / M) * (p.cache_read_usd_mtok ?? p.input_usd_mtok * 0.1) +
    ((tokens.cache_write ?? 0) / M) * (p.cache_write_usd_mtok ?? p.input_usd_mtok * 1.25)
  );
}

/** Custo estimado (USD) de coleta (páginas raspadas / resultados de busca). */
export function custoColeta(
  unidades: number,
  tipo: "pagina" | "busca",
  tabela: TabelaPrecos = getPrecos(),
): number {
  const preco = tipo === "pagina" ? tabela.coleta.firecrawl_pagina_usd : tabela.coleta.firecrawl_busca_usd;
  return unidades * preco;
}
