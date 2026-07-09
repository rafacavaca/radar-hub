/**
 * CLIENTES Supabase do Radar (item 2 — multi-tenant). Dois caminhos, separados
 * de propósito:
 *
 *  • userClient(accessToken) — opera com a SESSÃO do usuário (JWT). A RLS do
 *    banco decide o que ele vê: só as linhas da org dele. É o ÚNICO cliente que
 *    o caminho do usuário (rotas/páginas que servem o browser) pode usar.
 *
 *  • adminClient() — service_role. IGNORA a RLS. Por isso é uma GOD-KEY e
 *    NUNCA pode aparecer no fluxo do usuário. Só cron/coletor e server actions
 *    de admin, que rodam FORA de um request de usuário. Uma guarda em runtime
 *    (RADAR_ADMIN_CONTEXT=1) recusa criá-lo se esse selo não estiver posto —
 *    assim um import acidental numa rota de usuário falha barulhento, não
 *    silencioso.
 *
 * Ativação por FLAG: enquanto RADAR_DB != "supabase" (ou faltam chaves), o app
 * segue no armazenamento JSON single-tenant de hoje — nada quebra em produção.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function url(): string | undefined {
  return process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}
function anonKey(): string | undefined {
  return process.env.RADAR_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
function serviceKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/** O multi-tenant (Supabase) está ligado? Flag + chaves presentes. */
export function supabaseEnabled(): boolean {
  return process.env.RADAR_DB === "supabase" && !!url() && !!anonKey();
}

/**
 * Cliente na SESSÃO do usuário — RLS aplica. `accessToken` é o JWT da sessão
 * (vem do cookie do Supabase Auth). Sem token, é o papel `anon` (a RLS não
 * libera nada de nenhuma org — leitura vazia, honesto).
 */
export function userClient(accessToken?: string): SupabaseClient {
  const u = url();
  const k = anonKey();
  if (!u || !k) throw new Error("Supabase não configurado (RADAR_SUPABASE_URL / ANON_KEY).");
  return createClient(u, k, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {},
  });
}

/**
 * Cliente service_role (RLS-bypass). SÓ cron/coletor e admin server actions,
 * NUNCA no caminho do usuário. Recusa criar sem o selo RADAR_ADMIN_CONTEXT=1,
 * que só os scripts/ações de admin põem — a guarda contra vazar a god-key.
 */
export function adminClient(): SupabaseClient {
  if (process.env.RADAR_ADMIN_CONTEXT !== "1") {
    throw new Error(
      "adminClient() (service_role) fora de contexto admin. Ele IGNORA a RLS — " +
        "nunca no fluxo do usuário. Rode em cron/script/ação de admin com RADAR_ADMIN_CONTEXT=1.",
    );
  }
  const u = url();
  const k = serviceKey();
  if (!u || !k) throw new Error("Supabase admin não configurado (URL / SUPABASE_SERVICE_ROLE_KEY).");
  return createClient(u, k, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Marca o processo atual como contexto de admin (scripts/cron/ações de admin). */
export function markAdminContext(): void {
  process.env.RADAR_ADMIN_CONTEXT = "1";
}
