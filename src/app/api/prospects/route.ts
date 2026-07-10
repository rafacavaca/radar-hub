/**
 * /api/prospects — CRUD leve dos prospects (F1). Org-scoped (o store usa a org
 * da sessão). Gerar o dossiê (caro) é a rota /api/prospects/dossie.
 *
 * POST   { cliente, nome, siteUrl, reuniaoEm?, contato?, contexto? } -> cria/atualiza
 * PATCH  { cliente, id, patch }                                      -> status/campos
 * DELETE ?cliente=&id=                                               -> remove (+dossiê)
 */

import { NextResponse, type NextRequest } from "next/server";

import { normalizeSiteUrl } from "@/lib/discovery";
import { loadProspects, patchProspect, prospectId, removeProspect, upsertProspect } from "@/lib/prospects/store";
import type { Prospect } from "@/lib/prospects/schema";

export const dynamic = "force-dynamic";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function GET(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente")?.trim() || "";
  if (!cliente) return NextResponse.json({ error: "cliente obrigatório" }, { status: 400 });
  return NextResponse.json({ data: { prospects: await loadProspects(cliente) } });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const cliente = str(body?.cliente);
  const nome = str(body?.nome);
  const siteRaw = str(body?.siteUrl);
  if (!cliente || !nome || !siteRaw) {
    return NextResponse.json({ error: "Envie cliente, nome e siteUrl." }, { status: 400 });
  }
  let siteUrl: string;
  try {
    siteUrl = normalizeSiteUrl(siteRaw);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "site inválido" }, { status: 400 });
  }

  const reuniaoEm = str(body?.reuniaoEm);
  const id = prospectId(cliente, siteUrl);
  const existentes = await loadProspects(cliente);
  const atual = existentes.find((p) => p.id === id);

  const prospect: Prospect = {
    id,
    clientName: cliente,
    nome,
    siteUrl,
    reuniaoEm: reuniaoEm || null,
    contato: str(body?.contato) || null,
    contexto: str(body?.contexto) || null,
    status: "ativo",
    criadoEm: atual?.criadoEm ?? new Date().toISOString(),
    dossieEm: atual?.dossieEm ?? null,
  };
  await upsertProspect(prospect);
  return NextResponse.json({ data: { prospect } });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const cliente = str(body?.cliente);
  const id = str(body?.id);
  if (!cliente || !id) return NextResponse.json({ error: "cliente e id obrigatórios" }, { status: 400 });
  const patch = (body?.patch ?? {}) as Partial<Prospect>;
  const allowed: Partial<Prospect> = {};
  if (patch.status === "ativo" || patch.status === "arquivado" || patch.status === "promovido") allowed.status = patch.status;
  if (typeof patch.reuniaoEm === "string" || patch.reuniaoEm === null) allowed.reuniaoEm = patch.reuniaoEm;
  if (typeof patch.contato === "string") allowed.contato = patch.contato;
  if (typeof patch.contexto === "string") allowed.contexto = patch.contexto;
  const updated = await patchProspect(cliente, id, allowed);
  if (!updated) return NextResponse.json({ error: "prospect não encontrado" }, { status: 404 });
  return NextResponse.json({ data: { prospect: updated } });
}

export async function DELETE(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente")?.trim() || "";
  const id = req.nextUrl.searchParams.get("id")?.trim() || "";
  if (!cliente || !id) return NextResponse.json({ error: "cliente e id obrigatórios" }, { status: 400 });
  await removeProspect(cliente, id);
  return NextResponse.json({ data: { deleted: id } });
}
