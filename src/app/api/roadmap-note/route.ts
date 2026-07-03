/**
 * /api/roadmap-note — a AÇÃO da lente Produto (F6).
 *
 * POST { readingId }  -> guarda a leitura de produto como NOTA DE ROADMAP
 *                        interna (banco próprio do Radar) -> { data: note }.
 * DELETE ?id=<noteId> -> apaga a nota.
 *
 * Nada disto toca o Formare — nota de roadmap é material interno do time de
 * produto do cliente, não conteúdo de agência.
 */

import { NextResponse, type NextRequest } from "next/server";

import { deleteNote, saveNoteFromReading } from "@/lib/notes";
import { runRadarLoop } from "@/lib/loop";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { readingId?: unknown };
  const readingId = typeof body.readingId === "string" ? body.readingId.trim() : "";
  if (!readingId) {
    return NextResponse.json({ error: "readingId obrigatório" }, { status: 400 });
  }

  try {
    const { readings } = await runRadarLoop();
    const reading = (readings ?? []).find((r) => r.id === readingId);
    if (!reading) {
      return NextResponse.json({ error: "leitura não encontrada" }, { status: 404 });
    }
    if (reading.lens !== "produto") {
      return NextResponse.json(
        { error: "só leituras da lente Produto viram nota de roadmap" },
        { status: 400 },
      );
    }
    const note = saveNoteFromReading(reading);
    return NextResponse.json({ data: note });
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha ao guardar a nota";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  try {
    deleteNote(id);
    return NextResponse.json({ data: { deleted: id } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha ao apagar";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
