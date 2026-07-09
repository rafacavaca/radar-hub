/**
 * /api/admin — área do SUPER_ADMIN (item 2). Criar org e adicionar membro.
 *
 * Gate DUPLO: o proxy exige sessão; ESTA rota exige super_admin (a op usa o
 * adminClient/service_role, que ignora RLS — a verificação de papel é
 * obrigatória aqui, não pode confiar só no proxy). Só em modo Supabase.
 */

import { NextResponse, type NextRequest } from "next/server";

import { supabaseConfigured, supabaseEnabled } from "@/lib/db/supabase";
import { runAsAdmin } from "@/lib/db/admin-client";
import { isSuperAdmin } from "@/lib/db/session";
import { addMember, createOrg } from "@/lib/db/admin-ops";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Chaves ausentes → indisponível. No modo Supabase exige super_admin da
  // sessão; no modo clássico a rota já é gateada ao usuário principal no proxy.
  if (!supabaseConfigured()) return NextResponse.json({ error: "Supabase não configurado" }, { status: 400 });
  if (supabaseEnabled() && !(await isSuperAdmin())) return NextResponse.json({ error: "só o super_admin" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "corpo inválido" }, { status: 400 });

  try {
    if (body.action === "create-org") {
      const org = await runAsAdmin(() => createOrg({ name: String(body.name ?? ""), slug: body.slug ? String(body.slug) : undefined }));
      return NextResponse.json({ data: { org } });
    }
    if (body.action === "add-member") {
      const res = await runAsAdmin(() =>
        addMember({
          orgId: String(body.orgId ?? ""),
          email: String(body.email ?? ""),
          role: body.role === "org_admin" ? "org_admin" : "member",
        }),
      );
      return NextResponse.json({ data: res });
    }
    return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "falha" }, { status: 400 });
  }
}
