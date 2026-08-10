/**
 * POST /api/visita — marca a visita do USUÁRIO da sessão a um cliente (alimenta
 * o "desde sua última visita"). Chamado por um beacon do cliente ao abrir a
 * Visão. Org-scoped (markVisit usa a org do contexto) + por-usuário.
 *
 * O proxy já exige sessão; aqui resolvemos QUEM é (currentUser) pra a chave.
 */

import { NextResponse, type NextRequest } from "next/server";

import { currentUser } from "@/lib/db/session";
import { markVisit } from "@/lib/last-visit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { cliente?: string } | null;
  const cliente = body?.cliente?.trim();
  if (!cliente) return NextResponse.json({ error: "cliente obrigatório" }, { status: 400 });

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  await markVisit(cliente, user.id, new Date().toISOString());
  return NextResponse.json({ ok: true });
}
