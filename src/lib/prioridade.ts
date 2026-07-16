/**
 * P7 — RÉGUA DE PRIORIDADE (org-level) — STORE. Os cortes que traduzem o score
 * em palavra (Alta · Média · Baixa) são CRITÉRIO DA AGÊNCIA: uma vez, valem pra
 * todas as contas. Fonte única por org: org_docs kind `prioridade-regua`, key
 * `__agencia__` (JSON em data/prioridade.json no clássico). Nunca lança na leitura.
 *
 * O núcleo PURO (nivelPorCorte, sanitizarCorte, CORTE_PADRAO) vive em
 * `@/lib/prioridade-core` — re-exportado aqui pro servidor, importado direto
 * pelo CLIENTE (sem puxar fs).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { sbGetDoc, sbSetDoc } from "@/lib/db/repo-org-docs";
import { supabaseEnabled } from "@/lib/db/supabase";
import { sanitizarCorte, type CortePrioridade } from "@/lib/prioridade-core";

export * from "@/lib/prioridade-core";

const DOC_KIND = "prioridade-regua";
// CRITÉRIO DA AGÊNCIA (org-level): chave fixa — não é por-cliente.
const DOC_KEY = "__agencia__";

// ── JSON fallback (clássico/testes) ──────────────────────────────────────────

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function filePath(): string {
  return join(dataDir(), "prioridade.json");
}
function readJson(): CortePrioridade {
  const p = filePath();
  if (!existsSync(p)) return sanitizarCorte(null); // padrão
  try {
    return sanitizarCorte(JSON.parse(readFileSync(p, "utf8")));
  } catch {
    return sanitizarCorte(null);
  }
}
function writeJson(corte: CortePrioridade): void {
  mkdirSync(dataDir(), { recursive: true });
  const p = filePath();
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(corte, null, 2), "utf8");
  renameSync(tmp, p);
}

// ── API org-scoped ───────────────────────────────────────────────────────────

/** Os cortes da agência (org da sessão) — ou o padrão do sistema. Nunca lança. */
export async function loadPrioridade(): Promise<CortePrioridade> {
  if (!supabaseEnabled()) return readJson();
  return sanitizarCorte(await sbGetDoc<CortePrioridade | null>(DOC_KIND, DOC_KEY, null));
}

/** Grava os cortes (sanitizados) e devolve o que ficou. super_admin gate no API. */
export async function savePrioridade(bruto: unknown): Promise<CortePrioridade> {
  const sane = sanitizarCorte(bruto);
  if (!supabaseEnabled()) writeJson(sane);
  else await sbSetDoc(DOC_KIND, DOC_KEY, sane);
  return sane;
}
