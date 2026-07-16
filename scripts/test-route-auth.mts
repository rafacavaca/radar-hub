/**
 * TESTE DA PORTA (não da lógica). O smoke:ficha testa o motor; ESTE exercita a
 * ROTA REAL com uma SESSÃO REAL de super_admin, através do PROXY (a fechadura do
 * Radar) — o ponto cego que deixou "verde" enquanto o ar estava vermelho.
 *
 * Cria um super_admin efêmero na org Formare, loga de verdade em /api/entrar
 * (cookies de sessão reais), e POSTa nas rotas super_admin-gated batendo no
 * servidor de PRODUÇÃO local (127.0.0.1:3200) — o mesmo que serve o Rafael.
 * Assere 200 (a porta abre). Se a rota de import diverge do resto, quebra aqui.
 * Apaga o usuário no fim.
 *
 * Requer o server no ar (systemd radar-hub) + chaves do Supabase (.env.local).
 * Uso: npm run test:route-auth
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const BASE = process.env.RADAR_BASE_URL || "http://127.0.0.1:3200";
const FORMARE_ORG = "98e90ffe-1ece-4c05-8c09-43acaafcae7f";
const EMAIL = "route-auth@formare.tech";
const SENHA = "Route!" + "aX9r2Qm7";

const URL = process.env.RADAR_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !SERVICE) {
  console.log("⚠ Sem chaves do Supabase — este teste precisa delas (cria usuário efêmero).");
  process.exit(2);
}

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

type Item = { nome: string; estado: "ok" | "falhou"; detalhe?: string };
const itens: Item[] = [];
const reg = (nome: string, ok: boolean, detalhe?: string) => itens.push({ nome, estado: ok ? "ok" : "falhou", detalhe });

async function apagar(): Promise<void> {
  const { data } = await admin.auth.admin.listUsers();
  const u = data.users.find((x) => x.email?.toLowerCase() === EMAIL);
  if (!u) return;
  await admin.from("memberships").delete().eq("user_id", u.id).eq("org_id", FORMARE_ORG);
  await admin.auth.admin.deleteUser(u.id);
}

/** Loga de verdade em /api/entrar e devolve o header Cookie da sessão. */
async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/entrar`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: EMAIL, senha: SENHA }).toString(),
  });
  const setC = res.headers.getSetCookie?.() ?? [];
  const jar = setC.map((c) => c.split(";")[0]).filter((c) => c.includes("=") && !c.endsWith("=")).join("; ");
  const loc = res.headers.get("location");
  if (loc?.includes("erro=1")) throw new Error("login falhou (credenciais)");
  if (!jar) throw new Error("login não devolveu cookie de sessão");
  return jar;
}

/**
 * Forja o cookie de sessão com `expires_at` NO PASSADO (refresh token intacto) —
 * simula o access token EXPIRADO do Rafael. O proxy é obrigado a REFRESCAR pra
 * abrir. É o caminho que o login fresco pula (e onde a porta quebrava).
 */
function forjarExpirado(cookieHeader: string): { cookie: string; forjou: boolean } {
  let forjou = false;
  const cookie = cookieHeader
    .split("; ")
    .map((p) => {
      const eq = p.indexOf("=");
      const name = p.slice(0, eq);
      const value = p.slice(eq + 1);
      if (!name.includes("auth-token") || !value.startsWith("base64-")) return p;
      try {
        const json = JSON.parse(Buffer.from(value.slice(7), "base64").toString("utf8"));
        if (json && typeof json === "object" && "expires_at" in json) {
          json.expires_at = Math.floor(new Date("2020-01-01").getTime() / 1000);
          json.expires_in = -3600;
          forjou = true;
          return `${name}=base64-${Buffer.from(JSON.stringify(json)).toString("base64")}`;
        }
      } catch {
        /* formato inesperado — deixa como está */
      }
      return p;
    })
    .join("; ");
  return { cookie, forjou };
}

async function postJson(path: string, cookie: string, body: unknown): Promise<{ status: number; body: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.text()).slice(0, 200) };
}

console.log("\n=== Teste da PORTA — rota real + sessão real de super_admin ===\n");

await apagar();
const criado = await admin.auth.admin.createUser({ email: EMAIL, password: SENHA, email_confirm: true });
if (criado.error || !criado.data.user) { console.error("createUser:", criado.error?.message); process.exit(1); }
await admin.from("memberships").upsert({ org_id: FORMARE_ORG, user_id: criado.data.user.id, role: "super_admin" }, { onConflict: "org_id,user_id" });

try {
  const cookie = await login();
  reg("Login real em /api/entrar devolve cookie de sessão", !!cookie, `${cookie.split(";").length} cookie(s)`);

  const fichaMin = { ficha_version: 1, agencia: "Formare", criterio_agencia: { prioridade: { status: "definido", valor: { alta_a_partir_de: 80, media_a_partir_de: 50 } } } };

  // A ROTA DO IMPORT (preview) — o bug do Rafael
  const imp = await postJson("/api/implantacao/import", cookie, { json: fichaMin, mode: "preview" });
  reg("POST /api/implantacao/import (preview) → 200 (a porta abre)", imp.status === 200, `status ${imp.status} · ${imp.body}`);

  // BODY GRANDE — o Rafael cola uma Ficha real (grande); o proxy edge + getUser
  // pode tropeçar num body grande. 300 contas ~ dezenas de KB.
  const fichaGrande = {
    ficha_version: 1,
    agencia: "Formare",
    criterio_agencia: { prioridade: { status: "definido", valor: { alta_a_partir_de: 80, media_a_partir_de: 50 } } },
    contas: Array.from({ length: 300 }, (_, i) => ({
      nome: `Conta ${i}`,
      base_conhecimento: { status: "definido", valor: "Descrição longa da conta ".repeat(30), origem: "local" },
    })),
  };
  const kb = Math.round(JSON.stringify({ json: fichaGrande, mode: "preview" }).length / 1024);
  const impBig = await postJson("/api/implantacao/import", cookie, { json: fichaGrande, mode: "preview" });
  reg(`POST /api/implantacao/import com BODY GRANDE (~${kb}KB) → 200`, impBig.status === 200, `status ${impBig.status} · ${impBig.body.slice(0, 80)}`);

  // Rotas super_admin que "funcionam" — mesma sessão, pra comparar
  const marcar = await postJson("/api/implantacao", cookie, { id: "rotulos", status: "pendente" });
  reg("POST /api/implantacao (marcar-definido) → 200 (comparação)", marcar.status === 200, `status ${marcar.status} · ${marcar.body}`);

  const prio = await postJson("/api/prioridade", cookie, { alta: 70, media: 40 });
  reg("POST /api/prioridade (salvar régua) → 200 (comparação)", prio.status === 200, `status ${prio.status} · ${prio.body}`);

  // O CAMINHO DE REFRESH — o bug do Rafael. Token expirado + refresh válido: o
  // proxy TEM de refrescar pra abrir. É o que o login fresco não exercita.
  const { cookie: expirado, forjou } = forjarExpirado(cookie);
  if (forjou) {
    const impRef = await postJson("/api/implantacao/import", expirado, { json: fichaMin, mode: "preview" });
    reg("POST import com TOKEN EXPIRADO (proxy refresca) → 200 — o caminho que quebrava", impRef.status === 200, `status ${impRef.status} · ${impRef.body.slice(0, 80)}`);
  } else {
    reg("Forja de token expirado (cobertura do refresh)", false, "não reconheci o formato do cookie de sessão — refresh não exercitado");
  }

  // STRANDING END-TO-END (o cenário do Rafael): token expirado → GET da página
  // PESADA /implantacao (o render podia rotacionar+estrandar o refresh token) →
  // POST logo depois. Com o fix (só o proxy rotaciona), o cookie do GET segue vivo.
  if (forjou) {
    const getRes = await fetch(`${BASE}/implantacao`, { headers: { Cookie: expirado }, redirect: "manual" });
    const novos = getRes.headers.getSetCookie?.() ?? [];
    const jar = new Map(expirado.split("; ").map((p) => { const i = p.indexOf("="); return [p.slice(0, i), p.slice(i + 1)] as [string, string]; }));
    for (const sc of novos) { const kv = sc.split(";")[0]; const i = kv.indexOf("="); if (i > 0) jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    const merged = [...jar].filter(([, v]) => v && v !== "").map(([k, v]) => `${k}=${v}`).join("; ");
    const impStrand = await postJson("/api/implantacao/import", merged, { json: fichaMin, mode: "preview" });
    reg("STRANDING: GET da página pesada (com refresh) + POST logo depois → 200", impStrand.status === 200, `GET ${getRes.status} · ${novos.length} set-cookie · POST ${impStrand.status} ${impStrand.body.slice(0, 60)}`);
  }
} catch (e) {
  reg("Execução do teste da porta", false, (e as Error).message);
} finally {
  await apagar();
}

console.log("── Resultado ──");
let ok = true;
for (const it of itens) {
  console.log(`${it.estado === "ok" ? "✅" : "❌"} ${it.nome}${it.detalhe ? `  — ${it.detalhe}` : ""}`);
  if (it.estado === "falhou") ok = false;
}
console.log(ok ? "\nPORTA VERDE ✅ — a rota real abre pra super_admin.\n" : "\nPORTA VERMELHA ❌ — a rota nega o super_admin (o bug).\n");
process.exit(ok ? 0 : 1);
