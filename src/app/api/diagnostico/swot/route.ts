/**
 * POST /api/diagnostico/swot { clientName, competitorId } — gera/atualiza o SWOT
 * vivo do concorrente (do diagnóstico salvo + Brain; ~1 LLM) e persiste no diag.
 */

import { NextResponse, type NextRequest } from "next/server";

import { gerarSwot } from "@/lib/diagnostico/swot";
import { getDiagnostico, saveDiagnostico } from "@/lib/diagnostico/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const clientName = typeof body?.clientName === "string" ? body.clientName.trim() : "";
  const competitorId = typeof body?.competitorId === "string" ? body.competitorId.trim() : "";
  if (!clientName || !competitorId) return NextResponse.json({ error: "Envie clientName e competitorId." }, { status: 400 });

  const diag = getDiagnostico(clientName, competitorId);
  if (!diag) return NextResponse.json({ error: "Gere o diagnóstico antes do SWOT." }, { status: 404 });

  try {
    diag.swot = await gerarSwot(diag);
    saveDiagnostico(diag);
    return NextResponse.json({ data: { swot: diag.swot } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Falha no SWOT." }, { status: 500 });
  }
}
