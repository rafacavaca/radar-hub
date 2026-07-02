/**
 * DESCOBERTA DE FONTES — o Rafael digita só NOME + SITE do concorrente e o
 * sistema fareja as páginas públicas vigiáveis (blog/notícias, novidades/
 * releases, soluções/produto, vagas) e as classifica pra ele confirmar.
 *
 * Mesmo padrão do "Pesquisar concorrentes" do Formare (sugere → humano
 * confirma), aplicado a FONTES. E seguindo a regra da casa: código
 * determinístico > LLM — aqui é heurística de URL, não IA.
 *
 * Estratégia (barata e educada — só páginas públicas, nada de login):
 *   1. Busca a HOME do site com fetch simples (grátis). Se o site bloquear
 *      robô ou vier vazio, cai pro Firecrawl (1 crédito, cache diário).
 *   2. Classifica os links do próprio site por padrões de caminho/subdomínio
 *      (pt + en): vagas, releases/imprensa, notícias, blog, produto/soluções.
 *   3. Pra tipos não achados, SONDA caminhos comuns (/blog/, /imprensa/…)
 *      com fetch simples — no máximo ~8 tentativas.
 *   4. VERIFICA os candidatos coletáveis contando artigos com a MESMA
 *      heurística do coletor (isLikelyPostUrl) — a evidência vira a frase
 *      que o Rafael lê ("≈12 artigos detectados").
 *
 * Nunca lança por site ruim: devolve candidates=[] + warning, e a tela
 * mantém o campo manual como saída.
 */

import { isLikelyPostUrl } from "@/lib/collectors/blog";
import { scrape } from "@/lib/firecrawl";
import { COLLECTIBLE_KINDS, type SourceKind } from "@/lib/watchlist";

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_PROBES = 8;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

/** Hosts de plataformas de vagas (candidato externo aceito SÓ pra `vagas`). */
const JOB_BOARD_HOSTS = /(\.|^)(gupy\.io|kenoby\.com|greenhouse\.io|lever\.co|solides\.com\.br|abler\.com\.br|recrut\.ai)$/i;

/** Padrões de caminho/subdomínio por tipo (ordem = especificidade). */
const KIND_PATTERNS: Array<{ kind: SourceKind; re: RegExp }> = [
  { kind: "vagas", re: /(^|\/)(vagas?|carreiras?|careers?|jobs|trabalhe(-conosco)?)(\/|$)/i },
  { kind: "releases", re: /(^|\/)(releases?|imprensa|press(-room)?|novidades|changelog|atualizacoes|lancamentos|whats-new)(\/|$)/i },
  { kind: "noticias", re: /(^|\/)(noticias?|news)(\/|$)/i },
  { kind: "blog", re: /(^|\/)(blog|artigos?|conteudos?|insights|biblioteca|central-de-conteudo|academy)(\/|$)/i },
  { kind: "produto", re: /(^|\/)(produtos?|solucoes|plataforma|funcionalidades|servicos|recursos|features)(\/|$)/i },
];

/** Caminhos comuns pra sondar quando um tipo não aparece nos links da home. */
const PROBE_PATHS: Array<{ kind: SourceKind; path: string }> = [
  { kind: "blog", path: "/blog/" },
  { kind: "noticias", path: "/noticias/" },
  { kind: "releases", path: "/imprensa/" },
  { kind: "releases", path: "/novidades/" },
  { kind: "produto", path: "/solucoes/" },
  { kind: "produto", path: "/produtos/" },
  { kind: "vagas", path: "/vagas/" },
  { kind: "vagas", path: "/carreiras/" },
];

const KIND_LABEL: Record<SourceKind, string> = {
  blog: "Blog / artigos",
  noticias: "Notícias",
  releases: "Novidades / imprensa",
  produto: "Soluções / produto",
  vagas: "Vagas / carreiras",
};

export type SourceCandidate = {
  kind: SourceKind;
  url: string;
  /** rótulo humano do tipo (ex.: "Blog / artigos"). */
  titulo: string;
  /** 1 frase honesta do que é / evidência encontrada. */
  descricao: string;
  /** os óbvios já vêm marcados (só tipos que o coletor sabe varrer). */
  preChecked: boolean;
  /** o coletor já sabe varrer este tipo? (produto/vagas = registro futuro) */
  coletavel: boolean;
};

export type DiscoveryResult = {
  candidates: SourceCandidate[];
  /** precisou do Firecrawl pra ler a home? (site bloqueia fetch simples) */
  viaFirecrawl: boolean;
  /** aviso honesto quando nada (ou quase nada) foi achado. */
  warning?: string;
};

/** "rdstation.com" -> "https://rdstation.com" (o Rafael não digita esquema). */
export function normalizeSiteUrl(input: string): string {
  const raw = input.trim();
  if (!raw) throw new Error("Informe o site do concorrente.");
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("O site precisa ser um endereço válido (ex.: concorrente.com.br).");
  }
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString();
}

/** domínio "registrável" aproximado: tira www. e compara por sufixo. */
function baseDomainOf(host: string): string {
  return host.replace(/^www\./i, "").toLowerCase();
}

function isSameSite(candidateHost: string, siteHost: string): boolean {
  const base = baseDomainOf(siteHost);
  const cand = baseDomainOf(candidateHost);
  return cand === base || cand.endsWith(`.${base}`);
}

/** fetch simples com timeout, UA de navegador e teto de tamanho. */
async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) return null;
    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    return { html, finalUrl: res.url || url };
  } catch {
    return null;
  }
}

/** extrai hrefs absolutos de um HTML (regex é suficiente pra farejar). */
function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const re = /href\s*=\s*["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    try {
      const abs = new URL(match[1], baseUrl);
      if (abs.protocol === "http:" || abs.protocol === "https:") {
        abs.hash = "";
        links.push(abs.toString());
      }
    } catch {
      // href inválido — ignora.
    }
  }
  return links;
}

/**
 * Classifica uma URL num tipo de fonte (ou null se não parece fonte).
 * Devolve também a URL "canônica" do candidato: se o tipo veio do SUBDOMÍNIO
 * (blog.x.com), o candidato é a RAIZ do subdomínio — não a categoria linkada.
 */
function classify(
  url: URL,
  siteHost: string,
): { kind: SourceKind; candidate: URL } | null {
  const sameSite = isSameSite(url.hostname, siteHost);
  // externo: só plataformas de vagas conhecidas.
  if (!sameSite) {
    return JOB_BOARD_HOSTS.test(url.hostname) ? { kind: "vagas", candidate: url } : null;
  }
  // 1º: o subdomínio dedicado (blog.x.com, news.x.com…) -> raiz do subdomínio.
  const sub = url.hostname.split(".")[0].toLowerCase();
  for (const { kind, re } of KIND_PATTERNS) {
    if (re.test(`/${sub}/`)) {
      return { kind, candidate: new URL(`${url.protocol}//${url.hostname}/`) };
    }
  }
  // 2º: o caminho.
  for (const { kind, re } of KIND_PATTERNS) {
    if (re.test(url.pathname.toLowerCase())) return { kind, candidate: url };
  }
  return null;
}

/** conta artigos plausíveis num candidato coletável (a evidência da frase). */
async function countPosts(candidateUrl: string): Promise<number | null> {
  const page = await fetchHtml(candidateUrl);
  if (!page) return null;
  const host = new URL(candidateUrl).hostname;
  const basePath = new URL(candidateUrl).pathname.endsWith("/")
    ? new URL(candidateUrl).pathname
    : `${new URL(candidateUrl).pathname}/`;
  const links = extractLinks(page.html, page.finalUrl);
  const posts = new Set<string>();
  for (const link of links) {
    if (isLikelyPostUrl(link, host, basePath)) posts.add(link.replace(/\/$/, ""));
  }
  return posts.size;
}

/** Descobre e classifica as fontes públicas vigiáveis de um site. */
export async function discoverSources(siteInput: string): Promise<DiscoveryResult> {
  const siteUrl = normalizeSiteUrl(siteInput);
  const siteHost = new URL(siteUrl).hostname;

  // 1. Links da home: fetch simples -> fallback Firecrawl.
  let links: string[] = [];
  let viaFirecrawl = false;
  const home = await fetchHtml(siteUrl);
  if (home) links = extractLinks(home.html, home.finalUrl);
  if (links.filter((l) => isSameSite(new URL(l).hostname, siteHost)).length < 5) {
    try {
      const scraped = await scrape(siteUrl, { formats: ["links"], onlyMainContent: false });
      if (scraped.links.length > 0) {
        links = scraped.links;
        viaFirecrawl = true;
      }
    } catch (err) {
      console.warn(`[discovery] Firecrawl também falhou em ${siteUrl}: ${(err as Error).message}`);
    }
  }

  // 2. Classifica e escolhe o MELHOR candidato por tipo (caminho mais curto =
  //    provavelmente a raiz da seção, não um artigo específico).
  const bestByKind = new Map<SourceKind, URL>();
  for (const raw of links) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    // raiz do PRÓPRIO site não é fonte; raiz de subdomínio dedicado é (o
    // classify devolve a raiz do subdomínio como candidato canônico).
    if (baseDomainOf(url.hostname) === baseDomainOf(siteHost) &&
        url.hostname === new URL(siteUrl).hostname &&
        (url.pathname === "/" || url.pathname === "")) {
      continue;
    }
    const hit = classify(url, siteHost);
    if (!hit) continue;
    const candidate = hit.candidate;
    candidate.search = "";
    const current = bestByKind.get(hit.kind);
    if (!current || candidate.pathname.length < current.pathname.length) {
      bestByKind.set(hit.kind, candidate);
    }
  }

  // 3. Sonda caminhos comuns pros tipos que faltaram (fetch simples, barato).
  let probes = 0;
  for (const { kind, path } of PROBE_PATHS) {
    if (bestByKind.has(kind) || probes >= MAX_PROBES) continue;
    probes++;
    const probeUrl = new URL(path, siteUrl).toString();
    const page = await fetchHtml(probeUrl);
    // redirecionou pra home = seção não existe.
    if (page && new URL(page.finalUrl).pathname !== "/") {
      bestByKind.set(kind, new URL(page.finalUrl));
    }
  }

  // 4. Monta os candidatos com evidência honesta.
  const candidates: SourceCandidate[] = [];
  for (const [kind, url] of bestByKind) {
    const coletavel = COLLECTIBLE_KINDS.has(kind);
    let descricao: string;
    if (coletavel) {
      const posts = await countPosts(url.toString());
      if (posts !== null && posts >= 2) {
        descricao = `Página com ≈${posts} artigos detectados — o Radar varre daqui.`;
      } else if (posts !== null) {
        descricao = "Seção encontrada, mas contei poucos artigos por leitura simples — a coleta usará o Firecrawl.";
      } else {
        descricao = "O site bloqueia leitura simples — a coleta usará o Firecrawl (funciona, gasta 1 crédito).";
      }
    } else {
      descricao =
        kind === "vagas"
          ? "Página de vagas — registrada agora; a vigilância desse tipo entra numa fase futura."
          : "Página de soluções/produto — registrada agora; o monitor visual entra numa fase futura.";
    }
    candidates.push({
      kind,
      url: url.toString(),
      titulo: KIND_LABEL[kind],
      descricao,
      preChecked: coletavel,
      coletavel,
    });
  }

  // ordena: coletáveis primeiro, depois pela ordem dos tipos.
  const order: SourceKind[] = ["blog", "noticias", "releases", "produto", "vagas"];
  candidates.sort(
    (a, b) =>
      Number(b.coletavel) - Number(a.coletavel) || order.indexOf(a.kind) - order.indexOf(b.kind),
  );

  return {
    candidates,
    viaFirecrawl,
    warning:
      candidates.length === 0
        ? "Não achei fontes óbvias nesse site — confira o endereço ou cole a URL do blog manualmente."
        : undefined,
  };
}
