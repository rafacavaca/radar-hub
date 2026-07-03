/**
 * Coletor GENÉRICO de blog (F2) — varre a listagem pública de QUALQUER
 * concorrente da watchlist e devolve `RawEvent[]` tipado, pronto pro analista.
 *
 * Generalização do coletor do RD Station (F1), validada lá — a abordagem é a
 * mesma (não re-explorar, pra poupar créditos Firecrawl):
 *   1. Raspa a LISTAGEM (`blogUrl`) com markdown + links renderizados.
 *      (Sitemaps/RSS costumam estar quebrados ou desatualizados — links
 *      renderizados são o que o leitor humano vê.)
 *   2. Dos links, fica só com o que PARECE post de verdade (heurística abaixo).
 *   3. Pega os primeiros N (padrão 5) e raspa cada um (markdown).
 *   4. Monta RawEvent[] com id estável (sha1 da url) e o NOME do concorrente.
 *
 * Heurística de "post de verdade" (funciona pra estruturas comuns de blog):
 *   - mesmo host da listagem e caminho DENTRO do caminho da listagem;
 *   - nenhum segmento de seção (autor, categorias, tags, page, busca…);
 *   - último segmento parece SLUG de post: >= 8 chars E contém hífen
 *     (títulos viram slugs hifenizados; seções são palavras únicas);
 *   - e a URL não é "PAI" de outra URL da listagem (se /blog/x/ tem filhos
 *     /blog/x/algum-post, então /blog/x/ é seção — mesmo com nome hifenizado).
 *   Falso negativo possível (post de uma palavra só) é aceito — melhor perder
 *   um post raro do que raspar páginas de seção e poluir o feed.
 */

import { createHash } from "node:crypto";

import { collectFromFeed, resolveFeedUrl } from "@/lib/collectors/rss";
import { scrape } from "@/lib/firecrawl";
import type { Competitor, SourceKind, WatchSource } from "@/lib/watchlist";
import type { RawEvent, SignalKind } from "@/lib/types";

const DEFAULT_LIMIT = 5;

/** Tipo de fonte da watchlist -> tipo de sinal do evento. */
const SIGNAL_KIND_BY_SOURCE: Record<SourceKind, SignalKind> = {
  blog: "blog",
  noticias: "news",
  releases: "release",
  produto: "page",
  vagas: "page",
};
const EXCERPT_MAX_CHARS = 600;

/** Segmentos de caminho que denunciam página de SEÇÃO (não post). */
const SECTION_SEGMENTS = new Set([
  "autor",
  "autores",
  "author",
  "authors",
  "categoria",
  "categorias",
  "category",
  "categories",
  "tag",
  "tags",
  "page",
  "pagina",
  "paginas",
  "busca",
  "search",
  "feed",
  "rss",
  "sitemap",
  "sobre",
  "contato",
]);

export type CollectBlogOptions = {
  /** quantos posts coletar. Padrão: 5. */
  limit?: number;
  /** ignora o cache do Firecrawl e força chamadas frescas. Padrão: false. */
  force?: boolean;
};

/** id estável a partir da url (sha1 hex, primeiros 16 chars) — deduplica entre coletas. */
function stableId(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

/** Caminho-base da listagem, normalizado com barra final (ex.: "/blog/"). */
function basePathOf(blogUrl: string): string {
  const pathname = new URL(blogUrl).pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

/** Segmentos não-vazios do caminho DEPOIS do caminho-base da listagem. */
function segmentsAfterBase(pathname: string, basePath: string): string[] {
  if (!pathname.startsWith(basePath)) return [];
  return pathname
    .slice(basePath.length)
    .split("/")
    .filter((segment) => segment.length > 0);
}

/**
 * Uma URL parece POST/artigo real? Robusta a estruturas fora do padrão:
 * - mesmo host, nenhum segmento de SEÇÃO (autor, tag, categoria…);
 * - o ÚLTIMO segmento é um SLUG (>= 8 chars e com hífen — títulos viram slugs);
 * - e a URL está SOB a listagem (ex.: /blog/cat/slug) OU tem um "container"
 *   (>= 2 segmentos, ex.: /noticia/38/slug — o padrão do Agrosys), pra pegar
 *   artigos que ficam fora do caminho /blog.
 * Exportada: a DESCOBERTA de fontes usa isso pra contar artigos num candidato.
 */
export function isLikelyPostUrl(rawUrl: string, blogHost: string, basePath: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.hostname !== blogHost) return false;

  const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return false;
  if (segments.some((segment) => SECTION_SEGMENTS.has(segment.toLowerCase()))) return false;

  const lastSegment = segments[segments.length - 1];
  const isSlug = lastSegment.length >= 8 && lastSegment.includes("-");
  if (!isSlug) return false;

  const underBase = parsed.pathname.startsWith(basePath);
  return underBase || segments.length >= 2;
}

/** Forma canónica pra dedupe/id: sem query, sem hash, sem barra final. */
function normalizeUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  parsed.search = "";
  parsed.hash = "";
  let normalized = parsed.toString();
  if (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  return normalized;
}

/** Categoria = primeiro segmento depois da base, quando há categoria + slug. */
function categoryFromUrl(url: string, basePath: string): string | undefined {
  try {
    const segments = segmentsAfterBase(new URL(url).pathname, basePath);
    return segments.length >= 2 ? segments[0] : undefined;
  } catch {
    return undefined;
  }
}

/** Linha "trivial" de topo (imagem, link solto, separador, vazia) — descartável no excerpt. */
function isTrivialLeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return true;
  if (/^!\[/.test(trimmed)) return true; // imagem markdown
  if (/^\[[^\]]*\]\([^)]*\)$/.test(trimmed)) return true; // linha que é só um link
  if (/^[-*_]{3,}$/.test(trimmed)) return true; // separador
  if (trimmed.length < 3) return true; // rótulo/nav muito curto
  return false;
}

/** Primeiros ~600 chars do markdown, pulando linhas promocionais triviais do topo. */
function buildExcerpt(markdown: string): string {
  const lines = markdown.split("\n");
  let start = 0;
  while (start < lines.length && isTrivialLeadingLine(lines[start])) start++;
  const body = lines.slice(start).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return body.slice(0, EXCERPT_MAX_CHARS).trim();
}

/** Extrai as URLs de post prováveis, únicas e normalizadas, dos links da listagem. */
function selectPostUrls(
  links: string[],
  blogHost: string,
  basePath: string,
  limit: number,
): string[] {
  // Todos os caminhos same-host da listagem (normalizados) — base do teste "é pai?".
  const allPaths = new Set<string>();
  for (const raw of links) {
    try {
      const parsed = new URL(raw);
      if (parsed.hostname === blogHost) allPaths.add(new URL(normalizeUrl(raw)).pathname);
    } catch {
      // link inválido na listagem — ignora.
    }
  }
  /** URL "pai" de outra da listagem = página de seção, não post. */
  const isParentOfAnother = (path: string): boolean => {
    const prefix = `${path}/`;
    for (const other of allPaths) {
      if (other !== path && other.startsWith(prefix)) return true;
    }
    return false;
  };

  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const raw of links) {
    if (!isLikelyPostUrl(raw, blogHost, basePath)) continue;
    const url = normalizeUrl(raw);
    if (seen.has(url)) continue;
    if (isParentOfAnother(new URL(url).pathname)) continue;
    seen.add(url);
    candidates.push(url);
  }

  return dominantContentCluster(candidates).slice(0, limit);
}

/**
 * CLUSTER DOMINANTE: numa listagem, os artigos são o maior grupo de um mesmo
 * "container" (1º segmento do caminho). Isso separa /noticia/38/slug (artigos)
 * de /segmento/12/x e /solucao/1/y (nav). Preferimos containers de CONTEÚDO
 * (noticia, artigo, blog, post, news…) quando existirem; senão, o maior grupo.
 * Função pura — testável sem rede.
 */
export function dominantContentCluster(candidates: string[]): string[] {
  const container = (url: string): string => {
    try {
      return new URL(url).pathname.split("/").filter(Boolean)[0] ?? "";
    } catch {
      return "";
    }
  };
  const groups = new Map<string, string[]>();
  for (const url of candidates) {
    const key = container(url);
    const bucket = groups.get(key);
    if (bucket) bucket.push(url);
    else groups.set(key, [url]);
  }
  if (groups.size <= 1) return candidates;

  const CONTENT_RE = /^(noticias?|artigos?|posts?|blog|news|conteudos?|materiais|releases?|imprensa|novidades|cases?)$/i;
  const entries = [...groups.entries()];
  const contentGroups = entries.filter(([k]) => CONTENT_RE.test(k));
  const pool = contentGroups.length > 0 ? contentGroups : entries;
  pool.sort((a, b) => b[1].length - a[1].length);
  return pool[0][1];
}

/** Padrões comuns de 2ª página de listagem (os 2 mais frequentes). */
function page2Urls(listingUrl: string): string[] {
  const clean = listingUrl.replace(/\/$/, "");
  return [`${clean}/page/2/`, `${clean}?page=2`];
}

/**
 * Coleta além da 1ª página: tenta a 2ª página da listagem e devolve URLs de
 * post novas. Best-effort — qualquer falha vira lista vazia (não atrapalha).
 */
async function paginate(
  listingUrl: string,
  blogHost: string,
  basePath: string,
  need: number,
  force: boolean,
): Promise<string[]> {
  for (const url of page2Urls(listingUrl)) {
    try {
      const page = await scrape(url, { formats: ["links"], onlyMainContent: true, force });
      const urls = selectPostUrls(page.links, blogHost, basePath, need);
      if (urls.length > 0) return urls;
    } catch {
      // página 2 não existe nesse padrão — tenta o próximo
    }
  }
  return [];
}

/**
 * Coleta os itens recentes de UMA FONTE (listagem pública) de um concorrente.
 * A raspagem da listagem é obrigatória (se falhar, lança — o loop decide se
 * tolera). A raspagem de um post individual que falhe é ignorada (log + segue),
 * para não perder o lote inteiro por causa de uma URL problemática.
 */
export async function collectBlog(
  competitor: Pick<Competitor, "id" | "name">,
  source: Pick<WatchSource, "kind" | "url">,
  opts: CollectBlogOptions = {},
): Promise<RawEvent[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const force = opts.force ?? false;

  const blogHost = new URL(source.url).hostname;
  const basePath = basePathOf(source.url);

  // 1. Listagem (markdown + links renderizados).
  const listing = await scrape(source.url, {
    formats: ["markdown", "links"],
    onlyMainContent: true,
    force,
  });

  // 1b. FEED primeiro (padrão-ouro): se a listagem tem RSS/Atom, coletamos dele
  //     — 1 fetch traz N itens já estruturados (título/data/resumo), sem raspar
  //     post a post (0 crédito Firecrawl). Só cai no HTML se não houver feed.
  try {
    const feedUrl = await resolveFeedUrl(source.url, listing.links, { force });
    if (feedUrl) {
      const feedEvents = await collectFromFeed(
        competitor,
        feedUrl,
        SIGNAL_KIND_BY_SOURCE[source.kind],
        limit,
      );
      if (feedEvents.length > 0) {
        console.log(`[collect:${competitor.id}] via feed ${feedUrl} — ${feedEvents.length} itens`);
        return feedEvents;
      }
    }
  } catch (err) {
    console.warn(`[collect:${competitor.id}] resolução de feed falhou: ${(err as Error).message}`);
  }

  // 2-3. Sem feed: filtra URLs prováveis de post. Só pagina se a 1ª página deu
  //      uma listagem REAL (>=2 posts) mas curta — evita sondar páginas-2 que
  //      não existem em sites fora do padrão (não queima créditos à toa).
  let postUrls = selectPostUrls(listing.links, blogHost, basePath, limit);
  if (postUrls.length >= 2 && postUrls.length < limit) {
    const extra = await paginate(source.url, blogHost, basePath, limit - postUrls.length, force);
    postUrls = [...new Set([...postUrls, ...extra])].slice(0, limit);
  }
  if (postUrls.length === 0) {
    console.warn(
      `[collect:${competitor.id}] nenhuma URL de post reconhecida em ${source.url}`,
    );
  }

  // 4. Raspa cada post e monta o RawEvent.
  const collectedAt = new Date().toISOString();
  const events: RawEvent[] = [];

  for (const url of postUrls) {
    let post;
    try {
      post = await scrape(url, { formats: ["markdown"], onlyMainContent: true, force });
    } catch (err) {
      console.warn(`[collect:${competitor.id}] pulando ${url}: ${(err as Error).message}`);
      continue;
    }

    const title = (post.title ?? "").trim() || url;
    const description = post.description?.trim() || undefined;
    const excerpt = buildExcerpt(post.markdown);

    events.push({
      id: stableId(url),
      source: competitor.id,
      competitorName: competitor.name,
      kind: SIGNAL_KIND_BY_SOURCE[source.kind],
      url,
      title,
      description,
      category: categoryFromUrl(url, basePath),
      publishedAt: null, // não disponível de forma confiável na listagem/post
      collectedAt,
      excerpt: excerpt || undefined,
    });
  }

  return events;
}
