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
 * Tudo com a ANON key (RLS aplica). Nunca service_role aqui — isto é o caminho
 * do usuário. Ativo só quando supabaseEnabled().
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

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

/** Cliente ligado aos cookies do request (route handler / server component). */
export async function supabaseRouteClient(): Promise<SupabaseClient> {
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
