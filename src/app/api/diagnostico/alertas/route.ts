/**
 * /api/diagnostico/alertas — regras editáveis + inbox de disparos (F1a).
 *
 * GET  ?cliente=Nome                          -> { data: { regras, disparos } }
 * PUT  { clientName, regras }                 -> salva as regras do cliente
 * POST { clientName, acao: "marcar_vistos" }  -> marca os disparos como vistos
 */

import { NextResponse, type NextRequest } from "next/server";

import { getRegras, listDisparos, marcarVistos, saveRegras } from "@/lib/diagnostico/alertas-store";
import type { RegraAlerta, RegraAlertaTipo } from "@/lib/diagnostico/schema";

export const dynamic = "force-dynamic";

const TIPOS: RegraAlertaTipo[] = [
  "tagline_mudou",
  "produto_novo",
  "anuncios_variacao",
  "canal_novo",
  "cliente_novo",
  "preco_mudou",
  "nota_caiu",
  "vagas_variacao",
  "release_novo",
];

export async function GET(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente")?.trim() || "";
  if (!cliente) return NextResponse.json({ error: "cliente obrigatório" }, { status: 400 });
  return NextResponse.json({ data: { regras: getRegras(cliente), disparos: listDisparos(cliente) } });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const clientName = typeof body?.clientName === "string" ? body.clientName.trim() : "";
  const raw = Array.isArray(body?.regras) ? (body!.regras as Array<Record<string, unknown>>) : null;
  if (!clientName || !raw) {
    return NextResponse.json({ error: "Envie clientName e regras." }, { status: 400 });
  }
  const regras: RegraAlerta[] = [];
  for (const r of raw) {
    const tipo = TIPOS.find((t) => t === r.tipo);
    if (!tipo) continue;
    const limiar = Number(r.limiar);
    regras.push({
      tipo,
      ativo: r.ativo === true,
      ...(tipo === "anuncios_variacao" || tipo === "vagas_variacao"
        ? { limiar: Number.isFinite(limiar) && limiar > 0 ? Math.min(500, limiar) : 50 }
        : tipo === "nota_caiu"
          ? { limiar: Number.isFinite(limiar) && limiar > 0 ? Math.min(10, limiar) : 0.5 }
          : {}),
    });
  }
  return NextResponse.json({ data: { regras: saveRegras(clientName, regras) } });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const clientName = typeof body?.clientName === "string" ? body.clientName.trim() : "";
  const acao = typeof body?.acao === "string" ? body.acao : "";
  if (!clientName || acao !== "marcar_vistos") {
    return NextResponse.json({ error: "Envie clientName e acao=marcar_vistos." }, { status: 400 });
  }
  marcarVistos(clientName);
  return NextResponse.json({ data: { ok: true } });
}
