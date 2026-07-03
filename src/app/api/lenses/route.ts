/**
 * /api/lenses — configurar os analistas por ótica (tela Analistas).
 *
 * GET  -> { data: LensesFile } (semeia defaults pra clientes novos).
 * POST -> { action: "update", clientName, lensId, patch } | { action: "reset", clientName, lensId }
 *         -> 200 { data: LensesFile } | 400 { error } (mensagens pt-BR da lib).
 */

import { NextResponse } from "next/server";

import {
  readLenses,
  resetLens,
  updateLens,
  type LensId,
  type LensPatch,
} from "@/lib/lenses";

export const dynamic = "force-dynamic";

const LENS_IDS = ["comercial", "produto", "marketing"];

export async function GET() {
  return NextResponse.json({ data: readLenses() });
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
  const payload = (body ?? {}) as Record<string, unknown>;

  const clientName = typeof payload.clientName === "string" ? payload.clientName : "";
  const lensId = typeof payload.lensId === "string" ? payload.lensId : "";
  if (!clientName || !LENS_IDS.includes(lensId)) {
    return badRequest("Envie clientName e lensId (comercial | produto | marketing).");
  }

  try {
    switch (payload.action) {
      case "update": {
        const raw = (payload.patch ?? {}) as Record<string, unknown>;
        const patch: LensPatch = {};
        if (raw.enabled !== undefined) {
          if (typeof raw.enabled !== "boolean") return badRequest("enabled precisa ser true/false.");
          patch.enabled = raw.enabled;
        }
        if (raw.team !== undefined) {
          if (typeof raw.team !== "string") return badRequest("team precisa ser texto.");
          patch.team = raw.team;
        }
        if (raw.regua !== undefined) {
          if (typeof raw.regua !== "string") return badRequest("regua precisa ser texto.");
          patch.regua = raw.regua;
        }
        if (raw.action !== undefined) {
          if (typeof raw.action !== "string") return badRequest("action precisa ser texto.");
          patch.action = raw.action as LensPatch["action"];
        }
        const data = updateLens(clientName, lensId as LensId, patch);
        return NextResponse.json({ data });
      }
      case "reset": {
        const data = resetLens(clientName, lensId as LensId);
        return NextResponse.json({ data });
      }
      default:
        return badRequest("Ação desconhecida. Use update ou reset.");
    }
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return NextResponse.json({ error: "Erro inesperado." }, { status: 500 });
  }
}
