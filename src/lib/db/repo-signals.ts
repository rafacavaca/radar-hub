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
 * Lê o HISTÓRICO DURÁVEL de sinais de um cliente (tabela `signals`), ORG-SCOPED.
 * É daqui que o Feed lê — nada some: a tabela guarda tudo (upsert, nunca poda);
 * o Briefing continua lendo o cache curado. O evento inteiro vive em `data` (o
 * mesmo `ClientEvent` do loop) → volta pronto pra tela. Ordenado por ts desc
 * (usa o índice `signals(org_id, client_id, ts desc)`). Teto ALTO só por
 * segurança de UI (o histórico cresce; a retenção real é ilimitada no banco).
 * Nunca lança — leitura honesta e vazia sem org.
 */
export async function loadSignals(clientName: string, opts: { limite?: number } = {}): Promise<ClientEvent[]> {
  if (!clientName) return [];
  try {
    const orgId = await currentOrgId();
    if (!orgId) return [];
    const sb = await supabaseRouteClient();
    const { data, error } = await sb
      .from("signals")
      .select("data")
      .eq("org_id", orgId) // defesa dupla com a RLS: isolamento por agência
      .eq("client_id", clientName)
      .order("ts", { ascending: false })
      .limit(opts.limite ?? 2000);
    if (error || !data) return [];
    return (data as Array<{ data: ClientEvent | null }>).map((r) => r.data).filter((e): e is ClientEvent => Boolean(e));
  } catch {
    return [];
  }
}

/**
 * Quantos sinais deste cliente foram COLETADOS depois de `sinceIso` — alimenta
 * o "N novidades desde sua última visita". Org-scoped, count-only (barato, usa
 * o índice por ts). Nunca lança.
 */
export async function countSignalsSince(clientName: string, sinceIso: string): Promise<number> {
  if (!clientName || !sinceIso) return 0;
  try {
    const orgId = await currentOrgId();
    if (!orgId) return 0;
    const sb = await supabaseRouteClient();
    const { count, error } = await sb
      .from("signals")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("client_id", clientName)
      .gt("ts", sinceIso);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
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
