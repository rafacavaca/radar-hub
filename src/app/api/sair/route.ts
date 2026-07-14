/**
 * POST /api/sair — LOGOUT. Encerra a sessão: em modo Supabase, `signOut()` revoga
 * o refresh token e o adapter ssr limpa os cookies; em modo clássico, apaga o
 * cookie `radar_auth`. Depois, o proxy manda qualquer request pra /entrar.
 *
 * Importante para o piloto (usuários externos, possíveis dispositivos compartilhados).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { supabaseRouteClient } from "@/lib/db/session";
import { supabaseEnabled } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    if (supabaseEnabled()) {
      const sb = await supabaseRouteClient();
      await sb.auth.signOut();
    } else {
      const store = await cookies();
      store.delete("radar_auth");
    }
  } catch {
    // mesmo se o revoke remoto falhar, os cookies são limpos pelo adapter/delete.
  }
  return NextResponse.json({ ok: true });
}
