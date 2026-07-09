/**
 * CONTEXTO de atribuição da medição de custo — AsyncLocalStorage.
 *
 * O problema: as chamadas caras (LLM no `gateway.ts`, coleta no `firecrawl.ts`)
 * ficam FUNDO, sob ~26 pontos de chamada. Passar {cliente, feature, entidade}
 * por todas as assinaturas seria invasivo e frágil. Em vez disso, os PONTOS DE
 * ENTRADA (loop, diagnóstico, relatório, pergunta) estabelecem um contexto
 * ambiente; os wrappers baratos o LEEM na hora de gravar o usage_event.
 *
 * É a ferramenta certa pra uma preocupação transversal (instrumentação), sem
 * esconder regra de negócio: o contexto só carrega ROTULOS (ids/nomes), nada
 * de conteúdo. Fora de um `runWithUsage`, o contexto é undefined e o evento é
 * gravado sem atribuição (contado no total, honesto).
 */

import { AsyncLocalStorage } from "node:async_hooks";

/** Rótulos de atribuição — SÓ metadados (jamais o conteúdo do prompt/sinal). */
export type UsageContext = {
  /** tenant (multi-tenant, item 2). Ausente hoje = org única "Formare". */
  orgId?: string;
  /** cliente do Radar a quem a chamada serve (ex.: "Moovefy"). */
  clientName?: string;
  /** balde de custo: "briefing" | "diagnostico" | "lente_1..4" | "correlacao"
   *  | "relatorio" | "digest" | "coleta" | "pergunta" | "descoberta" | ... */
  feature?: string;
  /** sub-etapa opcional dentro da feature (ex.: "swot", "preco"). */
  etapa?: string;
  entidadeTipo?: "concorrente" | "conta" | "geral";
  entidadeId?: string;
  entidadeNome?: string;
};

// Ancorada em globalThis — o runtime do cron (tsx) pode carregar o módulo duas
// vezes (interop ESM/CJS); cada cópia com a própria ALS perderia a atribuição.
declare global {
  var __radarUsageALS: AsyncLocalStorage<UsageContext> | undefined;
}
const storage: AsyncLocalStorage<UsageContext> = (globalThis.__radarUsageALS ??=
  new AsyncLocalStorage<UsageContext>());

/** O contexto vigente (ou undefined fora de um `runWithUsage`). */
export function getUsageContext(): UsageContext | undefined {
  return storage.getStore();
}

/**
 * Roda `fn` com o contexto ambiente MESCLADO sobre o atual (chamadas aninhadas
 * herdam e sobrescrevem). Assíncrono-transparente: vale por toda a árvore de
 * awaits dentro de `fn`. Nunca altera o comportamento de `fn` — só o rotula.
 */
export function runWithUsage<T>(partial: UsageContext, fn: () => T): T {
  const base = storage.getStore() ?? {};
  return storage.run({ ...base, ...partial }, fn);
}

/** Provider derivado do id do modelo — a régua honesta do mix (Claude × DeepSeek). */
export function providerDoModelo(modelo: string | undefined): string {
  const id = (modelo ?? "").toLowerCase();
  if (id.startsWith("claude")) return "claude";
  if (id.startsWith("deepseek")) return "deepseek";
  if (id.startsWith("gpt") || id.startsWith("o1") || id.startsWith("o3")) return "openai";
  return id ? id.split(/[-/]/)[0] : "desconhecido";
}
