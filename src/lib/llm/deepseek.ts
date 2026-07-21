/**
 * Cliente DeepSeek (API OpenAI-compatível) — o outro caminho do roteador do
 * motor LLM. É o provider PADRÃO do Radar quando escolhido (ver gateway.ts +
 * provider.ts). O Claude segue INTACTO no gateway.ts; aqui não se mexe nele.
 *
 * POST {DEEPSEEK_BASE_URL}/chat/completions · Authorization: Bearer {DEEPSEEK_API_KEY}
 * body { model, messages:[{role,content}], stream:false } -> choices[0].message.content
 * effort:"high" → deepseek-reasoner (R1); senão deepseek-chat (V3) — mesma régua
 * de "tarefa mais dura → modelo mais forte" do gateway.
 *
 * MEDIÇÃO DE CUSTO: grava usage_event como o gateway (recordLLMUsage). A tabela
 * de preços já conhece o prefixo "deepseek" e providerDoModelo o rotula certo —
 * o /custo mostra o mix Claude × DeepSeek sem mais nada.
 */

import { recordLLMUsage } from "@/lib/usage/store";

const BASE = () => (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
const MODEL_CHAT = () => process.env.DEEPSEEK_MODEL || "deepseek-chat";
const MODEL_REASONER = () => process.env.DEEPSEEK_MODEL_REASONER || "deepseek-reasoner";

/** Há chave DeepSeek configurada? O roteador degrada pro Claude se não houver. */
export function deepseekConfigured(): boolean {
  return Boolean((process.env.DEEPSEEK_API_KEY ?? "").trim());
}

type DeepSeekUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
};

export async function completeViaDeepSeek(opts: {
  prompt: string;
  system?: string;
  effort?: "low" | "medium" | "high";
  timeoutMs?: number;
}): Promise<string> {
  const key = (process.env.DEEPSEEK_API_KEY ?? "").trim();
  if (!key) throw new Error("DEEPSEEK_API_KEY não configurado");
  if (!opts.prompt) throw new Error("prompt obrigatório");

  const model = opts.effort === "high" ? MODEL_REASONER() : MODEL_CHAT();
  const timeout = opts.timeoutMs ?? Number(process.env.LLM_GATEWAY_TIMEOUT_MS ?? 65000);
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.prompt });

  const res = await fetch(`${BASE()}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, stream: false }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`deepseek ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: DeepSeekUsage;
    model?: string;
    error?: { message?: string };
  };
  if (data.error) throw new Error(`deepseek: ${data.error.message ?? "erro"}`);
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("deepseek: resposta sem conteúdo");

  // medição (invisível, não bloqueia): tokens → custo pela tabela.
  recordLLMUsage({
    modelo: data.model || model,
    tokensIn: data.usage?.prompt_tokens,
    tokensOut: data.usage?.completion_tokens,
    cacheRead: data.usage?.prompt_cache_hit_tokens,
  });

  return content;
}
