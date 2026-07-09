/**
 * STATUS POR FONTE (F18) — a honestidade aplicada à cobertura.
 *
 * Cada rodada registra, por fonte, o que aconteceu: quantos sinais saíram,
 * quando, e se falhou. A tela Vigiar mostra isso ao lado de cada fonte —
 * assim o Rafael entende POR QUE um concorrente está quieto ("sem novidade"
 * é diferente de "falhou" e de "nunca rodou"), em vez de achar que é bug.
 *
 * Store: data/source-status.json (chave `${competitorId}:${sourceId}`).
 * Mesmo padrão dos outros: escrita atômica, leitura nunca lança,
 * RADAR_DATA_DIR isola em teste.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { supabaseEnabled } from "@/lib/db/supabase";
import { sbDeleteDoc, sbListDocs } from "@/lib/db/repo-org-docs";

export type SourceStatus = {
  lastRunAt: string;
  /** quantos sinais a fonte rendeu na última rodada. */
  eventos: number;
  /** mensagem curta quando a última rodada falhou. */
  erro?: string;
};

type StatusFile = { status: Record<string, SourceStatus> };

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function statusPath(): string {
  return join(dataDir(), "source-status.json");
}

function readFileSafe(): StatusFile {
  const path = statusPath();
  if (!existsSync(path)) return { status: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as StatusFile;
    return parsed && parsed.status && typeof parsed.status === "object" ? parsed : { status: {} };
  } catch {
    return { status: {} };
  }
}

function writeFileSafe(file: StatusFile): void {
  mkdirSync(dataDir(), { recursive: true });
  const path = statusPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2), "utf8");
  renameSync(tmp, path);
}

export function statusKey(competitorId: string, sourceId: string): string {
  return `${competitorId}:${sourceId}`;
}

/** Registra o resultado de uma rodada para UMA fonte. Nunca lança. */
export function recordSourceRun(
  competitorId: string,
  sourceId: string,
  outcome: { eventos: number; erro?: string },
): void {
  try {
    const file = readFileSafe();
    file.status[statusKey(competitorId, sourceId)] = {
      lastRunAt: new Date().toISOString(),
      eventos: Math.max(0, Math.floor(outcome.eventos)),
      erro: outcome.erro?.slice(0, 160),
    };
    writeFileSafe(file);
  } catch {
    // status é transparência, não pode derrubar a coleta.
  }
}

/** Todos os status (a tela Vigiar consome). */
export function listSourceStatus(): Record<string, SourceStatus> {
  return readFileSafe().status;
}

/** Limpa os status de um concorrente removido. */
export function forgetCompetitorStatus(competitorId: string): void {
  const file = readFileSafe();
  let changed = false;
  for (const key of Object.keys(file.status)) {
    if (key.startsWith(`${competitorId}:`)) {
      delete file.status[key];
      changed = true;
    }
  }
  if (changed) writeFileSafe(file);
}

// ─── MULTI-TENANT (item 2): API org-scoped (Supabase/org_docs ou JSON). ──
// Um doc por CONCORRENTE (kind `source-status`, key = competitorId, data =
// Record<sourceId, SourceStatus>). A ESCRITA (recordSourceRun) é do loop de
// coleta — vira por-org no rework do loop.

const DOC_KIND = "source-status";

/** Todos os status da org da sessão (ou JSON), achatados por `${cid}:${sid}`. */
export async function loadSourceStatus(): Promise<Record<string, SourceStatus>> {
  if (!supabaseEnabled()) return listSourceStatus();
  const docs = await sbListDocs<Record<string, SourceStatus>>(DOC_KIND);
  const out: Record<string, SourceStatus> = {};
  for (const doc of docs) {
    for (const [sourceId, status] of Object.entries(doc.data ?? {})) {
      out[statusKey(doc.key, sourceId)] = status;
    }
  }
  return out;
}

/** Limpa os status de um concorrente removido, na org da sessão (ou JSON). */
export async function dropCompetitorStatus(competitorId: string): Promise<void> {
  if (!supabaseEnabled()) return forgetCompetitorStatus(competitorId);
  await sbDeleteDoc(DOC_KIND, competitorId);
}
