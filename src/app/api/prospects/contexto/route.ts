/**
 * /api/prospects/contexto — CONTEXTO PRIVADO (confidencial) do prospect.
 * Org-scoped (o store usa org_docs → RLS/org da sessão). Nunca vaza entre orgs.
 *
 * POST multipart  (arquivo)  campos: cliente, id, file
 * POST json       (nota)     { cliente, id, nota }
 * DELETE ?cliente=&id=&item=  remove um item (arquivo/nota) — ação do usuário
 */

import { NextResponse, type NextRequest } from "next/server";

import { addArquivo, addNota, removeContexto, MAX_ARQUIVO_BYTES } from "@/lib/prospects/contexto";
import { getProspect } from "@/lib/prospects/store";
import { currentOrgId } from "@/lib/db/session";
import { LIMITES, rateLimit, respostaRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // extração + resumo (LLM) do arquivo

const TIPOS_OK = /pdf|word|officedocument|text\/|image\//i;

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") ?? "";

  // ── NOTA (json) ──
  if (ct.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const cliente = typeof body?.cliente === "string" ? body.cliente.trim() : "";
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const nota = typeof body?.nota === "string" ? body.nota : "";
    if (!cliente || !id) return NextResponse.json({ error: "cliente e id obrigatórios" }, { status: 400 });
    if (!(await getProspect(cliente, id))) return NextResponse.json({ error: "prospect não encontrado" }, { status: 404 });
    try {
      const item = await addNota(id, nota);
      return NextResponse.json({ data: { item } });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "falha" }, { status: 400 });
    }
  }

  // ── ARQUIVO (multipart) ──
  const form = await req.formData().catch(() => null);
  const cliente = String(form?.get("cliente") ?? "").trim();
  const id = String(form?.get("id") ?? "").trim();
  const file = form?.get("file");
  if (!cliente || !id) return NextResponse.json({ error: "cliente e id obrigatórios" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "envie um arquivo" }, { status: 400 });
  if (file.size > MAX_ARQUIVO_BYTES) return NextResponse.json({ error: `Arquivo grande demais (máx. ${Math.round(MAX_ARQUIVO_BYTES / 1024 / 1024)} MB).` }, { status: 400 });
  if (file.type && !TIPOS_OK.test(file.type)) return NextResponse.json({ error: "Tipo não suportado — use PDF, DOCX, TXT ou imagem." }, { status: 400 });
  if (!(await getProspect(cliente, id))) return NextResponse.json({ error: "prospect não encontrado" }, { status: 404 });

  // Upload dispara extração + resumo por LLM — trava loop por org.
  const org = (await currentOrgId()) ?? "anon";
  const rl = rateLimit(`upload:${org}`, LIMITES.upload.limit, LIMITES.upload.windowMs);
  if (rl.limited) return respostaRateLimit(rl);

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { item, erro } = await addArquivo(id, cliente, file.name, file.type || undefined, bytes);
    return NextResponse.json({ data: { item, aviso: erro } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "falha ao processar o arquivo" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente")?.trim() || "";
  const id = req.nextUrl.searchParams.get("id")?.trim() || "";
  const item = req.nextUrl.searchParams.get("item")?.trim() || "";
  if (!cliente || !id || !item) return NextResponse.json({ error: "cliente, id e item obrigatórios" }, { status: 400 });
  if (!(await getProspect(cliente, id))) return NextResponse.json({ error: "prospect não encontrado" }, { status: 404 });
  await removeContexto(id, item);
  return NextResponse.json({ data: { deleted: item } });
}
