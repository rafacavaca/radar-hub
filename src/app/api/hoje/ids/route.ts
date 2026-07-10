/**
 * /api/hoje/ids — as CHAVES de sinal do digest de hoje (ritual F1.4). A aba
 * "Hoje" no shell usa isto pra, comparando com o localStorage de vistos, mostrar
 * o contador de NÃO-LIDOS. Cache-only (não dispara coleta/LLM) e org-scoped.
 */

import { NextResponse } from "next/server";

import { agruparPorSinal, ensureDigest } from "@/lib/digest";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const digest = await ensureDigest(new Date());
    const keys = [...agruparPorSinal(digest.adiados), ...agruparPorSinal(digest.itens)].map((g) => g.key);
    return NextResponse.json({ data: { keys } });
  } catch {
    return NextResponse.json({ data: { keys: [] } });
  }
}
