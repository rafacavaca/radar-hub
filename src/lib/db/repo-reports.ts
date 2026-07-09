/**
 * REPOSITÓRIO Supabase dos relatórios (item 2 — cutover). Envelope jsonb em
 * `reports.data`; colunas reais (org_id, client_id, kind, share_token) para
 * isolamento/consulta. RLS escopa por org da sessão.
 *
 * Link público (/r/<token>): SEM sessão a RLS (corretamente) não devolve nada —
 * a leitura pública vai pela função capability `report_by_share_token` (002),
 * que devolve exatamente o relatório daquele token. Sem god-key na rota.
 */

import { supabaseRouteClient, currentOrgId } from "@/lib/db/session";
import type { Report } from "@/lib/reports";

/** Relatórios da org do contexto (opcionalmente de um cliente), novos primeiro. */
export async function sbListReports(clientName?: string): Promise<Report[]> {
  try {
    const orgId = await currentOrgId();
    if (!orgId) return [];
    const sb = await supabaseRouteClient();
    let q = sb.from("reports").select("data").eq("org_id", orgId).order("created_at", { ascending: false });
    if (clientName) q = q.eq("client_id", clientName);
    const { data, error } = await q;
    if (error || !data) return [];
    return data.map((r) => (r as { data: Report }).data).filter(Boolean);
  } catch {
    return [];
  }
}

/** Um relatório por id, na org do contexto. */
export async function sbGetReport(id: string): Promise<Report | null> {
  try {
    const orgId = await currentOrgId();
    if (!orgId) return null;
    const sb = await supabaseRouteClient();
    const { data, error } = await sb
      .from("reports")
      .select("data")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { data: Report }).data ?? null;
  } catch {
    return null;
  }
}

/** Grava (upsert) o relatório na org da sessão. */
export async function sbSaveReport(report: Report): Promise<Report> {
  const orgId = await currentOrgId();
  if (!orgId) throw new Error("Sem org na sessão — não há onde gravar o relatório.");
  const sb = await supabaseRouteClient();
  const { error } = await sb.from("reports").upsert(
    {
      id: report.id,
      org_id: orgId,
      client_id: report.clientName || null,
      kind: report.kind ?? null,
      share_token: report.shareToken ?? null,
      data: report,
      created_at: report.createdAt,
    },
    { onConflict: "org_id,id" },
  );
  if (error) throw new Error(`relatório: falha ao gravar: ${error.message}`);
  return report;
}

/** Apaga um relatório da org do contexto. Lança se não existe (na org). */
export async function sbDeleteReport(id: string): Promise<void> {
  const orgId = await currentOrgId();
  if (!orgId) throw new Error("Sem org no contexto — não há onde apagar o relatório.");
  const sb = await supabaseRouteClient();
  const { data, error } = await sb.from("reports").delete().eq("org_id", orgId).eq("id", id).select("id");
  if (error) throw new Error(`relatório: falha ao apagar: ${error.message}`);
  if (!data || data.length === 0) throw new Error("Relatório não encontrado.");
}

/**
 * Leitura PÚBLICA por share-token (capability). Usa a função SECURITY DEFINER
 * da migração 002; se ela ainda não foi aplicada, devolve null (link "não
 * encontrado" — falha honesta, sem vazar nada).
 */
export async function sbGetReportByShareToken(token: string): Promise<Report | null> {
  try {
    const sb = await supabaseRouteClient(); // anon serve — a capability é o token
    const { data, error } = await sb.rpc("report_by_share_token", { p_token: token });
    if (error || !data) return null;
    return data as Report;
  } catch {
    return null;
  }
}
