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

// ── config do DIGEST por org (ritual F1: quem recebe o e-mail matinal) ──────
// Vive em org_docs (kind "org-config", key "digest") — a mesma doc que o cron
// lê DENTRO do contexto da org. Aqui é escrita de admin (org_id explícito).

const CFG_KIND = "org-config";
const CFG_KEY = "digest";

/** Define (ou remove, com email vazio) o destinatário do digest de uma org. */
export async function setOrgDigestEmail(orgId: string, email: string): Promise<{ emailTo: string | null }> {
  const clean = (email ?? "").trim().toLowerCase();
  if (clean && (!clean.includes("@") || clean.length < 6)) throw new Error("Informe um e-mail válido (ou vazio para desligar).");
  const sb = adminClient();
  const { data } = await sb
    .from("org_docs").select("data").eq("org_id", orgId).eq("kind", CFG_KIND).eq("key", CFG_KEY).maybeSingle();
  const atual = ((data as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<string, unknown>;
  const nova = { ...atual, emailTo: clean || undefined };
  const { error } = await sb.from("org_docs").upsert(
    { org_id: orgId, kind: CFG_KIND, key: CFG_KEY, data: nova, updated_at: new Date().toISOString() },
    { onConflict: "org_id,kind,key" },
  );
  if (error) throw new Error(`Falha ao gravar o e-mail do digest: ${error.message}`);
  return { emailTo: clean || null };
}

/** Destinatário do digest por org (pro painel de admin exibir). */
export async function listOrgDigestEmails(): Promise<Record<string, string>> {
  const sb = adminClient();
  const { data } = await sb.from("org_docs").select("org_id, data").eq("kind", CFG_KIND).eq("key", CFG_KEY);
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as Array<{ org_id: string; data?: { emailTo?: string } }>) {
    if (row.data?.emailTo) out[row.org_id] = row.data.emailTo;
  }
  return out;
}

// ── provider do motor LLM por org (DeepSeek × Claude) ───────────────────────
// Mesma doc-família (org_docs kind "org-config"), key "provider". O motor lê
// DENTRO do contexto da org (lib/llm/provider.ts); aqui é escrita de admin.

const PROVIDER_KEY = "provider";

/** Define o provider LLM de uma org ("deepseek" | "claude"). */
export async function setOrgProvider(orgId: string, provider: string): Promise<{ provider: "deepseek" | "claude" }> {
  const p: "deepseek" | "claude" = provider === "claude" ? "claude" : "deepseek";
  const sb = adminClient();
  const { data } = await sb
    .from("org_docs").select("data").eq("org_id", orgId).eq("kind", CFG_KIND).eq("key", PROVIDER_KEY).maybeSingle();
  const atual = ((data as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<string, unknown>;
  const nova = { ...atual, provider: p };
  const { error } = await sb.from("org_docs").upsert(
    { org_id: orgId, kind: CFG_KIND, key: PROVIDER_KEY, data: nova, updated_at: new Date().toISOString() },
    { onConflict: "org_id,kind,key" },
  );
  if (error) throw new Error(`Falha ao gravar o provider: ${error.message}`);
  return { provider: p };
}

/** Provider escolhido por org (pro painel de admin exibir; ausência = default). */
export async function listOrgProviders(): Promise<Record<string, "deepseek" | "claude">> {
  const sb = adminClient();
  const { data } = await sb.from("org_docs").select("org_id, data").eq("kind", CFG_KIND).eq("key", PROVIDER_KEY);
  const out: Record<string, "deepseek" | "claude"> = {};
  for (const row of (data ?? []) as Array<{ org_id: string; data?: { provider?: string } }>) {
    if (row.data?.provider === "claude" || row.data?.provider === "deepseek") out[row.org_id] = row.data.provider;
  }
  return out;
}
