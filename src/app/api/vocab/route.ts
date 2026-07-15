/**
 * /api/vocab — grava o VOCABULÁRIO da agência (rótulos por-org, P13). Só
 * super_admin ajusta; a agência é read-only (a Implantação já esconde o editor,
 * mas a rota barra de novo — defesa dupla). saveVocab sanitiza (mapa mínimo).
 *
 * POST { vocab: {termo: rótulo} } -> { data: { vocab } }
 */

import { NextResponse } from "next/server";

import { isSuperAdmin } from "@/lib/db/session";
import { supabaseEnabled } from "@/lib/db/supabase";
import { saveVocab } from "@/lib/vocab";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (supabaseEnabled() && !(await isSuperAdmin())) {
    return NextResponse.json({ error: "Só um super_admin pode ajustar os rótulos." }, { status: 403 });
  }
  try {
    const body = (await req.json().catch(() => null)) as { vocab?: unknown } | null;
    const saved = await saveVocab((body?.vocab ?? {}) as Record<string, string>);
    return NextResponse.json({ data: { vocab: saved } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "falha ao salvar" }, { status: 500 });
  }
}
