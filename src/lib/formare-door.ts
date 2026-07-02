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
