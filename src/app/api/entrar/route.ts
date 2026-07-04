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

import { findAuthUser, getAuthUsers } from "@/lib/auth";

export const dynamic = "force-dynamic";

const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 dias

/**
 * Redirect RELATIVO (303) — o `Location` relativo é resolvido pelo NAVEGADOR
 * contra a URL que ele pediu (ex.: radar.formare.tech), não contra o host
 * interno. Necessário atrás do túnel: o `req.url` do route handler aponta pra
 * localhost:3200 (quirk do Next), e um redirect ABSOLUTO mandava o usuário
 * logado pra localhost — quebrando o acesso de quem entra pela URL pública.
 */
function seeOther(location: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: location } });
}

export async function POST(req: NextRequest) {
  if (getAuthUsers().length === 0) {
    // fechadura desligada (dev) — só volta pra home.
    return seeOther("/");
  }

  const form = await req.formData().catch(() => null);
  const email = String(form?.get("email") ?? "").trim().toLowerCase();
  const senha = String(form?.get("senha") ?? "");

  const user = findAuthUser(email, senha);
  if (!user) {
    return seeOther("/entrar?erro=1");
  }

  const res = seeOther("/");
  res.cookies.set(
    "radar_auth",
    createHash("sha256").update(`${user.email}:${user.password}`).digest("hex"),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE_S,
    },
  );
  return res;
}
