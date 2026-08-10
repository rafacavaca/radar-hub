/**
 * POST /api/base/upload — envia um MATERIAL (PDF/DOCX/TXT) pra a base de
 * conhecimento nativa de um cliente (D14, F2). Multipart: { cliente, file }.
 * Extrai o texto (unpdf/mammoth) + classifica em fatos INFERIDOS. Org-scoped;
 * rate-limit por org (é caro: parse + LLM); custo medido em ingerirMaterial.
 */

import { NextResponse, type NextRequest } from "next/server";

import { ingerirMaterial } from "@/lib/brain-nativo/upload";
import { currentOrgId } from "@/lib/db/session";
import { supabaseEnabled } from "@/lib/db/supabase";
import { LIMITES, rateLimit, respostaRateLimit } from "@/lib/rate-limit";
import { loadWatchlist } from "@/lib/watchlist";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!supabaseEnabled()) {
    return NextResponse.json({ error: "Base de conhecimento disponível só no modo org." }, { status: 400 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Envio inválido." }, { status: 400 });

  const cliente = String(form.get("cliente") ?? "").trim();
  const file = form.get("file");
  if (!cliente) return NextResponse.json({ error: "Cliente ausente." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo grande demais (máx 8 MB)." }, { status: 400 });

  const watchlist = await loadWatchlist();
  if (!watchlist.clients.some((c) => c.name === cliente)) {
    return NextResponse.json({ error: "Cliente não encontrado nesta org." }, { status: 404 });
  }

  const org = (await currentOrgId()) ?? "sem-org";
  const rl = rateLimit(`brain-upload:${org}`, LIMITES.upload.limit, LIMITES.upload.windowMs);
  if (rl.limited) return respostaRateLimit(rl);

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const res = await ingerirMaterial(cliente, bytes, file.name, file.type || undefined);
    return NextResponse.json({ data: res });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "falha ao ler o material" }, { status: 500 });
  }
}
