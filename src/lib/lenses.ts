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

// ─── MULTI-TENANT (item 2): API org-scoped (Supabase/org_docs ou JSON). ──
// Um doc por cliente (kind `lenses`, key = cliente, data = LensConfig[]).
// A semeadura em modo org é EM MEMÓRIA (defaults determinísticos) — só grava
// quando o usuário edita. O loop segue no sync (vira por-org no rework).

const DOC_KIND = "lenses";

/** Completa lentes que faltem (versão futura) com o default. */
function comLentesCompletas(lenses: LensConfig[]): LensConfig[] {
  const out = [...lenses];
  for (const id of LENS_IDS) {
    if (!out.some((l) => l.id === id)) out.push({ id, enabled: true, ...LENS_DEFAULTS[id] });
  }
  return out;
}

/** Lentes de UM cliente, na org da sessão (ou JSON) — semeadas se preciso. */
export async function loadLensesFor(clientName: string): Promise<LensConfig[]> {
  if (!supabaseEnabled()) return lensesFor(clientName);
  const saved = await sbGetDoc<LensConfig[] | null>(DOC_KIND, clientName, null);
  return saved ? comLentesCompletas(saved) : defaultLensesFor(clientName).lenses;
}

/** A config completa (todos os clientes da org), semeando defaults em memória. */
export async function loadLenses(): Promise<LensesFile> {
  if (!supabaseEnabled()) return readLenses();
  const [docs, watchlist] = await Promise.all([sbListDocs<LensConfig[]>(DOC_KIND), loadWatchlist()]);
  const byClient = new Map(docs.map((d) => [d.key, comLentesCompletas(d.data ?? [])]));
  const clients: ClientLenses[] = watchlist.clients.map((c) => ({
    clientName: c.name,
    lenses: byClient.get(c.name) ?? defaultLensesFor(c.name).lenses,
  }));
  return { clients };
}

/** Edita uma lente na org da sessão (ou JSON). Devolve a config completa. */
export async function persistLensUpdate(
  clientName: string,
  lensId: LensId,
  patch: LensPatch,
): Promise<LensesFile> {
  if (!supabaseEnabled()) return updateLens(clientName, lensId, patch);
  validarPatch(patch);
  const watchlist = await loadWatchlist();
  if (!watchlist.clients.some((c) => c.name === clientName)) {
    throw new Error(`Cliente não encontrado: ${clientName}`);
  }
  const lenses = await loadLensesFor(clientName);
  const lens = lenses.find((l) => l.id === lensId);
  if (!lens) throw new Error(`Lente não encontrada: ${lensId}`);
  aplicarPatch(lens, patch);
  await sbSetDoc(DOC_KIND, clientName, lenses);
  return loadLenses();
}

/** Restaura a lente ao padrão, na org da sessão (ou JSON). */
export async function persistLensReset(clientName: string, lensId: LensId): Promise<LensesFile> {
  if (!supabaseEnabled()) return resetLens(clientName, lensId);
  const lenses = await loadLensesFor(clientName);
  const lens = lenses.find((l) => l.id === lensId);
  if (!lens) throw new Error(`Lente não encontrada: ${lensId}`);
  const defaults = LENS_DEFAULTS[lensId];
  lens.team = defaults.team;
  lens.regua = defaults.regua;
  lens.action = defaults.action;
  await sbSetDoc(DOC_KIND, clientName, lenses);
  return loadLenses();
}

/** Limpa a config de lentes de um cliente removido, na org da sessão (ou JSON). */
export async function dropClientLenses(clientName: string): Promise<void> {
  if (!supabaseEnabled()) return removeClientLenses(clientName);
  await sbDeleteDoc(DOC_KIND, clientName);
}
