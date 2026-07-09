/**
 * /admin (item 2) — área do SUPER_ADMIN: criar orgs e adicionar membros.
 * Gate SERVER-SIDE: exige modo Supabase + super_admin (senão manda pra home).
 * Standalone (sem o shell de cliente) — é uma tela da agência-mãe.
 */

import { redirect } from "next/navigation";

import { supabaseConfigured, supabaseEnabled } from "@/lib/db/supabase";
import { runAsAdmin } from "@/lib/db/admin-client";
import { isSuperAdmin } from "@/lib/db/session";
import { listMembers, listOrgs } from "@/lib/db/admin-ops";
import { AdminView } from "@/components/admin-view";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // Admin de orgs funciona já no modo clássico (as orgs vivem no Supabase; a
  // rota é gateada ao usuário principal no proxy). No modo Supabase, exige o
  // papel super_admin da sessão. Sem chaves configuradas → home.
  if (!supabaseConfigured()) redirect("/");
  if (supabaseEnabled() && !(await isSuperAdmin())) redirect("/");

  const orgs = await runAsAdmin(async () => {
    const base = await listOrgs();
    return Promise.all(base.map(async (o) => ({ ...o, members: await listMembers(o.id) })));
  });

  return (
    <div className="min-h-[100dvh] bg-stone-50">
      <AdminView orgs={orgs} />
    </div>
  );
}
