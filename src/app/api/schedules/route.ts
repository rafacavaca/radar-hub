/**
 * /api/schedules — os RELATÓRIOS AGENDADOS (F10).
 *
 * GET  -> { data: { schedules } }
 * POST { action }:
 *   - "create" { clientName, request, cadence: {kind:"daily"} | {kind:"weekly",weekday} }
 *   - "toggle" { id, enabled }
 * DELETE ?id=<id>
 *
 * A EXECUÇÃO não é aqui — é o timer do sistema (scripts/run-schedules.mts).
 * Aqui só se GERE a lista. Validação defensiva; erros da lib viram 400 pt-BR.
 */

import { NextResponse, type NextRequest } from "next/server";

import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  setScheduleEnabled,
  type Cadence,
} from "@/lib/schedules";

export const dynamic = "force-dynamic";

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

/** Lê e valida a cadência do corpo (sem confiar no cliente). */
function parseCadence(raw: unknown): Cadence | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (c.kind === "daily") return { kind: "daily" };
  if (c.kind === "weekly" && Number.isInteger(c.weekday)) {
    const wd = c.weekday as number;
    if (wd >= 0 && wd <= 6) return { kind: "weekly", weekday: wd };
  }
  return null;
}

export async function GET() {
  return NextResponse.json({ data: { schedules: listSchedules() } });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return badRequest("Corpo inválido.");

  try {
    if (body.action === "create") {
      const clientName = typeof body.clientName === "string" ? body.clientName : "";
      const request = typeof body.request === "string" ? body.request : "";
      const cadence = parseCadence(body.cadence);
      if (!cadence) return badRequest("Escolha a frequência (todo dia ou um dia da semana).");
      const schedule = createSchedule({ clientName, request, cadence });
      return NextResponse.json({ data: schedule });
    }
    if (body.action === "toggle") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!id || typeof body.enabled !== "boolean") return badRequest("Envie id e enabled.");
      const schedule = setScheduleEnabled(id, body.enabled);
      return NextResponse.json({ data: schedule });
    }
    return badRequest("Ação desconhecida. Use create ou toggle.");
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return NextResponse.json({ error: "Erro inesperado." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) return badRequest("id obrigatório");
  try {
    deleteSchedule(id);
    return NextResponse.json({ data: { deleted: id } });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "falha ao apagar");
  }
}
