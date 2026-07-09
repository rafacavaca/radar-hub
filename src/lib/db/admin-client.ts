/**
 * CLIENTE service_role (a god-key) — SERVER-ONLY, isolado do módulo edge
 * (`supabase.ts` continua importável pelo proxy). Ignora a RLS, então só pode
 * rodar em contexto admin comprovado:
 *
 *  - No SERVIDOR Next (multi-request): dentro de `runAsAdmin(fn)` — uma flag
 *    REQUEST-SCOPED (AsyncLocalStorage), que NÃO vaza para requests concorrentes
 *    (o bug do process.env global). As server actions/rotas de admin embrulham
 *    a operação nisso DEPOIS de verificar super_admin.
 *  - Em SCRIPTS/CRON (processo de propósito único): `RADAR_ADMIN_CONTEXT=1` no
 *    ambiente do processo.
 *
 * Fora dos dois, criar o adminClient LANÇA — um import acidental numa rota de
 * usuário falha barulhento.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Ancorada em globalThis — mesmo motivo do collector-org: o tsx pode duplicar
// a instância do módulo (ESM/CJS) e cada cópia teria sua ALS.
declare global {
  var __radarAdminALS: AsyncLocalStorage<true> | undefined;
}
const adminALS: AsyncLocalStorage<true> = (globalThis.__radarAdminALS ??= new AsyncLocalStorage<true>());

/** Roda `fn` marcado como contexto admin (request-scoped). */
export function runAsAdmin<T>(fn: () => T): T {
  return adminALS.run(true, fn);
}

/** Marca o PROCESSO como admin (scripts/cron de propósito único). */
export function markAdminProcess(): void {
  process.env.RADAR_ADMIN_CONTEXT = "1";
}

function inAdminContext(): boolean {
  return adminALS.getStore() === true || process.env.RADAR_ADMIN_CONTEXT === "1";
}

export function adminClient(): SupabaseClient {
  if (!inAdminContext()) {
    throw new Error(
      "adminClient() (service_role) fora de contexto admin. Ele IGNORA a RLS — " +
        "use runAsAdmin() (após checar super_admin) ou RADAR_ADMIN_CONTEXT=1 em script/cron.",
    );
  }
  const url = process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin não configurado (URL / SUPABASE_SERVICE_ROLE_KEY).");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
