/**
 * /api/briefing — marca o estado de um item do digest (ritual F1).
 *
 * POST { itemId, estado: "atuado" | "ignorado" | "adiado", item? }
 *   -> { data: { registro } }
 * Adiar exige o `item` (snapshot que volta amanhã). Erros da lib -> 400 pt-BR.
 */

import { NextResponse, type NextRequest } from "next/server";

import { setEstado, type BriefingEstado } from "@/lib/briefing-estado";
import type { DigestItem } from "@/lib/digest";

export const dynamic = "force-dynamic";

const ESTADOS: BriefingEstado[] = ["atuado", "ignorado", "adiado"];

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
  const estado = ESTADOS.find((e) => e === body?.estado);
  if (!itemId || !estado) {
    return NextResponse.json({ error: "Envie itemId e estado (atuado | ignorado | adiado)." }, { status: 400 });
  }

  // o snapshot vem do digest que a tela renderizou — validação superficial
  // (o conteúdo é o que a própria org gerou; a RLS/org escopa a gravação).
  const raw = body?.item as Record<string, unknown> | undefined;
  const item: DigestItem | undefined =
    raw && typeof raw.id === "string" && typeof raw.titulo === "string" && typeof raw.clientName === "string"
      ? (raw as unknown as DigestItem)
      : undefined;

  try {
    const registro = await setEstado(itemId, estado, { item });
    return NextResponse.json({ data: { registro } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "falha ao marcar" }, { status: 400 });
  }
}
