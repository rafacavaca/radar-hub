/**
 * ANALISTAS POR ÓTICA (F6) — as três LENTES que leem o mesmo sinal cada uma
 * pro seu time: comercial, produto e marketing.
 *
 * Cada lente é um "analista-agente" (mesmo padrão dos especialistas do
 * Formare): tem uma RÉGUA de relevância em linguagem simples, um TIME que
 * atende e um TIPO DE AÇÃO que dispara. Tudo EDITÁVEL pelo Rafael (tela
 * Analistas), mas PRÉ-PREENCHIDO com bons padrões — ninguém começa do zero.
 *
 * A config vive em `data/lenses.json` (banco próprio do Radar), por cliente,
 * com o mesmo padrão da watchlist: seed automático, escrita atômica,
 * mensagens de erro em pt-BR, RADAR_DATA_DIR pra teste isolado.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { supabaseEnabled } from "@/lib/db/supabase";
import { sbDeleteDoc, sbGetDoc, sbListDocs, sbSetDoc } from "@/lib/db/repo-org-docs";
import { loadWatchlist, readWatchlist } from "@/lib/watchlist";

export type LensId = "comercial" | "produto" | "marketing";

/** O tipo de ação que a leitura da lente dispara. */
export type LensActionKind = "abordagem" | "nota_roadmap" | "brief_conteudo";

export type LensConfig = {
  id: LensId;
  /** a lente está ativa para este cliente? (nem todo cliente tem os 3 times) */
  enabled: boolean;
  /** quem recebe as leituras desta lente. */
  team: string;
  /** o que o botão de ação gera. */
  action: LensActionKind;
  /** a régua de relevância, em linguagem simples — o COMO a lente pensa. */
  regua: string;
};

export type ClientLenses = { clientName: string; lenses: LensConfig[] };
export type LensesFile = { clients: ClientLenses[] };

/** Rótulos humanos (UI e prompts). */
export const LENS_LABEL: Record<LensId, string> = {
  comercial: "Comercial",
  produto: "Produto",
  marketing: "Marketing",
};

export const ACTION_LABEL: Record<LensActionKind, string> = {
  abordagem: "Rascunho de abordagem (no Formare)",
  nota_roadmap: "Nota de roadmap (interna)",
  brief_conteudo: "Brief de conteúdo (no Formare)",
};

/** A pergunta que cada lente responde (fixa — é a identidade da lente). */
export const LENS_QUESTION: Record<LensId, string> = {
  comercial: "O que este movimento significa pra vender ou reter AGORA?",
  produto: "O que isto significa pro nosso produto e roadmap?",
  marketing: "O que isto significa pro nosso discurso, posicionamento e conteúdo?",
};

/** DEFAULTS da spec do Rafael — pré-preenchidos e editáveis. */
export const LENS_DEFAULTS: Record<LensId, Omit<LensConfig, "id" | "enabled">> = {
  comercial: {
    team: "Time de vendas / CS",
    action: "abordagem",
    regua:
      "Sobe quando o movimento mexe com um cliente ou negociação que estamos de olho; " +
      "quando o concorrente ataca comercialmente (preço, condição, campanha agressiva); " +
      "ou quando há sinal de que uma conta pode trocar de fornecedor. " +
      "Ignora tendência genérica sem efeito comercial imediato.",
  },
  produto: {
    team: "Time de produto",
    action: "nota_roadmap",
    regua:
      "Sobe quando o mercado pede uma capability; quando o concorrente lança " +
      "funcionalidade ou produto novo; ou quando há um gap nosso ou uma feature parada " +
      "que casa com o movimento (o cruzamento interno × externo). " +
      "Ignora puro marketing sem substância de produto.",
  },
  marketing: {
    team: "Time de marketing",
    action: "brief_conteudo",
    regua:
      "Sobe quando o concorrente muda mensagem, posicionamento ou visual; quando há " +
      "tendência de narrativa no mercado; ou quando o movimento abre um gancho claro " +
      "de conteúdo. Ignora o que não afeta discurso nem gera pauta.",
  },
};

export const LENS_IDS: readonly LensId[] = ["comercial", "produto", "marketing"] as const;

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}

function lensesPath(): string {
  return join(dataDir(), "lenses.json");
}

/** Config default (todas ativas) pra um cliente. */
function defaultLensesFor(clientName: string): ClientLenses {
  return {
    clientName,
    lenses: LENS_IDS.map((id) => ({ id, enabled: true, ...LENS_DEFAULTS[id] })),
  };
}

function isValidFile(value: unknown): value is LensesFile {
  if (!value || typeof value !== "object") return false;
  const clients = (value as LensesFile).clients;
  if (!Array.isArray(clients)) return false;
  return clients.every(
    (c) =>
      c &&
      typeof c.clientName === "string" &&
      Array.isArray(c.lenses) &&
      c.lenses.every(
        (l) =>
          l &&
          (LENS_IDS as readonly string[]).includes(l.id) &&
          typeof l.enabled === "boolean" &&
          typeof l.team === "string" &&
          typeof l.regua === "string" &&
          ["abordagem", "nota_roadmap", "brief_conteudo"].includes(l.action),
      ),
  );
}

function writeFile(file: LensesFile): void {
  mkdirSync(dataDir(), { recursive: true });
  const path = lensesPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2), "utf8");
  renameSync(tmp, path);
}

/**
 * Lê a config de lentes, SEMEANDO defaults pra todo cliente da watchlist que
 * ainda não tem (cliente novo ganha as 3 lentes ativas com régua padrão).
 * Nunca lança.
 */
export function readLenses(): LensesFile {
  let file: LensesFile = { clients: [] };
  const path = lensesPath();
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (isValidFile(parsed)) file = parsed;
      else console.warn(`[lenses] ${path} malformado — reconstruindo dos defaults.`);
    } catch (err) {
      console.warn(`[lenses] falha lendo ${path}: ${(err as Error).message} — defaults.`);
    }
  }

  // semeia clientes da watchlist que faltam (e completa lentes que faltem).
  let changed = false;
  for (const client of readWatchlist().clients) {
    let entry = file.clients.find((c) => c.clientName === client.name);
    if (!entry) {
      entry = defaultLensesFor(client.name);
      file.clients.push(entry);
      changed = true;
      continue;
    }
    for (const id of LENS_IDS) {
      if (!entry.lenses.some((l) => l.id === id)) {
        entry.lenses.push({ id, enabled: true, ...LENS_DEFAULTS[id] });
        changed = true;
      }
    }
  }
  if (changed) {
    try {
      writeFile(file);
    } catch {
      // sem escrita ainda dá pra operar em memória.
    }
  }
  return file;
}

/** Lentes de UM cliente (semeadas se preciso). */
export function lensesFor(clientName: string): LensConfig[] {
  const file = readLenses();
  return (
    file.clients.find((c) => c.clientName === clientName)?.lenses ??
    defaultLensesFor(clientName).lenses
  );
}

/** Só as lentes ATIVAS de um cliente (o que o loop roda). */
export function activeLensesFor(clientName: string): LensConfig[] {
  return lensesFor(clientName).filter((l) => l.enabled);
}

export type LensPatch = Partial<Pick<LensConfig, "enabled" | "team" | "regua" | "action">>;

/** Valida um patch de lente (mensagens pt-BR). Compartilhado JSON/org. */
function validarPatch(patch: LensPatch): void {
  if (patch.regua !== undefined && patch.regua.trim().length < 10) {
    throw new Error("A régua ficou curta demais — descreva o que sobe pra esta lente.");
  }
  if (patch.team !== undefined && patch.team.trim().length === 0) {
    throw new Error("Diga qual time recebe as leituras desta lente.");
  }
  if (patch.action !== undefined && !(patch.action in ACTION_LABEL)) {
    throw new Error("Tipo de ação desconhecido.");
  }
}

/** Aplica um patch VALIDADO a uma lente (mutação local). */
function aplicarPatch(lens: LensConfig, patch: LensPatch): void {
  if (patch.enabled !== undefined) lens.enabled = patch.enabled;
  if (patch.team !== undefined) lens.team = patch.team.trim();
  if (patch.regua !== undefined) lens.regua = patch.regua.trim();
  if (patch.action !== undefined) lens.action = patch.action;
}

/** Edita uma lente de um cliente e persiste. Devolve a config atualizada. */
export function updateLens(clientName: string, lensId: LensId, patch: LensPatch): LensesFile {
  validarPatch(patch);

  const file = readLenses();
  const client = file.clients.find((c) => c.clientName === clientName);
  if (!client) throw new Error(`Cliente não encontrado: ${clientName}`);
  const lens = client.lenses.find((l) => l.id === lensId);
  if (!lens) throw new Error(`Lente não encontrada: ${lensId}`);

  aplicarPatch(lens, patch);

  writeFile(file);
  return file;
}

/** Limpa a config de lentes de um cliente removido do Radar (F7). */
export function removeClientLenses(clientName: string): void {
  const file = readLenses();
  const before = file.clients.length;
  file.clients = file.clients.filter((c) => c.clientName !== clientName);
  if (file.clients.length !== before) writeFile(file);
}

/** Restaura a lente ao padrão de fábrica (mantém enabled). */
export function resetLens(clientName: string, lensId: LensId): LensesFile {
  const file = readLenses();
  const client = file.clients.find((c) => c.clientName === clientName);
  if (!client) throw new Error(`Cliente não encontrado: ${clientName}`);
  const lens = client.lenses.find((l) => l.id === lensId);
  if (!lens) throw new Error(`Lente não encontrada: ${lensId}`);

  const defaults = LENS_DEFAULTS[lensId];
  lens.team = defaults.team;
  lens.regua = defaults.regua;
  lens.action = defaults.action;

  writeFile(file);
  return file;
}

// ─── RE-SCOPE (org-level): a RÉGUA/time/ação de cada área é CRITÉRIO DA AGÊNCIA
// (um doc por org, kind `lens-regua`, key `global`) — editar por um cliente vale
// pra TODOS. As ÁREAS ATIVAS seguem POR CLIENTE (doc `lenses`, key=cliente — só o
// campo `enabled` importa agora). loadActiveLensesFor MESCLA os dois → LensConfig[]
// completo, então o LOOP e o analista NÃO mudam (contrato preservado; smoke prova).

const DOC_KIND = "lenses"; // por-cliente: fonte do `enabled`
const DOC_KIND_REGUA = "lens-regua"; // org-level: régua/time/ação da agência
const REGUA_KEY = "global";

/** A régua/time/ação de cada área — o critério de leitura da agência (org-level). */
export type ReguaAgencia = Record<LensId, Omit<LensConfig, "id" | "enabled">>;

function reguaAgenciaDefault(): ReguaAgencia {
  return {
    comercial: { ...LENS_DEFAULTS.comercial },
    produto: { ...LENS_DEFAULTS.produto },
    marketing: { ...LENS_DEFAULTS.marketing },
  };
}

/** Mescla o salvo sobre o default (área/campo faltante fica seguro no padrão). */
function mesclarRegua(saved: Partial<ReguaAgencia> | null): ReguaAgencia {
  const base = reguaAgenciaDefault();
  if (saved) for (const id of LENS_IDS) if (saved[id]) base[id] = { ...base[id], ...saved[id] };
  return base;
}

// JSON fallback (clássico/testes) da régua da agência.
function reguaPath(): string {
  return join(dataDir(), "lens-regua.json");
}
function readReguaJson(): ReguaAgencia {
  if (!existsSync(reguaPath())) return reguaAgenciaDefault();
  try {
    return mesclarRegua(JSON.parse(readFileSync(reguaPath(), "utf8")) as Partial<ReguaAgencia>);
  } catch {
    return reguaAgenciaDefault();
  }
}
function writeReguaJson(r: ReguaAgencia): void {
  mkdirSync(dataDir(), { recursive: true });
  const tmp = `${reguaPath()}.tmp`;
  writeFileSync(tmp, JSON.stringify(r, null, 2), "utf8");
  renameSync(tmp, reguaPath());
}

/** A régua da agência (org-scoped), semeada com o padrão. Nunca lança. */
export async function loadReguaAgencia(): Promise<ReguaAgencia> {
  if (!supabaseEnabled()) return readReguaJson();
  return mesclarRegua(await sbGetDoc<Partial<ReguaAgencia> | null>(DOC_KIND_REGUA, REGUA_KEY, null));
}

async function persistReguaMap(r: ReguaAgencia): Promise<void> {
  if (!supabaseEnabled()) writeReguaJson(r);
  else await sbSetDoc(DOC_KIND_REGUA, REGUA_KEY, r);
}

/** As áreas ATIVAS de um cliente (só o `enabled`; default: todas ativas). */
async function ativasFor(clientName: string): Promise<Record<LensId, boolean>> {
  const saved = supabaseEnabled()
    ? await sbGetDoc<LensConfig[] | null>(DOC_KIND, clientName, null)
    : (readLenses().clients.find((c) => c.clientName === clientName)?.lenses ?? null);
  const out = {} as Record<LensId, boolean>;
  for (const id of LENS_IDS) out[id] = saved?.find((l) => l.id === id)?.enabled ?? true;
  return out;
}

/** Monta LensConfig[] mesclando a régua da agência + o enabled do cliente. */
function montarLenses(regua: ReguaAgencia, ativas: Record<LensId, boolean>): LensConfig[] {
  return LENS_IDS.map((id) => ({ id, enabled: ativas[id] !== false, ...regua[id] }));
}

/** Grava o `enabled` de uma área para um cliente (no doc por-cliente). */
async function setAtiva(clientName: string, lensId: LensId, enabled: boolean): Promise<void> {
  const atuais = await loadLensesFor(clientName); // já mesclado (régua + enabled)
  const lens = atuais.find((l) => l.id === lensId);
  if (lens) lens.enabled = enabled;
  if (!supabaseEnabled()) {
    const file = readLenses();
    const c = file.clients.find((x) => x.clientName === clientName);
    if (c) c.lenses = atuais;
    else file.clients.push({ clientName, lenses: atuais });
    writeFile(file);
  } else {
    await sbSetDoc(DOC_KIND, clientName, atuais);
  }
}

/** Lentes de UM cliente (régua da agência + enabled do cliente). */
export async function loadLensesFor(clientName: string): Promise<LensConfig[]> {
  const [regua, ativas] = await Promise.all([loadReguaAgencia(), ativasFor(clientName)]);
  return montarLenses(regua, ativas);
}

/** Só as ATIVAS de um cliente (o que o loop roda) — contrato preservado. */
export async function loadActiveLensesFor(clientName: string): Promise<LensConfig[]> {
  return (await loadLensesFor(clientName)).filter((l) => l.enabled);
}

/** A config completa (todos os clientes da org), com a régua ÚNICA da agência. */
export async function loadLenses(): Promise<LensesFile> {
  const [regua, watchlist] = await Promise.all([loadReguaAgencia(), loadWatchlist()]);
  const clients: ClientLenses[] = await Promise.all(
    watchlist.clients.map(async (c) => ({ clientName: c.name, lenses: montarLenses(regua, await ativasFor(c.name)) })),
  );
  return { clients };
}

/**
 * Edita uma lente. RE-SCOPE: `enabled` vai pro CLIENTE; régua/time/ação vão pro
 * CRITÉRIO DA AGÊNCIA (org-level) — editar por um cliente muda pra TODOS.
 */
export async function persistLensUpdate(
  clientName: string,
  lensId: LensId,
  patch: LensPatch,
): Promise<LensesFile> {
  validarPatch(patch);
  if (patch.enabled !== undefined) await setAtiva(clientName, lensId, patch.enabled);
  if (patch.team !== undefined || patch.regua !== undefined || patch.action !== undefined) {
    const regua = await loadReguaAgencia();
    const cur = regua[lensId];
    regua[lensId] = {
      team: patch.team?.trim() ?? cur.team,
      regua: patch.regua?.trim() ?? cur.regua,
      action: patch.action ?? cur.action,
    };
    await persistReguaMap(regua);
  }
  return loadLenses();
}

/** Restaura a régua de uma área ao padrão de fábrica (org-level, vale pra todos). */
export async function persistLensReset(_clientName: string, lensId: LensId): Promise<LensesFile> {
  const regua = await loadReguaAgencia();
  regua[lensId] = { ...LENS_DEFAULTS[lensId] };
  await persistReguaMap(regua);
  return loadLenses();
}

/** Limpa as áreas ativas de um cliente removido (a régua é da agência, permanece). */
export async function dropClientLenses(clientName: string): Promise<void> {
  if (!supabaseEnabled()) return removeClientLenses(clientName);
  await sbDeleteDoc(DOC_KIND, clientName);
}
