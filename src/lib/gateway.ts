/**
 * Cliente do gateway (motor Claude na VPS, reuso do Formare).
 * POST {LLM_GATEWAY_URL}/complete  · Authorization: Bearer {LLM_GATEWAY_SECRET}
 * body { system, prompt, model?, effort? }  ->  200 { content, usage, cost, model, latency_ms }
 * temperature/max_tokens sao IGNORADOS pelo gateway; o servidor forca guarda pt-BR.
 *
 * MEDIÇÃO DE CUSTO (item 1): toda completion grava um usage_event (tokens +
 * custo estimado), atribuído ao contexto ambiente (cliente/feature/entidade).
 * O log é fire-and-forget — não adiciona latência à resposta.
 */

import { recordLLMUsage } from "@/lib/usage/store";

/** usage do Claude Agent SDK (o que o gateway repassa). */
type GatewayUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

export async function completeViaGateway(opts: {
  prompt: string;
  system?: string;
  model?: string;                     // ex.: "claude-opus-4-8"; omitir usa o default (sonnet-4-6)
  effort?: "low" | "medium" | "high";
  timeoutMs?: number;
}): Promise<string> {
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

  // medição (invisível, não bloqueia): tokens + custo, atribuídos ao contexto.
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
