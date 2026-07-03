/**
 * FECHADURA do Radar (proxy do Next 16; ex-middleware) — o app tem endereço
 * público (radar.formare.tech), então NADA passa sem login.
 *
 * Login = E-MAIL + SENHA (RADAR_APP_EMAIL / RADAR_APP_PASSWORD, uso único do
 * Rafael). O cookie `radar_auth` guarda o SHA-256 de "email:senha" — trocar
 * qualquer um dos dois invalida todas as sessões antigas na hora.
 *
 * - Toda rota (páginas E APIs) exige o cookie válido. Sem ele -> /entrar
 *   (ou 401 JSON para /api/*).
 * - /entrar e /api/entrar ficam abertas (é onde se faz login); estáticos
 *   do Next também.
 * - Sem as envs configuradas, a fechadura fica ABERTA (dev local). Em
 *   produção elas SEMPRE existem no .env.local.
 */

import { NextResponse, type NextRequest } from "next/server";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function proxy(req: NextRequest) {
  const email = process.env.RADAR_APP_EMAIL?.trim().toLowerCase();
  const password = process.env.RADAR_APP_PASSWORD;
  if (!email || !password) return NextResponse.next(); // dev local sem login configurado

  const { pathname } = req.nextUrl;
  if (pathname === "/entrar" || pathname === "/api/entrar") return NextResponse.next();

  const expected = await sha256Hex(`${email}:${password}`);
  if (req.cookies.get("radar_auth")?.value === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const login = req.nextUrl.clone();
  login.pathname = "/entrar";
  login.search = "";
  return NextResponse.redirect(login);
}

export const config = {
  // tudo, exceto estáticos do Next (o proxy decide /entrar por dentro).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
