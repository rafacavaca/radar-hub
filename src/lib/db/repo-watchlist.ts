/**
 * REPOSITÓRIO Supabase da watchlist (item 2 — cutover). Envelope jsonb: o
 * documento COMPLETO de cada cliente (com concorrentes) vive em `clients.data`,
 * então a forma que o app já usa (Watchlist) round-trips sem normalizar. A RLS
 * escopa por org — a leitura devolve só os clientes da org da sessão.
 *
 * Só é chamado em modo Supabase (o dispatch está em watchlist.ts). Leitura via
 * userClient (RLS); escrita idem, na org ativa da sessão.
 */

import { supabaseRouteClient, currentOrgId } from "@/lib/db/session";
import type { Watchlist, WatchClient } from "@/lib/watchlist";

/**
 * Lê a watchlist da org do contexto (RLS na sessão; filtro explícito no
 * coletor). Vazio => { clients: [] }.
 */
export async function sbReadWatchlist(): Promise<Watchlist> {
  const orgId = await currentOrgId();
  if (!orgId) return { clients: [] };
  const sb = await supabaseRouteClient();
  const { data, error } = await sb
    .from("clients")
    .select("data")
    .eq("org_id", orgId)
    .order("name", { ascending: true });
  if (error || !data) return { clients: [] };
  return { clients: data.map((r) => (r as { data: WatchClient }).data).filter(Boolean) };
}

/**
 * Grava a watchlist INTEIRA na org ativa (mesma semântica do writeWatchlist
 * JSON): upsert de cada cliente + apaga os que sumiram. org_id explícito; a RLS
 * (WITH CHECK) impede gravar em org alheia.
 */
export async function sbWriteWatchlist(watchlist: Watchlist): Promise<void> {
  const orgId = await currentOrgId();
  if (!orgId) throw new Error("Sem org na sessão — não há onde gravar a watchlist.");
  const sb = await supabaseRouteClient();

  const rows = watchlist.clients.map((c) => ({
    id: c.name,
    org_id: orgId,
    name: c.name,
    mode: c.mode ?? "concorrentes",
    data: c,
  }));
  if (rows.length > 0) {
    const { error } = await sb.from("clients").upsert(rows, { onConflict: "org_id,id" });
    if (error) throw new Error(`watchlist: falha ao gravar clientes: ${error.message}`);
  }

  // apaga clientes que não estão mais na watchlist (dentro da org, via RLS).
  const keep = watchlist.clients.map((c) => c.name);
  let del = sb.from("clients").delete().eq("org_id", orgId);
  if (keep.length > 0) del = del.not("id", "in", `(${keep.map((k) => `"${k.replace(/"/g, '""')}"`).join(",")})`);
  const { error: delErr } = await del;
  if (delErr) throw new Error(`watchlist: falha ao limpar clientes removidos: ${delErr.message}`);
}
