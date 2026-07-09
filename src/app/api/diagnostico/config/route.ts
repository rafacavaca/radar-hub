/**
 * /api/diagnostico/config — a config do usuário por concorrente (D):
 * fontes extras, temas a vigiar, campos customizados.
 *
 * GET  ?cliente=Nome&competitorId=id  -> { data: { config } }
 * PUT  { clientName, competitorId, fontesExtras?, temas?, camposCustom? } -> salva
 */

import { NextResponse, type NextRequest } from "next/server";

import { loadDiagConfig, saveDiagConfig, type DiagConfig } from "@/lib/diagnostico/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente")?.trim() || "";
  const competitorId = req.nextUrl.searchParams.get("competitorId")?.trim() || "";
  if (!cliente || !competitorId) return NextResponse.json({ error: "cliente e competitorId obrigatórios" }, { status: 400 });
  return NextResponse.json({ data: { config: await loadDiagConfig(cliente, competitorId) } });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const clientName = typeof body?.clientName === "string" ? body.clientName.trim() : "";
  const competitorId = typeof body?.competitorId === "string" ? body.competitorId.trim() : "";
  if (!clientName || !competitorId) return NextResponse.json({ error: "clientName e competitorId obrigatórios" }, { status: 400 });

  const patch: Partial<DiagConfig> = {};
  if (Array.isArray(body?.fontesExtras)) patch.fontesExtras = (body!.fontesExtras as unknown[]).map(String);
  if (Array.isArray(body?.temas)) patch.temas = (body!.temas as unknown[]).map(String);
  if (Array.isArray(body?.camposCustom)) {
    patch.camposCustom = (body!.camposCustom as Array<Record<string, unknown>>).map((c) => ({
      chave: typeof c?.chave === "string" ? c.chave : "",
      pergunta: typeof c?.pergunta === "string" ? c.pergunta : "",
    }));
  }
  return NextResponse.json({ data: { config: await saveDiagConfig(clientName, competitorId, patch) } });
}
