/**
 * POST /api/entrar — valida E-MAIL + SENHA do Radar e abre a fechadura.
 *
 * Recebe o form da página /entrar (campos `email` e `senha`). Credenciais
 * certas -> cookie `radar_auth` (SHA-256 de "email:senha", httpOnly, 30 dias)
 * + redirect pra home. Erradas -> volta pra /entrar?erro=1.
 * Nunca loga e-mail nem senha.
 */

import { createHash } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 dias

export async function POST(req: NextRequest) {
  const expectedEmail = process.env.RADAR_APP_EMAIL?.trim().toLowerCase();
  const password = process.env.RADAR_APP_PASSWORD;
  if (!expectedEmail || !password) {
    // fechadura desligada (dev) — só volta pra home.
    return NextResponse.redirect(new URL("/", req.url), 303);
  }

  const form = await req.formData().catch(() => null);
  const email = String(form?.get("email") ?? "").trim().toLowerCase();
  const senha = String(form?.get("senha") ?? "");

  if (email !== expectedEmail || senha !== password) {
    return NextResponse.redirect(new URL("/entrar?erro=1", req.url), 303);
  }

  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(
    "radar_auth",
    createHash("sha256").update(`${expectedEmail}:${password}`).digest("hex"),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE_S,
    },
  );
  return res;
}
