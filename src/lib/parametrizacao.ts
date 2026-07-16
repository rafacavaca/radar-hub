/**
 * PARAMETRIZAÇÃO (por cliente, org-scoped) — a PROVENIÊNCIA da implantação e o
 * STATUS de cada parâmetro da Ficha. É o que a tela /implantacao mostra no
 * topo ("parametrizado na implantação de X · revisado em Y") e o que dá o selo
 * honesto PENDENTE vs DEFINIDO por parâmetro — nunca um default silencioso que
 * depois vira "o Radar está errado".
 *
 * Este store NÃO guarda o valor dos parâmetros (esses vivem nos seus próprios
 * stores: watchlist, lenses, automacoes, alertas…). Guarda só o META: quando
 * foi implantado, quando foi revisado, e quais parâmetros já foram DEFINIDOS
 * pela agência (vs. ainda no padrão de fábrica).
 *
 * Store: org_docs (kind `parametrizacao`, key = cliente) no Supabase, ou JSON
 * (data/parametrizacao.json, mapa por cliente) no clássico — mesmo padrão dos
 * outros stores (RADAR_DATA_DIR isola os testes). Nunca lança na leitura.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { sbGetDoc, sbSetDoc } from "@/lib/db/repo-org-docs";
import { supabaseEnabled } from "@/lib/db/supabase";

/** Os 13 parâmetros da Ficha (ids estáveis; os rótulos humanos ficam na UI). */
export const PARAM_IDS = [
  // QUEM OBSERVAMOS
  "clientes",
  "concorrentes",
  "contas_chave",
  "base_conhecimento",
  // DE ONDE VEM
  "fontes_temas",
  // COMO LEMOS
  "areas_ativas",
  "regras_area",
  "regua_prioridade", // inclui o corte de ruído (P8 não é parâmetro próprio hoje)
  // COMO CHEGA
  "cadencia",
  "destinatarios",
  "alertas",
  // COMO FALAMOS
  "rotulos",
] as const;
export type ParamId = (typeof PARAM_IDS)[number];

const PARAM_SET: ReadonlySet<string> = new Set(PARAM_IDS);

export type ParamStatus = "definido" | "pendente";

export type Parametrizacao = {
  clientName: string;
  /** ISO — quando a implantação registrou a Ficha (null = nunca implantado). */
  implantadoEm: string | null;
  /** ISO — última revisão (a régua que se afina em 30/60/90). */
  revisadoEm: string | null;
  /** status por parâmetro; AUSENTE = pendente (honestidade: nunca default silencioso). */
  status: Partial<Record<ParamId, ParamStatus>>;
  /** as PALAVRAS da agência que geraram cada parâmetro (o "disseram" da Ficha) —
   *  o Mapa de Tradução vivo: a agência abre e vê a própria fala virando regra. */
  disseram: Partial<Record<ParamId, string>>;
};

const DOC_KIND = "parametrizacao";

/**
 * Chave do REGISTRO da agência (org-level). A Implantação é o critério da
 * AGÊNCIA (um registro por org), não por cliente — o status dos 13 parâmetros
 * é "foi revisado na implantação?". Usada como `clientName` nas funções abaixo.
 */
export const REGISTRO_KEY = "__agencia__";

/** Ficha vazia (nada implantado ainda — todos os parâmetros pendentes). */
export function parametrizacaoVazia(clientName: string): Parametrizacao {
  return { clientName, implantadoEm: null, revisadoEm: null, status: {}, disseram: {} };
}

// ── regras puras (o smoke testa direto) ──────────────────────────────────────

/** Status efetivo de um parâmetro: ausente ou inválido = PENDENTE. */
export function statusDe(p: Parametrizacao, id: ParamId): ParamStatus {
  return p.status[id] === "definido" ? "definido" : "pendente";
}

/** Quantos dos 13 já estão definidos (barra de completude da tela). */
export function completude(p: Parametrizacao): { definidos: number; total: number } {
  const definidos = PARAM_IDS.filter((id) => statusDe(p, id) === "definido").length;
  return { definidos, total: PARAM_IDS.length };
}

/** Sanitiza um objeto cru (do disco/DB) numa Parametrizacao válida. Nunca lança. */
export function sanitizar(clientName: string, raw: unknown): Parametrizacao {
  const base = parametrizacaoVazia(clientName);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<Parametrizacao>;
  const status: Partial<Record<ParamId, ParamStatus>> = {};
  if (r.status && typeof r.status === "object") {
    for (const [k, v] of Object.entries(r.status)) {
      if (PARAM_SET.has(k) && (v === "definido" || v === "pendente")) status[k as ParamId] = v;
    }
  }
  const disseram: Partial<Record<ParamId, string>> = {};
  if (r.disseram && typeof r.disseram === "object") {
    for (const [k, v] of Object.entries(r.disseram)) {
      if (PARAM_SET.has(k) && typeof v === "string" && v.trim()) disseram[k as ParamId] = v.trim().slice(0, 500);
    }
  }
  return {
    clientName,
    implantadoEm: typeof r.implantadoEm === "string" ? r.implantadoEm : null,
    revisadoEm: typeof r.revisadoEm === "string" ? r.revisadoEm : null,
    status,
    disseram,
  };
}

/**
 * REGISTRA a implantação: marca `implantadoEm` (só na primeira vez) e os
 * parâmetros informados como DEFINIDOS; guarda o "disseram" (as palavras da
 * agência) dos que vierem; toca a revisão. Puro (devolve cópia).
 */
export function comImplantado(
  p: Parametrizacao,
  ids: ParamId[],
  nowIso: string,
  disseram?: Partial<Record<ParamId, string>>,
): Parametrizacao {
  const status = { ...p.status };
  for (const id of ids) if (PARAM_SET.has(id)) status[id] = "definido";
  const disseramNovo = { ...p.disseram };
  if (disseram) {
    for (const [k, v] of Object.entries(disseram)) {
      if (PARAM_SET.has(k) && typeof v === "string" && v.trim()) disseramNovo[k as ParamId] = v.trim().slice(0, 500);
    }
  }
  return {
    ...p,
    implantadoEm: p.implantadoEm ?? nowIso,
    revisadoEm: nowIso,
    status,
    disseram: disseramNovo,
  };
}

/** Define/limpa um parâmetro e toca a revisão. Puro (devolve cópia). */
export function comParametro(p: Parametrizacao, id: ParamId, status: ParamStatus, nowIso: string): Parametrizacao {
  return { ...p, status: { ...p.status, [id]: status }, revisadoEm: nowIso };
}

/** Só toca a revisão (uma edição num editor embutido conta como afinação). Puro. */
export function comRevisao(p: Parametrizacao, nowIso: string): Parametrizacao {
  return { ...p, revisadoEm: nowIso };
}

// ── JSON fallback (clássico/testes): mapa { [cliente]: Parametrizacao } ───────

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function filePath(): string {
  return join(dataDir(), "parametrizacao.json");
}
function readJsonAll(): Record<string, Parametrizacao> {
  const p = filePath();
  if (!existsSync(p)) return {};
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    const out: Record<string, Parametrizacao> = {};
    for (const [name, v] of Object.entries(parsed)) out[name] = sanitizar(name, v);
    return out;
  } catch {
    return {};
  }
}
function writeJsonAll(all: Record<string, Parametrizacao>): void {
  mkdirSync(dataDir(), { recursive: true });
  const p = filePath();
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(all, null, 2), "utf8");
  renameSync(tmp, p);
}

// ── API org-scoped ───────────────────────────────────────────────────────────

/** A Ficha de um cliente (ou vazia se nunca implantado). Nunca lança. */
export async function loadParametrizacao(clientName: string): Promise<Parametrizacao> {
  if (!supabaseEnabled()) return readJsonAll()[clientName] ?? parametrizacaoVazia(clientName);
  const raw = await sbGetDoc<unknown>(DOC_KIND, clientName, null);
  return sanitizar(clientName, raw);
}

/** Grava a Ficha (sanitizada) e devolve o que ficou. */
export async function saveParametrizacao(p: Parametrizacao): Promise<Parametrizacao> {
  const sane = sanitizar(p.clientName, p);
  if (!supabaseEnabled()) {
    const all = readJsonAll();
    all[sane.clientName] = sane;
    writeJsonAll(all);
  } else {
    await sbSetDoc(DOC_KIND, sane.clientName, sane);
  }
  return sane;
}

/** Registra a implantação de um cliente (parâmetros informados = definidos + disseram). */
export async function registrarImplantacao(
  clientName: string,
  ids: ParamId[],
  now: Date,
  disseram?: Partial<Record<ParamId, string>>,
): Promise<Parametrizacao> {
  const atual = await loadParametrizacao(clientName);
  return saveParametrizacao(comImplantado(atual, ids, now.toISOString(), disseram));
}

/**
 * Define o status de um parâmetro (definido/pendente) e toca a revisão. Ao
 * marcar o PRIMEIRO como definido, carimba a data da implantação (a implantação
 * "aconteceu" quando se começou a revisar).
 */
export async function definirParametro(clientName: string, id: ParamId, status: ParamStatus, now: Date): Promise<Parametrizacao> {
  const atual = await loadParametrizacao(clientName);
  const nowIso = now.toISOString();
  let prox = comParametro(atual, id, status, nowIso);
  if (status === "definido" && !prox.implantadoEm) prox = { ...prox, implantadoEm: nowIso };
  return saveParametrizacao(prox);
}

/** Toca a revisão de um cliente (chamado quando um editor embutido salva). */
export async function tocarRevisao(clientName: string, now: Date): Promise<Parametrizacao> {
  const atual = await loadParametrizacao(clientName);
  return saveParametrizacao(comRevisao(atual, now.toISOString()));
}
