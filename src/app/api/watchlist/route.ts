/**
 * /api/watchlist — a porta de edição da vigilância do Radar.
 *
 * GET  -> devolve a watchlist atual { data }.
 * POST -> muta a watchlist. O corpo é discriminado por `action`:
 *   - { action: "add",    clientName, name, blogUrl, siteUrl? }  -> addCompetitor
 *   - { action: "remove", clientName, competitorId }             -> removeCompetitor
 *   - { action: "toggle", clientName, competitorId, enabled }    -> setCompetitorEnabled
 *
 * A lib (`@/lib/watchlist`) é a fonte de verdade e lança Error com mensagem
 * amigável (pt-BR) quando a entrada é inválida — aqui isso vira 400 { error }.
 * Corpo malformado ou ação desconhecida também dão 400; imprevistos, 500.
 * Sucesso sempre devolve a lista JÁ atualizada { data }, pra tela re-renderizar.
 */

import { NextResponse } from "next/server";

import {
  addCompetitor,
  readWatchlist,
  removeCompetitor,
  setCompetitorEnabled,
  type AddCompetitorInput,
} from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ data: readWatchlist() });
}

/** true só para string de verdade — checagem defensiva do corpo, sem zod. */
function isString(value: unknown): value is string {
  return typeof value === "string";
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Corpo inválido: envie um JSON.");
  }

  if (!body || typeof body !== "object") {
    return badRequest("Corpo inválido: esperado um objeto JSON.");
  }

  const payload = body as Record<string, unknown>;

  try {
    switch (payload.action) {
      case "add": {
        if (!isString(payload.clientName) || !isString(payload.name)) {
          return badRequest("Envie clientName e name como texto.");
        }
        if (payload.siteUrl !== undefined && !isString(payload.siteUrl)) {
          return badRequest("O campo siteUrl, quando enviado, precisa ser texto.");
        }
        if (payload.blogUrl !== undefined && !isString(payload.blogUrl)) {
          return badRequest("O campo blogUrl, quando enviado, precisa ser texto.");
        }
        // fontes descobertas/confirmadas na tela: [{kind, url}] — a lib valida
        // tipo e URL uma a uma (mensagens amigáveis).
        let sources: Array<{ kind: string; url: string }> | undefined;
        if (payload.sources !== undefined) {
          if (!Array.isArray(payload.sources)) {
            return badRequest("O campo sources precisa ser uma lista.");
          }
          sources = [];
          for (const s of payload.sources) {
            const kind = (s as Record<string, unknown>)?.kind;
            const url = (s as Record<string, unknown>)?.url;
            if (!isString(kind) || !isString(url)) {
              return badRequest("Cada fonte precisa de kind e url como texto.");
            }
            sources.push({ kind, url });
          }
        }
        const data = addCompetitor(payload.clientName, {
          name: payload.name,
          blogUrl: isString(payload.blogUrl) ? payload.blogUrl : undefined,
          siteUrl: isString(payload.siteUrl) ? payload.siteUrl : undefined,
          // a lib valida kind/url em runtime com mensagens amigáveis.
          sources: sources as AddCompetitorInput["sources"],
        });
        return NextResponse.json({ data });
      }

      case "remove": {
        if (!isString(payload.clientName) || !isString(payload.competitorId)) {
          return badRequest("Envie clientName e competitorId como texto.");
        }
        const data = removeCompetitor(payload.clientName, payload.competitorId);
        return NextResponse.json({ data });
      }

      case "toggle": {
        if (!isString(payload.clientName) || !isString(payload.competitorId)) {
          return badRequest("Envie clientName e competitorId como texto.");
        }
        if (typeof payload.enabled !== "boolean") {
          return badRequest("O campo enabled precisa ser true ou false.");
        }
        const data = setCompetitorEnabled(
          payload.clientName,
          payload.competitorId,
          payload.enabled,
        );
        return NextResponse.json({ data });
      }

      default:
        return badRequest("Ação desconhecida. Use add, remove ou toggle.");
    }
  } catch (err) {
    // A lib lança Error (pt-BR) para entradas inválidas -> 400 com a mensagem.
    if (err instanceof Error) return badRequest(err.message);
    // Qualquer coisa fora disso é imprevisto -> 500.
    return NextResponse.json(
      { error: "Erro inesperado ao atualizar a vigilância." },
      { status: 500 },
    );
  }
}
