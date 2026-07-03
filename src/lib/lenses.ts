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

import { readWatchlist } from "@/lib/watchlist";

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

/** Edita uma lente de um cliente e persiste. Devolve a config atualizada. */
export function updateLens(clientName: string, lensId: LensId, patch: LensPatch): LensesFile {
  if (patch.regua !== undefined && patch.regua.trim().length < 10) {
    throw new Error("A régua ficou curta demais — descreva o que sobe pra esta lente.");
  }
  if (patch.team !== undefined && patch.team.trim().length === 0) {
    throw new Error("Diga qual time recebe as leituras desta lente.");
  }
  if (patch.action !== undefined && !(patch.action in ACTION_LABEL)) {
    throw new Error("Tipo de ação desconhecido.");
  }

  const file = readLenses();
  const client = file.clients.find((c) => c.clientName === clientName);
  if (!client) throw new Error(`Cliente não encontrado: ${clientName}`);
  const lens = client.lenses.find((l) => l.id === lensId);
  if (!lens) throw new Error(`Lente não encontrada: ${lensId}`);

  if (patch.enabled !== undefined) lens.enabled = patch.enabled;
  if (patch.team !== undefined) lens.team = patch.team.trim();
  if (patch.regua !== undefined) lens.regua = patch.regua.trim();
  if (patch.action !== undefined) lens.action = patch.action;

  writeFile(file);
  return file;
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
