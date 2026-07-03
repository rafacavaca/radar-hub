/**
 * /api/visual — o NÓ VISÃO (F11): captura e detecção de mudança de identidade.
 *
 * GET  ?cliente=Nome     -> { data: { reports } } (relatórios visuais)
 * POST { competitorId }  -> captura a identidade AGORA (print + paleta + IA) e
 *                           devolve o VisualReport. LENTO (~20-60s: Firecrawl +
 *                           visão por IA no motor).
 *
 * O concorrente é resolvido pela watchlist (precisa de siteUrl cadastrado).
 */

import { NextResponse, type NextRequest } from "next/server";

import { readWatchlist } from "@/lib/watchlist";
import { captureIdentity, listVisualReports } from "@/lib/visual";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente")?.trim() || undefined;
  return NextResponse.json({ data: { reports: listVisualReports(cliente) } });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { competitorId?: unknown } | null;
  const competitorId = typeof body?.competitorId === "string" ? body.competitorId.trim() : "";
  if (!competitorId) {
    return NextResponse.json({ error: "competitorId obrigatório" }, { status: 400 });
  }

  // resolve concorrente + cliente na watchlist.
  const watchlist = readWatchlist();
  let found: { clientName: string; competitor: (typeof watchlist.clients)[number]["competitors"][number] } | null =
    null;
  for (const client of watchlist.clients) {
    const competitor = client.competitors.find((c) => c.id === competitorId);
    if (competitor) {
      found = { clientName: client.name, competitor };
      break;
    }
  }
  if (!found) {
    return NextResponse.json({ error: "concorrente não encontrado" }, { status: 404 });
  }
  if (!found.competitor.siteUrl) {
    return NextResponse.json(
      { error: "esse concorrente não tem site cadastrado — adicione o site na tela Vigiar" },
      { status: 400 },
    );
  }

  try {
    const report = await captureIdentity(found.competitor, found.clientName);
    return NextResponse.json({ data: report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha ao capturar a identidade";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
