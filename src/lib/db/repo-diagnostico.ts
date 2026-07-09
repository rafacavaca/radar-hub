/**
 * REPOSITÓRIO Supabase dos diagnósticos (item 2 — cutover). Envelope jsonb:
 * o DiagnosticoConcorrente completo vive em `diagnostics.data`; as colunas
 * reais (org_id, client_id, competitor_id) servem ao isolamento e à consulta.
 * RLS escopa por org da sessão — mesmo padrão provado na watchlist.
 */

import { supabaseRouteClient, currentOrgId } from "@/lib/db/session";
import type { DiagnosticoConcorrente } from "@/lib/diagnostico/schema";

/** Diagnósticos de um cliente, na org do contexto (RLS + filtro explícito). Nunca lança. */
export async function sbListDiagnosticos(clientName: string): Promise<DiagnosticoConcorrente[]> {
  try {
    const orgId = await currentOrgId();
    if (!orgId) return [];
    const sb = await supabaseRouteClient();
    const { data, error } = await sb
      .from("diagnostics")
      .select("data")
      .eq("org_id", orgId)
      .eq("client_id", clientName);
    if (error || !data) return [];
    return data.map((r) => (r as { data: DiagnosticoConcorrente }).data).filter(Boolean);
  } catch {
    return [];
  }
}

/** O diagnóstico de um concorrente, na org do contexto (RLS + filtro explícito). Nunca lança. */
export async function sbGetDiagnostico(
  clientName: string,
  concorrenteId: string,
): Promise<DiagnosticoConcorrente | null> {
  try {
    const orgId = await currentOrgId();
    if (!orgId) return null;
    const sb = await supabaseRouteClient();
    const { data, error } = await sb
      .from("diagnostics")
      .select("data")
      .eq("org_id", orgId)
      .eq("client_id", clientName)
      .eq("competitor_id", concorrenteId)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { data: DiagnosticoConcorrente }).data ?? null;
  } catch {
    return null;
  }
}

/** Salva (upsert) o diagnóstico na org da sessão. org_id explícito; RLS valida. */
export async function sbSaveDiagnostico(diag: DiagnosticoConcorrente): Promise<DiagnosticoConcorrente> {
  const orgId = await currentOrgId();
  if (!orgId) throw new Error("Sem org na sessão — não há onde gravar o diagnóstico.");
  const sb = await supabaseRouteClient();
  const { error } = await sb.from("diagnostics").upsert(
    {
      id: diag.concorrente_id,
      org_id: orgId,
      client_id: diag.clientName,
      competitor_id: diag.concorrente_id,
      data: diag,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,id" },
  );
  if (error) throw new Error(`diagnóstico: falha ao gravar ${diag.concorrente_nome}: ${error.message}`);
  return diag;
}
