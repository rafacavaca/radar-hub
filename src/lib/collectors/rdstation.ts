/**
 * Coletor RD Station — pega os "movimentos" recentes (posts do blog) do
 * concorrente do F1 e devolve `RawEvent[]` tipado, pronto pro analista.
 *
 * Abordagem (validada — não re-explorar, pra poupar créditos Firecrawl):
 *   1. Raspa a listagem https://www.rdstation.com/blog/ (markdown + links).
 *   2. Dos `links` renderizados, fica só com as URLs REAIS de post: pelo menos
 *      dois segmentos depois de /blog/, último segmento com >= 8 chars, e sem
 *      /autor/ nem /categorias/. (O sitemap.xml do site tem URLs erradas que
 *      dão 404 — por isso usamos os links renderizados, não o sitemap.)
 *   3. Pega os primeiros N (padrão 5).
 *   4. Raspa cada post (markdown) para título, descrição e excerpt.
 *   5. Monta RawEvent[] com id estável (sha1 da url).
 */

import { createHash } from "node:crypto";

import { scrape } from "@/lib/firecrawl";
import type { RawEvent } from "@/lib/types";

const BLOG_URL = "https://www.rdstation.com/blog/";
const BLOG_PATH_PREFIX = "/blog/";
const DEFAULT_LIMIT = 5;
const EXCERPT_MAX_CHARS = 600;

export type CollectRDStationOptions = {
  /** quantos posts coletar. Padrão: 5. */
  limit?: number;
  /** ignora o cache do Firecrawl e força chamadas frescas. Padrão: false. */
  force?: boolean;
};

/** id estável a partir da url (sha1 hex, primeiros 16 chars) — deduplica entre coletas. */
function stableId(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

/** Segmentos não-vazios do caminho depois de /blog/ (ex.: ["marketing", "algum-post"]). */
function blogSegments(pathname: string): string[] {
  if (!pathname.startsWith(BLOG_PATH_PREFIX)) return [];
  return pathname
    .slice(BLOG_PATH_PREFIX.length)
    .split("/")
    .filter((segment) => segment.length > 0);
}

/**
 * Uma URL é de POST real quando: é do host do RD Station, começa em /blog/,
 * tem >= 2 segmentos depois de /blog/ (categoria + slug), o último segmento
 * tem >= 8 chars, e o caminho não é de autor nem de categoria.
 */
function isRealPostUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.hostname !== "www.rdstation.com") return false;
  const pathname = parsed.pathname;
  if (!pathname.startsWith(BLOG_PATH_PREFIX)) return false;
  if (pathname.includes("/autor/") || pathname.includes("/categorias/")) return false;
  const segments = blogSegments(pathname);
  if (segments.length < 2) return false;
  const lastSegment = segments[segments.length - 1];
  return lastSegment.length >= 8;
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

/** Categoria = primeiro segmento depois de /blog/ (ex.: "marketing", "vendas"). */
function categoryFromUrl(url: string): string | undefined {
  try {
    const segments = blogSegments(new URL(url).pathname);
    return segments[0];
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

/** Extrai as URLs de post reais, únicas e normalizadas, dos links da listagem. */
function selectPostUrls(links: string[], limit: number): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const raw of links) {
    if (!isRealPostUrl(raw)) continue;
    const url = normalizeUrl(raw);
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls.slice(0, limit);
}

/**
 * Coleta os posts recentes do blog do RD Station como RawEvent[].
 * A raspagem da listagem é obrigatória (se falhar, lança). A raspagem de um
 * post individual que falhe é apenas ignorada (log + segue), para não perder
 * o lote inteiro por causa de uma URL problemática.
 */
export async function collectRDStation(
  opts: CollectRDStationOptions = {},
): Promise<RawEvent[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const force = opts.force ?? false;

  // 1. Listagem do blog (markdown + links renderizados).
  const listing = await scrape(BLOG_URL, {
    formats: ["markdown", "links"],
    onlyMainContent: true,
    force,
  });

  // 2-3. Filtra URLs reais de post e pega as primeiras N.
  const postUrls = selectPostUrls(listing.links, limit);

  // 4-5. Raspa cada post e monta o RawEvent.
  const collectedAt = new Date().toISOString();
  const events: RawEvent[] = [];

  for (const url of postUrls) {
    let post;
    try {
      post = await scrape(url, { formats: ["markdown"], onlyMainContent: true, force });
    } catch (err) {
      console.warn(`[rdstation] pulando ${url}: ${(err as Error).message}`);
      continue;
    }

    const title = (post.title ?? "").trim() || url;
    const description = post.description?.trim() || undefined;
    const excerpt = buildExcerpt(post.markdown);

    events.push({
      id: stableId(url),
      source: "rdstation",
      kind: "blog",
      url,
      title,
      description,
      category: categoryFromUrl(url),
      publishedAt: null, // não disponível de forma confiável na listagem/post
      collectedAt,
      excerpt: excerpt || undefined,
    });
  }

  return events;
}
