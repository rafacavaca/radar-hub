/**
 * Leitor do BRAIN REAL (F3) — o Radar deixa de usar resumo fixo e passa a
 * ancorar o analista no conhecimento CONFIRMADO do cliente, vindo do Brain do
 * Formare pela porta estreita de LEITURA (GET /brain do radar-door).
 *
 * SEGURANÇA (lado do Radar):
 * - O Radar NUNCA tem a credencial do banco do Formare. Só conhece a URL da
 *   porta (RADAR_BRAIN_URL) + o segredo compartilhado (RADAR_BRAIN_SECRET).
 * - A porta só serve conhecimento confirmado e não-rascunho — quem garante é
 *   o SERVIDOR (ver door/door.mjs); aqui a gente só consome.
 *
 * HONESTIDADE (nunca fingir contexto):
 * - `mode: "live"`    -> contexto veio do Brain real (com contagem de fatos).
 * - `mode: "fixture"` -> porta indisponível; usamos o resumo local da Moovefy
 *                        (o substituto do F1) e DIZEMOS isso.
 * - `mode: "none"`    -> cliente sem Brain e sem fixture; o analista é
 *                        instruído a ser conservador, não a inventar.
 *
 * CUSTO: resultado LIVE tem cache de DIA (.cache/brain-<cliente>-<data>.json) —
 * o Brain não muda de hora em hora e a porta não precisa apanhar a cada visita.
 * Fallbacks NÃO são cacheados (se a porta voltar, a próxima rodada já é live).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { GEMMINI } from "@/lib/clients/gemmini";
import { MOOVEFY } from "@/lib/clients/moovefy";
import { TAGAT } from "@/lib/clients/tagat";
import { currentOrgId } from "@/lib/db/session";
import { slugify } from "@/lib/watchlist";

const CACHE_DIR = join(process.cwd(), ".cache");
const FETCH_TIMEOUT_MS = 10000;
const NODE_LIMIT = 60;
/** Orçamento de chars do contexto (o prompt do analista precisa caber). */
const CONTEXT_MAX_CHARS = 6000;
const NODE_MAX_CHARS = 320;

/** Um nó como a porta devolve (já filtrado: confirmado + não-rascunho). */
export type BrainNode = {
  type: string;
  layer: string;
  material_kind: string | null;
  authority: "canonical" | "reference";
  confidence: number;
  content: string;
  updated_at: string;
};

export type BrainContext =
  | { mode: "live"; context: string; nodeCount: number }
  | { mode: "fixture"; context: string }
  | { mode: "none"; context: string };

export type FetchBrainOptions = {
  /** ignora o cache do dia (usado pelo smoke pra provar live e fallback). */
  noCache?: boolean;
};

/** A porta de leitura está configurada? (URL + segredo no .env do Radar) */
export function isBrainDoorConfigured(): boolean {
  return Boolean(process.env.RADAR_BRAIN_URL && process.env.RADAR_BRAIN_SECRET);
}

/**
 * ISOLAMENTO MULTI-TENANT: a org DONA do Brain — a ÚNICA que pode ler o Brain do
 * Formare (e os fixtures locais). A porta serve por NOME de workspace com um
 * segredo compartilhado; sem este portão, uma org com um cliente de nome igual
 * ao de outra agência leria o conhecimento da outra. Default: a org de ingestão
 * (o Formare do Rafael). Exportado pra o teste de isolamento provar o gate.
 */
export function brainOwnerOrgId(): string | undefined {
  return process.env.RADAR_BRAIN_ORG_ID || process.env.RADAR_INGEST_ORG_ID || undefined;
}

/**
 * Contexto genérico "sem Brain" — o que uma org NÃO-dona SEMPRE recebe. Nunca o
 * fixture (que é de um cliente do Formare) nem o Brain de outra org.
 */
function noneFor(clientName: string): BrainContext {
  return {
    mode: "none",
    context:
      `Ainda NÃO há base de conhecimento disponível para ${clientName}. ` +
      "Seja conservador: gere itens só quando o impacto for óbvio pelo próprio movimento, " +
      "com scores baixos, e deixe claro no porQueImporta que falta contexto do cliente.",
  };
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Cache do dia POR ORG (nunca serve o Brain de uma org a outra, nem por nome). */
function cachePathFor(orgId: string, clientName: string): string {
  const org = (orgId || "sem-org").slice(0, 12);
  return join(CACHE_DIR, `brain-${org}-${slugify(clientName)}-${todayStamp()}.json`);
}

function readCache(orgId: string, clientName: string): BrainContext | null {
  const path = cachePathFor(orgId, clientName);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as BrainContext;
    if (parsed && parsed.mode === "live" && typeof parsed.context === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeCache(orgId: string, clientName: string, value: BrainContext): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePathFor(orgId, clientName), JSON.stringify(value, null, 2), "utf8");
  } catch {
    // cache é conveniência; falha de escrita não pode derrubar o loop.
  }
}

/** Uma linha compacta por nó: "(oferta) O CRM da Moovefy é customizável…" */
function nodeLine(node: BrainNode): string {
  const kind = node.material_kind ?? node.layer;
  const clean = node.content.replace(/\s+/g, " ").trim().slice(0, NODE_MAX_CHARS);
  return `- (${kind}) ${clean}`;
}

/** Monta o contexto textual pro analista, canônico primeiro, dentro do orçamento. */
function formatContext(clientName: string, nodes: BrainNode[]): string {
  const canonical = nodes.filter((n) => n.authority === "canonical");
  const reference = nodes.filter((n) => n.authority === "reference");

  const parts: string[] = [
    `O QUE O BRAIN DO FORMARE SABE DE ${clientName.toUpperCase()} (${nodes.length} fatos confirmados):`,
  ];
  let budget = CONTEXT_MAX_CHARS - parts[0].length;

  const push = (line: string): boolean => {
    if (line.length + 1 > budget) return false;
    parts.push(line);
    budget -= line.length + 1;
    return true;
  };

  if (canonical.length > 0) {
    push("\nVERDADE INSTITUCIONAL (canônico):");
    for (const node of canonical) if (!push(nodeLine(node))) break;
  }
  if (reference.length > 0) {
    push("\nCONHECIMENTO CONFIRMADO (referência):");
    for (const node of reference) if (!push(nodeLine(node))) break;
  }
  return parts.join("\n");
}

/** Fallback quando a porta está fora do ar / sem nós — SEMPRE dizendo o que é. */
function fallbackFor(clientName: string): BrainContext {
  if (clientName === MOOVEFY.clientName) {
    return {
      mode: "fixture",
      context:
        `(Contexto LOCAL — a porta de leitura do Brain estava indisponível nesta rodada.)\n` +
        MOOVEFY.brainContext,
    };
  }
  if (clientName === GEMMINI.clientName) {
    return {
      mode: "fixture",
      context:
        `(Base da carteira Gemmini — as 5 linhas + a matriz linha↔hospital, seedadas localmente.)\n` +
        GEMMINI.brainContext,
    };
  }
  if (clientName === TAGAT.clientName) {
    return {
      mode: "fixture",
      context:
        `(Rascunho LOCAL da oferta da TAGAT — a porta de leitura do Brain não trouxe fatos confirmados nesta rodada. Confirmar/atualizar pelo Brain real.)\n` +
        TAGAT.offerContext,
    };
  }
  return {
    mode: "none",
    context:
      `Ainda NÃO há base de conhecimento disponível para ${clientName}. ` +
      "Seja conservador: gere itens só quando o impacto for óbvio pelo próprio movimento, " +
      "com scores baixos, e deixe claro no porQueImporta que falta contexto do cliente.",
  };
}

/**
 * Busca o contexto do cliente no Brain real (com cache de dia); cai no
 * fallback honesto se a porta não estiver configurada/disponível. Nunca lança.
 */
export async function fetchClientBrain(
  clientName: string,
  opts: FetchBrainOptions = {},
): Promise<BrainContext> {
  // ISOLAMENTO MULTI-TENANT: só a org DONA lê Brain/fixtures. Qualquer outra org
  // recebe "none" — nunca o conhecimento de outra agência, mesmo com cliente de
  // nome idêntico. (A porta serve por nome com segredo compartilhado; o gate é aqui.)
  const org = (await currentOrgId()) ?? "";
  const owner = brainOwnerOrgId();
  if (owner && org !== owner) return noneFor(clientName);

  if (!isBrainDoorConfigured()) return fallbackFor(clientName);

  if (!opts.noCache) {
    const cached = readCache(org, clientName);
    if (cached) return cached;
  }

  try {
    const url = new URL(process.env.RADAR_BRAIN_URL as string);
    url.searchParams.set("workspace", clientName);
    url.searchParams.set("limit", String(NODE_LIMIT));

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.RADAR_BRAIN_SECRET as string}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[brain] porta respondeu ${res.status} p/ ${clientName}: ${text.slice(0, 120)}`);
      return fallbackFor(clientName);
    }

    const payload = (await res.json()) as { data?: { nodes?: BrainNode[] } };
    const nodes = payload.data?.nodes ?? [];
    if (nodes.length === 0) {
      console.warn(`[brain] Brain sem fatos confirmados p/ ${clientName} — fallback.`);
      return fallbackFor(clientName);
    }

    const live: BrainContext = {
      mode: "live",
      context: formatContext(clientName, nodes),
      nodeCount: nodes.length,
    };
    if (!opts.noCache) writeCache(org, clientName, live);
    return live;
  } catch (err) {
    console.warn(`[brain] falha lendo o Brain de ${clientName}: ${(err as Error).message}`);
    return fallbackFor(clientName);
  }
}
