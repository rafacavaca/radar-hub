/**
 * GET /api/formare-workspaces — os clientes (workspaces) que EXISTEM no
 * Formare, pela porta estreita (F7 — multi-cliente).
 *
 * Serve pra tela Vigiar oferecer os nomes CERTOS ao adicionar um cliente:
 * o nome precisa casar com `workspaces.name` pra o Brain e os cards baterem.
 * Porta fora do ar -> devolve lista vazia + warning honesto (a tela cai no
 * campo manual — nunca trava o Rafael).
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 8000;

function doorBaseUrl(): string | null {
  if (process.env.RADAR_DOOR_BASE_URL) return process.env.RADAR_DOOR_BASE_URL;
  const brain = process.env.RADAR_BRAIN_URL;
  if (brain) return brain.replace(/\/brain\/?$/, "");
  return null;
}

export async function GET() {
  const base = doorBaseUrl();
  const secret = process.env.RADAR_DOOR_SECRET || process.env.RADAR_BRAIN_SECRET;
  if (!base || !secret) {
    return NextResponse.json({
      data: { workspaces: [], warning: "porta do Formare não configurada" },
    });
  }

  try {
    const res = await fetch(`${base}/workspaces`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      return NextResponse.json({
        data: { workspaces: [], warning: `porta respondeu ${res.status}` },
      });
    }
    const payload = (await res.json()) as { data?: { workspaces?: string[] } };
    return NextResponse.json({ data: { workspaces: payload.data?.workspaces ?? [] } });
  } catch {
    return NextResponse.json({
      data: { workspaces: [], warning: "porta do Formare fora do ar" },
    });
  }
}
