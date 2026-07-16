/**
 * Cliente Supabase para o PROXY (edge middleware, Next 16). EDGE-SAFE: usa só
 * @supabase/ssr + next/server (NUNCA next/headers, que é proibido no edge).
 *
 * Devolve o supabase + o `response` mutável onde os cookies REFRESCADOS são
 * regravados (o @supabase/ssr rotaciona o token expirado). O chamador valida
 * com `supabase.auth.getUser()` e devolve o `response`. ANON key → RLS aplica.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export function supabaseProxyClient(request: NextRequest): { supabase: SupabaseClient; getResponse: () => NextResponse } {
  const url = process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.RADAR_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list: CookieToSet[]) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  // BUG CORRIGIDO: `setAll` roda DEPOIS (dentro do getUser do chamador, quando o
  // token é refrescado) e REATRIBUI `response`. Se devolvêssemos o valor agora, o
  // chamador ficaria com o response VELHO (sem o Set-Cookie do token novo) — o
  // navegador nunca recebia o refresh, o refresh token rotacionado morria, e o
  // POST seguinte caía em 401. O getter fecha sobre a variável mutável e entrega
  // o response ATUAL (pós-refresh). É a causa raiz do "página concede, rota nega".
  return { supabase, getResponse: () => response };
}
