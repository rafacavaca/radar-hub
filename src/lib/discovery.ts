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
import { completeViaGateway } from "@/lib/gateway";
import { collectionMethod, type SourceKind } from "@/lib/watchlist";

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_PROBES = 8;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

/** Hosts de plataformas de vagas (candidato externo aceito SÓ pra `vagas`). */
const JOB_BOARD_HOSTS = /(\.|^)(gupy\.io|kenoby\.com|greenhouse\.io|lever\.co|solides\.com\.br|abler\.com\.br|recrut\.ai)$/i;

/** Padrões de caminho/subdomínio por tipo (ordem = especificidade). Vocabulário
 * PT-BR ampliado — muitos sites BR usam esses termos. */
const KIND_PATTERNS: Array<{ kind: SourceKind; re: RegExp }> = [
  { kind: "vagas", re: /(^|\/)(vagas?|carreiras?|careers?|jobs|now-hiring|hiring|join-us|trabalhe(-conosco)?|oportunidades)(\/|$)/i },
  { kind: "releases", re: /(^|\/)(releases?|imprensa|sala-de-imprensa|press(-room)?|newsroom|comunicados?|novidades|changelog|atualizacoes|lancamentos|whats-new)(\/|$)/i },
  { kind: "noticias", re: /(^|\/)(noticias?|news|midia|na-midia)(\/|$)/i },
  { kind: "blog", re: /(^|\/)(blog|artigos?|articles?|conteudos?|conteudo|content|insights|biblioteca|library|central-de-conteudo|academy|materiais|materiais-ricos|recursos|resources|ebooks?|e-books?|cases?|clientes|casos-de-sucesso)(\/|$)/i },
  { kind: "produto", re: /(^|\/)(produtos?|products?|solucoes|solucao|solutions?|plataforma|platform|funcionalidades|servicos|services|software|suites?|features|modulos|modules)(\/|$)/i },
];

/** Caminhos comuns pra sondar quando um tipo não aparece nos links da home. */
const PROBE_PATHS: Array<{ kind: SourceKind; path: string }> = [
  { kind: "blog", path: "/blog/" },
  { kind: "blog", path: "/conteudo/" },
  { kind: "noticias", path: "/noticias/" },
  { kind: "releases", path: "/imprensa/" },
  { kind: "releases", path: "/sala-de-imprensa/" },
  { kind: "releases", path: "/novidades/" },
  { kind: "produto", path: "/solucoes/" },
  { kind: "produto", path: "/produtos/" },
  { kind: "vagas", path: "/vagas/" },
  { kind: "vagas", path: "/carreiras/" },
  { kind: "vagas", path: "/trabalhe-conosco/" },
];

/**
 * A URL é um ARTIGO-FOLHA (não uma seção-índice)? Uma seção é curta (/blog,
 * /solucoes, /use-cases); um artigo é fundo (/noticia/38/slug) ou tem slug
 * bem longo (título). Rejeitamos folhas como candidatas a fonte.
 */
function isLeafArticle(pathname: string): boolean {
  const segments = pathname.split("/").filter((s) => s.length > 0);
  if (segments.length >= 3) return true; // /noticia/38/slug, /blog/cat/post
  const last = segments[segments.length - 1] ?? "";
  return last.length >= 25; // slug longo = título de artigo
}

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
 * NAVEGAÇÃO REAL: extrai âncoras <a href>TEXTO</a> same-site — o "menu" que um
 * humano lê. É a matéria-prima do ENTENDIMENTO do site (texto do link diz o que
 * a página É: "CYNERGY WMS Suite", "News", "Job Openings"…).
 */
export function extractNavEntries(
  html: string,
  baseUrl: string,
  siteHost: string,
): Array<{ path: string; text: string }> {
  const byPath = new Map<string, string>();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const abs = new URL(m[1], baseUrl);
      if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
      if (!isSameSite(abs.hostname, siteHost)) continue;
      const path = abs.pathname.replace(/\/$/, "") || "/";
      if (path === "/") continue;
      const text = m[2].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
      // guarda o texto mais informativo visto pra esse caminho.
      const prev = byPath.get(path) ?? "";
      if (text.length > prev.length && text.length <= 80) byPath.set(path, text);
      else if (!byPath.has(path)) byPath.set(path, prev);
    } catch {
      // âncora inválida — ignora.
    }
  }
  return [...byPath.entries()].map(([path, text]) => ({ path, text }));
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTENDIMENTO DO SITE (F15) — o motor LÊ a navegação e mapeia o que vigiar.
// Regex de caminho não pega /cynergy ou /first-processing; um leitor pega.
// ─────────────────────────────────────────────────────────────────────────────

const UNDERSTAND_SYSTEM =
  "Você é o mapeador de sites do Radar (inteligência de mercado B2B). Recebe a NAVEGAÇÃO REAL do site de um concorrente " +
  "(linhas 'caminho ← texto do link') e seleciona o que vale VIGIAR. Tipos: " +
  "'blog' (índice de blog/artigos/conteúdo), 'noticias' (índice de notícias/news), 'releases' (imprensa/comunicados/novidades), " +
  "'produto' (páginas de PRODUTO/SOLUÇÃO/SUÍTE — o portfólio; prefira o nível de linha/suíte, não cada sub-módulo; no máximo 8, as mais importantes), " +
  "'vagas' (vagas/carreiras/job openings). " +
  "REGRAS: (1) use SOMENTE caminhos que estão na lista — NUNCA invente; " +
  "(2) escolha páginas-SEÇÃO/índice, nunca um artigo individual de blog/notícia; " +
  "(3) rotule cada página com o texto do link (limpo); " +
  "(4) se um tipo não existe no site, não o inclua. " +
  'Responda SÓ um array JSON: [{"path":"/x","kind":"produto","label":"Cynergy WMS Suite"}].';

type UnderstoodEntry = { path: string; kind: SourceKind; label: string };

const KIND_SET: ReadonlySet<string> = new Set(["blog", "noticias", "releases", "produto", "vagas"]);

/**
 * Pede ao motor pra LER a navegação e mapear as páginas vigiáveis.
 * Defensivo: valida cada item (caminho PRECISA existir na lista — anti-invenção;
 * kind na whitelist). Falha do motor -> [] (a descoberta segue só determinística).
 */
export async function understandSite(
  entries: Array<{ path: string; text: string }>,
): Promise<UnderstoodEntry[]> {
  if (entries.length < 3) return [];
  const lines = entries
    .slice(0, 110)
    .map((e) => `${e.path}${e.text ? ` ← ${e.text}` : ""}`)
    .join("\n");
  let content = "";
  try {
    content = await completeViaGateway({
      system: UNDERSTAND_SYSTEM,
      prompt: `NAVEGAÇÃO DO SITE:\n${lines}\n\nMapeie o que vigiar.`,
    });
  } catch (err) {
    console.warn(`[discovery] entendimento indisponível: ${(err as Error).message}`);
    return [];
  }

  let parsed: unknown;
  try {
    const m = content.match(/\[[\s\S]*\]/);
    parsed = m ? JSON.parse(m[0]) : [];
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const validPaths = new Set(entries.map((e) => e.path));
  const out: UnderstoodEntry[] = [];
  let produtos = 0;
  for (const raw of parsed) {
    const path = typeof (raw as UnderstoodEntry)?.path === "string" ? (raw as UnderstoodEntry).path.replace(/\/$/, "") : "";
    const kind = (raw as UnderstoodEntry)?.kind;
    const label = typeof (raw as UnderstoodEntry)?.label === "string" ? (raw as UnderstoodEntry).label.trim() : "";
    if (!validPaths.has(path)) continue; // anti-invenção: só o que existe
    if (typeof kind !== "string" || !KIND_SET.has(kind)) continue;
    if (kind === "produto" && ++produtos > 8) continue;
    out.push({ path, kind: kind as SourceKind, label: label.slice(0, 60) });
  }
  return out;
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

  // 1. Links da home: fetch simples -> fallback Firecrawl. Também extrai a
  //    NAVEGAÇÃO (link ← texto) — a matéria-prima do entendimento (F15).
  let links: string[] = [];
  let navEntries: Array<{ path: string; text: string }> = [];
  let viaFirecrawl = false;
  const home = await fetchHtml(siteUrl);
  if (home) {
    links = extractLinks(home.html, home.finalUrl);
    navEntries = extractNavEntries(home.html, home.finalUrl, siteHost);
  }
  if (links.filter((l) => isSameSite(new URL(l).hostname, siteHost)).length < 5) {
    try {
      const scraped = await scrape(siteUrl, { formats: ["links"], onlyMainContent: false });
      if (scraped.links.length > 0) {
        links = scraped.links;
        viaFirecrawl = true;
        // sem HTML das âncoras aqui: o entendimento lê só os caminhos (slugs).
        navEntries = links
          .filter((l) => {
            try {
              return isSameSite(new URL(l).hostname, siteHost);
            } catch {
              return false;
            }
          })
          .map((l) => ({ path: new URL(l).pathname.replace(/\/$/, "") || "/", text: "" }))
          .filter((e) => e.path !== "/");
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
    // artigo-folha (ex.: /noticia/38/slug) não é a SEÇÃO — ignora como candidato.
    if (isLeafArticle(candidate.pathname)) continue;
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
    if (!page) continue;
    const finalPath = new URL(page.finalUrl).pathname;
    const firstProbeSeg = path.split("/").filter(Boolean)[0] ?? "";
    // aceita só se a seção EXISTE de fato: não voltou pra home nem foi reescrita
    // pra outro caminho (soft-404 de SPA que devolve 200 em qualquer URL).
    if (finalPath !== "/" && finalPath.toLowerCase().includes(firstProbeSeg.toLowerCase())) {
      bestByKind.set(kind, new URL(page.finalUrl));
    }
  }

  // 4. ENTENDIMENTO (F15): o motor LÊ a navegação real (link ← texto) e mapeia
  //    o que vigiar — pega o que regex de caminho não pega (/cynergy, /now-hiring).
  const understood = navEntries.length > 0 ? await understandSite(navEntries) : [];

  // 5. Junta: determinístico (1 por tipo, com evidência) + entendimento
  //    (vários por tipo — cada suíte de produto é uma fonte). Dedupe por URL.
  const candidates: SourceCandidate[] = [];
  const seenUrls = new Set<string>();
  // chave de dedupe tolerante: ignora esquema, www. e barra final.
  const normalized = (u: string): string => {
    try {
      const x = new URL(u);
      return `${x.hostname.replace(/^www\./i, "")}${x.pathname.replace(/\/$/, "")}`;
    } catch {
      return u.replace(/\/$/, "");
    }
  };

  const buildCandidate = async (
    kind: SourceKind,
    url: string,
    titulo: string,
    viaEntendimento: boolean,
  ): Promise<SourceCandidate> => {
    const method = collectionMethod(kind);
    const coletavel = method !== null;
    let descricao: string;
    if (method === "list") {
      const posts = await countPosts(url);
      if (posts !== null && posts >= 2) {
        descricao = `Página com ≈${posts} artigos detectados — o Radar varre daqui.`;
      } else if (posts !== null) {
        descricao = "Seção encontrada, mas contei poucos artigos por leitura simples — a coleta usará o Firecrawl.";
      } else {
        descricao = "O site bloqueia leitura simples — a coleta usará o Firecrawl (funciona, gasta 1 crédito).";
      }
    } else if (method === "diff") {
      descricao =
        kind === "vagas"
          ? "Página de vagas — vigiada por MUDANÇA: quando abrir/fechar vaga, vira sinal."
          : "Página de produto/solução — vigiada por MUDANÇA: quando mudar, vira sinal.";
    } else {
      descricao = "Página registrada — a vigilância desse tipo entra numa fase futura.";
    }
    if (viaEntendimento) descricao = `Mapeada lendo a navegação do site. ${descricao}`;
    return { kind, url, titulo, descricao, preChecked: coletavel, coletavel };
  };

  for (const [kind, url] of bestByKind) {
    if (url.pathname === "/" || url.pathname === "") continue;
    const key = normalized(url.toString());
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    candidates.push(await buildCandidate(kind, url.toString(), KIND_LABEL[kind], false));
  }

  const origin = new URL(siteUrl).origin;
  let produtosMarcados = candidates.filter((c) => c.kind === "produto").length;
  for (const entry of understood) {
    const url = `${origin}${entry.path}`;
    const key = normalized(url);
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    const candidate = await buildCandidate(
      entry.kind,
      url,
      entry.label || KIND_LABEL[entry.kind],
      true,
    );
    // produto demais pré-marcado vira spam: pré-marca só as 4 primeiras páginas.
    if (candidate.kind === "produto" && ++produtosMarcados > 4) candidate.preChecked = false;
    candidates.push(candidate);
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
