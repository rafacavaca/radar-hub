/**
 * POST /api/discover-sources — o farejador de fontes da tela Vigiar.
 *
 * body { siteUrl }  ->  200 { data: DiscoveryResult }  (candidatos
 * classificados por tipo, com evidência) — ou 400 com mensagem amigável.
 * Só páginas públicas; fetch simples primeiro, Firecrawl como plano B.
 */

import { NextResponse, type NextRequest } from "next/server";

import { discoverSources } from "@/lib/discovery";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { siteUrl?: unknown } | null;
  const siteUrl = typeof body?.siteUrl === "string" ? body.siteUrl : "";
  if (!siteUrl.trim()) {
    return NextResponse.json({ error: "Informe o site do concorrente." }, { status: 400 });
  }

  try {
    const result = await discoverSources(siteUrl);
    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível investigar o site.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
