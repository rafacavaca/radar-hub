/**
 * /api/prospects/dossie — GERA o dossiê de um prospect (F1). É a AÇÃO CARA (LLM
 * + buscas): debita crédito (feature `prospect_dossie`, medido no motor) e
 * guarda o resultado org-scoped pra reabrir sem re-gastar.
 *
 * POST { cliente, id } -> { data: { dossie } }   (regenera sempre; on-demand)
 */

import { NextResponse, type NextRequest } from "next/server";

import { gerarDossie } from "@/lib/prospects/dossie";
import { getProspect, patchProspect, saveDossie } from "@/lib/prospects/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // a montagem reusa scrape + várias chamadas de LLM

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const cliente = typeof body?.cliente === "string" ? body.cliente.trim() : "";
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!cliente || !id) return NextResponse.json({ error: "cliente e id obrigatórios" }, { status: 400 });

  const prospect = await getProspect(cliente, id);
  if (!prospect) return NextResponse.json({ error: "prospect não encontrado" }, { status: 404 });

  try {
    const dossie = await gerarDossie(prospect);
    await saveDossie(dossie);
    await patchProspect(cliente, id, { dossieEm: dossie.geradoEm });
    return NextResponse.json({ data: { dossie } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "falha ao gerar o dossiê" }, { status: 500 });
  }
}
