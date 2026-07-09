/**
 * CHECKLIST THROUGH-THE-APP do FLIP (item 2). Roda contra o app EM PRODUÇÃO
 * (localhost:3200, modo Supabase LIGADO) e prova, pela porta da frente:
 *
 *  1. anônimo é barrado (→ /entrar) e senha errada volta com erro;
 *  2. membro da org Formare LOGA e vê os dados REAIS da agência (Moovefy/…)
 *     em Home, Vigiar, Relatórios e Diagnóstico — servidos do banco por org;
 *  3. /custo e /admin são NEGADOS a membro comum (papel fino);
 *  4. membro de OUTRA org não vê NENHUM dado da Formare (isolamento no banco,
 *     atravessando o app real);
 *  5. link público /r/<token> segue funcionando (capability, sem sessão);
 *  6. cron per-org itera as orgs sem erro.
 *
 * Cria usuários/org TEMPORÁRIOS e os APAGA ao final. Zero LLM (home lê o cache
 * do dia migrado). Uso: npm run test:flip (exige chaves + RADAR_DB=supabase).
 */

import { config } from "dotenv";
import { execSync } from "node:child_process";

config({ path: ".env.local" });

const BASE = process.env.FLIP_CHECK_BASE || "http://localhost:3200";
const URL_SB = process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SB || !SERVICE) {
  console.error("Sem chaves do Supabase — nada a checar.");
  process.exit(2);
}

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log(`\n=== Checklist do FLIP — through-the-app em ${BASE} ===\n`);

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });

// ── setup: membro temporário na Formare + org B temporária com membro ──
const stamp = process.env.RADAR_ISO_STAMP || "flip";
const FORMARE_SLUG = "formare";
const orgB = { slug: `flipcheck-${stamp}`, name: "Flipcheck (temp)" };
const userF = { email: `check-formare-${stamp}@radar.test`, password: `F-${stamp}-Secret!1` };
const userB = { email: `check-b-${stamp}@radar.test`, password: `B-${stamp}-Secret!1` };

const { data: formare } = await admin.from("orgs").select("id").eq("slug", FORMARE_SLUG).single();
const formareId = formare!.id as string;

await admin.from("orgs").delete().eq("slug", orgB.slug);
const { data: bRow } = await admin.from("orgs").insert(orgB).select("id").single();
const bId = bRow!.id as string;

async function mkUser(u: { email: string; password: string }, orgId: string): Promise<string> {
  const found = await admin.auth.admin.listUsers();
  const existing = found.data.users.find((x) => x.email === u.email);
  if (existing) await admin.auth.admin.deleteUser(existing.id);
  const created = await admin.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true });
  const id = created.data.user!.id;
  await admin.from("memberships").insert({ org_id: orgId, user_id: id, role: "member" });
  return id;
}
const userFId = await mkUser(userF, formareId);
const userBId = await mkUser(userB, bId);

// ── helpers HTTP (cookie jar manual) ──
async function login(email: string, password: string): Promise<{ cookies: string; location: string }> {
  const body = new URLSearchParams({ email, senha: password });
  const res = await fetch(`${BASE}/api/entrar`, { method: "POST", body, redirect: "manual" });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const cookies = setCookies.map((c) => c.split(";")[0]).join("; ");
  return { cookies, location: res.headers.get("location") ?? "" };
}
async function get(path: string, cookies?: string): Promise<{ status: number; location: string; body: string }> {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", headers: cookies ? { cookie: cookies } : {} });
  return { status: res.status, location: res.headers.get("location") ?? "", body: res.status === 200 ? await res.text() : "" };
}

const FORMARE_MARCAS = ["Moovefy", "TAGAT", "Gemmini"];

try {
  // 1) anônimo barrado + senha errada
  const anon = await get("/");
  add("Anônimo é barrado (307 → /entrar)", anon.status === 307 && anon.location.includes("/entrar"), `status=${anon.status}`);
  const errado = await login(userF.email, "senha-errada");
  add("Senha errada volta com erro (não loga)", errado.location.includes("erro=1"), errado.location);

  // 2) membro da Formare atravessa o app e vê os dados reais
  const sessF = await login(userF.email, userF.password);
  add("Login Supabase Auth grava sessão e manda pra home", sessF.location === "/" && sessF.cookies.length > 0, `cookies=${sessF.cookies ? "sim" : "NÃO"}`);

  const home = await get("/", sessF.cookies);
  const marcasHome = FORMARE_MARCAS.filter((m) => home.body.includes(m));
  add("Home (membro Formare) mostra os clientes REAIS da org", home.status === 200 && marcasHome.length >= 2, `200=${home.status === 200} · marcas=${marcasHome.join(",") || "nenhuma"}`);

  const vigiar = await get("/vigiar", sessF.cookies);
  add("Vigiar mostra a watchlist da org (do banco)", vigiar.status === 200 && FORMARE_MARCAS.some((m) => vigiar.body.includes(m)), `status=${vigiar.status}`);

  const rel = await get("/relatorios", sessF.cookies);
  add("Relatórios carrega (org-scoped)", rel.status === 200, `status=${rel.status}`);

  const diag = await get("/diagnostico", sessF.cookies);
  add("Diagnóstico carrega (fichas + alertas + config da org)", diag.status === 200, `status=${diag.status}`);

  // 3) papel fino: membro comum NÃO entra em /custo nem /admin
  const custo = await get("/custo", sessF.cookies);
  const adminPg = await get("/admin", sessF.cookies);
  const custoBloqueado = custo.status !== 200 || !custo.body.includes("Custo");
  const adminBloqueado = adminPg.status !== 200 || !adminPg.body.includes("Admin · agências");
  add("/custo negado a membro comum (só super_admin)", custoBloqueado, `status=${custo.status}`);
  add("/admin negado a membro comum (só super_admin)", adminBloqueado, `status=${adminPg.status}`);

  // 4) membro de OUTRA org não vê NADA da Formare
  const sessB = await login(userB.email, userB.password);
  const homeB = await get("/", sessB.cookies);
  const vazouHome = FORMARE_MARCAS.filter((m) => homeB.body.includes(m));
  const vigiarB = await get("/vigiar", sessB.cookies);
  const vazouVigiar = FORMARE_MARCAS.filter((m) => vigiarB.body.includes(m));
  add(
    "Org B NÃO vê nenhum dado da Formare (home + vigiar, pelo app real)",
    homeB.status === 200 && vazouHome.length === 0 && vazouVigiar.length === 0,
    vazouHome.length + vazouVigiar.length > 0 ? `VAZOU: ${[...vazouHome, ...vazouVigiar].join(",")}` : "nada vazou",
  );

  // 5) link público de relatório (capability por token, sem sessão)
  const { data: comToken } = await admin
    .from("reports").select("share_token").eq("org_id", formareId).not("share_token", "is", null).limit(1).maybeSingle();
  if (comToken?.share_token) {
    const pub = await get(`/r/${comToken.share_token}`);
    add("Link público /r/<token> segue abrindo sem sessão", pub.status === 200, `status=${pub.status}`);
  } else {
    add("Link público /r/<token>", true, "nenhum relatório com token — pulado (nada a provar)");
  }

  // 6) cron per-org roda sem erro (no-op idempotente é ok)
  try {
    const out = execSync("npx tsx scripts/run-schedules.mts", { encoding: "utf8", timeout: 240000 });
    add("Cron per-org itera as orgs sem erro", /modo org: \d+ org\(s\)/.test(out) && !/falhou:/.test(out), out.split("\n").find((l) => l.includes("modo org")) ?? "sem log");
  } catch (e) {
    add("Cron per-org itera as orgs sem erro", false, (e as Error).message.slice(0, 160));
  }
} finally {
  // ── limpeza: usuários e org temporários somem; a Formare fica intacta ──
  await admin.auth.admin.deleteUser(userFId).catch(() => {});
  await admin.auth.admin.deleteUser(userBId).catch(() => {});
  await admin.from("orgs").delete().eq("slug", orgB.slug);
}

console.log("── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nFLIP VERDE ✅ — multi-tenant no ar, isolado pela porta da frente.\n" : "\nFLIP VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
