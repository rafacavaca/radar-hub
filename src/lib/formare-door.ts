/**
 * Cliente da "porta estreita" (Radar -> Brain do Formare) — LADO DO RADAR.
 *
 * SEGURANÇA:
 * - O Radar NUNCA tem a chave-mestra do Formare. Só conhece a URL da porta
 *   (RADAR_INTAKE_URL) e um segredo compartilhado (RADAR_INTAKE_SECRET).
 * - Quem FORÇA os valores seguros (is_confirmed=false, authority=draft, tag
 *   origin=radar, apenas INSERT) é o ENDPOINT dentro do Formare — ver
 *   docs/narrow-door/README.md. O Radar só entrega os itens; não consegue
 *   tornar nada "verdade" nem tocar em nós existentes.
 *
 * MODO DRY-RUN (padrão até a porta ser instalada e aprovada pelo Rafael):
 * se RADAR_INTAKE_URL/SECRET não estão definidos, NÃO envia nada ao Formare —
 * monta o bilhete exatamente como iria e o registra numa "caixa de saída" local
 * (.cache/outbox/*.json). Assim o loop (critério 5) roda sem tocar na produção.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { IntelligenceItem } from "@/lib/types";

const OUTBOX_DIR = join(process.cwd(), ".cache", "outbox");
const LIVE_TIMEOUT_MS = 20000;

/** Corpo que a porta espera. Os valores de segurança são aplicados NO SERVIDOR. */
export type DoorPayload = {
  workspaceName: string;
  items: Array<{
    sinal: string;
    porQueImporta: string;
    acao: string;
    fonte: { url: string; titulo: string };
    score: number;
  }>;
};

export type SendResult =
  | { mode: "dry-run"; ok: true; payload: DoorPayload; savedTo: string }
  | { mode: "live"; ok: true; inserted: number }
  | { mode: "dry-run" | "live"; ok: false; error: string };

/** A porta está configurada para envio REAL? (só depois de o Rafael instalá-la) */
export function isDoorLive(): boolean {
  return Boolean(process.env.RADAR_INTAKE_URL && process.env.RADAR_INTAKE_SECRET);
}

/** Converte os itens de inteligência no corpo que a porta espera. */
function toPayload(items: IntelligenceItem[], workspaceName: string): DoorPayload {
  return {
    workspaceName,
    items: items.map((it) => ({
      sinal: it.sinal,
      porQueImporta: it.porQueImporta,
      acao: it.acao,
      fonte: it.fonte,
      score: it.score,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// F4 — AÇÃO NO FORMARE: 1 item de inteligência vira 1 CARD (pedido de trabalho)
// ─────────────────────────────────────────────────────────────────────────────

/** Onde o Formare vive (pra montar o link "Ver no Formare" do card criado). */
const FORMARE_APP_URL = process.env.FORMARE_APP_URL || "https://os.formare.tech";
/** Base da porta estreita. Deriva da URL do /brain se não houver override. */
function doorBaseUrl(): string | null {
  if (process.env.RADAR_DOOR_BASE_URL) return process.env.RADAR_DOOR_BASE_URL;
  const brain = process.env.RADAR_BRAIN_URL;
  if (brain) return brain.replace(/\/brain\/?$/, "");
  return null;
}
function doorSecret(): string | null {
  return process.env.RADAR_DOOR_SECRET || process.env.RADAR_BRAIN_SECRET || null;
}

/** Link direto pro card dentro do Formare. */
export function buildCardUrl(workspaceId: string, cardId: string): string {
  return `${FORMARE_APP_URL}/workspaces/${workspaceId}/cards/${cardId}`;
}

export type SendTaskResult =
  | { mode: "live"; ok: true; cardId: string; cardUrl: string }
  | { mode: "dry-run"; ok: true; savedTo: string; reason: string }
  | { mode: "live" | "dry-run"; ok: false; error: string };

/** Grava o pedido na caixa de saída local (o dry-run do /task). */
function saveTaskToOutbox(payload: unknown): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const hash = createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 8);
  mkdirSync(OUTBOX_DIR, { recursive: true });
  const savedTo = join(OUTBOX_DIR, `task-${stamp}-${hash}.json`);
  writeFileSync(
    savedTo,
    JSON.stringify({ kind: "task", mode: "dry-run", ranAt: new Date().toISOString(), payload }, null, 2),
    "utf8",
  );
  return savedTo;
}

/**
 * "Gerar no Formare" formalizado (F4): envia UM item pra virar CARD ('ideias',
 * tag radar — forçados pela porta). A PORTA decide se a escrita está ligada:
 * 403 = escrita desligada -> registramos na caixa de saída e dizemos isso.
 */
export async function sendTaskToFormare(item: IntelligenceItem): Promise<SendTaskResult> {
  const base = doorBaseUrl();
  const secret = doorSecret();
  const payload = {
    workspaceName: item.clientName,
    item: {
      sinal: item.sinal,
      porQueImporta: item.porQueImporta,
      acao: item.acao,
      fonte: item.fonte,
      score: item.score,
      concorrente: item.concorrente,
    },
  };

  // Porta nem configurada -> caixa de saída (nunca perde o pedido).
  if (!base || !secret) {
    const savedTo = saveTaskToOutbox(payload);
    return { mode: "dry-run", ok: true, savedTo, reason: "porta não configurada" };
  }

  try {
    const res = await fetch(`${base}/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
    });

    // 403 = escrita DESLIGADA por decisão do Rafael -> modo seguro, sem erro.
    if (res.status === 403) {
      const savedTo = saveTaskToOutbox(payload);
      return { mode: "dry-run", ok: true, savedTo, reason: "porta de escrita desligada" };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { mode: "live", ok: false, error: `porta ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = (await res.json()) as {
      data?: { cardId?: string; workspaceId?: string };
      error?: string;
    };
    if (data.error || !data.data?.cardId || !data.data.workspaceId) {
      return { mode: "live", ok: false, error: data.error ?? "resposta sem cardId" };
    }
    return {
      mode: "live",
      ok: true,
      cardId: data.data.cardId,
      cardUrl: buildCardUrl(data.data.workspaceId, data.data.cardId),
    };
  } catch (err) {
    return { mode: "live", ok: false, error: (err as Error).message };
  }
}

/**
 * "Gerar no Formare" de um RELATÓRIO (F8): manda o documento inteiro pra virar
 * um card ('ideias', tags radar+relatorio) que o Redator do Formare retoma.
 * Mesma disciplina do /task: 403 (escrita off) -> caixa de saída, ok honesto.
 */
export async function sendReportToFormare(report: {
  clientName: string;
  titulo: string;
  corpo: string;
}): Promise<SendTaskResult> {
  const base = doorBaseUrl();
  const secret = doorSecret();
  const payload = {
    workspaceName: report.clientName,
    titulo: report.titulo,
    corpo: report.corpo,
  };

  if (!base || !secret) {
    const savedTo = saveTaskToOutbox({ kind: "report", ...payload });
    return { mode: "dry-run", ok: true, savedTo, reason: "porta não configurada" };
  }

  try {
    const res = await fetch(`${base}/report-task`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
    });
    if (res.status === 403) {
      const savedTo = saveTaskToOutbox({ kind: "report", ...payload });
      return { mode: "dry-run", ok: true, savedTo, reason: "porta de escrita desligada" };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { mode: "live", ok: false, error: `porta ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = (await res.json()) as {
      data?: { cardId?: string; workspaceId?: string };
      error?: string;
    };
    if (data.error || !data.data?.cardId || !data.data.workspaceId) {
      return { mode: "live", ok: false, error: data.error ?? "resposta sem cardId" };
    }
    return {
      mode: "live",
      ok: true,
      cardId: data.data.cardId,
      cardUrl: buildCardUrl(data.data.workspaceId, data.data.cardId),
    };
  } catch (err) {
    return { mode: "live", ok: false, error: (err as Error).message };
  }
}

/**
 * Envia itens de inteligência ao Formare pela porta estreita.
 * Sem RADAR_INTAKE_URL/SECRET -> DRY-RUN (registra local, não envia nada).
 */
export async function sendToFormare(
  items: IntelligenceItem[],
  opts: { workspaceName?: string } = {},
): Promise<SendResult> {
  const live = isDoorLive();
  if (items.length === 0) {
    return { mode: live ? "live" : "dry-run", ok: false, error: "nenhum item para enviar" };
  }
  const workspaceName = opts.workspaceName ?? items[0].clientName ?? "Moovefy";
  const payload = toPayload(items, workspaceName);

  // DRY-RUN: sem porta configurada, só registra localmente (caixa de saída).
  if (!live) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const hash = createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 8);
    mkdirSync(OUTBOX_DIR, { recursive: true });
    const savedTo = join(OUTBOX_DIR, `${stamp}-${hash}.json`);
    writeFileSync(
      savedTo,
      JSON.stringify({ mode: "dry-run", ranAt: new Date().toISOString(), payload }, null, 2),
      "utf8",
    );
    return { mode: "dry-run", ok: true, payload, savedTo };
  }

  // LIVE: só quando o Rafael instala a porta e configura RADAR_INTAKE_URL/SECRET.
  try {
    const res = await fetch(process.env.RADAR_INTAKE_URL as string, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RADAR_INTAKE_SECRET as string}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { mode: "live", ok: false, error: `porta ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = (await res.json()) as { data?: { inserted?: number }; error?: string };
    if (data.error) return { mode: "live", ok: false, error: data.error };
    return { mode: "live", ok: true, inserted: data.data?.inserted ?? 0 };
  } catch (err) {
    return { mode: "live", ok: false, error: (err as Error).message };
  }
}
