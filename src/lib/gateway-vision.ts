/**
 * Cliente da VISÃO por IA — o endpoint ISOLADO do motor (F11).
 * POST {LLM_GATEWAY_URL}/complete-vision  ·  Bearer {LLM_GATEWAY_SECRET}
 * body { system?, prompt, images:[{media_type,data(base64)}], model? } -> { content }
 *
 * É o mesmo motor Claude (por assinatura), mas por um caminho separado do texto
 * do Formare: fila própria no gateway e SEM mexer no disjuntor de texto. Aqui a
 * gente só consome; a segurança/isolamento é garantida no servidor.
 */

export type VisionImage = { media_type: "image/png" | "image/jpeg" | "image/webp"; data: string };

export async function analyzeImagesViaGateway(opts: {
  prompt: string;
  images: VisionImage[];
  system?: string;
  model?: string;
  timeoutMs?: number;
}): Promise<string> {
  const base = process.env.LLM_GATEWAY_URL;
  if (!base) throw new Error("LLM_GATEWAY_URL não configurado");
  if (!opts.prompt) throw new Error("prompt obrigatório");
  if (!opts.images?.length) throw new Error("images obrigatório");

  const secret = process.env.LLM_GATEWAY_SECRET ?? "";
  const timeout = opts.timeoutMs ?? 130000;

  const res = await fetch(`${base.replace(/\/+$/, "")}/complete-vision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({
      system: opts.system,
      prompt: opts.prompt,
      images: opts.images,
      model: opts.model,
    }),
    signal: AbortSignal.timeout(timeout),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`gateway-vision ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { content?: string; error?: string };
  if (data.error) throw new Error(`gateway-vision: ${data.error}`);
  if (!data.content) throw new Error("gateway-vision: resposta sem conteúdo");
  return data.content;
}
