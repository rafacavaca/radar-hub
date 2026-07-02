/**
 * Cliente do gateway (motor Claude na VPS, reuso do Formare).
 * POST {LLM_GATEWAY_URL}/complete  · Authorization: Bearer {LLM_GATEWAY_SECRET}
 * body { system, prompt, model?, effort? }  ->  200 { content, usage, cost, model, latency_ms }
 * temperature/max_tokens sao IGNORADOS pelo gateway; o servidor forca guarda pt-BR.
 */
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
  const data = (await res.json()) as { content?: string; error?: string };
  if (data.error) throw new Error(`gateway: ${data.error}`);
  if (!data.content) throw new Error("gateway: resposta sem conteúdo");
  return data.content;
}
