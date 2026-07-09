/**
 * /api/diagnostico/battlecard — o artefato comercial (F1d).
 *
 * POST { clientName, competitorId }                       -> gera/atualiza o battlecard
 *      (do diag SALVO + Brain — zero scrape novo; ~1 LLM) e persiste no diag.
 * POST { ..., acao: "abordagem" }                         -> rascunho de e-mail a partir
 *      do battlecard salvo (persiste em battlecard.abordagem).
 * POST { ..., acao: "enviar_formare" }                    -> abordagem vira PEDIDO DE
 *      TRABALHO no Formare pela porta estreita (mesma do "Gerar no Formare").
 */

import { NextResponse, type NextRequest } from "next/server";

import { gerarAbordagem, gerarBattlecard } from "@/lib/diagnostico/battlecard";
import { getDiagnostico, saveDiagnostico } from "@/lib/diagnostico/store";
import { sendTaskToFormare } from "@/lib/formare-door";
import type { IntelligenceItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const clientName = typeof body?.clientName === "string" ? body.clientName.trim() : "";
  const competitorId = typeof body?.competitorId === "string" ? body.competitorId.trim() : "";
  const acao = typeof body?.acao === "string" ? body.acao : "gerar";
  if (!clientName || !competitorId) {
    return NextResponse.json({ error: "Envie clientName e competitorId." }, { status: 400 });
  }

  const diag = getDiagnostico(clientName, competitorId);
  if (!diag) {
    return NextResponse.json({ error: "Gere o diagnóstico antes do battlecard." }, { status: 404 });
  }

  try {
    if (acao === "gerar") {
      diag.battlecard = await gerarBattlecard(diag);
      saveDiagnostico(diag);
      return NextResponse.json({ data: { battlecard: diag.battlecard } });
    }

    if (acao === "abordagem") {
      if (!diag.battlecard) {
        return NextResponse.json({ error: "Gere o battlecard antes da abordagem." }, { status: 400 });
      }
      const texto = await gerarAbordagem(diag);
      diag.battlecard.abordagem = { texto, gerado_em: new Date().toISOString() };
      saveDiagnostico(diag);
      return NextResponse.json({ data: { abordagem: diag.battlecard.abordagem } });
    }

    if (acao === "enviar_formare") {
      const abordagem = diag.battlecard?.abordagem;
      if (!abordagem) {
        return NextResponse.json({ error: "Gere a abordagem antes de enviar ao Formare." }, { status: 400 });
      }
      const fraquezas = (diag.battlecard?.fraquezas ?? []).map((f) => f.texto).slice(0, 3).join(" · ");
      const item: IntelligenceItem = {
        id: `battlecard-${competitorId}-${Date.now()}`,
        clientName,
        sinal: `Abordagem comercial vs ${diag.concorrente_nome} (battlecard do diagnóstico)`,
        porQueImporta: fraquezas
          ? `Fraquezas citadas do concorrente: ${fraquezas}`
          : `Battlecard do ${diag.concorrente_nome} pronto para uso comercial.`,
        acao: abordagem.texto,
        fonte: { url: diag.site_url, titulo: `Diagnóstico ${diag.concorrente_nome} (Radar)` },
        concorrente: diag.concorrente_nome,
        score: 70,
        createdAt: new Date().toISOString(),
      };
      const result = await sendTaskToFormare(item);
      return NextResponse.json({ data: result });
    }

    return NextResponse.json({ error: `acao desconhecida: ${acao}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha no battlecard.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
