/**
 * FECHADURA do Radar (proxy do Next 16; ex-middleware) — o app tem endereço
 * público (radar.formare.tech), então NADA passa sem login.
 *
 * Login = E-MAIL + SENHA. MULTI-USUÁRIO: o principal (RADAR_APP_EMAIL /
 * RADAR_APP_PASSWORD) + extras em RADAR_APP_USERS (ver `@/lib/auth`). O cookie
 * `radar_auth` guarda o SHA-256 de "email:senha" de UM usuário; o portão aceita
 * o cookie que bater com QUALQUER usuário cadastrado.
 *
 * - Toda rota (páginas E APIs) exige o cookie válido. Sem ele -> /entrar
 *   (ou 401 JSON para /api/*).
 * - /entrar e /api/entrar ficam abertas (é onde se faz login); estáticos
 *   do Next também.
 * - Sem as envs configuradas, a fechadura fica ABERTA (dev local). Em
 *   produção elas SEMPRE existem no .env.local.
 */

import { NextResponse, type NextRequest } from "next/server";

import { getAuthUsers } from "@/lib/auth";
import { supabaseEnabled } from "@/lib/db/supabase";
import { supabaseProxyClient } from "@/lib/db/session-proxy";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Rotas abertas (login + capabilities por token) — iguais nos dois modos. */
function isOpenPath(pathname: string): boolean {
  return (
    pathname === "/entrar" ||
    pathname === "/api/entrar" ||
    pathname === "/api/ingest" ||
    pathname.startsWith("/r/") ||
    pathname === "/api/reports/shared-export"
  );
}

/**
 * MULTI-TENANT (item 2): quando o Supabase está ligado, a fechadura é a SESSÃO
 * do Supabase Auth. Valida (e refresca) via getUser; sem sessão -> /entrar
 * (ou 401 JSON). O isolamento por org é do banco (RLS) — o proxy só cuida do
 * "está logado?". Papel fino (super_admin em /custo, /admin) é reforçado nas
 * próprias páginas (server-side), além da RLS.
 */
async function proxySupabase(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  if (isOpenPath(pathname)) return NextResponse.next();

  const { supabase, response } = supabaseProxyClient(req);
  const { data } = await supabase.auth.getUser();
  if (data.user) return response; // sessão válida (cookies já refrescados no response)

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const login = req.nextUrl.clone();
  login.pathname = "/entrar";
  login.search = "";
  return NextResponse.redirect(login);
}

export async function proxy(req: NextRequest) {
  // Modo multi-tenant (flag + chaves) — caminho novo, isolado do clássico.
  if (supabaseEnabled()) return proxySupabase(req);

  const users = getAuthUsers();
  if (users.length === 0) return NextResponse.next(); // dev local sem login configurado

  const { pathname } = req.nextUrl;
  // /api/ingest é aberta no proxy (a extensão POSTa por fora da página); ela tem
  // o próprio portão por segredo compartilhado (RADAR_INGEST_SECRET).
  // /r/<token> e /api/reports/shared-export são links COMPARTILHÁVEIS de relatório
  // (G): a capability é o token (sha1 de 24 chars, imprevisível) — quem tem o
  // link vê/baixa o snapshot, sem senha do Radar (como um "anyone with link").
  if (isOpenPath(pathname)) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get("radar_auth")?.value;
  if (cookie) {
    const valid = await Promise.all(users.map((u) => sha256Hex(`${u.email}:${u.password}`)));
    if (valid.includes(cookie)) {
      // ADMIN (só Rafael, o 1º usuário): /custo e /admin (gerir orgs) são do
      // dono. No modo clássico admin == usuário PRINCIPAL (no modo Supabase o
      // papel super_admin é checado nas próprias páginas/rotas).
      const ehAdminRota =
        pathname === "/custo" ||
        pathname.startsWith("/api/custo") ||
        pathname === "/admin" ||
        pathname.startsWith("/api/admin");
      if (ehAdminRota) {
        const adminCookie = await sha256Hex(`${users[0].email}:${users[0].password}`);
        if (cookie !== adminCookie) {
          if (pathname.startsWith("/api/")) return NextResponse.json({ error: "só o admin" }, { status: 403 });
          const home = req.nextUrl.clone();
          home.pathname = "/";
          home.search = "";
          return NextResponse.redirect(home);
        }
      }
      return NextResponse.next();
    }
  }

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
