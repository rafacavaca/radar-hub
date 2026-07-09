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

/** O multi-tenant (Supabase) está LIGADO (login/dados via Supabase)? Flag + chaves. */
export function supabaseEnabled(): boolean {
  return process.env.RADAR_DB === "supabase" && !!url() && !!anonKey();
}

/**
 * O Supabase está CONFIGURADO (chaves presentes), independente da flag de login?
 * A área de admin (gerir orgs) pode operar já no modo clássico — as orgs vivem
 * no Supabase de qualquer jeito; assim dá pra onboardar agências ANTES do flip
 * do login (que muda como o Rafael entra). Precisa da service key (é escrita admin).
 */
export function supabaseConfigured(): boolean {
  return !!url() && !!anonKey() && !!serviceKey();
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

// O cliente service_role (a god-key) mora em `@/lib/db/admin-client` (server-
// only, isolado deste módulo edge-safe pra não puxar node:async_hooks pro
// proxy). Importe adminClient/runAsAdmin de lá. NUNCA no caminho do usuário.
