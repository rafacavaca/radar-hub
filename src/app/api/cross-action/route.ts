/**
 * /api/cross-action — a AÇÃO de um insight Interno × Externo (F9).
 *
 * POST { insightId, action }:
 *   - "nota"    -> guarda como NOTA DE ROADMAP interna (reativar/gap);
 *   - "formare" -> vira card no Formare (go-to-market do "já temos"), pela
 *                  porta estreita (403 = escrita off -> caixa de saída, honesto).
 *
 * O insight é recuperado do resultado do loop (cache diário — barato).
 */

import { NextResponse, type NextRequest } from "next/server";

import { sendTaskToFormare } from "@/lib/formare-door";
import { runRadarLoop } from "@/lib/loop";
import { saveNoteFromCross } from "@/lib/notes";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { insightId?: unknown; action?: unknown };
  const insightId = typeof body.insightId === "string" ? body.insightId.trim() : "";
  const action = body.action;
  if (!insightId) return NextResponse.json({ error: "insightId obrigatório" }, { status: 400 });
  if (action !== "nota" && action !== "formare") {
    return NextResponse.json({ error: "action deve ser nota ou formare" }, { status: 400 });
  }

  try {
    const { crossInsights } = await runRadarLoop();
    const insight = (crossInsights ?? []).find((c) => c.id === insightId);
    if (!insight) {
      return NextResponse.json({ error: "insight não encontrado" }, { status: 404 });
    }

    if (action === "nota") {
      const note = saveNoteFromCross(insight);
      return NextResponse.json({ data: { kind: "nota", noteId: note.id } });
    }

    // action === "formare": mapeia o insight num item pro card.
    const result = await sendTaskToFormare({
      id: insight.id,
      clientName: insight.clientName,
      sinal: insight.sinal,
      porQueImporta: `Externo: ${insight.externo}\n\nInterno (o que ${insight.clientName} tem): ${insight.interno}`,
      acao: insight.oportunidade,
      fonte: insight.fonte,
      concorrente: insight.concorrente,
      score: insight.score,
      eventIds: insight.eventIds,
      createdAt: insight.createdAt,
    });
    return NextResponse.json({ data: { kind: "formare", ...result } }, { status: result.ok ? 200 : 502 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha na ação";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
