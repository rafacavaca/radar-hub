/**
 * SESSÃO Supabase Auth no Next (item 2 — cutover). Dois adaptadores de cookie:
 *
 *  • supabaseRouteClient() — para route handlers / server components: lê e
 *    grava os cookies de sessão via next/headers. Usado no login (/api/entrar)
 *    e em qualquer código servidor que precise da sessão.
 *
 *  • supabaseProxyClient(request) — para o PROXY (edge middleware, Next 16): lê
 *    os cookies do request, e devolve também o response onde os cookies
 *    REFRESCADOS são regravados (o @supabase/ssr rotaciona o token expirado).
 *
 * Tudo com a ANON key (RLS aplica) — no caminho do USUÁRIO nunca service_role.
 * Ativo só quando supabaseEnabled().
 *
 * EXCEÇÃO ÚNICA E ESCOPADA (rework do loop): dentro de `runAsOrgCollector`
 * (cron, contexto admin comprovado), o cliente vira o admin e `currentOrgId()`
 * devolve a org do coletor — assim os MESMOS repos servem sessão e cron. Como o
 * admin ignora a RLS, todo repo lê com filtro explícito `.eq("org_id", …)`.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient } from "@/lib/db/admin-client";
import { collectorOrgId } from "@/lib/db/collector-org";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function url(): string {
  const u = process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!u) throw new Error("RADAR_SUPABASE_URL ausente");
  return u;
}
function anon(): string {
  const k = process.env.RADAR_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!k) throw new Error("RADAR_SUPABASE_ANON_KEY ausente");
  return k;
}

/**
 * Cliente do CONTEXTO DE EXECUÇÃO: sessão (cookies, RLS) no caminho do usuário;
 * admin escopado à org do coletor dentro de runAsOrgCollector (cron).
 */
export async function supabaseRouteClient(): Promise<SupabaseClient> {
  if (collectorOrgId()) return adminClient(); // cron: org explícita + filtros nos repos
  const store = await cookies();
  return createServerClient(url(), anon(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: CookieToSet[]) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          /* chamado de um server component (sem escrita) — ok, o proxy refresca */
        }
      },
    },
  });
}

/** O usuário logado (id + e-mail) ou null. Server-side. Nunca lança. */
export async function currentUser(): Promise<{ id: string; email?: string } | null> {
  try {
    const sb = await supabaseRouteClient();
    const { data } = await sb.auth.getUser();
    return data.user ? { id: data.user.id, email: data.user.email ?? undefined } : null;
  } catch {
    return null;
  }
}

/**
 * O usuário logado é super_admin? Usa a FUNÇÃO do banco `is_super_admin()`, que
 * checa `user_id = auth.uid() AND role='super_admin'`. NÃO dá pra consultar
 * `memberships` direto: a RLS deixa um membro VER os co-membros da própria org,
 * então "existe alguma linha super_admin visível" seria true pra qualquer um —
 * o furo. A RPC olha só o PRÓPRIO papel. Nunca lança.
 */
export async function isSuperAdmin(): Promise<boolean> {
  try {
    const sb = await supabaseRouteClient();
    const { data, error } = await sb.rpc("is_super_admin");
    return !error && data === true;
  } catch {
    return false;
  }
}

/**
 * A org ATIVA do contexto: a do COLETOR (dentro de runAsOrgCollector) ou a 1ª
 * membership da sessão (RLS só devolve as dele). Para escrever, é a org onde
 * grava. null se não logado/sem org.
 */
export async function currentOrgId(): Promise<string | null> {
  const collector = collectorOrgId();
  if (collector) return collector;
  try {
    const sb = await supabaseRouteClient();
    const { data } = await sb
      .from("memberships")
      .select("org_id, created_at")
      .order("created_at", { ascending: true })
      .limit(1);
    return (data?.[0] as { org_id?: string } | undefined)?.org_id ?? null;
  } catch {
    return null;
  }
}
