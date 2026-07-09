/**
 * OPERAÇÕES DE ADMIN (item 2) — criar org e adicionar membro. Usam o
 * adminClient (service_role) e por isso SÓ podem ser chamadas depois de
 * confirmar `isSuperAdmin()` na rota. Rodam em contexto admin (server action /
 * route handler), nunca no fluxo comum do usuário.
 *
 * "Convite": para não depender de SMTP, criamos o usuário com uma senha
 * TEMPORÁRIA gerada, devolvida UMA vez pro super_admin repassar — o usuário
 * troca depois. (Quando o e-mail do Supabase estiver ligado, dá pra trocar por
 * inviteUserByEmail, que manda o link de definir senha.)
 */

import { adminClient } from "@/lib/db/admin-client";

export type OrgRow = { id: string; slug: string; name: string; created_at: string };
export type MemberRow = { user_id: string; email: string; role: string };

function slugify(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** Cria uma org (a agência). Slug derivado do nome se não vier. */
export async function createOrg(input: { name: string; slug?: string }): Promise<OrgRow> {
  const name = (input.name ?? "").trim();
  if (!name) throw new Error("Dê um nome à organização.");
  const slug = slugify(input.slug || name);
  if (!slug) throw new Error("Nome inválido para gerar o identificador (slug).");
  const sb = adminClient();
  const { data, error } = await sb.from("orgs").insert({ name, slug }).select("id, slug, name, created_at").single();
  if (error) throw new Error(error.message.includes("duplicate") ? `Já existe uma org com o slug "${slug}".` : error.message);
  return data as OrgRow;
}

/** Lista todas as orgs (super_admin). */
export async function listOrgs(): Promise<OrgRow[]> {
  const sb = adminClient();
  const { data } = await sb.from("orgs").select("id, slug, name, created_at").order("created_at", { ascending: true });
  return (data ?? []) as OrgRow[];
}

/** Membros de uma org (com e-mail resolvido do Auth). */
export async function listMembers(orgId: string): Promise<MemberRow[]> {
  const sb = adminClient();
  const { data } = await sb.from("memberships").select("user_id, role").eq("org_id", orgId);
  const rows = (data ?? []) as Array<{ user_id: string; role: string }>;
  if (rows.length === 0) return [];
  const users = await sb.auth.admin.listUsers();
  const byId = new Map(users.data.users.map((u) => [u.id, u.email ?? ""]));
  return rows.map((r) => ({ user_id: r.user_id, email: byId.get(r.user_id) ?? "(sem e-mail)", role: r.role }));
}

function tempPassword(): string {
  // sem Math.random no gateway, mas aqui é Node normal: senha temporária forte.
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return "Rdr-" + Buffer.from(bytes).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 10) + "!";
}

/**
 * Adiciona um membro a uma org por e-mail. Cria o usuário no Auth se ainda não
 * existir (com senha temporária, devolvida UMA vez). role: org_admin | member.
 */
export async function addMember(input: {
  orgId: string;
  email: string;
  role?: "org_admin" | "member";
}): Promise<{ email: string; role: string; tempPassword?: string }> {
  const email = (input.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Informe um e-mail válido.");
  const role = input.role === "org_admin" ? "org_admin" : "member";
  const sb = adminClient();

  const users = await sb.auth.admin.listUsers();
  let user = users.data.users.find((u) => u.email?.toLowerCase() === email);
  let temp: string | undefined;
  if (!user) {
    temp = tempPassword();
    const created = await sb.auth.admin.createUser({ email, password: temp, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`Falha ao criar o usuário: ${created.error?.message ?? "desconhecido"}`);
    user = created.data.user;
  }

  const { error } = await sb.from("memberships").upsert({ org_id: input.orgId, user_id: user.id, role }, { onConflict: "org_id,user_id" });
  if (error) throw new Error(`Falha ao vincular o membro: ${error.message}`);
  return { email, role, tempPassword: temp };
}
