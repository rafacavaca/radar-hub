/**
 * WATCHLIST — "quem vigiar" (F2). O Rafael dirige o Radar por aqui.
 *
 * Antes (F1) o concorrente era fixo no código. Agora a lista de concorrentes
 * por cliente vive em `data/watchlist.json` (banco PRÓPRIO do Radar — nunca o
 * do Formare) e o loop coleta o que estiver nela. Editar a lista = mudar o que
 * o Radar observa, sem mexer em código.
 *
 * Regras deste módulo:
 * - Arquivo ausente/corrompido -> volta ao SEED (Moovefy + RD Station), nunca lança.
 * - Escrita ATÔMICA (tmp + rename) — uma escrita interrompida não corrompe a lista.
 * - Validação com mensagens em pt-BR (elas aparecem na tela do Rafael).
 * - `RADAR_DATA_DIR` sobrepõe o diretório (usado pelo smoke pra testar isolado).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Um concorrente vigiado. `blogUrl` é o que o coletor varre hoje. */
export type Competitor = {
  /** id estável (slug do nome) — usado como `source` dos eventos coletados. */
  id: string;
  name: string;
  /** listagem pública que o coletor varre (blog/notícias). Obrigatória. */
  blogUrl: string;
  /** site institucional (informativo; futuro monitor visual). Opcional. */
  siteUrl?: string;
  /** desligado = fica na lista mas o Radar não varre. */
  enabled: boolean;
};

export type WatchClient = {
  /** nome do cliente do Radar (== workspaces.name no Formare, ex.: "Moovefy"). */
  name: string;
  competitors: Competitor[];
};

export type Watchlist = { clients: WatchClient[] };

/** Um alvo concreto de coleta: cliente + concorrente habilitado. */
export type CollectionTarget = { clientName: string; competitor: Competitor };

/** SEED — o estado do F1, pra nada quebrar quando o arquivo ainda não existe. */
export const WATCHLIST_SEED: Watchlist = {
  clients: [
    {
      name: "Moovefy",
      competitors: [
        {
          id: "rd-station",
          name: "RD Station",
          blogUrl: "https://www.rdstation.com/blog/",
          siteUrl: "https://www.rdstation.com/",
          enabled: true,
        },
      ],
    },
  ],
};

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}

function watchlistPath(): string {
  return join(dataDir(), "watchlist.json");
}

/** slug estável a partir do nome (sem acentos, minúsculo, hífens). */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** URL http(s) válida? (o que aceitamos como endereço público de coleta) */
function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Deep-clone simples (a watchlist é JSON puro). */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A estrutura lida do disco é uma watchlist plausível? */
function isValidWatchlist(value: unknown): value is Watchlist {
  if (!value || typeof value !== "object") return false;
  const clients = (value as Watchlist).clients;
  if (!Array.isArray(clients)) return false;
  return clients.every(
    (c) =>
      c &&
      typeof c.name === "string" &&
      Array.isArray(c.competitors) &&
      c.competitors.every(
        (comp) =>
          comp &&
          typeof comp.id === "string" &&
          typeof comp.name === "string" &&
          typeof comp.blogUrl === "string" &&
          typeof comp.enabled === "boolean",
      ),
  );
}

/**
 * Lê a watchlist. Arquivo ausente ou corrompido -> SEED (e o seed é gravado,
 * pra edições seguintes partirem de um arquivo real). Nunca lança.
 */
export function readWatchlist(): Watchlist {
  const path = watchlistPath();
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (isValidWatchlist(parsed)) return parsed;
      console.warn(`[watchlist] ${path} malformado — voltando ao seed.`);
    } catch (err) {
      console.warn(`[watchlist] falha lendo ${path}: ${(err as Error).message} — seed.`);
    }
  }
  const seed = clone(WATCHLIST_SEED);
  try {
    writeWatchlist(seed);
  } catch {
    // sem permissão de escrita ainda dá pra operar em memória com o seed.
  }
  return seed;
}

/** Grava ATÔMICO: escreve num .tmp e renomeia por cima (rename é atômico no mesmo fs). */
export function writeWatchlist(watchlist: Watchlist): void {
  mkdirSync(dataDir(), { recursive: true });
  const path = watchlistPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(watchlist, null, 2), "utf8");
  renameSync(tmp, path);
}

function findClient(watchlist: Watchlist, clientName: string): WatchClient {
  const client = watchlist.clients.find((c) => c.name === clientName);
  if (!client) throw new Error(`Cliente não encontrado na watchlist: ${clientName}`);
  return client;
}

export type AddCompetitorInput = {
  name: string;
  blogUrl: string;
  siteUrl?: string;
};

/**
 * Adiciona um concorrente ao cliente e persiste. Devolve a lista atualizada.
 * Lança Error com mensagem amigável (pt-BR) quando a entrada é inválida —
 * a API converte em 400 e a tela mostra ao Rafael.
 */
export function addCompetitor(clientName: string, input: AddCompetitorInput): Watchlist {
  const name = (input.name ?? "").trim();
  const blogUrl = (input.blogUrl ?? "").trim();
  const siteUrl = (input.siteUrl ?? "").trim();

  if (!name) throw new Error("Dê um nome ao concorrente.");
  if (!blogUrl) throw new Error("Informe o endereço do blog/notícias do concorrente.");
  if (!isHttpUrl(blogUrl)) {
    throw new Error("O endereço do blog precisa ser uma URL completa (https://…).");
  }
  if (siteUrl && !isHttpUrl(siteUrl)) {
    throw new Error("O endereço do site precisa ser uma URL completa (https://…).");
  }
  const id = slugify(name);
  if (!id) throw new Error("Esse nome não gera um identificador válido — use letras/números.");

  const watchlist = readWatchlist();
  const client = findClient(watchlist, clientName);
  if (client.competitors.some((c) => c.id === id)) {
    throw new Error(`"${name}" já está na lista deste cliente.`);
  }

  client.competitors.push({
    id,
    name,
    blogUrl,
    siteUrl: siteUrl || undefined,
    enabled: true,
  });
  writeWatchlist(watchlist);
  return watchlist;
}

/** Remove um concorrente do cliente e persiste. Devolve a lista atualizada. */
export function removeCompetitor(clientName: string, competitorId: string): Watchlist {
  const watchlist = readWatchlist();
  const client = findClient(watchlist, clientName);
  const before = client.competitors.length;
  client.competitors = client.competitors.filter((c) => c.id !== competitorId);
  if (client.competitors.length === before) {
    throw new Error(`Concorrente não encontrado: ${competitorId}`);
  }
  writeWatchlist(watchlist);
  return watchlist;
}

/** Liga/desliga a vigilância de um concorrente e persiste. Devolve a lista atualizada. */
export function setCompetitorEnabled(
  clientName: string,
  competitorId: string,
  enabled: boolean,
): Watchlist {
  const watchlist = readWatchlist();
  const client = findClient(watchlist, clientName);
  const competitor = client.competitors.find((c) => c.id === competitorId);
  if (!competitor) throw new Error(`Concorrente não encontrado: ${competitorId}`);
  competitor.enabled = enabled;
  writeWatchlist(watchlist);
  return watchlist;
}

/**
 * O PLANO DE COLETA: quais (cliente, concorrente) o loop deve varrer agora.
 * Função pura — só concorrentes `enabled` com `blogUrl` entram.
 */
export function planCollection(watchlist: Watchlist): CollectionTarget[] {
  const targets: CollectionTarget[] = [];
  for (const client of watchlist.clients) {
    for (const competitor of client.competitors) {
      if (!competitor.enabled) continue;
      if (!competitor.blogUrl) continue;
      targets.push({ clientName: client.name, competitor });
    }
  }
  return targets;
}
