/**
 * /api/prospects/promover — F3: o prospect virou oportunidade real → move pro
 * pilar CLIENTES (conta-chave, vigilância contínua). O EFÊMERO vira MONITORADO,
 * SEM DUPLICAR DADO (dedupe por nome/site no núcleo `promoverProspect`).
 *
 * POST { cliente, id } -> { data: { contaId, jaExistia } }
 */

import { NextResponse, type NextRequest } from "next/server";

import { discoverSources } from "@/lib/discovery";
import { promoverProspect } from "@/lib/prospects/promover";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // a descoberta de fontes faz um scrape

/** descoberta REAL de fontes coletáveis (o smoke injeta um fake). */
async function discover(site: string) {
  const disc = await discoverSources(site);
  return disc.candidates.filter((c) => c.coletavel).slice(0, 5).map((c) => ({ kind: c.kind, url: c.url }));
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const cliente = typeof body?.cliente === "string" ? body.cliente.trim() : "";
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!cliente || !id) return NextResponse.json({ error: "cliente e id obrigatórios" }, { status: 400 });

  try {
    const res = await promoverProspect(cliente, id, { discover });
    return NextResponse.json({ data: res });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "falha ao promover" }, { status: 400 });
  }
}
