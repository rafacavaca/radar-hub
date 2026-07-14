/**
 * CHECKLIST DE ISOLAMENTO (item 2 — a PAUSA OBRIGATÓRIA). Cria 2 orgs de teste
 * (A e B) com dados distintos e prova, no BANCO (RLS), que uma não vê nada da
 * outra — nem por id direto, nem por escrita cruzada. Item a item, como pedido.
 *
 * Requer as chaves do Supabase (SUA VEZ do Rafael):
 *   RADAR_SUPABASE_URL, RADAR_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Sem elas, roda só a checagem ESTÁTICA (nenhuma rota de usuário usa
 * service_role) e marca os itens de banco como PENDENTES — honesto.
 *
 * Uso: npm run test:isolation
 */

import { config } from "dotenv";
import { execSync } from "node:child_process";

config({ path: ".env.local" });

type Item = { nome: string; estado: "ok" | "falhou" | "pendente"; detalhe?: string };
const itens: Item[] = [];
const reg = (nome: string, estado: Item["estado"], detalhe?: string) => itens.push({ nome, estado, detalhe });

const URL = process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.RADAR_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("\n=== Checklist de isolamento (multi-tenant, RLS) ===\n");

// ── ITEM ESTÁTICO (roda SEMPRE, mesmo sem chaves): nenhuma rota/página do
//    CAMINHO DO USUÁRIO CHAMA o adminClient (service_role ignora RLS).
//    - casa USO REAL: `adminClient(` ou a env SERVICE_ROLE_KEY — não comentários;
//    - exclui a superfície de ADMIN (/admin, /api/admin), que É a exceção
//      deliberada (gated por super_admin), e o não-código (comentários //, *). ──
try {
  const raw = execSync(
    "grep -rInE 'adminClient\\(|SUPABASE_SERVICE_ROLE_KEY' src/app 2>/dev/null || true",
    { cwd: process.cwd(), encoding: "utf8" },
  ).trim();
  const hits = raw
    .split("\n")
    .filter(Boolean)
    .filter((l) => !/\/(api\/)?admin\//.test(l)) // superfície de admin: exceção gated
    .filter((l) => {
      const corpo = l.replace(/^[^:]+:\d+:/, "").trim(); // tira "arquivo:linha:"
      return !corpo.startsWith("*") && !corpo.startsWith("//") && !corpo.startsWith("/*");
    });
  reg(
    "Nenhuma rota do usuário CHAMA service_role (grep src/app, exclui /admin gated)",
    hits.length ? "falhou" : "ok",
    hits.length ? `encontrado:\n${hits.join("\n")}` : "caminho do usuário limpo",
  );
} catch (e) {
  reg("Checagem estática de service_role", "falhou", (e as Error).message);
}

async function runLive(): Promise<void> {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });

  const stamp = process.env.RADAR_ISO_STAMP || "iso"; // varia por env, não por relógio
  const orgA = { slug: `test-a-${stamp}`, name: "Org A (teste)" };
  const orgB = { slug: `test-b-${stamp}`, name: "Org B (teste)" };
  const userA = { email: `a-${stamp}@radar.test`, password: `A-${stamp}-secret!` };
  const userB = { email: `b-${stamp}@radar.test`, password: `B-${stamp}-secret!` };

  // limpeza de execução anterior (idempotente)
  await admin.from("orgs").delete().in("slug", [orgA.slug, orgB.slug]);

  // 1) cria orgs
  const { data: aRow } = await admin.from("orgs").insert(orgA).select("id").single();
  const { data: bRow } = await admin.from("orgs").insert(orgB).select("id").single();
  const aId = aRow!.id as string, bId = bRow!.id as string;

  // 2) cria usuários + membership
  const mkUser = async (u: { email: string; password: string }, orgId: string) => {
    const found = await admin.auth.admin.listUsers();
    const existing = found.data.users.find((x) => x.email === u.email);
    const id = existing?.id ?? (await admin.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true })).data.user!.id;
    await admin.from("memberships").delete().eq("user_id", id);
    await admin.from("memberships").insert({ org_id: orgId, user_id: id, role: "member" });
    return id;
  };
  await mkUser(userA, aId);
  await mkUser(userB, bId);

  // 3) semeia dados DISTINTOS em cada org (via admin — bypassa RLS de propósito)
  const seed = async (orgId: string, tag: string) => {
    await admin.from("clients").insert({ id: `cli-${tag}`, org_id: orgId, name: `Cliente ${tag}`, data: { tag } });
    await admin.from("competitors").insert({ id: `cmp-${tag}`, org_id: orgId, client_id: `cli-${tag}`, name: `Concorrente ${tag}`, data: { tag } });
    await admin.from("signals").insert({ id: `sig-${tag}`, org_id: orgId, client_id: `cli-${tag}`, data: { segredo: `sinal-${tag}` } });
    await admin.from("diagnostics").insert({ id: `dia-${tag}`, org_id: orgId, client_id: `cli-${tag}`, competitor_id: `cmp-${tag}`, data: { tag } });
    await admin.from("reports").insert({ id: `rep-${tag}`, org_id: orgId, client_id: `cli-${tag}`, data: { tag } });
    // CONTEXTO PRIVADO (confidencial): texto extraído + bytes do arquivo, em org_docs.
    await admin.from("org_docs").insert({ org_id: orgId, kind: "prospect-contexto", key: `px-${tag}`, data: [{ id: `ci-${tag}`, tipo: "arquivo", nome: `proposta-${tag}.pdf`, texto: `SEGREDO-${tag}: proposta confidencial`, legivel: true, temArquivo: true, criadoEm: "2026-07-13T00:00:00Z" }] });
    await admin.from("org_docs").insert({ org_id: orgId, kind: "prospect-arquivo", key: `ci-${tag}`, data: { mime: "application/pdf", nome: `proposta-${tag}.pdf`, b64: Buffer.from(`bytes-confidenciais-${tag}`).toString("base64") } });
  };
  await seed(aId, "A");
  await seed(bId, "B");

  // 4) sessão do usuário A (JWT) → cliente que RESPEITA RLS
  const sessA = await createClient(URL!, ANON!).auth.signInWithPassword(userA);
  const tokenA = sessA.data.session!.access_token;
  const asA = createClient(URL!, ANON!, { global: { headers: { Authorization: `Bearer ${tokenA}` } }, auth: { persistSession: false } });

  // 4a) A não vê NENHUM dado de B
  const tabelas = ["clients", "competitors", "signals", "diagnostics", "reports"] as const;
  let vazouLeitura = "";
  for (const t of tabelas) {
    const { data } = await asA.from(t).select("*");
    const doB = (data ?? []).filter((r) => (r as { org_id: string }).org_id === bId);
    const soA = (data ?? []).every((r) => (r as { org_id: string }).org_id === aId);
    if (doB.length > 0 || !soA) vazouLeitura += `${t} `;
  }
  reg("A não vê NENHUM dado de B (clients/competitors/signals/diagnostics/reports)", vazouLeitura ? "falhou" : "ok", vazouLeitura ? `vazou em: ${vazouLeitura}` : "só linhas da org A");

  // 4b) deep-link: A pede o id de B diretamente → NEGADO (0 linhas, não os dados de B)
  const { data: deep } = await asA.from("clients").select("*").eq("id", "cli-B");
  reg("Deep-link por id de B → negado (0 linhas, não a tela de B)", (deep ?? []).length === 0 ? "ok" : "falhou", `${(deep ?? []).length} linha(s)`);

  // 4c) escrita cruzada: A tenta gravar na org de B → recusada (WITH CHECK)
  const { error: crossErr } = await asA.from("clients").insert({ id: "cli-hack", org_id: bId, name: "invasor", data: {} });
  reg("Escrita cruzada (A grava em org de B) → recusada pela RLS", crossErr ? "ok" : "falhou", crossErr ? "insert bloqueado" : "PERIGO: insert passou");

  // 5) inverso — B não vê A
  const sessB = await createClient(URL!, ANON!).auth.signInWithPassword(userB);
  const tokenB = sessB.data.session!.access_token;
  const asB = createClient(URL!, ANON!, { global: { headers: { Authorization: `Bearer ${tokenB}` } }, auth: { persistSession: false } });
  const { data: bVeA } = await asB.from("signals").select("*").eq("id", "sig-A");
  reg("Invertido: B não vê o sinal de A", (bVeA ?? []).length === 0 ? "ok" : "falhou", `${(bVeA ?? []).length} linha(s)`);

  // 5b) CONTEXTO PRIVADO (o guardrail nº1 desta feature): A não vê o arquivo/texto de B.
  const { data: bCtx } = await asA.from("org_docs").select("*").eq("kind", "prospect-contexto");
  const { data: bArq } = await asA.from("org_docs").select("*").eq("kind", "prospect-arquivo");
  const ctxVazou = (bCtx ?? []).some((r) => (r as { org_id: string }).org_id === bId) || (bArq ?? []).some((r) => (r as { org_id: string }).org_id === bId);
  // deep-link direto no arquivo confidencial de B (por key)
  const { data: bArqDireto } = await asA.from("org_docs").select("*").eq("kind", "prospect-arquivo").eq("key", "ci-B");
  reg(
    "Contexto privado: A não vê arquivo/texto de B (nem por deep-link) — sem URL pública",
    !ctxVazou && (bArqDireto ?? []).length === 0 ? "ok" : "falhou",
    ctxVazou || (bArqDireto ?? []).length > 0 ? "PERIGO: vazou contexto confidencial" : "confidencial isolado por org",
  );

  // 6) coletor grava no org certo (função controlada, org explícito) e não vaza
  process.env.RADAR_ADMIN_CONTEXT = "1";
  await admin.rpc("collector_insert_signal", { p_org_id: aId, p_id: "sig-coletor-A", p_client_id: "cli-A", p_competitor_id: "cmp-A", p_ts: null, p_data: { origem: "coletor" } });
  const { data: aVeColetor } = await asA.from("signals").select("*").eq("id", "sig-coletor-A");
  const { data: bVeColetor } = await asB.from("signals").select("*").eq("id", "sig-coletor-A");
  reg("Coletor grava na org A (org_id explícito) e B não vê", (aVeColetor ?? []).length === 1 && (bVeColetor ?? []).length === 0 ? "ok" : "falhou", `A=${(aVeColetor ?? []).length} B=${(bVeColetor ?? []).length}`);

  // 7) BRAIN + LinkedIn org-scoped (o GAP ALTO): duas orgs com um cliente de nome
  //    IDÊNTICO. Só a org DONA (A) lê o Brain/LinkedIn; a outra (B) recebe "none"
  //    e [] — mesmo pedindo o mesmo nome. Prova que não vaza conhecimento entre agências.
  {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join: joinP } = await import("node:path");
    process.env.RADAR_DATA_DIR = mkdtempSync(joinP(tmpdir(), "iso-li-")); // store LinkedIn isolado (não polui data/)
    process.env.RADAR_BRAIN_ORG_ID = aId; // A é a org DONA do Brain/LinkedIn

    const { fetchClientBrain } = await import("@/lib/brain");
    const { linkedInReadAllowed, ingestLinkedInPost, collectLinkedIn } = await import("@/lib/linkedin");
    const { runAsOrgCollector } = await import("@/lib/db/collector-org");
    const { MOOVEFY } = await import("@/lib/clients/moovefy");
    const nome = MOOVEFY.clientName; // um cliente que o Formare (org A) tem

    // Brain: A (dona) lê; B (mesmo nome) recebe "none".
    const brainA = await runAsOrgCollector(aId, () => fetchClientBrain(nome, { noCache: true }));
    const brainB = await runAsOrgCollector(bId, () => fetchClientBrain(nome, { noCache: true }));
    reg(
      "Brain org-scoped: A (dona) lê o Brain; B com cliente de NOME IGUAL recebe 'none' — não vaza",
      brainA.mode !== "none" && brainB.mode === "none" ? "ok" : "falhou",
      `A=${brainA.mode} B=${brainB.mode}`,
    );

    // LinkedIn: semeia 1 post p/ o mesmo nome; A lê, B (gate) não vê.
    ingestLinkedInPost({ perfil: "Concorrente X", papel: "concorrente", workspace: nome, texto: "SEGREDO-LINKEDIN-A", data_publicacao: "2026-07-10", url: "https://www.linkedin.com/posts/segredo-a" });
    const liA = await runAsOrgCollector(aId, async () => ((await linkedInReadAllowed()) ? collectLinkedIn(nome).concorrente : []));
    const liB = await runAsOrgCollector(bId, async () => ((await linkedInReadAllowed()) ? collectLinkedIn(nome).concorrente : []));
    reg(
      "LinkedIn org-scoped: A (dona) lê os posts; B com cliente de NOME IGUAL não vê — não vaza",
      liA.length > 0 && liB.length === 0 ? "ok" : "falhou",
      `A=${liA.length} B=${liB.length} post(s)`,
    );
  }

  // limpeza
  await admin.from("orgs").delete().in("slug", [orgA.slug, orgB.slug]);
}

if (!URL || !ANON || !SERVICE) {
  console.log("⚠ Chaves do Supabase ausentes — rodando só a checagem estática.");
  console.log("  Configure RADAR_SUPABASE_URL, RADAR_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY (SUA VEZ) e rode de novo.\n");
  for (const t of ["A não vê NENHUM dado de B", "Deep-link por id de B → negado", "Escrita cruzada A→B → recusada", "Invertido: B não vê A", "Coletor grava na org certa e não vaza"]) reg(t, "pendente", "precisa das chaves do Supabase");
} else {
  try {
    await runLive();
  } catch (e) {
    reg("Execução ao vivo do checklist", "falhou", (e as Error).message);
  }
}

console.log("── Checklist item a item ──");
const icon = { ok: "✅", falhou: "❌", pendente: "⏳" };
let algumFalhou = false, algumPendente = false;
for (const it of itens) {
  console.log(`${icon[it.estado]} ${it.nome}${it.detalhe ? `  — ${it.detalhe}` : ""}`);
  if (it.estado === "falhou") algumFalhou = true;
  if (it.estado === "pendente") algumPendente = true;
}
console.log(
  algumFalhou
    ? "\n❌ ISOLAMENTO FALHOU — não liberar externo.\n"
    : algumPendente
      ? "\n⏳ Estático verde; itens de banco PENDENTES até as chaves (SUA VEZ).\n"
      : "\n✅ ISOLAMENTO 100% — pode liberar externo.\n",
);
process.exit(algumFalhou ? 1 : 0);
