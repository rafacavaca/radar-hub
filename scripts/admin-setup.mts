/**
 * ADMIN SETUP (item 2) — garante a org "Formare" e vincula o usuário principal
 * (RADAR_APP_EMAIL) como super_admin. Idempotente; NÃO re-insere dados (o
 * backfill faz isso). Roda em contexto admin (service_role).
 *
 * Uso: npm run admin:setup
 */

import { config } from "dotenv";

config({ path: ".env.local" });

const URL = process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main(): Promise<void> {
  if (!URL || !SERVICE) { console.error("Faltam chaves do Supabase."); process.exit(2); }
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  // org Formare (idempotente)
  let { data: org } = await admin.from("orgs").select("id,name").eq("slug", "formare").maybeSingle();
  if (!org) {
    const ins = await admin.from("orgs").insert({ slug: "formare", name: "Formare" }).select("id,name").single();
    org = ins.data;
  }
  console.log(`org: ${org!.name} (${org!.id})`);

  const email = process.env.RADAR_APP_EMAIL?.toLowerCase();
  if (!email) { console.log("RADAR_APP_EMAIL ausente — nada a vincular."); return; }

  const users = await admin.auth.admin.listUsers();
  const u = users.data.users.find((x) => x.email?.toLowerCase() === email);
  if (!u) {
    console.log(`⚠ usuário ${email} ainda não existe no Supabase Auth. Crie-o em Authentication → Users e rode de novo.`);
    return;
  }
  const { error } = await admin.from("memberships").upsert(
    { org_id: org!.id, user_id: u.id, role: "super_admin" },
    { onConflict: "org_id,user_id" },
  );
  if (error) { console.error(`falha ao vincular: ${error.message}`); process.exit(1); }
  console.log(`✅ ${email} → super_admin da org Formare (user_id ${u.id})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
