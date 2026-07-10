/**
 * /api/prospects/ics — baixa o .ics do prospect (F2). Escrita pra fora (o
 * vendedor põe na agenda dele) — sem Google, sem OAuth.
 * GET ?cliente=&id=
 */

import { type NextRequest } from "next/server";

import { prospectToIcs } from "@/lib/prospects/ics";
import { getProspect } from "@/lib/prospects/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente")?.trim() || "";
  const id = req.nextUrl.searchParams.get("id")?.trim() || "";
  if (!cliente || !id) return new Response("cliente e id obrigatórios", { status: 400 });

  const prospect = await getProspect(cliente, id);
  if (!prospect) return new Response("prospect não encontrado", { status: 404 });
  if (!prospect.reuniaoEm) return new Response("este prospect não tem data de reunião", { status: 400 });

  const appUrl = process.env.RADAR_APP_URL || "https://radar.formare.tech";
  const ics = prospectToIcs(prospect, appUrl);
  if (!ics) return new Response("não foi possível gerar o evento", { status: 400 });

  const nome = prospect.nome.replace(/[^\w-]+/g, "-").toLowerCase();
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="reuniao-${nome}.ics"`,
    },
  });
}
