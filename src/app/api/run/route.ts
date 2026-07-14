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

import { currentOrgId } from "@/lib/db/session";
import { runRadarLoop, runRadarPartial } from "@/lib/loop";
import { LIMITES, rateLimit, respostaRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Aceita ?force=1 ou ?force=true. */
function wantsForce(req: NextRequest): boolean {
  const value = req.nextUrl.searchParams.get("force");
  return value === "1" || value === "true";
}

export async function GET(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente")?.trim() || "";
  const concorrente = req.nextUrl.searchParams.get("concorrente")?.trim() || "";
  const force = wantsForce(req);

  // Rate-limit só o caminho CARO (coleta+LLM): parcial (?cliente) ou ?force.
  // A leitura de cache (sem query) é barata e não conta.
  if (cliente || force) {
    const org = (await currentOrgId()) ?? "anon";
    const rl = rateLimit(`run:${org}`, LIMITES.run.limit, LIMITES.run.windowMs);
    if (rl.limited) return respostaRateLimit(rl);
  }

  try {
    if (cliente) {
      const { result, summary } = await runRadarPartial({
        clientName: cliente,
        competitorId: concorrente || undefined,
      });
      return NextResponse.json({ data: result, resumo: summary });
    }
    const result = await runRadarLoop({ force });
    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha ao rodar o loop";
    const status = /não encontrado|Nada pra coletar/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
