/**
 * /api/diagnostico/schedule — varredura semanal automática do diagnóstico (0a).
 *
 * GET  ?cliente=Nome                    -> { data: { config, alvos } }
 * PUT  { clientName, enabled, weekday }  -> salva a config de varredura do cliente
 */

import { NextResponse, type NextRequest } from "next/server";

import { loadAlvosDaVarredura, loadDiagSchedule, persistDiagSchedule } from "@/lib/diagnostico/schedule";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente")?.trim() || "";
  if (!cliente) return NextResponse.json({ error: "cliente obrigatório" }, { status: 400 });
  const [config, alvos] = await Promise.all([loadDiagSchedule(cliente), loadAlvosDaVarredura(cliente)]);
  return NextResponse.json({ data: { config, alvos: alvos.length } });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const clientName = typeof body?.clientName === "string" ? body.clientName.trim() : "";
  if (!clientName) return NextResponse.json({ error: "clientName obrigatório" }, { status: 400 });
  const weekday = Number(body?.weekday);
  const config = await persistDiagSchedule(clientName, {
    enabled: body?.enabled === true,
    weekday: Number.isInteger(weekday) ? weekday : 1,
  });
  return NextResponse.json({ data: { config } });
}
