/**
 * /api/prioridade — grava a RÉGUA DE PRIORIDADE da agência (cortes Alta/Média,
 * P7, org-level). Só super_admin ajusta; a agência é read-only (a Implantação
 * já esconde o editor, mas a rota barra de novo — defesa dupla). savePrioridade
 * sanitiza (1 ≤ media < alta ≤ 100).
 *
 * POST { alta, media } -> { data: { corte } }
 */

import { NextResponse } from "next/server";

import { isSuperAdmin } from "@/lib/db/session";
import { supabaseEnabled } from "@/lib/db/supabase";
import { savePrioridade } from "@/lib/prioridade";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (supabaseEnabled() && !(await isSuperAdmin())) {
    return NextResponse.json({ error: "Só um super_admin pode ajustar a régua de prioridade." }, { status: 403 });
  }
  try {
    const body = (await req.json().catch(() => null)) as { alta?: unknown; media?: unknown } | null;
    const corte = await savePrioridade({ alta: body?.alta, media: body?.media });
    return NextResponse.json({ data: { corte } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "falha ao salvar" }, { status: 500 });
  }
}
