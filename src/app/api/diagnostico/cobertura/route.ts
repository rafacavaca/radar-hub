/**
 * /api/diagnostico/cobertura — cobertura de conteúdo / gap de temas (E3).
 *
 * GET  ?cliente=Nome        -> { data: { cobertura } } (a salva, se houver)
 * POST { clientName }        -> analisa (LLM sobre o conteúdo coletado) e salva.
 */

import { NextResponse, type NextRequest } from "next/server";

import { analisarCobertura, getCobertura, saveCobertura } from "@/lib/diagnostico/cobertura";
import { listDiagnosticos } from "@/lib/diagnostico/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente")?.trim() || "";
  if (!cliente) return NextResponse.json({ error: "cliente obrigatório" }, { status: 400 });
  return NextResponse.json({ data: { cobertura: getCobertura(cliente) } });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const clientName = typeof body?.clientName === "string" ? body.clientName.trim() : "";
  if (!clientName) return NextResponse.json({ error: "clientName obrigatório" }, { status: 400 });

  try {
    const cobertura = await analisarCobertura(clientName, listDiagnosticos(clientName));
    return NextResponse.json({ data: { cobertura: saveCobertura(cobertura) } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Falha na cobertura." }, { status: 400 });
  }
}
