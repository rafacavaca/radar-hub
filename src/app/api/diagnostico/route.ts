/**
 * /api/diagnostico — o diagnóstico vivo por concorrente.
 *
 * GET  ?cliente=Nome            -> { data: { diagnosticos } } (os salvos do cliente)
 * POST { clientName, competitorId } -> roda as lentes 1-2 pra aquele concorrente
 *      (pega nome+site da watchlist), salva e devolve o diagnóstico.
 *
 * LENTO (Firecrawl + LLM). Erros viram 400/500 { error }.
 */

import { NextResponse, type NextRequest } from "next/server";

import { runDiagnostico } from "@/lib/diagnostico/run";
import { listDiagnosticos } from "@/lib/diagnostico/store";
import { pillarOf, loadWatchlist } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente")?.trim() || "";
  if (!cliente) return NextResponse.json({ error: "cliente obrigatório" }, { status: 400 });
  return NextResponse.json({ data: { diagnosticos: listDiagnosticos(cliente) } });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const clientName = typeof body?.clientName === "string" ? body.clientName.trim() : "";
  const competitorId = typeof body?.competitorId === "string" ? body.competitorId.trim() : "";
  if (!clientName || !competitorId) {
    return NextResponse.json({ error: "Envie clientName e competitorId." }, { status: 400 });
  }

  const client = (await loadWatchlist()).clients.find((c) => c.name === clientName);
  const competitor = client?.competitors.find((c) => c.id === competitorId);
  if (!competitor || pillarOf(competitor, client?.mode) === "conta-chave") {
    return NextResponse.json({ error: "Concorrente não encontrado neste cliente." }, { status: 404 });
  }
  if (!competitor.siteUrl) {
    return NextResponse.json(
      { error: `${competitor.name} não tem site cadastrado — o diagnóstico lê do site.` },
      { status: 400 },
    );
  }

  try {
    const diag = await runDiagnostico({
      clientName,
      competitorId,
      name: competitor.name,
      siteUrl: competitor.siteUrl,
    });
    return NextResponse.json({ data: diag });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao gerar o diagnóstico.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
