/**
 * /api/hoje — re-gera o digest do dia (ritual F1, botão "Atualizar").
 *
 * POST -> { data: { digest } }  (força a re-montagem do material atual;
 * cache-only — nunca dispara coleta/LLM).
 */

import { NextResponse } from "next/server";

import { ensureDigest } from "@/lib/digest";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const digest = await ensureDigest(new Date(), { force: true });
    return NextResponse.json({ data: { digest } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "falha ao atualizar" }, { status: 500 });
  }
}
