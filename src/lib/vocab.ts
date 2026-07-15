/**
 * VOCABULÁRIO DA AGÊNCIA (P13, org-level) — STORE. Deixa a agência renomear os
 * TERMOS que ela vê no Radar (Concorrente, Área, Prioridade…) pro nome que ela
 * já usa. Fonte única por org: org_docs kind `vocab`, key `global` (JSON em
 * data/vocab.json no clássico). Guarda só o que DIFERE do padrão (mapa mínimo).
 *
 * O núcleo PURO (catálogo + resolvedor `rotulo`) vive em `@/lib/vocab-terms` —
 * re-exportado aqui pro servidor, e importado direto pelo CLIENTE (sem puxar fs).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { sbGetDoc, sbSetDoc } from "@/lib/db/repo-org-docs";
import { supabaseEnabled } from "@/lib/db/supabase";
import { sanitizarVocab, type VocabMap } from "@/lib/vocab-terms";

export * from "@/lib/vocab-terms";

const DOC_KIND = "vocab";
const DOC_KEY = "global";

// ── JSON fallback (clássico/testes) ──────────────────────────────────────────

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function filePath(): string {
  return join(dataDir(), "vocab.json");
}
function readJson(): VocabMap {
  const p = filePath();
  if (!existsSync(p)) return {};
  try {
    return sanitizarVocab(JSON.parse(readFileSync(p, "utf8")));
  } catch {
    return {};
  }
}
function writeJson(map: VocabMap): void {
  mkdirSync(dataDir(), { recursive: true });
  const p = filePath();
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(map, null, 2), "utf8");
  renameSync(tmp, p);
}

// ── API org-scoped ───────────────────────────────────────────────────────────

/** O vocabulário da org (mapa mínimo de overrides). Nunca lança. */
export async function loadVocab(): Promise<VocabMap> {
  if (!supabaseEnabled()) return readJson();
  return sanitizarVocab(await sbGetDoc<VocabMap | null>(DOC_KIND, DOC_KEY, null));
}

/** Grava o vocabulário (sanitizado) e devolve o mapa que ficou. */
export async function saveVocab(map: VocabMap): Promise<VocabMap> {
  const sane = sanitizarVocab(map);
  if (!supabaseEnabled()) writeJson(sane);
  else await sbSetDoc(DOC_KIND, DOC_KEY, sane);
  return sane;
}
