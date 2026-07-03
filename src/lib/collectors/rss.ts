/**
 * COLETA VIA RSS/ATOM (F14) — o padrão-ouro pra vigiar blog: estruturado,
 * confiável e barato (feed é XML estático, fetch simples, 0 crédito Firecrawl).
 *
 * Duas peças:
 *   1. resolver o FEED de uma listagem (dos links da página + caminhos comuns);
 *   2. parsear o feed (RSS 2.0 e Atom, por regex — sem dependência) em RawEvent[].
 *
 * Resolução de feed é CACHEADA (data/feeds.json, re-checa ~semanal) pra não
 * re-sondar caminhos todo dia. Parser é defensivo: XML estranho -> [] (nunca
 * derruba a coleta; o chamador cai no HTML).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { RawEvent, SignalKind } from "@/lib/types";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const FETCH_TIMEOUT_MS = 12000;
const FEED_RECHECK_DAYS = 7;

// ─────────────────────────────────────────────────────────────────────────────
// Parser RSS 2.0 / Atom (regex — sem dependência)
// ─────────────────────────────────────────────────────────────────────────────

export type FeedItem = { title: string; link: string; description?: string; publishedAt?: string };

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function tagText(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return unescapeXml(stripTags(stripCdata(m[1]))).trim();
}
function linkOf(block: string): string {
  // Atom: <link href="..."/> (prefere rel="alternate" ou sem rel).
  const atoms = [...block.matchAll(/<link\b[^>]*href="([^"]+)"[^>]*\/?>/gi)];
  if (atoms.length > 0) {
    const alt = atoms.find((m) => /rel="alternate"/i.test(m[0])) ?? atoms.find((m) => !/rel="/i.test(m[0])) ?? atoms[0];
    return alt[1].trim();
  }
  // RSS: <link>...</link>
  const rss = block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
  if (rss) return unescapeXml(stripCdata(rss[1])).trim();
  // fallback: <guid isPermaLink="true">url</guid>
  const guid = block.match(/<guid\b[^>]*>([\s\S]*?)<\/guid>/i);
  if (guid && /^https?:\/\//i.test(guid[1].trim())) return guid[1].trim();
  return "";
}

/** Parseia um XML de feed (RSS/Atom) em itens. Nunca lança. */
export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  try {
    const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
    for (const block of blocks) {
      const title = tagText(block, "title");
      const link = linkOf(block);
      if (!title || !link) continue;
      const description =
        tagText(block, "description") || tagText(block, "summary") || tagText(block, "content") || undefined;
      const publishedAt =
        tagText(block, "pubDate") || tagText(block, "published") || tagText(block, "updated") || undefined;
      items.push({ title, link, description: description?.slice(0, 600), publishedAt });
    }
  } catch {
    return [];
  }
  return items;
}

/** O texto parece um feed (RSS/Atom)? */
function looksLikeFeed(text: string): boolean {
  return /<rss\b|<feed\b|<rdf:RDF\b/i.test(text.slice(0, 2000)) || /<item\b|<entry\b/i.test(text.slice(0, 4000));
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, 2_000_000);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolução de feed (com cache) — dos links da listagem + caminhos comuns
// ─────────────────────────────────────────────────────────────────────────────

type FeedCache = { feeds: Record<string, { feedUrl: string | null; checkedAt: string }> };

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function feedCachePath(): string {
  return join(dataDir(), "feeds.json");
}
function readFeedCache(): FeedCache {
  const path = feedCachePath();
  if (!existsSync(path)) return { feeds: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as FeedCache;
    return parsed && parsed.feeds ? parsed : { feeds: {} };
  } catch {
    return { feeds: {} };
  }
}
function writeFeedCache(cache: FeedCache): void {
  mkdirSync(dataDir(), { recursive: true });
  const path = feedCachePath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache, null, 2), "utf8");
  renameSync(tmp, path);
}

/** Candidatos de feed a partir dos links da listagem (mesmo host). */
function feedLinksFrom(links: string[], host: string): string[] {
  const out: string[] = [];
  for (const raw of links) {
    try {
      const u = new URL(raw);
      if (u.hostname !== host) continue;
      if (/(\/feed\/?$|\/rss\/?$|\.rss$|\.xml$|\/atom\/?$|feed=rss|type=rss)/i.test(u.pathname + u.search)) {
        out.push(u.toString());
      }
    } catch {
      // ignora
    }
  }
  return out;
}

/** Caminhos comuns de feed a partir da URL da listagem. */
function commonFeedPaths(listingUrl: string): string[] {
  const u = new URL(listingUrl);
  const base = `${u.protocol}//${u.host}`;
  const path = u.pathname.replace(/\/$/, "");
  return [
    `${listingUrl.replace(/\/$/, "")}/feed`,
    `${listingUrl.replace(/\/$/, "")}/rss`,
    `${base}/feed`,
    `${base}/rss`,
    `${base}/feed.xml`,
    `${base}/rss.xml`,
    `${base}/index.xml`,
    `${base}/atom.xml`,
    `${base}${path}/feed/`,
  ];
}

/**
 * Resolve o feed de uma listagem (dos `links` dela + caminhos comuns), com
 * CACHE (re-checa a cada ~7 dias). Devolve a URL do feed ou null.
 */
export async function resolveFeedUrl(
  listingUrl: string,
  links: string[],
  opts: { force?: boolean } = {},
): Promise<string | null> {
  const cache = readFeedCache();
  const cached = cache.feeds[listingUrl];
  if (!opts.force && cached) {
    const ageDays = (Date.now() - Date.parse(cached.checkedAt)) / 86400000;
    if (Number.isFinite(ageDays) && ageDays < FEED_RECHECK_DAYS) return cached.feedUrl;
  }

  const host = new URL(listingUrl).hostname;
  const seen = new Set<string>();
  const candidates = [...feedLinksFrom(links, host), ...commonFeedPaths(listingUrl)].filter((u) => {
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  let resolved: string | null = null;
  for (const candidate of candidates) {
    const text = await fetchText(candidate);
    if (text && looksLikeFeed(text) && parseFeed(text).length > 0) {
      resolved = candidate;
      break;
    }
  }

  cache.feeds[listingUrl] = { feedUrl: resolved, checkedAt: new Date().toISOString() };
  try {
    writeFeedCache(cache);
  } catch {
    // cache é conveniência
  }
  return resolved;
}

/** id estável a partir da url (sha1 hex, 16). */
function stableId(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

function isoDate(value?: string): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * Coleta itens de um FEED como RawEvent[]. Fetch simples (0 crédito Firecrawl).
 * Nunca lança: feed fora do ar/estranho -> [] (o chamador cai no HTML).
 */
export async function collectFromFeed(
  competitor: { id: string; name: string },
  feedUrl: string,
  kind: SignalKind,
  limit: number,
): Promise<RawEvent[]> {
  const xml = await fetchText(feedUrl);
  if (!xml) return [];
  const items = parseFeed(xml).slice(0, limit);
  const collectedAt = new Date().toISOString();
  return items.map((it) => ({
    id: stableId(it.link),
    source: competitor.id,
    competitorName: competitor.name,
    kind,
    url: it.link,
    title: it.title,
    description: it.description,
    publishedAt: isoDate(it.publishedAt),
    collectedAt,
    excerpt: it.description,
  }));
}
