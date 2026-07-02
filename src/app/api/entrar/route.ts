/**
 * POST /api/entrar — valida a senha do Radar e abre a fechadura.
 *
 * Recebe o form da página /entrar (campo `senha`). Senha certa -> cookie
 * `radar_auth` (SHA-256 da senha, httpOnly, 30 dias) + redirect pra home.
 * Senha errada -> volta pra /entrar?erro=1. Nunca loga a senha.
 */

import { createHash } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 dias

export async function POST(req: NextRequest) {
  const password = process.env.RADAR_APP_PASSWORD;
  if (!password) {
    // fechadura desligada (dev) — só volta pra home.
    return NextResponse.redirect(new URL("/", req.url), 303);
  }

  const form = await req.formData().catch(() => null);
  const senha = String(form?.get("senha") ?? "");

  if (senha !== password) {
    return NextResponse.redirect(new URL("/entrar?erro=1", req.url), 303);
  }

  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set("radar_auth", createHash("sha256").update(password).digest("hex"), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S,
  });
  return res;
}
