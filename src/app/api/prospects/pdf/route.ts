/**
 * /api/prospects/pdf — baixa o PDF do dossiê (F2). Reusa o dossiê já gerado
 * (não re-gasta crédito) + a curadoria de concorrentes. Server-safe (pdf-lib).
 * GET ?cliente=&id=
 */

import { type NextRequest } from "next/server";

import { mergeConcorrentes } from "@/lib/prospects/schema";
import { dossieToPdf } from "@/lib/prospects/pdf";
import { loadContexto } from "@/lib/prospects/contexto";
import { getProspect, loadCuradoria, loadDossie } from "@/lib/prospects/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente")?.trim() || "";
  const id = req.nextUrl.searchParams.get("id")?.trim() || "";
  if (!cliente || !id) return new Response("cliente e id obrigatórios", { status: 400 });

  const prospect = await getProspect(cliente, id);
  if (!prospect) return new Response("prospect não encontrado", { status: 404 });
  const [dossie, curadoria, contexto] = await Promise.all([loadDossie(id), loadCuradoria(id), loadContexto(id)]);
  if (!dossie) return new Response("gere o dossiê antes de baixar o PDF", { status: 400 });

  const concorrentes = mergeConcorrentes(dossie.concorrentes, curadoria);
  const pdf = await dossieToPdf(dossie, prospect, concorrentes, contexto);
  const nome = prospect.nome.replace(/[^\w-]+/g, "-").toLowerCase();
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="dossie-${nome}.pdf"`,
    },
  });
}
