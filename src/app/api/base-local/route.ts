/**
 * /api/base-local — grava a BASE DE CONHECIMENTO LOCAL de um cliente (o texto
 * da implantação). Só super_admin (a agência é read-only). saveBaseLocal é
 * org-scoped: a base de uma agência nunca vaza pra outra.
 *
 * POST { cliente, texto } -> { data: { texto } }
 */

import { NextResponse } from "next/server";

import { saveBaseLocal } from "@/lib/base-local";
import { isSuperAdmin } from "@/lib/db/session";
import { supabaseEnabled } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (supabaseEnabled() && !(await isSuperAdmin())) {
    return NextResponse.json({ error: "Só um super_admin pode editar a base local." }, { status: 403 });
  }
  try {
    const body = (await req.json().catch(() => null)) as { cliente?: string; texto?: string } | null;
    const cliente = (body?.cliente ?? "").trim();
    if (!cliente) return NextResponse.json({ error: "Cliente ausente." }, { status: 400 });
    const texto = await saveBaseLocal(cliente, body?.texto ?? "");
    return NextResponse.json({ data: { texto } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "falha ao salvar" }, { status: 500 });
  }
}
