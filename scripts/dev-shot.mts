/**
 * DEV-SHOT — screenshot autenticado de uma tela do Radar (aparato de verificação,
 * NÃO versionado). Cria um usuário EFÊMERO na org Formare (service_role), loga
 * pelo /entrar, tira o print e APAGA o usuário no fim (finally). Reutilizável.
 *
 * Uso: npx tsx scripts/dev-shot.mts "/parametrizacao?cliente=Moovefy" /tmp/shot.png [larguraViewport]
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const CAMINHO = process.argv[2] || "/parametrizacao?cliente=Moovefy";
const SAIDA = process.argv[3] || "/tmp/shot.png";
const LARGURA = Number(process.argv[4] || 1280);
const BASE = "http://127.0.0.1:3200";
const FORMARE_ORG = "98e90ffe-1ece-4c05-8c09-43acaafcae7f";
const EMAIL = "dev-shot@formare.tech";
const SENHA = "Shot!" + "aX9r2Qm7"; // efêmero; usuário é apagado no fim

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(process.env.RADAR_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function apagarUsuario(): Promise<void> {
  const { data } = await admin.auth.admin.listUsers();
  const u = data.users.find((x) => x.email?.toLowerCase() === EMAIL);
  if (!u) return;
  await admin.from("memberships").delete().eq("user_id", u.id).eq("org_id", FORMARE_ORG);
  await admin.auth.admin.deleteUser(u.id);
}

let puppeteer: typeof import("puppeteer");
try {
  puppeteer = (await import("puppeteer")).default as unknown as typeof import("puppeteer");
} catch {
  console.error("puppeteer indisponível."); process.exit(2);
}

await apagarUsuario(); // limpa resíduo de corrida anterior
const criado = await admin.auth.admin.createUser({ email: EMAIL, password: SENHA, email_confirm: true });
if (criado.error || !criado.data.user) { console.error("createUser:", criado.error?.message); process.exit(1); }
await admin.from("memberships").upsert({ org_id: FORMARE_ORG, user_id: criado.data.user.id, role: process.env.SHOT_ROLE || "member" }, { onConflict: "org_id,user_id" });
console.log(`usuário efêmero criado (${EMAIL}) na org Formare`);

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
try {
  const ALTURA = Number(process.argv[5] || 900);
  const DPR = Number(process.argv[6] || 2);
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.setViewport({ width: LARGURA, height: ALTURA, deviceScaleFactor: DPR });
  await page.goto(`${BASE}/entrar`, { waitUntil: "domcontentloaded" });
  await page.type('input[name="email"]', EMAIL);
  await page.type('input[name="senha"]', SENHA);
  await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click('button[type="submit"]')]);
  if (page.url().includes("erro=1")) throw new Error("login falhou (credenciais)");
  console.log(`logado; abrindo ${CAMINHO}`);
  await page.goto(`${BASE}${CAMINHO}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1", { timeout: 20000 }).catch(() => null);
  await new Promise((r) => setTimeout(r, 1500)); // deixa hidratar/carregar embutidos
  if (process.env.SHOT_CLICK) {
    await page.click(process.env.SHOT_CLICK);
    await new Promise((r) => setTimeout(r, 1800)); // deixa o POST + refresh assentarem
    console.log(`clicou ${process.env.SHOT_CLICK}`);
  }
  if (process.env.SHOT_TYPE) {
    const [sel, texto] = process.env.SHOT_TYPE.split("|||");
    await page.type(sel, texto);
    await new Promise((r) => setTimeout(r, 800));
    console.log(`digitou "${texto}" em ${sel}`);
  }
  await page.screenshot({ path: SAIDA, fullPage: true });
  console.log(`✅ print salvo em ${SAIDA}`);
} finally {
  await browser.close();
  await apagarUsuario();
  console.log("usuário efêmero apagado.");
}
