/**
 * GET /api/run  — o gatilho "rodar agora" do loop do Radar.
 *
 * Sem query: reusa o resultado do dia (cache) -> barato, seguro de chamar
 * repetidamente. Com `?force=1`: ignora o cache e roda de novo (1 chamada ao
 * gateway; Firecrawl continua no cache diário).
 *
 * Sucesso -> 200 { data: { items, ranAt } }
 * Erro    -> 500 { error }
 */

import { NextResponse, type NextRequest } from "next/server";

import { runRadarLoop } from "@/lib/loop";

export const dynamic = "force-dynamic";

/** Aceita ?force=1 ou ?force=true. */
function wantsForce(req: NextRequest): boolean {
  const value = req.nextUrl.searchParams.get("force");
  return value === "1" || value === "true";
}

export async function GET(req: NextRequest) {
  try {
    const result = await runRadarLoop({ force: wantsForce(req) });
    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha ao rodar o loop";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
