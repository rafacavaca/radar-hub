/**
 * CONTEXTO DE ORG DO COLETOR (item 2 — rework do loop). O cron roda SEM sessão
 * de usuário, mas TODO acesso a dado precisa de org explícita. Este módulo dá o
 * escopo: `runAsOrgCollector(orgId, fn)` marca o trecho com a org em execução
 * (AsyncLocalStorage — não vaza entre execuções concorrentes) e `session.ts`
 * honra a marca: `currentOrgId()` devolve a org do coletor e o cliente de banco
 * vira o admin (service_role).
 *
 * REGRAS DE SEGURANÇA (o candidato nº 1 a furo de isolamento):
 *  - Só roda em CONTEXTO ADMIN comprovado (cron com RADAR_ADMIN_CONTEXT=1 ou
 *    runAsAdmin) — fora disso, LANÇA. O caminho do usuário nunca entra aqui.
 *  - Como o admin ignora a RLS, TODA leitura dos repos carrega filtro EXPLÍCITO
 *    `.eq("org_id", currentOrgId())` (defesa dupla: RLS no caminho do usuário,
 *    filtro explícito no do coletor). Repo novo DEVE seguir a convenção.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import { adminClient } from "@/lib/db/admin-client";

const orgALS = new AsyncLocalStorage<{ orgId: string }>();

/** A org do coletor em execução, se estamos dentro de runAsOrgCollector. */
export function collectorOrgId(): string | null {
  return orgALS.getStore()?.orgId ?? null;
}

/**
 * Roda `fn` escopado à org indicada (cron/coletor). Exige contexto admin —
 * criar o adminClient valida isso (lança fora de cron/runAsAdmin).
 */
export async function runAsOrgCollector<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
  if (!orgId) throw new Error("runAsOrgCollector: orgId obrigatório (o coletor opera org explícita).");
  adminClient(); // valida o contexto admin ANTES de escopar (lança barulhento)
  return orgALS.run({ orgId }, fn);
}

/** As orgs existentes (para o cron iterar). Só em contexto admin. */
export async function listOrgsAsCollector(): Promise<Array<{ id: string; slug: string; name: string }>> {
  const sb = adminClient();
  const { data, error } = await sb.from("orgs").select("id, slug, name").order("created_at", { ascending: true });
  if (error) throw new Error(`coletor: falha ao listar orgs: ${error.message}`);
  return (data ?? []) as Array<{ id: string; slug: string; name: string }>;
}
