/**
 * POST /api/ask — "Pergunte ao Radar" (F5).
 *
 * body { question, history? } -> 200 { data: AskAnswer } (resposta + fontes
 * MAPEADAS do material — nunca inventadas) — ou 4xx/5xx { error }.
 *
 * Custo: 1 chamada ao gateway por pergunta (+ leitura do Brain, que tem cache
 * de dia). O material vem dos caches diários do loop — não dispara coleta.
 */

import { NextResponse, type NextRequest } from "next/server";

import { askRadar, type AskTurn } from "@/lib/ask";

export const dynamic = "force-dynamic";

const MAX_QUESTION_CHARS = 2000;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    question?: unknown;
    history?: unknown;
  } | null;

  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "Escreva uma pergunta." }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json({ error: "Pergunta longa demais." }, { status: 400 });
  }

  // histórico defensivo: só turnos bem-formados, no máximo 6.
  const history: AskTurn[] = [];
  if (Array.isArray(body?.history)) {
    for (const turn of body.history) {
      const role = (turn as Record<string, unknown>)?.role;
      const text = (turn as Record<string, unknown>)?.text;
      if ((role === "user" || role === "radar") && typeof text === "string" && text.trim()) {
        history.push({ role, text: text.slice(0, 2000) });
      }
    }
  }

  try {
    const answer = await askRadar(question, history.slice(-6));
    return NextResponse.json({ data: answer });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível responder agora.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
