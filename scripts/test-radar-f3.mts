/**
 * Smoke test da F3 — o "juiz" da LEITURA DO BRAIN REAL.
 *
 * Sobe a porta estreita (door.mjs) num PORTO DE TESTE (8091, pra não colidir
 * com a porta de produção) usando o .env dela (/root/radar-door/.env — a
 * credencial do banco NUNCA passa por aqui), e prova:
 *   1. /health responde e a ESCRITA está DESLIGADA (write=off);
 *   2. GET /brain devolve ≥1 fato CONFIRMADO da Moovefy, e NENHUM rascunho
 *      (todo nó com authority canonical|reference — draft nunca sai);
 *   3. sem o segredo, a porta nega (401);
 *   4. POST /intake nega (403) — a fase de leitura NÃO religou a escrita;
 *   5. fetchClientBrain (lado do Radar) monta contexto AO VIVO do Brain real;
 *   6. com a porta fora do ar, cai no fallback local SEM lançar (honesto).
 *
 * Não gasta créditos Firecrawl nem chamadas de LLM. Toca o banco SÓ em leitura.
 * Uso: npm run smoke:f3
 */

import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import { config } from "dotenv";

config({ path: ".env.local" });

const DOOR_ENV = "/root/radar-door/.env";
const DOOR_SCRIPT = "/root/radar-door/door.mjs";
const TEST_PORT = 8091;
const BASE = `http://127.0.0.1:${TEST_PORT}`;
const SECRET = process.env.RADAR_BRAIN_SECRET ?? "";
const CLIENTE = "Moovefy";

type Criterio = { nome: string; feito: boolean; detalhe?: string };

async function esperarPorta(ms: number): Promise<boolean> {
  const inicio = Date.now();
  while (Date.now() - inicio < ms) {
    try {
      const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch {
      // ainda subindo
    }
    await sleep(300);
  }
  return false;
}

async function rodar(): Promise<Criterio[]> {
  const criterios: Criterio[] = [];

  // 1) /health + escrita desligada.
  let writeOff = false;
  try {
    const health = (await (await fetch(`${BASE}/health`)).json()) as { ok?: boolean; write?: string };
    writeOff = health.ok === true && health.write === "off";
    criterios.push({
      nome: "Porta de pé com a ESCRITA DESLIGADA",
      feito: writeOff,
      detalhe: `health=${JSON.stringify(health)}`,
    });
  } catch (err) {
    criterios.push({ nome: "Porta de pé com a ESCRITA DESLIGADA", feito: false, detalhe: (err as Error).message });
  }

  // 2) Leitura devolve fatos confirmados — e nenhum rascunho vaza.
  let nodes: Array<{ authority?: string; content?: string }> = [];
  try {
    const res = await fetch(`${BASE}/brain?workspace=${encodeURIComponent(CLIENTE)}&limit=60`, {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    const payload = (await res.json()) as { data?: { count?: number; nodes?: typeof nodes } };
    nodes = payload.data?.nodes ?? [];
    const semRascunho = nodes.every(
      (n) => n.authority === "canonical" || n.authority === "reference",
    );
    criterios.push({
      nome: `Leitura devolve fatos CONFIRMADOS de ${CLIENTE} (nunca rascunho)`,
      feito: res.ok && nodes.length >= 1 && semRascunho,
      detalhe: `${nodes.length} nó(s); todos confirmados/não-rascunho=${semRascunho}`,
    });
  } catch (err) {
    criterios.push({
      nome: `Leitura devolve fatos CONFIRMADOS de ${CLIENTE} (nunca rascunho)`,
      feito: false,
      detalhe: (err as Error).message,
    });
  }

  // 3) Sem segredo -> 401.
  try {
    const res = await fetch(`${BASE}/brain?workspace=${encodeURIComponent(CLIENTE)}`);
    criterios.push({
      nome: "Sem o segredo, a porta nega (401)",
      feito: res.status === 401,
      detalhe: `status=${res.status}`,
    });
  } catch (err) {
    criterios.push({ nome: "Sem o segredo, a porta nega (401)", feito: false, detalhe: (err as Error).message });
  }

  // 4) Escrita segue trancada: POST /intake -> 403 mesmo com o segredo.
  try {
    const res = await fetch(`${BASE}/intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({
        workspaceName: CLIENTE,
        items: [{ sinal: "teste", porQueImporta: "teste", acao: "teste", fonte: {}, score: 1 }],
      }),
    });
    criterios.push({
      nome: "Escrita segue DESLIGADA (POST /intake -> 403, nada entra no Brain)",
      feito: res.status === 403,
      detalhe: `status=${res.status}`,
    });
  } catch (err) {
    criterios.push({
      nome: "Escrita segue DESLIGADA (POST /intake -> 403, nada entra no Brain)",
      feito: false,
      detalhe: (err as Error).message,
    });
  }

  // 5) Lado do Radar: fetchClientBrain monta contexto AO VIVO.
  //    (aponta a URL pro porto de teste; noCache pra não poluir/depender do dia)
  process.env.RADAR_BRAIN_URL = `${BASE}/brain`;
  process.env.RADAR_BRAIN_SECRET = SECRET;
  const { fetchClientBrain } = await import("@/lib/brain");
  try {
    const brain = await fetchClientBrain(CLIENTE, { noCache: true });
    const live = brain.mode === "live";
    const ancorado = live && brain.context.includes("BRAIN DO FORMARE") && brain.context.length > 300;
    criterios.push({
      nome: "Radar monta o contexto do analista a partir do Brain REAL (mode=live)",
      feito: live && ancorado,
      detalhe: live
        ? `live com ${(brain as { nodeCount: number }).nodeCount} fatos, ${brain.context.length} chars`
        : `mode=${brain.mode} (esperado live)`,
    });
  } catch (err) {
    criterios.push({
      nome: "Radar monta o contexto do analista a partir do Brain REAL (mode=live)",
      feito: false,
      detalhe: (err as Error).message,
    });
  }

  // 6) Porta fora do ar -> fallback honesto (sem lançar, e DIZENDO que é local).
  process.env.RADAR_BRAIN_URL = "http://127.0.0.1:1/brain"; // porta morta de propósito
  try {
    const brain = await fetchClientBrain(CLIENTE, { noCache: true });
    const honesto = brain.mode === "fixture" && brain.context.includes("LOCAL");
    criterios.push({
      nome: "Porta fora do ar -> fallback local HONESTO (sem quebrar o loop)",
      feito: honesto,
      detalhe: `mode=${brain.mode}`,
    });
  } catch (err) {
    criterios.push({
      nome: "Porta fora do ar -> fallback local HONESTO (sem quebrar o loop)",
      feito: false,
      detalhe: `lançou: ${(err as Error).message}`,
    });
  }

  return criterios;
}

async function main(): Promise<void> {
  console.log("\n=== Smoke F3 — Leitura do Brain real (porta estreita) ===\n");

  if (!SECRET) {
    console.error("RADAR_BRAIN_SECRET ausente no .env.local — abortando.");
    process.exit(1);
  }

  // Sobe a porta no porto de teste. O .env DELA carrega a credencial do banco;
  // aqui só sobrepomos o porto e garantimos escrita desligada.
  const door: ChildProcess = spawn(
    "node",
    [`--env-file=${DOOR_ENV}`, DOOR_SCRIPT],
    {
      env: { ...process.env, RADAR_DOOR_PORT: String(TEST_PORT), DOOR_WRITE_ENABLED: "" },
      stdio: "ignore",
    },
  );

  let tudoVerde = true;
  try {
    if (!(await esperarPorta(8000))) {
      console.error("A porta de teste não subiu em 8s — veja /root/radar-door/.env.");
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
    console.log("F3 VERDE ✅ — o analista raciocina ancorado no Brain real (e a escrita segue trancada).");
    process.exit(0);
  }
  console.log("F3 ainda NÃO completa — critérios acima em branco.");
  process.exit(1);
}

main().catch((err) => {
  console.error("Smoke falhou com erro:", err);
  process.exit(1);
});
