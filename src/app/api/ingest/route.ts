/**
 * POST /api/ingest — a INGESTÃO de posts (hoje: LinkedIn via extensão "Enviar
 * pro Radar"). Aceita o OBJETO NORMALIZADO; qualquer captura (botão, print, API)
 * que produza esse objeto alimenta o Radar. O post cai no pilar certo pelo
 * `papel` (concorrente/conta-chave) e a data relativa vira absoluta.
 *
 * Aberto no proxy (não exige o cookie de sessão) porque a extensão POSTa por
 * fora da página; a porta é guardada por SEGREDO COMPARTILHADO (RADAR_INGEST_SECRET,
 * Bearer). FAIL-CLOSED: sem o segredo configurado, a rota fica DESLIGADA (503) —
 * nunca aberta (o payload vira input de LLM, então porta aberta = injeção).
 *
 * body (normalizado): { perfil, papel, workspace, texto, data_publicacao, data_coleta?, url }
 *   -> 200 { data: LinkedInPost }  |  400 { error }  |  401
 */

import { NextResponse, type NextRequest } from "next/server";

import { ingestLinkedInPost, type IngestInput } from "@/lib/linkedin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // FAIL-CLOSED: sem segredo configurado, a ingestão fica desligada (nunca aberta).
  const secret = process.env.RADAR_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "ingestão indisponível" }, { status: 503 });
  }
  // A extensão manda Authorization: Bearer <segredo>.
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  let body: IngestInput;
  try {
    body = (await req.json()) as IngestInput;
  } catch {
    return NextResponse.json({ error: "Corpo inválido: envie um JSON." }, { status: 400 });
  }

  try {
    const post = ingestLinkedInPost(body);
    return NextResponse.json({ data: post });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao ingerir o post.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
