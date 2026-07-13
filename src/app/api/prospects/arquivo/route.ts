/**
 * /api/prospects/arquivo — DOWNLOAD do arquivo privado. NUNCA público: só esta
 * rota autenticada serve os bytes, lendo pela SESSÃO (o store é org-scoped via
 * org_docs/RLS → devolve só o da própria org). Sem URL assinada aberta, sem
 * service_role. Confidencial de ponta a ponta.
 *
 * GET ?cliente=&id=&item=  -> o arquivo (inline), ou 404
 */

import { type NextRequest } from "next/server";

import { loadArquivoBytes, loadContexto } from "@/lib/prospects/contexto";
import { getProspect } from "@/lib/prospects/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente")?.trim() || "";
  const id = req.nextUrl.searchParams.get("id")?.trim() || "";
  const item = req.nextUrl.searchParams.get("item")?.trim() || "";
  if (!cliente || !id || !item) return new Response("parâmetros obrigatórios", { status: 400 });

  // dupla checagem: o prospect é da org da sessão E o item pertence a ele.
  if (!(await getProspect(cliente, id))) return new Response("não encontrado", { status: 404 });
  const pertence = (await loadContexto(id)).some((c) => c.id === item && c.temArquivo);
  if (!pertence) return new Response("não encontrado", { status: 404 });

  const arq = await loadArquivoBytes(item);
  if (!arq) return new Response("não encontrado", { status: 404 });

  return new Response(new Uint8Array(arq.bytes), {
    headers: {
      "Content-Type": arq.mime,
      "Content-Disposition": `inline; filename="${arq.nome.replace(/[^\w.\-]+/g, "_")}"`,
      "Cache-Control": "private, no-store", // confidencial — nunca em cache compartilhado
    },
  });
}
