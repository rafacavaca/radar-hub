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

import { scrape } from "@/lib/firecrawl";
import type { Competitor } from "@/lib/watchlist";
import type { RawEvent } from "@/lib/types";

const DEFAULT_LIMIT = 5;
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
 * Uma URL parece POST real deste blog? (ver heurística no topo do arquivo)
 */
function isLikelyPostUrl(rawUrl: string, blogHost: string, basePath: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.hostname !== blogHost) return false;

  const segments = segmentsAfterBase(parsed.pathname, basePath);
  if (segments.length === 0) return false;
  if (segments.some((segment) => SECTION_SEGMENTS.has(segment.toLowerCase()))) return false;

  const lastSegment = segments[segments.length - 1];
  return lastSegment.length >= 8 && lastSegment.includes("-");
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
  const urls: string[] = [];
  for (const raw of links) {
    if (!isLikelyPostUrl(raw, blogHost, basePath)) continue;
    const url = normalizeUrl(raw);
    if (seen.has(url)) continue;
    if (isParentOfAnother(new URL(url).pathname)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls.slice(0, limit);
}

/**
 * Coleta os posts recentes do blog de UM concorrente da watchlist.
 * A raspagem da listagem é obrigatória (se falhar, lança — o loop decide se
 * tolera). A raspagem de um post individual que falhe é ignorada (log + segue),
 * para não perder o lote inteiro por causa de uma URL problemática.
 */
export async function collectBlog(
  competitor: Pick<Competitor, "id" | "name" | "blogUrl">,
  opts: CollectBlogOptions = {},
): Promise<RawEvent[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const force = opts.force ?? false;

  const blogHost = new URL(competitor.blogUrl).hostname;
  const basePath = basePathOf(competitor.blogUrl);

  // 1. Listagem (markdown + links renderizados).
  const listing = await scrape(competitor.blogUrl, {
    formats: ["markdown", "links"],
    onlyMainContent: true,
    force,
  });

  // 2-3. Filtra URLs prováveis de post e pega as primeiras N.
  const postUrls = selectPostUrls(listing.links, blogHost, basePath, limit);
  if (postUrls.length === 0) {
    console.warn(
      `[collect:${competitor.id}] nenhuma URL de post reconhecida em ${competitor.blogUrl}`,
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
      kind: "blog",
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
