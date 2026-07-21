/**
 * PROVIDER DO MOTOR LLM (por-org) — DeepSeek por PADRÃO; o super_admin pode
 * trocar por Claude no /admin. O Claude NUNCA é removido: fica como opção e como
 * fallback automático (ver gateway.ts).
 *
 * Store: org_docs kind "org-config" key "provider" (mesma doc-família do digest)
 * — lido DENTRO do contexto da org (sessão/coletor), como as Automações. A
 * escrita de admin (org_id explícito, cross-org) vive em admin-ops.ts.
 *
 * Escopo POR-ORG (decisão do Rafael): o default deepseek já vale pra todas as
 * orgs; trocar é por agência. No modo clássico (sem Supabase) usa só o default.
 */

import { sbGetDoc } from "@/lib/db/repo-org-docs";
import { supabaseEnabled } from "@/lib/db/supabase";
import { deepseekConfigured } from "@/lib/llm/deepseek";

export type Provider = "deepseek" | "claude";
export const PROVIDERS: readonly Provider[] = ["deepseek", "claude"] as const;
export const PROVIDER_LABEL: Record<Provider, string> = { deepseek: "DeepSeek", claude: "Claude" };

const CFG_KIND = "org-config";
const CFG_KEY = "provider";

/** Default do sistema: env `LLM_PROVIDER` se for "claude"; senão DeepSeek. */
export function providerPadrao(): Provider {
  return (process.env.LLM_PROVIDER ?? "").toLowerCase() === "claude" ? "claude" : "deepseek";
}

export function sanitizarProvider(p: unknown): Provider {
  return p === "claude" ? "claude" : p === "deepseek" ? "deepseek" : providerPadrao();
}

/** O provider ESCOLHIDO pela org da sessão (ou o default). Nunca lança. */
export async function loadProvider(): Promise<Provider> {
  if (!supabaseEnabled()) return providerPadrao();
  try {
    const doc = await sbGetDoc<{ provider?: string } | null>(CFG_KIND, CFG_KEY, null);
    return sanitizarProvider(doc?.provider);
  } catch {
    return providerPadrao();
  }
}

/**
 * O provider EFETIVO que o roteador usa: o escolhido, mas se for DeepSeek sem
 * chave configurada, degrada pro Claude — os agentes nunca quebram por falta de
 * chave (e o Claude está sempre lá). O gateway.ts chama este.
 */
export async function effectiveProvider(): Promise<Provider> {
  const escolhido = await loadProvider();
  if (escolhido === "deepseek" && !deepseekConfigured()) return "claude";
  return escolhido;
}
