/**
 * POST /api/send-to-formare — a "porta estreita" (Radar -> Brain do Formare).
 *
 * MODO SEGURO (dry-run) por padrão: enquanto RADAR_INTAKE_URL/SECRET não estão
 * definidos, NÃO envia nada ao Formare — registra o bilhete numa caixa de saída
 * local (.cache/outbox/). Quando o Rafael instalar e aprovar a porta, o MESMO
 * código passa a enviar de verdade. Ver docs/narrow-door/README.md.
 *
 * body { itemId }  ->  200 { data: SendResult }  (ou 4xx/5xx)
 */

import { NextResponse, type NextRequest } from "next/server";

import { sendToFormare } from "@/lib/formare-door";
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

    // Recupera o item pelo id no resultado do loop (cacheado no dia — barato).
    const { items } = await runRadarLoop();
    const item = items.find((it) => it.id === itemId);
    if (!item) {
      return NextResponse.json({ error: "item não encontrado" }, { status: 404 });
    }

    // Envia pela porta estreita. Sem porta configurada -> dry-run (seguro).
    const result = await sendToFormare([item], { workspaceName: item.clientName });
    return NextResponse.json({ data: result }, { status: result.ok ? 200 : 502 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha no envio";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
