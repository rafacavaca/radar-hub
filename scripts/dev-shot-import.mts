/**
 * DEV-SHOT-IMPORT — print do DIFF do import da Ficha (aparato de verificação, NÃO
 * versionado). Loga super_admin efêmero na org Formare, abre /implantacao, abre o
 * painel de import, cola uma Ficha de exemplo, clica Pré-visualizar e captura o
 * DIFF (read-only — NÃO clica Aplicar, pra não mexer na org real). Apaga o user no fim.
 *
 * Uso: npx tsx scripts/dev-shot-import.mts /tmp/shot.png
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const SAIDA = process.argv[2] || "/tmp/shot-import.png";
const BASE = "http://127.0.0.1:3200";
const FORMARE_ORG = "98e90ffe-1ece-4c05-8c09-43acaafcae7f";
const EMAIL = "dev-shot-import@formare.tech";
const SENHA = "Shot!" + "kP7m2Xr9";

const FICHA = JSON.stringify(
  {
    ficha_version: 1,
    agencia: "Formare",
    criterio_agencia: {
      prioridade: { status: "definido", valor: { alta_a_partir_de: 80, media_a_partir_de: 50 }, disseram: "Esse aqui eu agiria (80). Esse eu ignoraria (35)." },
      rotulos: { status: "definido", valor: { concorrentes: "Rivais" }, disseram: "A gente chama de rivais, não de concorrentes." },
      regua_areas: { status: "definido", valor: { regras: { comercial: "Sobe quando o concorrente ataca uma conta que estamos de olho — preço, condição, campanha agressiva." } } },
      cadencia: { status: "definido", valor: { varredura: "segunda 06:00", digest: "diario 08:00" } },
      destinatarios: { status: "definido", valor: [{ quem: "diretor", cadencia: "diario" }, { quem: "time", cadencia: "semanal" }] },
    },
    contas: [
      {
        nome: "Cliente Piloto",
        concorrentes: { status: "definido", valor: [{ nome: "Rival X", validar: false }, { nome: "Rival Y", validar: true }] },
        base_conhecimento: { status: "definido", valor: "Vende automação para PMEs; diferencial é o onboarding assistido.", origem: "local" },
        areas_ativas: { status: "definido", valor: ["comercial", "marketing"] },
      },
    ],
  },
  null,
  2,
);

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(process.env.RADAR_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function apagar(): Promise<void> {
  const { data } = await admin.auth.admin.listUsers();
  const u = data.users.find((x) => x.email?.toLowerCase() === EMAIL);
  if (!u) return;
  await admin.from("memberships").delete().eq("user_id", u.id).eq("org_id", FORMARE_ORG);
  await admin.auth.admin.deleteUser(u.id);
}

const puppeteer = (await import("puppeteer")).default as unknown as typeof import("puppeteer");

await apagar();
const criado = await admin.auth.admin.createUser({ email: EMAIL, password: SENHA, email_confirm: true });
if (criado.error || !criado.data.user) { console.error("createUser:", criado.error?.message); process.exit(1); }
await admin.from("memberships").upsert({ org_id: FORMARE_ORG, user_id: criado.data.user.id, role: "super_admin" }, { onConflict: "org_id,user_id" });
console.log("super_admin efêmero criado");

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
try {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.setViewport({ width: 1000, height: 1700, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/entrar`, { waitUntil: "domcontentloaded" });
  await page.type('input[name="email"]', EMAIL);
  await page.type('input[name="senha"]', SENHA);
  await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click('button[type="submit"]')]);
  if (page.url().includes("erro=1")) throw new Error("login falhou");

  await page.goto(`${BASE}/implantacao`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 800));

  // abre o painel de import
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent?.includes("Importar Ficha"));
    (b as HTMLButtonElement | undefined)?.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.type("textarea", FICHA);
  // clica Pré-visualizar
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent?.includes("Pré-visualizar"));
    (b as HTMLButtonElement | undefined)?.click();
  });
  await new Promise((r) => setTimeout(r, 2500)); // POST preview + render do diff
  await page.screenshot({ path: SAIDA, fullPage: true });
  console.log(`✅ print do diff salvo em ${SAIDA}`);
} finally {
  await browser.close();
  await apagar();
  console.log("user efêmero apagado.");
}
