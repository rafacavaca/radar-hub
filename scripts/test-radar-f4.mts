/**
 * Smoke test da F4 — o "juiz" da AÇÃO NO FORMARE (o botão formalizado).
 *
 * Sobe a porta estreita num PORTO DE TESTE com a escrita DESLIGADA (o estado
 * atual, decidido pelo Rafael) e prova que o caminho todo é seguro e honesto:
 *   1. POST /task sem segredo -> 401 (ninguém sem a senha da fenda);
 *   2. POST /task com segredo -> 403 (escrita trancada: NADA vira card);
 *   3. o Radar (sendTaskToFormare) trata o 403 como MODO SEGURO: registra o
 *      pedido completo na caixa de saída local e devolve ok (nunca perde);
 *   4. o link "Ver no Formare" é montado certo (workspace/card);
 *   5. porta nem configurada -> também cai na caixa de saída, sem lançar.
 *
 * O teste com a escrita LIGADA (1 card real em 'ideias') é feito JUNTO com o
 * Rafael, com OK explícito — nunca pelo smoke.
 *
 * Não gasta créditos nem LLM; não escreve NADA no Formare.
 * Uso: npm run smoke:f4
 */

import { spawn, type ChildProcess } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { config } from "dotenv";

import type { IntelligenceItem } from "@/lib/types";

config({ path: ".env.local" });

const DOOR_ENV = "/root/radar-door/.env";
const DOOR_SCRIPT = "/root/radar-door/door.mjs";
const TEST_PORT = 8092;
const BASE = `http://127.0.0.1:${TEST_PORT}`;
const SECRET = process.env.RADAR_BRAIN_SECRET ?? "";
const OUTBOX = join(process.cwd(), ".cache", "outbox");

const ITEM: IntelligenceItem = {
  id: "smoke-f4-item",
  clientName: "Moovefy",
  sinal: "Concorrente de teste lançou funcionalidade X (smoke F4)",
  porQueImporta: "Colide com o diferencial de customização da Moovefy.",
  acao: "Publicar comparativo destacando a aderência ao processo do cliente.",
  fonte: { url: "https://example.com/post", titulo: "Post de teste" },
  concorrente: "RD Station",
  score: 42,
  createdAt: new Date().toISOString(),
};

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

function ultimoTaskDaOutbox(): { path: string; json: unknown } | null {
  try {
    const files = readdirSync(OUTBOX)
      .filter((f) => f.startsWith("task-"))
      .sort();
    if (files.length === 0) return null;
    const path = join(OUTBOX, files[files.length - 1]);
    return { path, json: JSON.parse(readFileSync(path, "utf8")) };
  } catch {
    return null;
  }
}

async function rodar(): Promise<Criterio[]> {
  const criterios: Criterio[] = [];

  // 1) Sem segredo -> 401.
  try {
    const res = await fetch(`${BASE}/task`, { method: "POST", body: "{}" });
    criterios.push({
      nome: "POST /task sem segredo -> 401",
      feito: res.status === 401,
      detalhe: `status=${res.status}`,
    });
  } catch (err) {
    criterios.push({ nome: "POST /task sem segredo -> 401", feito: false, detalhe: (err as Error).message });
  }

  // 2) Com segredo, escrita trancada -> 403 (nada vira card).
  try {
    const res = await fetch(`${BASE}/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ workspaceName: "Moovefy", item: ITEM }),
    });
    criterios.push({
      nome: "Escrita DESLIGADA: POST /task -> 403 (nenhum card criado)",
      feito: res.status === 403,
      detalhe: `status=${res.status}`,
    });
  } catch (err) {
    criterios.push({
      nome: "Escrita DESLIGADA: POST /task -> 403 (nenhum card criado)",
      feito: false,
      detalhe: (err as Error).message,
    });
  }

  // 3) Radar trata 403 como modo seguro: caixa de saída com o pedido COMPLETO.
  process.env.RADAR_DOOR_BASE_URL = BASE;
  process.env.RADAR_DOOR_SECRET = SECRET;
  const { sendTaskToFormare, buildCardUrl } = await import("@/lib/formare-door");
  try {
    const result = await sendTaskToFormare(ITEM);
    const ultimo = ultimoTaskDaOutbox();
    const payload = (ultimo?.json as { payload?: { workspaceName?: string; item?: Record<string, unknown> } })?.payload;
    const completo =
      payload?.workspaceName === "Moovefy" &&
      payload?.item?.sinal === ITEM.sinal &&
      payload?.item?.porQueImporta === ITEM.porQueImporta &&
      payload?.item?.acao === ITEM.acao &&
      payload?.item?.score === ITEM.score;
    criterios.push({
      nome: "403 vira MODO SEGURO: pedido completo na caixa de saída (ok, sem perder nada)",
      feito: result.ok && result.mode === "dry-run" && Boolean(completo),
      detalhe: `mode=${result.mode}, ok=${result.ok}, payload completo=${Boolean(completo)}`,
    });
  } catch (err) {
    criterios.push({
      nome: "403 vira MODO SEGURO: pedido completo na caixa de saída (ok, sem perder nada)",
      feito: false,
      detalhe: (err as Error).message,
    });
  }

  // 4) Link "Ver no Formare" bem montado.
  const url = buildCardUrl("ws-123", "card-456");
  criterios.push({
    nome: "Link do card aponta pro Formare (workspaces/<ws>/cards/<card>)",
    feito: url.endsWith("/workspaces/ws-123/cards/card-456") && url.startsWith("http"),
    detalhe: url,
  });

  // 5) Porta nem configurada -> caixa de saída, sem lançar.
  delete process.env.RADAR_DOOR_BASE_URL;
  delete process.env.RADAR_DOOR_SECRET;
  const brainUrl = process.env.RADAR_BRAIN_URL;
  const brainSecret = process.env.RADAR_BRAIN_SECRET;
  delete process.env.RADAR_BRAIN_URL;
  delete process.env.RADAR_BRAIN_SECRET;
  try {
    const result = await sendTaskToFormare(ITEM);
    criterios.push({
      nome: "Porta não configurada -> caixa de saída (nunca perde o pedido)",
      feito: result.ok && result.mode === "dry-run",
      detalhe: `mode=${result.mode}, ok=${result.ok}`,
    });
  } catch (err) {
    criterios.push({
      nome: "Porta não configurada -> caixa de saída (nunca perde o pedido)",
      feito: false,
      detalhe: `lançou: ${(err as Error).message}`,
    });
  } finally {
    if (brainUrl) process.env.RADAR_BRAIN_URL = brainUrl;
    if (brainSecret) process.env.RADAR_BRAIN_SECRET = brainSecret;
  }

  return criterios;
}

async function main(): Promise<void> {
  console.log("\n=== Smoke F4 — Ação no Formare (o botão formalizado) ===\n");

  if (!SECRET) {
    console.error("RADAR_BRAIN_SECRET ausente no .env.local — abortando.");
    process.exit(1);
  }

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
  }

  console.log();
  if (tudoVerde) {
    console.log("F4 VERDE ✅ (modo seguro) — o card real é testado JUNTO com o Rafael, com a escrita ligada.");
    process.exit(0);
  }
  console.log("F4 ainda NÃO completa — critérios acima em branco.");
  process.exit(1);
}

main().catch((err) => {
  console.error("Smoke falhou com erro:", err);
  process.exit(1);
});
