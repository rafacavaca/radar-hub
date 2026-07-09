/**
 * Store dos diagnósticos — data/diagnostico.json (escrita atômica, RADAR_DATA_DIR
 * pra teste isolado). 1 diagnóstico por (cliente, concorrente). Nunca lança na leitura.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { supabaseEnabled } from "@/lib/db/supabase";
import { sbGetDiagnostico, sbListDiagnosticos, sbSaveDiagnostico } from "@/lib/db/repo-diagnostico";
import type { DiagnosticoConcorrente } from "@/lib/diagnostico/schema";

type DiagFile = { diagnosticos: DiagnosticoConcorrente[] };

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function filePath(): string {
  return join(dataDir(), "diagnostico.json");
}

function readFile(): DiagFile {
  const path = filePath();
  if (!existsSync(path)) return { diagnosticos: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as DiagFile;
    if (parsed && Array.isArray(parsed.diagnosticos)) return parsed;
    return { diagnosticos: [] };
  } catch {
    return { diagnosticos: [] };
  }
}

function writeFile(file: DiagFile): void {
  mkdirSync(dataDir(), { recursive: true });
  const path = filePath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2), "utf8");
  renameSync(tmp, path);
}

/** O diagnóstico de um concorrente, se existe. */
export function getDiagnostico(
  clientName: string,
  concorrenteId: string,
): DiagnosticoConcorrente | null {
  return (
    readFile().diagnosticos.find(
      (d) => d.clientName === clientName && d.concorrente_id === concorrenteId,
    ) ?? null
  );
}

/** Todos os diagnósticos de um cliente. */
export function listDiagnosticos(clientName: string): DiagnosticoConcorrente[] {
  return readFile().diagnosticos.filter((d) => d.clientName === clientName);
}

/** Salva (substitui) o diagnóstico de um concorrente. */
export function saveDiagnostico(diag: DiagnosticoConcorrente): DiagnosticoConcorrente {
  const file = readFile();
  const idx = file.diagnosticos.findIndex(
    (d) => d.clientName === diag.clientName && d.concorrente_id === diag.concorrente_id,
  );
  if (idx >= 0) file.diagnosticos[idx] = diag;
  else file.diagnosticos.push(diag);
  writeFile(file);
  return diag;
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-TENANT (item 2 — cutover, aditivo). API ORG-SCOPED: em modo Supabase
// lê/grava do banco (RLS escopa pela org da sessão); senão cai no JSON síncrono.
// As superfícies user-facing migram get/list/save → load/persist uma a uma;
// os smokes e o cron seguem no caminho síncrono até o trilho do coletor.
// ─────────────────────────────────────────────────────────────────────────────

/** Diagnósticos de um cliente, escopados pela org da sessão (ou JSON). */
export async function loadDiagnosticos(clientName: string): Promise<DiagnosticoConcorrente[]> {
  return supabaseEnabled() ? sbListDiagnosticos(clientName) : listDiagnosticos(clientName);
}

/** O diagnóstico de um concorrente, escopado pela org da sessão (ou JSON). */
export async function loadDiagnostico(
  clientName: string,
  concorrenteId: string,
): Promise<DiagnosticoConcorrente | null> {
  return supabaseEnabled() ? sbGetDiagnostico(clientName, concorrenteId) : getDiagnostico(clientName, concorrenteId);
}

/** Salva o diagnóstico na org da sessão (ou JSON). */
export async function persistDiagnostico(diag: DiagnosticoConcorrente): Promise<DiagnosticoConcorrente> {
  return supabaseEnabled() ? sbSaveDiagnostico(diag) : saveDiagnostico(diag);
}
