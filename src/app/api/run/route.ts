/**
 * GET /api/run — o gatilho "rodar agora" do loop do Radar.
 *
 * Sem query: reusa o resultado do dia (cache) -> barato, seguro de chamar
 * repetidamente. Com `?force=1`: roda TUDO de novo.
 *
 * RODADA PARCIAL (F16 — evita rodar tudo pra ver algo pontual):
 *   ?cliente=Nome                     -> roda SÓ esse cliente e mescla no dia
 *   ?cliente=Nome&concorrente=<id>   -> roda SÓ esse concorrente do cliente
 * (parcial já força por natureza; Firecrawl segue no cache diário)
 *
 * Sucesso -> 200 { data: RadarLoopResult, resumo? }
 * Erro    -> 4xx/5xx { error }
 */

import { NextResponse, type NextRequest } from "next/server";

import { runRadarLoop, runRadarPartial } from "@/lib/loop";

export const dynamic = "force-dynamic";

/** Aceita ?force=1 ou ?force=true. */
function wantsForce(req: NextRequest): boolean {
  const value = req.nextUrl.searchParams.get("force");
  return value === "1" || value === "true";
}

export async function GET(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente")?.trim() || "";
  const concorrente = req.nextUrl.searchParams.get("concorrente")?.trim() || "";

  try {
    if (cliente) {
      const { result, summary } = await runRadarPartial({
        clientName: cliente,
        competitorId: concorrente || undefined,
      });
      return NextResponse.json({ data: result, resumo: summary });
    }
    const result = await runRadarLoop({ force: wantsForce(req) });
    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha ao rodar o loop";
    const status = /não encontrado|Nada pra coletar/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
