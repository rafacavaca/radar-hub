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

/** Tipos de fonte pública que registramos por concorrente. */
export type SourceKind = "blog" | "noticias" | "releases" | "produto" | "vagas";

/** Tipos coletados por LISTAGEM de artigos (varre a lista → posts). */
export const LIST_KINDS: ReadonlySet<SourceKind> = new Set(["blog", "noticias", "releases"]);
/** Tipos coletados por MUDANÇA (snapshot + diff): páginas de produto/vagas. */
export const DIFF_KINDS: ReadonlySet<SourceKind> = new Set(["produto", "vagas"]);

/** Todos os tipos que o Radar SABE coletar hoje (por um dos dois métodos). */
export const COLLECTIBLE_KINDS: ReadonlySet<SourceKind> = new Set([
  ...LIST_KINDS,
  ...DIFF_KINDS,
]);

/** Como uma fonte é coletada: por listagem, por mudança, ou não coletável. */
export function collectionMethod(kind: SourceKind): "list" | "diff" | null {
  if (LIST_KINDS.has(kind)) return "list";
  if (DIFF_KINDS.has(kind)) return "diff";
  return null;
}

/** Uma fonte pública vigiável de um concorrente. */
export type WatchSource = {
  /** id estável dentro do concorrente (kind + hash curto da url). */
  id: string;
  kind: SourceKind;
  url: string;
};

/** Um concorrente vigiado — com uma ou mais fontes públicas. */
export type Competitor = {
  /** id estável (slug do nome) — usado como `source` dos eventos coletados. */
  id: string;
  name: string;
  /** site institucional (base da descoberta de fontes). Opcional. */
  siteUrl?: string;
  /** desligado = fica na lista mas o Radar não varre nenhuma fonte dele. */
  enabled: boolean;
  /** páginas públicas registradas (blog, notícias, releases, produto, vagas). */
  sources: WatchSource[];
};

/** Formato ANTIGO (F2 inicial): uma única blogUrl por concorrente. Ainda é
 * aceito na leitura e migrado automaticamente para `sources`. */
type LegacyCompetitor = {
  id: string;
  name: string;
  blogUrl: string;
  siteUrl?: string;
  enabled: boolean;
};

export type WatchClient = {
  /** nome do cliente do Radar (== workspaces.name no Formare, ex.: "Moovefy"). */
  name: string;
  competitors: Competitor[];
};

export type Watchlist = { clients: WatchClient[] };

/** Um alvo concreto de coleta: cliente + concorrente + UMA fonte coletável. */
export type CollectionTarget = {
  clientName: string;
  competitor: Competitor;
  source: WatchSource;
};

/** SEED — o estado do F1, pra nada quebrar quando o arquivo ainda não existe. */
export const WATCHLIST_SEED: Watchlist = {
  clients: [
    {
      name: "Moovefy",
      competitors: [
        {
          id: "rd-station",
          name: "RD Station",
          siteUrl: "https://www.rdstation.com/",
          enabled: true,
          sources: [
            { id: "blog-rd", kind: "blog", url: "https://www.rdstation.com/blog/" },
          ],
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

const SOURCE_KINDS: ReadonlySet<string> = new Set([
  "blog",
  "noticias",
  "releases",
  "produto",
  "vagas",
]);

/** id estável de uma fonte: kind + hash curto da url (não colide entre urls). */
export function sourceId(kind: SourceKind, url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
  return `${kind}-${hash.toString(36)}`;
}

/** O concorrente lido do disco é válido (formato novo OU legado)? */
function isValidStoredCompetitor(comp: unknown): boolean {
  if (!comp || typeof comp !== "object") return false;
  const c = comp as Partial<Competitor & LegacyCompetitor>;
  if (typeof c.id !== "string" || typeof c.name !== "string" || typeof c.enabled !== "boolean") {
    return false;
  }
  if (Array.isArray(c.sources)) {
    return c.sources.every(
      (s) =>
        s &&
        typeof s.id === "string" &&
        typeof s.url === "string" &&
        typeof s.kind === "string" &&
        SOURCE_KINDS.has(s.kind),
    );
  }
  return typeof c.blogUrl === "string"; // formato legado
}

/** A estrutura lida do disco é uma watchlist plausível (novo ou legado)? */
function isValidWatchlist(value: unknown): value is Watchlist {
  if (!value || typeof value !== "object") return false;
  const clients = (value as Watchlist).clients;
  if (!Array.isArray(clients)) return false;
  return clients.every(
    (c) =>
      c &&
      typeof c.name === "string" &&
      Array.isArray(c.competitors) &&
      c.competitors.every(isValidStoredCompetitor),
  );
}

/**
 * MIGRAÇÃO do formato legado: `blogUrl` vira uma fonte `kind='blog'`.
 * Devolve [watchlist, mudou] — se mudou, quem chamou persiste o formato novo.
 */
function migrateShape(watchlist: Watchlist): [Watchlist, boolean] {
  let changed = false;
  for (const client of watchlist.clients) {
    client.competitors = client.competitors.map((comp) => {
      const legacy = comp as unknown as LegacyCompetitor & Partial<Competitor>;
      if (Array.isArray(legacy.sources)) return comp;
      changed = true;
      const url = legacy.blogUrl;
      return {
        id: legacy.id,
        name: legacy.name,
        siteUrl: legacy.siteUrl,
        enabled: legacy.enabled,
        sources: url ? [{ id: sourceId("blog", url), kind: "blog" as const, url }] : [],
      };
    });
  }
  return [watchlist, changed];
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
      if (isValidWatchlist(parsed)) {
        const [migrated, changed] = migrateShape(parsed);
        if (changed) {
          try {
            writeWatchlist(migrated); // persiste já no formato novo
          } catch {
            // sem escrita ainda dá pra operar em memória.
          }
        }
        return migrated;
      }
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

/**
 * Adiciona um CLIENTE novo (F7 — multi-cliente): nasce sem concorrentes; a
 * estrutura (lentes com defaults, Brain via porta, briefing próprio) replica
 * sozinha. O nome deve casar com `workspaces.name` do Formare pra Brain e
 * cards baterem — a tela oferece a lista real pela porta.
 */
export function addClient(clientName: string): Watchlist {
  const name = (clientName ?? "").trim();
  if (!name) throw new Error("Dê o nome do cliente.");
  if (name.length > 120) throw new Error("Nome de cliente longo demais.");

  const watchlist = readWatchlist();
  if (watchlist.clients.some((c) => c.name === name)) {
    throw new Error(`"${name}" já está no Radar.`);
  }
  watchlist.clients.push({ name, competitors: [] });
  writeWatchlist(watchlist);
  return watchlist;
}

/** Remove um CLIENTE do Radar (só a vigilância — NÃO toca o Formare). */
export function removeClient(clientName: string): Watchlist {
  const watchlist = readWatchlist();
  const before = watchlist.clients.length;
  watchlist.clients = watchlist.clients.filter((c) => c.name !== clientName);
  if (watchlist.clients.length === before) {
    throw new Error(`Cliente não encontrado: ${clientName}`);
  }
  if (watchlist.clients.length === 0) {
    throw new Error("O Radar precisa de pelo menos um cliente — adicione outro antes de remover este.");
  }
  writeWatchlist(watchlist);
  return watchlist;
}

export type AddSourceInput = { kind: SourceKind; url: string };

export type AddCompetitorInput = {
  name: string;
  /** LEGADO/manual: uma URL de blog direta (vira fonte kind='blog'). */
  blogUrl?: string;
  siteUrl?: string;
  /** fontes descobertas/confirmadas na tela (o caminho novo). */
  sources?: AddSourceInput[];
};

/**
 * Adiciona um concorrente ao cliente e persiste. Devolve a lista atualizada.
 * Aceita o caminho NOVO (`sources` descobertas) e o manual/legado (`blogUrl`).
 * Lança Error com mensagem amigável (pt-BR) quando a entrada é inválida —
 * a API converte em 400 e a tela mostra ao Rafael.
 */
export function addCompetitor(clientName: string, input: AddCompetitorInput): Watchlist {
  const name = (input.name ?? "").trim();
  const blogUrl = (input.blogUrl ?? "").trim();
  const siteUrl = (input.siteUrl ?? "").trim();
  const rawSources = Array.isArray(input.sources) ? input.sources : [];

  if (!name) throw new Error("Dê um nome ao concorrente.");
  if (siteUrl && !isHttpUrl(siteUrl)) {
    throw new Error("O endereço do site precisa ser uma URL completa (https://…).");
  }

  // Monta as fontes: as confirmadas na descoberta e/ou a URL manual.
  const sources: WatchSource[] = [];
  const seenUrls = new Set<string>();
  const pushSource = (kind: SourceKind, url: string): void => {
    const clean = url.trim();
    if (!clean || seenUrls.has(clean)) return;
    seenUrls.add(clean);
    sources.push({ id: sourceId(kind, clean), kind, url: clean });
  };

  for (const s of rawSources) {
    const kind = String(s?.kind ?? "");
    const url = String(s?.url ?? "").trim();
    if (!SOURCE_KINDS.has(kind)) throw new Error(`Tipo de fonte desconhecido: ${kind}`);
    if (!isHttpUrl(url)) {
      throw new Error("Toda fonte precisa ser uma URL completa (https://…).");
    }
    pushSource(kind as SourceKind, url);
  }
  if (blogUrl) {
    if (!isHttpUrl(blogUrl)) {
      throw new Error("O endereço do blog precisa ser uma URL completa (https://…).");
    }
    pushSource("blog", blogUrl);
  }
  if (sources.length === 0) {
    throw new Error("Escolha ao menos uma fonte pra vigiar (ou informe uma URL manual).");
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
    siteUrl: siteUrl || undefined,
    enabled: true,
    sources,
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
 * O PLANO DE COLETA: quais (cliente, concorrente, FONTE) o loop varre agora.
 * Função pura — só concorrentes `enabled`, e só fontes de tipo COLETÁVEL
 * (blog/notícias/releases; produto e vagas ficam registradas pra fase futura).
 */
export function planCollection(watchlist: Watchlist): CollectionTarget[] {
  const targets: CollectionTarget[] = [];
  for (const client of watchlist.clients) {
    for (const competitor of client.competitors) {
      if (!competitor.enabled) continue;
      for (const source of competitor.sources) {
        if (!COLLECTIBLE_KINDS.has(source.kind)) continue;
        targets.push({ clientName: client.name, competitor, source });
      }
    }
  }
  return targets;
}
