/**
 * BASE DE CONHECIMENTO LOCAL (por org, por cliente) — o texto ENXUTO da
 * implantação (o diagnóstico digitado), guardado em org_docs (kind `base-local`,
 * key=cliente; JSON fallback). Plugado na costura de fallback do brain.ts:
 * destrava a correlação pras agências do piloto SEM tocar na porta de leitura
 * nem no owner gate.
 *
 * Honesto por construção: NÃO é o Brain rico do Formare — é uma base local,
 * digitada. Quem consome (dossiê, battlecard, swot) rotula como "base local
 * (implantação)", nunca como "Brain real". Org-scoped: a base de uma agência
 * NUNCA vaza pra outra, mesmo com cliente de nome idêntico (org_docs + RLS).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { sbGetDoc, sbSetDoc } from "@/lib/db/repo-org-docs";
import { supabaseEnabled } from "@/lib/db/supabase";

const DOC_KIND = "base-local";
const MAX_CHARS = 8000; // orçamento: cabe no prompt do analista sem estourar
type Doc = { texto: string };

// ── JSON fallback (clássico/testes): mapa { [cliente]: texto } ────────────────

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function filePath(): string {
  return join(dataDir(), "base-local.json");
}
function readJsonAll(): Record<string, string> {
  const p = filePath();
  if (!existsSync(p)) return {};
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return {};
  }
}
function writeJsonAll(all: Record<string, string>): void {
  mkdirSync(dataDir(), { recursive: true });
  const p = filePath();
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(all, null, 2), "utf8");
  renameSync(tmp, p);
}

// ── API org-scoped ───────────────────────────────────────────────────────────

/** O texto da base local de um cliente na org do contexto ("" se não há). */
export async function loadBaseLocal(clientName: string): Promise<string> {
  if (!supabaseEnabled()) return (readJsonAll()[clientName] ?? "").trim();
  const doc = await sbGetDoc<Doc | null>(DOC_KIND, clientName, null);
  return (doc?.texto ?? "").trim();
}

/** Grava (ou apaga, se vazio) a base local de um cliente. Devolve o texto salvo. */
export async function saveBaseLocal(clientName: string, texto: string): Promise<string> {
  const clean = (texto ?? "").trim().slice(0, MAX_CHARS);
  if (!supabaseEnabled()) {
    const all = readJsonAll();
    if (clean) all[clientName] = clean;
    else delete all[clientName];
    writeJsonAll(all);
  } else {
    await sbSetDoc(DOC_KIND, clientName, { texto: clean });
  }
  return clean;
}
