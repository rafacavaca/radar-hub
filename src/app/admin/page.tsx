/**
 * /admin (item 2) — área do SUPER_ADMIN: criar orgs e adicionar membros.
 * Gate SERVER-SIDE: exige modo Supabase + super_admin (senão manda pra home).
 * Standalone (sem o shell de cliente) — é uma tela da agência-mãe.
 */

import { redirect } from "next/navigation";

import { supabaseEnabled } from "@/lib/db/supabase";
import { runAsAdmin } from "@/lib/db/admin-client";
import { isSuperAdmin } from "@/lib/db/session";
import { listMembers, listOrgs } from "@/lib/db/admin-ops";
import { AdminView } from "@/components/admin-view";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!supabaseEnabled() || !(await isSuperAdmin())) redirect("/");

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
