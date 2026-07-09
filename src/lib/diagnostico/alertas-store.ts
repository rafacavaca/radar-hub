/**
 * F1a — Store de ALERTAS do diagnóstico: regras editáveis (por cliente) +
 * disparos (inbox in-app). data/diagnostico-alertas.json, escrita atômica,
 * RADAR_DATA_DIR pra teste isolado. Nunca lança na leitura.
 *
 * MULTI-TENANT (item 2): a API async (loadRegras, persistDisparos, …) despacha
 * pra org_docs (kinds `diag-alertas-regras` e `diag-alertas-disparos`, key =
 * cliente) em modo Supabase, ou pro JSON. O caminho do usuário usa SEMPRE a async.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { supabaseEnabled } from "@/lib/db/supabase";
import { sbGetDoc, sbSetDoc } from "@/lib/db/repo-org-docs";
import { REGRAS_PADRAO } from "@/lib/diagnostico/movimento";
import type { AlertaDisparo, RegraAlerta } from "@/lib/diagnostico/schema";

const MAX_DISPAROS = 300;
const KIND_REGRAS = "diag-alertas-regras";
const KIND_DISPAROS = "diag-alertas-disparos";

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

/** Completa regras salvas com o padrão (regra nova de versão futura aparece). */
function comPadrao(salvas: RegraAlerta[] | null | undefined): RegraAlerta[] {
  if (!salvas) return REGRAS_PADRAO.map((r) => ({ ...r }));
  return REGRAS_PADRAO.map((padrao) => salvas.find((s) => s.tipo === padrao.tipo) ?? { ...padrao });
}

/** Regras do cliente (padrão quando nunca editadas) — sempre a lista completa. */
export function getRegras(clientName: string): RegraAlerta[] {
  return comPadrao(readFile().regras[clientName]);
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

// ─── MULTI-TENANT (item 2): API org-scoped (Supabase/org_docs ou JSON). ──

/** Regras do cliente, na org da sessão (ou JSON). Sempre a lista completa. */
export async function loadRegras(clientName: string): Promise<RegraAlerta[]> {
  if (!supabaseEnabled()) return getRegras(clientName);
  return comPadrao(await sbGetDoc<RegraAlerta[] | null>(KIND_REGRAS, clientName, null));
}

/** Salva as regras do cliente na org da sessão (ou JSON). */
export async function persistRegras(clientName: string, regras: RegraAlerta[]): Promise<RegraAlerta[]> {
  if (!supabaseEnabled()) return saveRegras(clientName, regras);
  await sbSetDoc(KIND_REGRAS, clientName, regras);
  return comPadrao(regras);
}

/** Disparos do cliente, na org da sessão (ou JSON). Mais novos primeiro. */
export async function loadDisparos(clientName: string): Promise<AlertaDisparo[]> {
  if (!supabaseEnabled()) return listDisparos(clientName);
  return sbGetDoc<AlertaDisparo[]>(KIND_DISPAROS, clientName, []);
}

/**
 * Anexa disparos novos na org da sessão (ou JSON) — dedupe por id, cap por
 * cliente. Os disparos vêm de UMA varredura (um cliente); agrupa por via das dúvidas.
 */
export async function persistDisparos(novos: AlertaDisparo[]): Promise<void> {
  if (novos.length === 0) return;
  if (!supabaseEnabled()) return appendDisparos(novos);
  const porCliente = new Map<string, AlertaDisparo[]>();
  for (const d of novos) {
    const lista = porCliente.get(d.clientName) ?? [];
    lista.push(d);
    porCliente.set(d.clientName, lista);
  }
  for (const [clientName, lista] of porCliente) {
    const atuais = await sbGetDoc<AlertaDisparo[]>(KIND_DISPAROS, clientName, []);
    const vistos = new Set(atuais.map((d) => d.id));
    const inserir = lista.filter((d) => !vistos.has(d.id));
    if (inserir.length === 0) continue;
    await sbSetDoc(KIND_DISPAROS, clientName, [...inserir, ...atuais].slice(0, MAX_DISPAROS));
  }
}

/** Marca os disparos do cliente como vistos, na org da sessão (ou JSON). */
export async function persistVistos(clientName: string): Promise<void> {
  if (!supabaseEnabled()) return marcarVistos(clientName);
  const atuais = await sbGetDoc<AlertaDisparo[]>(KIND_DISPAROS, clientName, []);
  if (!atuais.some((d) => !d.visto)) return;
  await sbSetDoc(KIND_DISPAROS, clientName, atuais.map((d) => (d.visto ? d : { ...d, visto: true })));
}
