/**
 * /api/hoje/limpar-falhas — apaga as FALHAS de coleta do dia da Transparência
 * da base (Hoje), mantendo o que coletou certo. Limpa `failures` do cache do
 * loop (org-scoped) e re-gera o digest pra a tela sair sem o ruído.
 *
 * POST -> { data: { removidas } }
 */

import { NextResponse } from "next/server";

import { ensureDigest } from "@/lib/digest";
import { clearLoopFailures } from "@/lib/loop";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const removidas = await clearLoopFailures();
    // re-monta o digest (cacheado) já sem as falhas — cache-only, não re-coleta
    await ensureDigest(new Date(), { force: true });
    return NextResponse.json({ data: { removidas } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "falha ao limpar" }, { status: 500 });
  }
}
