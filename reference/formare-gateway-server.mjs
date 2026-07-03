/**
 * FormareOS — Gateway LLM (VPS).
 *
 * Corre o Claude Agent SDK (motor do Claude Code) usando a SUBSCRIÇÃO logada
 * nesta máquina (~/.claude/.credentials.json), e expõe um endpoint HTTP simples
 * que a app FormareOS (no Vercel) consome como provider primário.
 *
 * Princípios:
 *  - Completion puro: TODAS as tools desligadas, settingSources [] (ignora este
 *    repo/CLAUDE.md/.claude), maxTurns 1.
 *  - Auth pela subscrição: o subprocesso NUNCA vê ANTHROPIC_API_KEY (senão passa
 *    a cobrança metered). Mantém CLAUDE_CODE_OAUTH_TOKEN se existir.
 *  - Concorrência limitada + timeout por pedido (cada chamada abre um subprocesso).
 *
 * Env:
 *  GATEWAY_PORT (8088) · GATEWAY_SECRET (bearer obrigatório em produção)
 *  GATEWAY_MODEL (claude-opus-4-8) · GATEWAY_MAX_CONCURRENCY (3) · GATEWAY_TIMEOUT_MS (120000)
 */

import { createServer } from "node:http";
import { query } from "@anthropic-ai/claude-agent-sdk";

const PORT = Number(process.env.GATEWAY_PORT || 8088);
const SECRET = process.env.GATEWAY_SECRET || "";
// Sonnet 4.6 é o melhor equilíbrio para gerar conteúdo (rápido + excelente).
// Opus 4.8 fica disponível via GATEWAY_MODEL ou model por pedido.
const DEFAULT_MODEL = process.env.GATEWAY_MODEL || "claude-sonnet-4-6";
const MAX_CONCURRENCY = Number(process.env.GATEWAY_MAX_CONCURRENCY || 3);
const TIMEOUT_MS = Number(process.env.GATEWAY_TIMEOUT_MS || 90000);
// Visão (imagens) — caminho ISOLADO do texto: fila própria (não compete com o
// Formare), timeout maior (vision é mais lenta) e NÃO mexe no circuit breaker.
const VISION_MAX_CONCURRENCY = Number(process.env.GATEWAY_VISION_CONCURRENCY || 1);
const VISION_TIMEOUT_MS = Number(process.env.GATEWAY_VISION_TIMEOUT_MS || 120000);
// Esforço de raciocínio. Geração de conteúdo quer RÁPIDO, não "pensar fundo".
// 'high' (default do Opus) levava minutos; 'low' = mínimo, respostas rápidas.
const DEFAULT_EFFORT = process.env.GATEWAY_EFFORT || "low";
// Geração de conteúdo não precisa de "pensar" — desligar thinking põe TODO o
// orçamento de output no texto (rápido, sem desperdício). GATEWAY_THINKING=on reativa.
const THINKING_OFF = process.env.GATEWAY_THINKING !== "on";
// Operação 100% pt-BR (Formare só atua no Brasil): guard sempre prefixado +
// retry com thinking ligado se vazar caractere CJK (instabilidade do thinking-off).
const PT_GUARD = "IMPORTANTE: Responda SEMPRE e EXCLUSIVAMENTE em português do Brasil (pt-BR). NUNCA use caracteres chineses, japoneses ou coreanos, nem palavras de outros idiomas.";
const CJK = /[぀-ヿ㐀-鿿가-힯]/;

// Tools explicitamente negadas (além de allowedTools:[]) — garante completion puro.
const DISABLED_TOOLS = ["Bash", "Read", "Edit", "Write", "Glob", "Grep", "WebFetch", "WebSearch", "NotebookEdit", "Task", "TodoWrite"];

/** Ambiente do subprocesso: subscrição sim, API key NUNCA. */
function subprocessEnv() {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // <- crítico: senão usa cobrança metered
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

// ── Limitador de concorrência ──────────────────────────────────────────────
let active = 0;
const waiters = [];
function acquire() {
  if (active < MAX_CONCURRENCY) { active++; return Promise.resolve(); }
  return new Promise((resolve) => waiters.push(resolve));
}
function release() {
  active--;
  const next = waiters.shift();
  if (next) { active++; next(); }
}

// Fila SEPARADA para visão — o Radar pode pedir análise de imagem sem roubar
// os slots de texto do Formare (nem o contrário).
let visionActive = 0;
const visionWaiters = [];
function acquireVision() {
  if (visionActive < VISION_MAX_CONCURRENCY) { visionActive++; return Promise.resolve(); }
  return new Promise((resolve) => visionWaiters.push(resolve));
}
function releaseVision() {
  visionActive--;
  const next = visionWaiters.shift();
  if (next) { visionActive++; next(); }
}

// ── Circuit breaker (estado durável: o gateway é um processo systemd longo) ──
// Quando o Claude degrada (timeouts/erros seguidos), abre o circuito e passa a
// devolver 503 rápido — a app cai logo no DeepSeek em vez de esperar o timeout
// em cada pedido. Fecha sozinho no 1º sucesso após o cooldown.
let consecutiveFailures = 0;
let circuitOpenUntil = 0;
const CIRCUIT_THRESHOLD = 2;
const CIRCUIT_COOLDOWN_MS = 45_000;

/** Uma completion single-shot via subscrição. */
async function runQuery(prompt, options) {
  let content = null, usage = null, cost = null, failure = null;
  for await (const message of query({ prompt, options })) {
    if (message.type === "result") {
      if (message.subtype === "success") {
        content = message.result;
        usage = message.usage ?? null;
        cost = message.total_cost_usd ?? null;
      } else {
        failure = message.subtype + (message.errors?.length ? `: ${message.errors.join("; ")}` : "");
      }
    }
  }
  if (content == null) throw new Error(`gateway: ${failure || "sem resultado"}`);
  return { content, usage, cost };
}

async function complete({ system, prompt, model, effort }) {
  const base = {
    model: model || DEFAULT_MODEL,
    systemPrompt: `${PT_GUARD}\n\n${system || "Você é um assistente."}`,
    allowedTools: [],
    disallowedTools: DISABLED_TOOLS,
    permissionMode: "dontAsk",
    settingSources: [],
    maxTurns: 2, // 1 às vezes dava "max turns reached" com thinking off; 2 absorve (tools off = sem loop)
    env: subprocessEnv(),
    cwd: "/tmp",
  };

  // 1ª tentativa: rápida (thinking off, se configurado).
  // thinking e effort são mutuamente exclusivos (juntos → "max turns reached").
  const first = THINKING_OFF ? { ...base, thinking: { type: "disabled" } } : { ...base, effort: effort || DEFAULT_EFFORT };
  let out = await runQuery(prompt, first);

  // Salvaguarda pt-BR: se vazou caractere CJK, refaz 1x com thinking ligado (mais estável).
  if (CJK.test(out.content)) {
    console.warn("[gw] CJK detectado → retry com thinking on");
    out = await runQuery(prompt, { ...base, effort: "low" });
  }
  return { ...out, model: base.model };
}

/**
 * Completion MULTIMODAL (texto + imagens) via subscrição. Isolada de complete():
 * mesma engine (query), mas a entrada é uma user-message com blocos de imagem.
 * NÃO toca no circuit breaker do texto (é outro workload, do Radar).
 */
async function completeVision({ system, prompt, images, model }) {
  const content = [{ type: "text", text: prompt || "Analise a imagem." }];
  for (const img of images) {
    if (!img?.data) continue;
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.media_type || "image/png", data: img.data },
    });
  }
  async function* input() {
    yield { type: "user", parent_tool_use_id: null, message: { role: "user", content } };
  }
  const options = {
    model: model || DEFAULT_MODEL,
    systemPrompt: `${PT_GUARD}\n\n${system || "Você é um analista visual."}`,
    allowedTools: [],
    disallowedTools: DISABLED_TOOLS,
    permissionMode: "dontAsk",
    settingSources: [],
    maxTurns: 2,
    env: subprocessEnv(),
    cwd: "/tmp",
    thinking: { type: "disabled" },
  };
  let out = null, usage = null, cost = null, failure = null;
  for await (const message of query({ prompt: input(), options })) {
    if (message.type === "result") {
      if (message.subtype === "success") {
        out = message.result; usage = message.usage ?? null; cost = message.total_cost_usd ?? null;
      } else {
        failure = message.subtype + (message.errors?.length ? `: ${message.errors.join("; ")}` : "");
      }
    }
  }
  if (out == null) throw new Error(`gateway-vision: ${failure || "sem resultado"}`);
  return { content: out, usage, cost, model: options.model };
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms)),
  ]);
}

// ── HTTP ───────────────────────────────────────────────────────────────────
const server = createServer((req, res) => {
  const json = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };

  if (req.method === "GET" && req.url === "/health") {
    return json(200, { ok: true, model: DEFAULT_MODEL, active, concurrency: MAX_CONCURRENCY, vision: visionActive });
  }
  const isComplete = req.method === "POST" && req.url === "/complete";
  const isVision = req.method === "POST" && req.url === "/complete-vision";
  if (!isComplete && !isVision) return json(404, { error: "not found" });
  if (SECRET && req.headers.authorization !== `Bearer ${SECRET}`) return json(401, { error: "unauthorized" });

  let raw = "";
  // imagens em base64 podem ser maiores que texto → teto maior no caminho de visão.
  const maxBytes = isVision ? 16_000_000 : 5_000_000;
  req.on("data", (chunk) => { raw += chunk; if (raw.length > maxBytes) req.destroy(); });
  req.on("end", async () => {
    let body;
    try { body = JSON.parse(raw); } catch { return json(400, { error: "invalid json" }); }
    if (!body?.prompt) return json(400, { error: "prompt obrigatório" });

    // ── VISÃO: caminho ISOLADO — fila própria, sem circuit breaker do texto ──
    if (isVision) {
      const images = Array.isArray(body.images) ? body.images : [];
      if (images.length === 0) return json(400, { error: "images obrigatório" });
      await acquireVision();
      const t0 = Date.now();
      try {
        const out = await withTimeout(
          completeVision({ system: body.system, prompt: body.prompt, images, model: body.model }),
          VISION_TIMEOUT_MS,
        );
        console.log(`[gw:vision] ok ${Date.now() - t0}ms · imgs=${images.length}`);
        json(200, { ...out, latency_ms: Date.now() - t0 });
      } catch (e) {
        console.warn(`[gw:vision] erro ${Date.now() - t0}ms: ${String(e?.message ?? e).slice(0, 140)}`);
        json(502, { error: String(e?.message ?? e), latency_ms: Date.now() - t0 });
      } finally {
        releaseVision();
      }
      return;
    }

    // ── TEXTO (o caminho do Formare — INALTERADO) ──
    // Circuito aberto (Claude degradado há pouco) → 503 rápido, sem chamar o Claude.
    if (Date.now() < circuitOpenUntil) {
      return json(503, { error: "gateway degradado (circuito aberto)", degraded: true });
    }

    await acquire();
    const t0 = Date.now();
    try {
      const out = await withTimeout(complete({ system: body.system, prompt: body.prompt, model: body.model, effort: body.effort }), TIMEOUT_MS);
      consecutiveFailures = 0; circuitOpenUntil = 0; // sucesso → reseta o circuito
      console.log(`[gw] ok ${Date.now() - t0}ms · in=${out.usage?.input_tokens ?? "?"} out=${out.usage?.output_tokens ?? "?"} · promptLen=${(body.prompt ?? "").length}`);
      json(200, { ...out, latency_ms: Date.now() - t0 });
    } catch (e) {
      consecutiveFailures++;
      if (consecutiveFailures >= CIRCUIT_THRESHOLD) {
        circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
        console.warn(`[gw] circuito ABERTO ${CIRCUIT_COOLDOWN_MS / 1000}s (após ${consecutiveFailures} falhas seguidas)`);
      }
      console.warn(`[gw] erro ${Date.now() - t0}ms: ${String(e?.message ?? e).slice(0, 140)}`);
      json(502, { error: String(e?.message ?? e), latency_ms: Date.now() - t0 });
    } finally {
      release();
    }
  });
});

server.listen(PORT, () => {
  console.log(`[gateway] :${PORT} · model=${DEFAULT_MODEL} · concurrency=${MAX_CONCURRENCY} · auth=${SECRET ? "on" : "OFF"}`);
});
