/**
 * CAMINHO DO COLETOR (item 2) — o cron da VPS escreve sinais SEM sessão de
 * usuário. Em vez de espalhar service_role, passa pela função controlada
 * `collector_insert_signal(org_id EXPLÍCITO, …)` (SECURITY DEFINER, superfície
 * mínima). O org_id vem da linha da watchlist que originou a coleta — nunca
 * "adivinhado". Roda só em contexto admin (cron/script marca RADAR_ADMIN_CONTEXT).
 *
 * É o candidato nº 1 a virar furo de isolamento — por isso é um ÚNICO ponto,
 * auditável, com org_id obrigatório (a função no banco recusa org nulo).
 */

import { adminClient } from "@/lib/db/admin-client";

export type CollectorSignal = {
  id: string;
  clientId?: string;
  competitorId?: string;
  ts?: string;
  data: Record<string, unknown>;
};

/**
 * Grava um sinal na org indicada, pelo caminho controlado. `orgId` é
 * obrigatório — sem org, não grava (a função no banco também barra). Lança em
 * erro real (o cron registra e segue; não deixa passar silencioso).
 */
export async function insertSignalAsCollector(orgId: string, signal: CollectorSignal): Promise<void> {
  if (!orgId) throw new Error("insertSignalAsCollector: orgId obrigatório (o coletor grava org explícita).");
  const sb = adminClient(); // exige RADAR_ADMIN_CONTEXT=1 (cron/script) — nunca no fluxo do usuário
  const { error } = await sb.rpc("collector_insert_signal", {
    p_org_id: orgId,
    p_id: signal.id,
    p_client_id: signal.clientId ?? null,
    p_competitor_id: signal.competitorId ?? null,
    p_ts: signal.ts ?? null,
    p_data: signal.data ?? {},
  });
  if (error) throw new Error(`coletor: falha ao gravar sinal ${signal.id} na org ${orgId}: ${error.message}`);
}
