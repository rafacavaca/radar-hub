/**
 * POST /api/send-to-formare — "Gerar no Formare" formalizado (F4).
 *
 * O item de inteligência vira um PEDIDO DE TRABALHO no Formare: um card em
 * 'ideias', tag 'radar' (valores forçados pela porta estreita). Quando a porta
 * de escrita está DESLIGADA (decisão do Rafael), a porta devolve 403 e o pedido
 * fica registrado na caixa de saída local — nada toca o Formare.
 *
 * body { itemId }  ->  200 { data: SendTaskResult }  (ou 4xx/5xx)
 */

import { NextResponse, type NextRequest } from "next/server";

import { sendTaskToFormare } from "@/lib/formare-door";
import { runRadarLoop } from "@/lib/loop";

export const dynamic = "force-dynamic";

type SendBody = { itemId?: unknown };

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as SendBody;
    const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
    if (!itemId) {
      return NextResponse.json({ error: "itemId obrigatório" }, { status: 400 });
    }

    // Recupera pelo id: item da visão Geral OU leitura de lente (F6) OU leitura de venda (carteira).
    const { items, readings, salesReadings } = await runRadarLoop();
    let item = items.find((it) => it.id === itemId);
    if (!item) {
      const reading = (readings ?? []).find((r) => r.id === itemId);
      if (reading) {
        // PRODUTO não vira card — vira nota de roadmap (/api/roadmap-note).
        if (reading.lens === "produto") {
          return NextResponse.json(
            { error: "leituras de Produto viram nota de roadmap, não card" },
            { status: 400 },
          );
        }
        item = {
          id: reading.id,
          clientName: reading.clientName,
          sinal: reading.sinal,
          porQueImporta: reading.leitura,
          acao: reading.acao,
          fonte: reading.fonte,
          concorrente: reading.concorrente,
          score: reading.score,
          eventIds: reading.eventIds,
          createdAt: reading.createdAt,
        };
      }
    }
    if (!item) {
      // 2º template (carteira): leitura de venda vira card — o gatilho é o "porquê",
      // o ângulo é a ação; o hospital ocupa o campo de "concorrente" (o subject).
      const sale = (salesReadings ?? []).find((s) => s.id === itemId);
      if (sale) {
        item = {
          id: sale.id,
          clientName: sale.clientName,
          sinal: sale.sinal,
          porQueImporta: `${sale.gatilho} (linha: ${sale.linha})`,
          acao: sale.angulo,
          fonte: sale.fonte,
          concorrente: sale.hospital,
          score: sale.score,
          eventIds: sale.eventIds,
          createdAt: sale.createdAt,
        };
      }
    }
    if (!item) {
      return NextResponse.json({ error: "item não encontrado" }, { status: 404 });
    }

    // Vira card pela porta estreita. Escrita desligada -> dry-run (403 vira
    // caixa de saída, ok:true) — o botão mostra o estado honesto.
    const result = await sendTaskToFormare(item);
    return NextResponse.json({ data: result }, { status: result.ok ? 200 : 502 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha no envio";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
