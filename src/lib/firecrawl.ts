/**
 * Cliente Firecrawl (API v2) — pequeno, tipado e com CACHE EM DISCO.
 *
 * Por que o cache importa: o Firecrawl é plano gratuito com créditos LIMITADOS.
 * Cada `scrape` gasta crédito. Para não queimar créditos em reexecuções (ao
 * corrigir build, rodar de novo, etc.), guardamos a resposta de cada URL em
 * `.cache/firecrawl/<sha1(url)>.json`. Se já existe um cache DE HOJE, reusamos
 * em vez de bater na API. Use `force: true` para ignorar o cache de propósito.
 *
 * Só há UMA operação: `scrape(url, opts?)`.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";
const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search";
const CACHE_DIR = join(process.cwd(), ".cache", "firecrawl");

/** O que devolvemos ao chamador — forma estável, independente da API. */
export type ScrapeResult = {
  markdown: string;
  links: string[];
  title?: string;
  description?: string;
  statusCode?: number;
  /** URL do print (quando formats inclui "screenshot"). */
  screenshot?: string;
};

export type ScrapeOptions = {
  /** formatos pedidos ao Firecrawl. Padrão: ["markdown"]. */
  formats?: string[];
  /** só o conteúdo principal (sem nav/rodapé). Padrão: true. */
  onlyMainContent?: boolean;
  /** ignora o cache em disco e força uma chamada fresca à API. */
  force?: boolean;
  /** espera (ms) o JavaScript renderizar antes de capturar — o "gatilho
   * conteúdo vazio" usa isto pra sites-casca (SPA). Só quando precisa. */
  waitFor?: number;
};

/** Envelope gravado no cache — guarda quando foi cacheado, para expirar por dia. */
type CacheEnvelope = {
  cachedAt: string;
  url: string;
  result: ScrapeResult;
};

/** Forma bruta da resposta do Firecrawl v2 (só o que usamos). */
type FirecrawlResponse = {
  success: boolean;
  data?: {
    markdown?: string;
    links?: string[];
    screenshot?: string;
    metadata?: {
      title?: string;
      description?: string;
      statusCode?: number;
    };
  };
  error?: string;
};

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

/** Carimbo do dia (YYYY-MM-DD) — para saber se o cache é "de hoje". */
function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function cachePathFor(url: string): string {
  return join(CACHE_DIR, `${sha1(url)}.json`);
}

/** Lê o cache; devolve null se não existe, é ilegível ou não é de hoje. */
function readCache(url: string): ScrapeResult | null {
  const path = cachePathFor(url);
  if (!existsSync(path)) return null;
  try {
    const envelope = JSON.parse(readFileSync(path, "utf8")) as CacheEnvelope;
    if (!envelope || typeof envelope.cachedAt !== "string") return null;
    if (envelope.cachedAt.slice(0, 10) !== todayStamp()) return null;
    return envelope.result;
  } catch {
    return null;
  }
}

function writeCache(url: string, result: ScrapeResult): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  const envelope: CacheEnvelope = {
    cachedAt: new Date().toISOString(),
    url,
    result,
  };
  writeFileSync(cachePathFor(url), JSON.stringify(envelope, null, 2), "utf8");
}

/**
 * Raspa uma URL. Reusa cache de hoje quando houver (a menos que `force`).
 * Lança Error claro se a chave faltar, a rede falhar ou a API recusar
 * (ex.: HTTP 402 = "Insufficient credits").
 */
export async function scrape(url: string, opts: ScrapeOptions = {}): Promise<ScrapeResult> {
  const { formats = ["markdown"], onlyMainContent = true, force = false, waitFor } = opts;

  // waitFor (render JS) sempre busca fresco: o cache do dia pode ser justamente
  // a captura vazia que motivou o retry.
  if (!force && !waitFor) {
    const cached = readCache(url);
    if (cached) return cached;
  }

  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "FIRECRAWL_API_KEY ausente. Defina-a em .env.local (o runner a carrega via dotenv).",
    );
  }

  let response: Response;
  try {
    response = await fetch(FIRECRAWL_SCRAPE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats, onlyMainContent, ...(waitFor ? { waitFor } : {}) }),
    });
  } catch (err) {
    throw new Error(`Firecrawl: falha de rede ao raspar ${url}: ${(err as Error).message}`);
  }

  let payload: FirecrawlResponse;
  try {
    payload = (await response.json()) as FirecrawlResponse;
  } catch {
    throw new Error(`Firecrawl: resposta não-JSON (HTTP ${response.status}) ao raspar ${url}`);
  }

  if (!response.ok || !payload.success || !payload.data) {
    const detail = payload?.error ?? `HTTP ${response.status}`;
    throw new Error(`Firecrawl: falha ao raspar ${url} — ${detail}`);
  }

  const result: ScrapeResult = {
    markdown: payload.data.markdown ?? "",
    links: payload.data.links ?? [],
    title: payload.data.metadata?.title,
    description: payload.data.metadata?.description,
    statusCode: payload.data.metadata?.statusCode,
    screenshot: payload.data.screenshot,
  };

  writeCache(url, result);
  return result;
}

export type SearchHit = { url: string; title: string; description?: string };

/**
 * BUSCA WEB (F17) — a rede de segurança da descoberta: acha páginas que o
 * crawl da navegação não pegou (`site:dominio blog OR imprensa…`).
 * Gasta crédito — usar SÓ quando a descoberta rendeu pouco. Nunca lança por
 * resposta estranha: devolve [] e o chamador segue sem a rede de segurança.
 */
export async function searchWeb(query: string, limit = 6): Promise<SearchHit[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch(FIRECRAWL_SEARCH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      success?: boolean;
      data?: { web?: Array<{ url?: string; title?: string; description?: string }> } | Array<{ url?: string; title?: string; description?: string }>;
    };
    const rows = Array.isArray(payload.data) ? payload.data : (payload.data?.web ?? []);
    return rows
      .filter((r) => typeof r?.url === "string")
      .map((r) => ({ url: r.url as string, title: (r.title ?? "").trim(), description: r.description }));
  } catch {
    return [];
  }
}
