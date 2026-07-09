/**
 * D — CONFIG do diagnóstico por concorrente (definida pelo usuário): fontes
 * extras, temas a vigiar e campos customizados. É o "motor configurável"
 * aplicado ao diagnóstico. Store data/diagnostico-config.json (atômico,
 * RADAR_DATA_DIR p/ teste). Nunca lança na leitura.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { supabaseEnabled } from "@/lib/db/supabase";
import { sbGetDoc, sbSetDoc } from "@/lib/db/repo-org-docs";
import type { CampoCustomDef } from "@/lib/diagnostico/campos-custom";

const DOC_KIND = "diag-config";

export type DiagConfig = {
  /** URLs extras a incluir no crawl (além do site). */
  fontesExtras: string[];
  /** temas que o usuário quer vigiar (guiam a extração; exibidos na ficha). */
  temas: string[];
  /** campos customizados a extrair. */
  camposCustom: CampoCustomDef[];
};

export const DIAG_CONFIG_VAZIA: DiagConfig = { fontesExtras: [], temas: [], camposCustom: [] };

type ConfigFile = { configs: Record<string, DiagConfig> };

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function filePath(): string {
  return join(dataDir(), "diagnostico-config.json");
}
/** chave estável por (cliente, concorrente). */
function chave(clientName: string, competitorId: string): string {
  return `${clientName}::${competitorId}`;
}

function readFileSafe(): ConfigFile {
  const path = filePath();
  if (!existsSync(path)) return { configs: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as ConfigFile;
    if (parsed && parsed.configs && typeof parsed.configs === "object") return parsed;
    return { configs: {} };
  } catch {
    return { configs: {} };
  }
}

function writeFileSafe(file: ConfigFile): void {
  mkdirSync(dataDir(), { recursive: true });
  const path = filePath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2), "utf8");
  renameSync(tmp, path);
}

export function getDiagConfig(clientName: string, competitorId: string): DiagConfig {
  const saved = readFileSafe().configs[chave(clientName, competitorId)];
  return saved ? { ...DIAG_CONFIG_VAZIA, ...saved } : { ...DIAG_CONFIG_VAZIA };
}

function isUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Sanitiza a config (URLs inválidas descartadas, limites), a partir da atual. */
function sanitizeConfig(input: Partial<DiagConfig>, atual: DiagConfig): DiagConfig {
  return {
    fontesExtras:
      input.fontesExtras !== undefined ? input.fontesExtras.map((s) => s.trim()).filter(isUrl).slice(0, 5) : atual.fontesExtras,
    temas: input.temas !== undefined ? input.temas.map((s) => s.trim()).filter(Boolean).slice(0, 10) : atual.temas,
    camposCustom:
      input.camposCustom !== undefined
        ? input.camposCustom
            .map((c) => ({ chave: (c.chave ?? "").trim().slice(0, 40), pergunta: (c.pergunta ?? "").trim().slice(0, 240) }))
            .filter((c) => c.chave && c.pergunta)
            .slice(0, 8)
        : atual.camposCustom,
  };
}

/** Salva a config (sanitizada) — JSON síncrono. */
export function setDiagConfig(clientName: string, competitorId: string, input: Partial<DiagConfig>): DiagConfig {
  const file = readFileSafe();
  const atual = file.configs[chave(clientName, competitorId)] ?? { ...DIAG_CONFIG_VAZIA };
  file.configs[chave(clientName, competitorId)] = sanitizeConfig(input, atual);
  writeFileSafe(file);
  return getDiagConfig(clientName, competitorId);
}

// ─── MULTI-TENANT (item 2): API org-scoped (Supabase/org_docs ou JSON). ──

/** Config do concorrente, na org da sessão (ou JSON). */
export async function loadDiagConfig(clientName: string, competitorId: string): Promise<DiagConfig> {
  if (!supabaseEnabled()) return getDiagConfig(clientName, competitorId);
  const saved = await sbGetDoc<DiagConfig | null>(DOC_KIND, chave(clientName, competitorId), null);
  return saved ? { ...DIAG_CONFIG_VAZIA, ...saved } : { ...DIAG_CONFIG_VAZIA };
}

/** Salva a config na org da sessão (ou JSON). */
export async function saveDiagConfig(clientName: string, competitorId: string, input: Partial<DiagConfig>): Promise<DiagConfig> {
  if (!supabaseEnabled()) return setDiagConfig(clientName, competitorId, input);
  const atual = await loadDiagConfig(clientName, competitorId);
  const sane = sanitizeConfig(input, atual);
  await sbSetDoc(DOC_KIND, chave(clientName, competitorId), sane);
  return { ...DIAG_CONFIG_VAZIA, ...sane };
}
