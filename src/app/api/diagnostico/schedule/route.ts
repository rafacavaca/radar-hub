/**
 * /api/diagnostico/schedule — varredura semanal automática do diagnóstico (0a).
 *
 * GET  ?cliente=Nome                    -> { data: { config, alvos } }
 * PUT  { clientName, enabled, weekday }  -> salva a config de varredura do cliente
 */

import { NextResponse, type NextRequest } from "next/server";

import { alvosDaVarredura, getDiagSchedule, setDiagSchedule } from "@/lib/diagnostico/schedule";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente")?.trim() || "";
  if (!cliente) return NextResponse.json({ error: "cliente obrigatório" }, { status: 400 });
  return NextResponse.json({
    data: { config: getDiagSchedule(cliente), alvos: alvosDaVarredura(cliente).length },
  });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const clientName = typeof body?.clientName === "string" ? body.clientName.trim() : "";
  if (!clientName) return NextResponse.json({ error: "clientName obrigatório" }, { status: 400 });
  const weekday = Number(body?.weekday);
  const config = setDiagSchedule(clientName, {
    enabled: body?.enabled === true,
    weekday: Number.isInteger(weekday) ? weekday : 1,
  });
  return NextResponse.json({ data: { config } });
}
