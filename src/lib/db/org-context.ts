/**
 * CONTEXTO DE ORG do usuário logado (item 2). Resolve, a partir da sessão
 * (JWT), a(s) org(s) e o papel do usuário — lendo `memberships` pelo
 * userClient, então a própria RLS já garante que ele só enxerga o que é dele.
 *
 * O caminho do usuário SEMPRE opera com userClient(token): a org não é um filtro
 * que o app "escolhe aplicar" (isso seria isolamento só na UI) — é a RLS do
 * banco que recusa qualquer linha de outra org. Este módulo só DESCOBRE a org
 * ativa (pra rotular a tela e para escritas saberem em qual org gravar).
 */

import { supabaseEnabled, userClient } from "@/lib/db/supabase";

export type OrgMembership = { orgId: string; orgSlug: string; orgName: string; role: string };

/**
 * As orgs do usuário da sessão. Vazio se não logado, sem membership, ou
 * multi-tenant desligado. Nunca lança (falha de rede → vazio, o app degrada).
 */
export async function orgsForSession(accessToken: string | undefined): Promise<OrgMembership[]> {
  if (!supabaseEnabled() || !accessToken) return [];
  try {
    const sb = userClient(accessToken);
    // RLS: memberships só devolve as do próprio usuário; join em orgs idem.
    const { data, error } = await sb
      .from("memberships")
      .select("role, org_id, orgs(id, slug, name)")
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return data.flatMap((row) => {
      const m = row as unknown as { role?: string; orgs?: unknown };
      // PostgREST devolve o embed de um-para-muitos como objeto; a inferência
      // sem tipos gerados pode vê-lo como array — normalizamos os dois casos.
      const orgRaw = Array.isArray(m.orgs) ? m.orgs[0] : m.orgs;
      const org = orgRaw as { id: string; slug: string; name: string } | undefined;
      if (!org?.id) return [];
      return [{ orgId: org.id, orgSlug: org.slug, orgName: org.name, role: String(m.role ?? "member") }];
    });
  } catch {
    return [];
  }
}

/**
 * A org ATIVA da sessão: a preferida (cookie/ seleção) se o usuário pertence a
 * ela; senão a primeira. `null` se ele não tem org. Para single-org (o comum),
 * é simplesmente a única.
 */
export async function activeOrg(
  accessToken: string | undefined,
  preferredOrgId?: string,
): Promise<OrgMembership | null> {
  const orgs = await orgsForSession(accessToken);
  if (orgs.length === 0) return null;
  if (preferredOrgId) {
    const match = orgs.find((o) => o.orgId === preferredOrgId);
    if (match) return match;
  }
  return orgs[0];
}
