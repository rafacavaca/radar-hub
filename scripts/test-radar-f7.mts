/**
 * Smoke test da F7 — o "juiz" do MULTI-CLIENTE.
 *
 * Prova que "cadastrar cliente novo = estrutura replicada":
 *   1. adicionar cliente -> entra na watchlist SEM concorrentes;
 *   2. as 3 lentes dele nascem sozinhas com a régua padrão (seed);
 *   3. concorrente adicionado ao cliente novo entra no plano de coleta —
 *      SEM misturar com o plano do cliente antigo;
 *   4. remover o cliente limpa a vigilância E a config de lentes dele;
 *   5. o último cliente não pode ser removido (o Radar nunca fica vazio);
 *   6. a porta lista os workspaces REAIS do Formare (401 sem segredo).
 *
 * Custo: 0 LLM, 0 Firecrawl; a porta é aberta num porto de teste (leitura).
 * Uso: npm run smoke:f7
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { config } from "dotenv";

config({ path: ".env.local" });

const TEMP_DIR = mkdtempSync(join(tmpdir(), "radar-multicliente-"));
process.env.RADAR_DATA_DIR = TEMP_DIR;

const { addClient, addCompetitor, planCollection, readWatchlist, removeClient } = await import(
  "@/lib/watchlist"
);
const { lensesFor, LENS_DEFAULTS, readLenses, removeClientLenses } = await import("@/lib/lenses");

const DOOR_ENV = "/root/radar-door/.env";
const DOOR_SCRIPT = "/root/radar-door/door.mjs";
const TEST_PORT = 8093;
const BASE = `http://127.0.0.1:${TEST_PORT}`;
const SECRET = process.env.RADAR_BRAIN_SECRET ?? "";

const NOVO = "Cliente Novo Teste";

type Criterio = { nome: string; feito: boolean; detalhe?: string };

async function esperarPorta(ms: number): Promise<boolean> {
  const inicio = Date.now();
  while (Date.now() - inicio < ms) {
    try {
      const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch {
      /* subindo */
    }
    await sleep(300);
  }
  return false;
}

async function rodar(): Promise<Criterio[]> {
  const criterios: Criterio[] = [];

  // 1) Adicionar cliente -> na watchlist, sem concorrentes.
  let addOk = false;
  let addDet = "";
  try {
    addClient(NOVO);
    const cliente = readWatchlist().clients.find((c) => c.name === NOVO);
    addOk = Boolean(cliente) && cliente!.competitors.length === 0;
    addDet = `na lista=${Boolean(cliente)}, concorrentes=${cliente?.competitors.length}`;
  } catch (err) {
    addDet = `falhou: ${(err as Error).message}`;
  }
  criterios.push({ nome: "Adicionar cliente entra na watchlist (sem concorrentes)", feito: addOk, detalhe: addDet });

  // 2) Lentes nascem sozinhas com o padrão.
  const lentes = lensesFor(NOVO);
  const lentesOk =
    lentes.length === 3 &&
    lentes.every((l) => l.enabled) &&
    lentes.find((l) => l.id === "comercial")?.regua === LENS_DEFAULTS.comercial.regua;
  criterios.push({
    nome: "Cliente novo nasce com as 3 lentes padrão ativas (estrutura replicada)",
    feito: lentesOk,
    detalhe: `${lentes.length} lentes, ativas=${lentes.filter((l) => l.enabled).length}`,
  });

  // 3) Concorrente do cliente novo entra no plano — sem vazar pro antigo.
  let planoOk = false;
  let planoDet = "";
  try {
    addCompetitor(NOVO, {
      name: "Rival do Novo",
      sources: [{ kind: "blog", url: "https://rivaldonovo.com/blog/" }],
    });
    const plano = planCollection(readWatchlist());
    const doNovo = plano.filter((t) => t.clientName === NOVO);
    const doAntigo = plano.filter((t) => t.clientName === "Moovefy");
    planoOk =
      doNovo.length === 1 &&
      doNovo[0].competitor.id === "rival-do-novo" &&
      doAntigo.every((t) => t.competitor.id !== "rival-do-novo");
    planoDet = `alvos do novo=${doNovo.length}, vazou pro antigo=${!planoOk && doAntigo.some((t) => t.competitor.id === "rival-do-novo")}`;
  } catch (err) {
    planoDet = `falhou: ${(err as Error).message}`;
  }
  criterios.push({
    nome: "Concorrente do cliente novo entra no plano de coleta (isolado por cliente)",
    feito: planoOk,
    detalhe: planoDet,
  });

  // 4) Remover cliente limpa vigilância + lentes.
  let removeOk = false;
  let removeDet = "";
  try {
    removeClient(NOVO);
    removeClientLenses(NOVO);
    const naWatchlist = readWatchlist().clients.some((c) => c.name === NOVO);
    const nasLentes = readLenses().clients.some((c) => c.clientName === NOVO);
    removeOk = !naWatchlist && !nasLentes;
    removeDet = `watchlist=${naWatchlist ? "ainda lá!" : "limpo"}, lentes=${nasLentes ? "ainda lá!" : "limpo"}`;
  } catch (err) {
    removeDet = `falhou: ${(err as Error).message}`;
  }
  criterios.push({ nome: "Remover cliente limpa vigilância e lentes dele", feito: removeOk, detalhe: removeDet });

  // 5) O último cliente não sai.
  let guardOk = false;
  try {
    removeClient("Moovefy");
    guardOk = false; // não deveria chegar aqui
  } catch (err) {
    guardOk = /pelo menos um cliente/i.test((err as Error).message);
  }
  const aindaLa = readWatchlist().clients.some((c) => c.name === "Moovefy");
  criterios.push({
    nome: "O último cliente não pode ser removido (o Radar nunca fica vazio)",
    feito: guardOk && aindaLa,
    detalhe: `bloqueado=${guardOk}, Moovefy intacta=${aindaLa}`,
  });

  // 6) A porta lista os workspaces reais (e nega sem segredo).
  try {
    const noAuth = await fetch(`${BASE}/workspaces`);
    const auth = await fetch(`${BASE}/workspaces`, {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    const payload = (await auth.json()) as { data?: { workspaces?: string[] } };
    const nomes = payload.data?.workspaces ?? [];
    criterios.push({
      nome: "Porta lista os clientes REAIS do Formare (401 sem segredo)",
      feito: noAuth.status === 401 && auth.ok && nomes.includes("Moovefy"),
      detalhe: `sem segredo=${noAuth.status}; ${nomes.length} workspaces (${nomes.slice(0, 3).join(", ")}…)`,
    });
  } catch (err) {
    criterios.push({
      nome: "Porta lista os clientes REAIS do Formare (401 sem segredo)",
      feito: false,
      detalhe: (err as Error).message,
    });
  }

  return criterios;
}

async function main(): Promise<void> {
  console.log("\n=== Smoke F7 — Multi-cliente (estrutura que se replica) ===\n");

  const door: ChildProcess = spawn("node", [`--env-file=${DOOR_ENV}`, DOOR_SCRIPT], {
    env: { ...process.env, RADAR_DOOR_PORT: String(TEST_PORT), DOOR_WRITE_ENABLED: "" },
    stdio: "ignore",
  });

  let tudoVerde = true;
  try {
    if (!(await esperarPorta(8000))) {
      console.error("A porta de teste não subiu em 8s.");
      process.exit(1);
    }
    for (const c of await rodar()) {
      console.log(`${c.feito ? "✅" : "⬜"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
      if (!c.feito) tudoVerde = false;
    }
  } finally {
    door.kill("SIGTERM");
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }

  console.log();
  if (tudoVerde) {
    console.log("F7 VERDE ✅ — cliente novo replica a estrutura inteira; remover limpa tudo.");
    process.exit(0);
  }
  console.log("F7 ainda NÃO completa — critérios acima em branco.");
  process.exit(1);
}

main().catch((err) => {
  console.error("Smoke falhou com erro:", err);
  process.exit(1);
});
