/**
 * /api/prospects/formare — "Gerar no Formare" a partir do DOSSIÊ (F1): monta um
 * pedido de abordagem/one-pager (o ângulo + ganchos + munição) e manda pela
 * porta estreita (403 = escrita off → caixa de saída, honesto).
 *
 * POST { cliente, id } -> { data: { mode, ok, cardUrl? } }
 */

import { NextResponse, type NextRequest } from "next/server";

import { sendTaskToFormare } from "@/lib/formare-door";
import { loadDossie, getProspect } from "@/lib/prospects/store";
import type { IntelligenceItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const cliente = typeof body?.cliente === "string" ? body.cliente.trim() : "";
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!cliente || !id) return NextResponse.json({ error: "cliente e id obrigatórios" }, { status: 400 });

  const [prospect, dossie] = await Promise.all([getProspect(cliente, id), loadDossie(id)]);
  if (!prospect) return NextResponse.json({ error: "prospect não encontrado" }, { status: 404 });
  if (!dossie) return NextResponse.json({ error: "gere o dossiê antes de enviar ao Formare" }, { status: 400 });

  // monta o pedido: o ângulo de abertura + ganchos + a 1ª fonte real disponível.
  const ganchos = dossie.encaixe.ganchos.map((g) => `• ${g.texto}`).join("\n");
  const perguntas = dossie.municao.perguntas.slice(0, 3).map((p) => `• ${p.texto}`).join("\n");
  const fonte = dossie.sinais[0]?.fonte_url
    ? { url: dossie.sinais[0].fonte_url, titulo: dossie.sinais[0].fonte_titulo ?? dossie.sinais[0].fonte_url }
    : { url: dossie.siteUrl, titulo: dossie.nome };

  const item: IntelligenceItem = {
    id: `prospect:${id}`,
    clientName: cliente,
    sinal: `Abordagem para ${dossie.nome} (prospect)`,
    porQueImporta:
      `${dossie.perfil.resumo.texto}\n\n` +
      (dossie.encaixe.angulo ? `Ângulo: ${dossie.encaixe.angulo.texto}\n` : "") +
      (ganchos ? `Ganchos:\n${ganchos}\n` : "") +
      (perguntas ? `Perguntas:\n${perguntas}` : ""),
    acao: dossie.encaixe.angulo?.texto ?? "Escrever e-mail de abordagem a partir do dossiê.",
    fonte,
    score: 70,
    concorrente: undefined,
    createdAt: new Date().toISOString(),
  };

  const res = await sendTaskToFormare(item);
  return NextResponse.json(
    { data: { mode: res.mode, ok: res.ok, cardUrl: res.mode === "live" && res.ok ? res.cardUrl : undefined, error: res.ok ? undefined : (res as { error?: string }).error } },
    { status: res.ok ? 200 : 502 },
  );
}
