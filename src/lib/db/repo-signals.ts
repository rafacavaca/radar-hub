/**
 * SINAIS na tabela `signals` (item 2 — rework do loop). Os eventos crus que o
 * loop coleta ganham registro durável POR ORG (o cache do dia é derivado e
 * regenerável; a tabela é a história — e alimenta o ritual diário do item 3).
 *
 * Dois caminhos de escrita, ambos org-explícitos:
 *  - SESSÃO ("Rodar agora"): upsert em lote via cliente da sessão — a RLS
 *    (WITH CHECK) valida a org.
 *  - COLETOR (cron): a RPC `collector_insert_signal` (SECURITY DEFINER,
 *    superfície mínima, org obrigatória) — nunca god-key solta.
 *
 * Honestidade: falha aqui NÃO derruba a rodada (o resultado do dia já está no
 * cache) — mas é registrada em `failures` pra UI não fingir que gravou.
 */

import { collectorOrgId } from "@/lib/db/collector-org";
import { insertSignalAsCollector } from "@/lib/db/collector";
import { supabaseRouteClient, currentOrgId } from "@/lib/db/session";
import type { ClientEvent } from "@/lib/loop";

/** A forma persistida: colunas de isolamento + o evento inteiro em `data`. */
function toRow(orgId: string, event: ClientEvent) {
  return {
    id: event.id,
    org_id: orgId,
    client_id: event.clientName,
    competitor_id: event.source || null,
    ts: event.collectedAt ?? new Date().toISOString(),
    data: event as unknown as Record<string, unknown>,
  };
}

/**
 * Grava os eventos da rodada na org do contexto. Devolve mensagem de falha
 * (pra `failures[]`) em vez de lançar — sinal durável é registro, não gate.
 */
export async function persistSignals(events: ClientEvent[]): Promise<string | null> {
  if (events.length === 0) return null;
  try {
    const orgId = await currentOrgId();
    if (!orgId) return "sinais: sem org no contexto — nada gravado.";

    if (collectorOrgId()) {
      // cron: um a um pela porta estreita (idempotente — a RPC faz upsert).
      for (const event of events) {
        await insertSignalAsCollector(orgId, {
          id: event.id,
          clientId: event.clientName,
          competitorId: event.source || undefined,
          ts: event.collectedAt,
          data: event as unknown as Record<string, unknown>,
        });
      }
      return null;
    }

    // sessão: lote único; RLS valida a org.
    const sb = await supabaseRouteClient();
    const { error } = await sb
      .from("signals")
      .upsert(events.map((e) => toRow(orgId, e)), { onConflict: "org_id,id" });
    if (error) return `sinais: falha ao gravar (${error.message})`;
    return null;
  } catch (err) {
    return `sinais: falha ao gravar (${(err as Error).message})`;
  }
}
