/**
 * FECHADURA do Radar (proxy do Next 16; ex-middleware) — o app vai ganhar endereço público (radar.formare.tech
 * via Cloudflare Tunnel), então NADA passa sem a senha (RADAR_APP_PASSWORD).
 *
 * Como funciona:
 * - Toda rota (páginas E APIs) exige o cookie `radar_auth` com o SHA-256 da
 *   senha. Sem ele -> página /entrar (ou 401 JSON para /api/*).
 * - /entrar e /api/entrar ficam abertas (é onde se digita a senha);
 *   estáticos do Next (_next, favicon) também.
 * - Sem RADAR_APP_PASSWORD definida, a fechadura fica ABERTA (dev local).
 *   Em produção ela SEMPRE deve estar no .env.local.
 */

import { NextResponse, type NextRequest } from "next/server";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function proxy(req: NextRequest) {
  const password = process.env.RADAR_APP_PASSWORD;
  if (!password) return NextResponse.next(); // dev local sem senha configurada

  const { pathname } = req.nextUrl;
  if (pathname === "/entrar" || pathname === "/api/entrar") return NextResponse.next();

  const expected = await sha256Hex(password);
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
  // tudo, exceto estáticos do Next (o middleware decide /entrar por dentro).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
