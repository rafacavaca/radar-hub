/**
 * ROTEADOR DO MOTOR LLM. `completeViaGateway` é o ponto único por onde TODA
 * chamada de IA do Radar passa (22 arquivos). O provider é POR-ORG (DeepSeek por
 * padrão; Claude opção + fallback — ver lib/llm/provider.ts). O Claude segue
 * INTACTO neste arquivo (`completeViaClaudeGateway`, a subscrição via gateway na
 * VPS); só deixou de ser o único caminho. Assinatura idêntica — nada nos
 * chamadores muda.
 *
 * Resiliência: tenta o provider EFETIVO; se falhar, cai no OUTRO disponível
 * (Claude nunca é removido). Se nenhum estiver configurado, lança claro.
 *
 * MEDIÇÃO DE CUSTO (item 1): cada completion grava um usage_event (tokens +
 * custo estimado), atribuído ao contexto ambiente. Fire-and-forget.
 */

import { completeViaDeepSeek, deepseekConfigured } from "@/lib/llm/deepseek";
import { effectiveProvider } from "@/lib/llm/provider";
import { recordLLMUsage } from "@/lib/usage/store";

export type CompleteOpts = {
  prompt: string;
  system?: string;
  model?: string;                     // Claude: ex. "claude-opus-4-8" (DeepSeek ignora; usa effort→modelo)
  effort?: "low" | "medium" | "high";
  timeoutMs?: number;
};

/** usage do Claude Agent SDK (o que o gateway repassa). */
type GatewayUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

function claudeConfigured(): boolean {
  return Boolean(process.env.LLM_GATEWAY_URL);
}

/**
 * O caminho CLAUDE — subscrição via gateway na VPS (reuso do Formare). INTACTO.
 * POST {LLM_GATEWAY_URL}/complete · Bearer {LLM_GATEWAY_SECRET}
 * body { system, prompt, model?, effort? } -> 200 { content, usage, cost, model, latency_ms }
 * temperature/max_tokens são IGNORADOS pelo gateway; o servidor força guarda pt-BR.
 */
async function completeViaClaudeGateway(opts: CompleteOpts): Promise<string> {
  const base = process.env.LLM_GATEWAY_URL;
  if (!base) throw new Error("LLM_GATEWAY_URL não configurado");
  if (!opts.prompt) throw new Error("prompt obrigatório");
  const secret = process.env.LLM_GATEWAY_SECRET ?? "";
  const timeout = opts.timeoutMs ?? Number(process.env.LLM_GATEWAY_TIMEOUT_MS ?? 65000);
  const res = await fetch(`${base.replace(/\/+$/, "")}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
    body: JSON.stringify({ system: opts.system, prompt: opts.prompt, model: opts.model, effort: opts.effort }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error(`gateway ${res.status}: ${t.slice(0, 200)}`); }
  const data = (await res.json()) as {
    content?: string;
    error?: string;
    usage?: GatewayUsage;
    cost?: number;
    model?: string;
    latency_ms?: number;
  };
  if (data.error) throw new Error(`gateway: ${data.error}`);
  if (!data.content) throw new Error("gateway: resposta sem conteúdo");

  recordLLMUsage({
    modelo: data.model,
    tokensIn: data.usage?.input_tokens,
    tokensOut: data.usage?.output_tokens,
    cacheRead: data.usage?.cache_read_input_tokens,
    cacheWrite: data.usage?.cache_creation_input_tokens,
    custoProvedor: typeof data.cost === "number" ? data.cost : undefined,
    latenciaMs: data.latency_ms,
  });

  return data.content;
}

/**
 * Ordem de tentativa dos providers DISPONÍVEIS: o alvo (efetivo) primeiro, o
 * outro como fallback — filtrando os não-configurados. Pura → testável.
 */
export function ordemProviders(
  alvo: "deepseek" | "claude",
  disp: { deepseek: boolean; claude: boolean },
): Array<"deepseek" | "claude"> {
  const ordem: Array<"deepseek" | "claude"> = alvo === "deepseek" ? ["deepseek", "claude"] : ["claude", "deepseek"];
  return ordem.filter((p) => disp[p]);
}

export async function completeViaGateway(opts: CompleteOpts): Promise<string> {
  if (!opts.prompt) throw new Error("prompt obrigatório");
  const alvo = await effectiveProvider();
  const ordem = ordemProviders(alvo, { deepseek: deepseekConfigured(), claude: claudeConfigured() });
  if (ordem.length === 0) {
    throw new Error("nenhum provider LLM configurado (defina DEEPSEEK_API_KEY e/ou LLM_GATEWAY_URL)");
  }
  const runner: Record<"deepseek" | "claude", () => Promise<string>> = {
    deepseek: () => completeViaDeepSeek(opts),
    claude: () => completeViaClaudeGateway(opts),
  };

  let ultimoErro: unknown;
  for (let i = 0; i < ordem.length; i++) {
    try {
      return await runner[ordem[i]]();
    } catch (err) {
      ultimoErro = err;
      if (ordem[i + 1]) {
        console.warn(`[llm] ${ordem[i]} falhou (${(err as Error).message?.slice(0, 120)}); fallback → ${ordem[i + 1]}`);
      }
    }
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error(String(ultimoErro));
}
