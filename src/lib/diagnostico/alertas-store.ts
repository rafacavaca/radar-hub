/**
 * F1a — Store de ALERTAS do diagnóstico: regras editáveis (por cliente) +
 * disparos (inbox in-app). data/diagnostico-alertas.json, escrita atômica,
 * RADAR_DATA_DIR pra teste isolado. Nunca lança na leitura.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { REGRAS_PADRAO } from "@/lib/diagnostico/movimento";
import type { AlertaDisparo, RegraAlerta } from "@/lib/diagnostico/schema";

const MAX_DISPAROS = 300;

type AlertasFile = {
  /** regras por cliente (nome → regras). Ausente ⇒ REGRAS_PADRAO. */
  regras: Record<string, RegraAlerta[]>;
  /** disparos (mais novo primeiro), com cap. */
  disparos: AlertaDisparo[];
};

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function filePath(): string {
  return join(dataDir(), "diagnostico-alertas.json");
}

function readFile(): AlertasFile {
  const path = filePath();
  if (!existsSync(path)) return { regras: {}, disparos: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as AlertasFile;
    return {
      regras: parsed?.regras && typeof parsed.regras === "object" ? parsed.regras : {},
      disparos: Array.isArray(parsed?.disparos) ? parsed.disparos : [],
    };
  } catch {
    return { regras: {}, disparos: [] };
  }
}

function writeFile(file: AlertasFile): void {
  mkdirSync(dataDir(), { recursive: true });
  const path = filePath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2), "utf8");
  renameSync(tmp, path);
}

/** Regras do cliente (padrão quando nunca editadas) — sempre a lista completa. */
export function getRegras(clientName: string): RegraAlerta[] {
  const salvas = readFile().regras[clientName];
  if (!salvas) return REGRAS_PADRAO.map((r) => ({ ...r }));
  // garante que regra nova (de versão futura) apareça mesmo pra quem já salvou
  return REGRAS_PADRAO.map((padrao) => salvas.find((s) => s.tipo === padrao.tipo) ?? { ...padrao });
}

export function saveRegras(clientName: string, regras: RegraAlerta[]): RegraAlerta[] {
  const file = readFile();
  file.regras[clientName] = regras;
  writeFile(file);
  return getRegras(clientName);
}

/** Anexa disparos novos (dedupe por id) — mais novos primeiro, com cap. */
export function appendDisparos(novos: AlertaDisparo[]): void {
  if (novos.length === 0) return;
  const file = readFile();
  const vistos = new Set(file.disparos.map((d) => d.id));
  const inserir = novos.filter((d) => !vistos.has(d.id));
  if (inserir.length === 0) return;
  file.disparos = [...inserir, ...file.disparos].slice(0, MAX_DISPAROS);
  writeFile(file);
}

export function listDisparos(clientName: string): AlertaDisparo[] {
  return readFile().disparos.filter((d) => d.clientName === clientName);
}

/** Marca TODOS os disparos do cliente como vistos. */
export function marcarVistos(clientName: string): void {
  const file = readFile();
  let mudou = false;
  for (const d of file.disparos) {
    if (d.clientName === clientName && !d.visto) {
      d.visto = true;
      mudou = true;
    }
  }
  if (mudou) writeFile(file);
}
