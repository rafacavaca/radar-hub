/**
 * D — CONFIG do diagnóstico por concorrente (definida pelo usuário): fontes
 * extras, temas a vigiar e campos customizados. É o "motor configurável"
 * aplicado ao diagnóstico. Store data/diagnostico-config.json (atômico,
 * RADAR_DATA_DIR p/ teste). Nunca lança na leitura.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { CampoCustomDef } from "@/lib/diagnostico/campos-custom";

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

/** Salva a config (sanitizada). URLs inválidas são descartadas. */
export function setDiagConfig(clientName: string, competitorId: string, input: Partial<DiagConfig>): DiagConfig {
  const file = readFileSafe();
  const atual = file.configs[chave(clientName, competitorId)] ?? { ...DIAG_CONFIG_VAZIA };

  const fontesExtras =
    input.fontesExtras !== undefined
      ? input.fontesExtras.map((s) => s.trim()).filter(isUrl).slice(0, 5)
      : atual.fontesExtras;
  const temas =
    input.temas !== undefined ? input.temas.map((s) => s.trim()).filter(Boolean).slice(0, 10) : atual.temas;
  const camposCustom =
    input.camposCustom !== undefined
      ? input.camposCustom
          .map((c) => ({ chave: (c.chave ?? "").trim().slice(0, 40), pergunta: (c.pergunta ?? "").trim().slice(0, 240) }))
          .filter((c) => c.chave && c.pergunta)
          .slice(0, 8)
      : atual.camposCustom;

  file.configs[chave(clientName, competitorId)] = { fontesExtras, temas, camposCustom };
  writeFileSafe(file);
  return getDiagConfig(clientName, competitorId);
}
