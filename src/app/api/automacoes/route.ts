/**
 * /api/automacoes — o painel de automações (org-scoped). Liga/desliga cada
 * rotina e escolhe a cadência. Default OFF (nada roda sem ligar).
 *
 * GET  -> { data: { config } }
 * PATCH { kind: "digest"|"diagnostico", enabled?, cadencia? } -> { data: { config } }
 */

import { NextResponse, type NextRequest } from "next/server";

import { loadAutomacoes, sanitizarCadencia, saveAutomacoes, type AutomacaoKind, type Cadencia } from "@/lib/automacoes";

export const dynamic = "force-dynamic";

const KINDS: AutomacaoKind[] = ["digest", "diagnostico"];

export async function GET() {
  return NextResponse.json({ data: { config: await loadAutomacoes() } });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = KINDS.find((k) => k === body?.kind);
  if (!kind) return NextResponse.json({ error: "kind deve ser digest ou diagnostico" }, { status: 400 });

  const cfg = await loadAutomacoes();
  const atual = cfg[kind];
  const enabled = typeof body?.enabled === "boolean" ? body.enabled : atual.enabled;
  const cadencia: Cadencia = body?.cadencia ? sanitizarCadencia(body.cadencia as Cadencia) : atual.cadencia;
  cfg[kind] = { ...atual, enabled, cadencia };

  return NextResponse.json({ data: { config: await saveAutomacoes(cfg) } });
}
