/**
 * LENTE 1 — POSICIONAMENTO & MENSAGEM. Do site do concorrente, extrai um card
 * estruturado (tagline · propósito · posicionamento · diferenciais · produtos
 * nomeados · provas). Reusa a coleta (Firecrawl scrape) + extração por LLM.
 *
 * HONESTIDADE (o ponto mais importante): o LLM só preenche o que está no
 * MATERIAL. O que não achar vira status:"nao_encontrado" com valor null —
 * NUNCA um valor plausível inventado. A fonte de cada campo é a PÁGINA real de
 * onde saiu (fonteIndex → url), nunca inventada.
 */

import { scrape } from "@/lib/firecrawl";
import { completeViaGateway } from "@/lib/gateway";
import {
  campoFato,
  campoNaoEncontrado,
  type Campo,
  type Posicionamento,
  type Produto,
} from "@/lib/diagnostico/schema";

const PAGE_CHARS = 2800; // teto por sub-página (home tem orçamento próprio); cabe em 40s

/** Páginas típicas de um site institucional que alimentam o posicionamento. */
const CATS: Array<{ re: RegExp }> = [
  { re: /\/(sobre|about|institucional|quem-somos|company|empresa|a-empresa|nossa-historia|about-us)(\/|$|\?)/i },
  { re: /\/(solucoes?|solutions?|produtos?|products?|plataforma|platform|servicos?|services|o-que-fazemos|what-we-do)(\/|$|\?)/i },
  { re: /\/(clientes|cases?|customers?|success|casos?-de-sucesso|depoimentos|testimonials|resultados)(\/|$|\?)/i },
];

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

/** Escolhe até 3 sub-páginas (sobre/soluções/clientes) dos links da home. */
function pickKeyPages(siteUrl: string, links: string[]): string[] {
  const picked: string[] = [];
  const seen = new Set<string>([siteUrl.replace(/\/$/, "")]);
  for (const { re } of CATS) {
    const matches = links
      .filter((l) => sameHost(l, siteUrl) && re.test(l))
      .map((l) => l.split("#")[0].split("?")[0])
      .sort((a, b) => new URL(a).pathname.length - new URL(b).pathname.length);
    const best = matches[0];
    if (best && !seen.has(best.replace(/\/$/, ""))) {
      seen.add(best.replace(/\/$/, ""));
      picked.push(best);
    }
  }
  return picked.slice(0, 3);
}

/** Páginas que NÃO são de produto (excluídas do crawl de produto). */
const NON_PRODUCT =
  /\/(get-a-quote|book-a-demo|request-demo|become-a-dealer|contato?|contact|about|sobre|institucional|quem-somos|company|empresa|blog|artigos?|news|noticias?|insights|imprensa|press|privacy|privacidade|terms?|termos|cookie|lgpd|careers?|carreiras|vagas|jobs|trabalhe|login|sign-?in|register|cadastro|cart|checkout|search|busca|faq|support|suporte|help|ajuda|legal|sitemap|clientes|customers|cases?|depoimentos|testimonials|partners?|parceiros|events?|eventos?|webinars?|resources?|recursos|downloads?|pricing|precos?)(\/|$|-|\.)/i;

/**
 * Páginas de PRODUTO/SOLUÇÃO: slugs de topo (1-2 segmentos) que não são
 * institucionais/legais/CTA. Determinístico (o LLM depois extrai o que serve).
 */
function pickProductPages(siteUrl: string, links: string[], jaEscolhidas: string[]): string[] {
  const seen = new Set<string>([siteUrl.replace(/\/$/, ""), ...jaEscolhidas.map((u) => u.replace(/\/$/, ""))]);
  const out: string[] = [];
  for (const l of links) {
    if (!sameHost(l, siteUrl)) continue;
    let u: URL;
    try {
      u = new URL(l);
    } catch {
      continue;
    }
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length < 1 || segs.length > 2) continue;
    if (NON_PRODUCT.test(u.pathname)) continue;
    const clean = `${u.origin}${u.pathname}`.replace(/\/$/, "");
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out.slice(0, 4);
}

export type Page = { url: string; label: string; markdown: string };

/**
 * Scrape das páginas-chave (home + sobre/soluções/clientes + produtos). `extras`
 * (D — fontes extras do usuário) são adicionadas ao final. Nunca lança.
 */
export async function collectPages(siteUrl: string, extras: string[] = []): Promise<Page[]> {
  const pages: Page[] = [];
  let links: string[] = [];
  try {
    // onlyMainContent:false pra pegar os links de NAVEGAÇÃO (menu/rodapé) — é lá
    // que estão sobre/soluções/clientes; sem isso, só a home é lida.
    const home = await scrape(siteUrl, { formats: ["markdown", "links"], onlyMainContent: false });
    links = home.links ?? [];
    // home ganha orçamento maior: com onlyMainContent:false o herói vem depois do menu.
    pages.push({ url: siteUrl, label: "home", markdown: home.markdown.slice(0, 6000) });
  } catch {
    return pages; // sem home não há o que ler
  }
  // sobre/soluções/clientes (índices) + páginas de PRODUTO (detalhe por solução).
  const keyPages = pickKeyPages(siteUrl, links);
  const productPages = pickProductPages(siteUrl, links, keyPages);
  const subPages = [...keyPages, ...productPages].slice(0, 5); // teto: home + 5 páginas
  for (const url of subPages) {
    const label = productPages.includes(url) ? "produto" : "página";
    try {
      const p = await scrape(url);
      pages.push({ url, label, markdown: p.markdown.slice(0, PAGE_CHARS) });
    } catch {
      // página que não abre — segue com as outras (honesto: menos material).
    }
  }
  // D — fontes extras do usuário (até 3), rotuladas como tal.
  const jaLidas = new Set(pages.map((p) => p.url.replace(/\/$/, "")));
  for (const url of extras.slice(0, 3)) {
    if (jaLidas.has(url.replace(/\/$/, ""))) continue;
    try {
      const p = await scrape(url);
      pages.push({ url, label: "fonte-extra", markdown: p.markdown.slice(0, PAGE_CHARS) });
    } catch {
      // fonte extra que não abre — segue (honesto).
    }
  }
  return pages;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extração por LLM
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM =
  "Você é o EXTRATOR DE POSICIONAMENTO do Radar (diagnóstico de marca B2B). Recebe páginas do site de UM concorrente e extrai um card ESTRUTURADO de posicionamento — APENAS o que está EXPLÍCITO no material. " +
  "REGRA DE OURO (inviolável): NÃO invente. O que não estiver no material vira status:'nao_encontrado' com valor null. NUNCA deduza tagline, cliente, prêmio, número ou produto que não esteja escrito. " +
  "Para CADA campo preenchido, informe 'fonteIndex' = o número [N] da página de onde tirou. " +
  "Campos: tagline (a frase-assinatura da marca); proposito (propósito/missão); posicionamento (como se posiciona: líder, especialista, etc.); diferenciais (lista); produtos (soluções com NOME PRÓPRIO + descrição curta); provas: clientes_citados (nomes de clientes citados), depoimentos (tem/não tem + resumo), premiacoes (lista), big_numbers (números de marca, ex.: '+30 anos', '50 países'). " +
  'Responda SÓ com um objeto JSON válido, sem texto fora: ' +
  '{ "tagline": {"valor":"...","status":"encontrado","fonteIndex":1}, "proposito": {...}, "posicionamento": {...}, ' +
  '"diferenciais": [{"valor":"...","fonteIndex":1}], "produtos": [{"nome":"...","descricao":"...","fonteIndex":2}], ' +
  '"provas": {"clientes_citados":[{"valor":"...","fonteIndex":3}], "depoimentos":{"valor":"...","status":"encontrado","fonteIndex":3}, "premiacoes":[], "big_numbers":[{"valor":"...","fonteIndex":1}]} }. ' +
  "Para escalares não achados, use {\"valor\":null,\"status\":\"nao_encontrado\"}; para listas não achadas, [].";

function buildPrompt(name: string, pages: Page[]): string {
  const blocks = pages
    .map((p, i) => `[${i + 1}] (${p.label}) ${p.url}\n${p.markdown}`)
    .join("\n\n---\n\n");
  return `CONCORRENTE: ${name}\n\nPÁGINAS DO SITE (cite a fonte por [N]):\n\n${blocks}\n\nExtraia o posicionamento de ${name} SÓ do material acima. O que não estiver escrito, marque como não encontrado.`;
}

function extractJsonObject(content: string): Record<string, unknown> | null {
  try {
    const m = content.match(/\{[\s\S]*\}/);
    return m ? (JSON.parse(m[0]) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export type Lente1Result = { posicionamento: Posicionamento; paginas: string[]; pages: Page[] };

/**
 * Roda a Lente 1: coleta as páginas-chave (+ fontes extras do usuário) e extrai
 * o posicionamento. Devolve também as `pages` coletadas (D reusa p/ campos
 * custom, sem re-scrape). Campos não achados = nao_encontrado.
 */
export async function runLente1(name: string, siteUrl: string, extras: string[] = []): Promise<Lente1Result> {
  const now = new Date().toISOString();
  const pages = await collectPages(siteUrl, extras);
  const paginas = pages.map((p) => p.url);

  const vazio = (): Posicionamento => ({
    tagline: campoNaoEncontrado(now),
    proposito: campoNaoEncontrado(now),
    posicionamento: campoNaoEncontrado(now),
    diferenciais: [],
    produtos: [],
    provas: {
      clientes_citados: [],
      depoimentos: campoNaoEncontrado(now),
      premiacoes: [],
      big_numbers: [],
    },
  });

  if (pages.length === 0) return { posicionamento: vazio(), paginas, pages };

  let content = "";
  try {
    content = await completeViaGateway({ system: SYSTEM, prompt: buildPrompt(name, pages) });
  } catch {
    return { posicionamento: vazio(), paginas, pages };
  }
  const raw = extractJsonObject(content);
  if (!raw) return { posicionamento: vazio(), paginas, pages };

  const fonteDe = (fonteIndex: unknown): string | undefined => {
    const n = Number(fonteIndex);
    return Number.isInteger(n) && n >= 1 && n <= pages.length ? pages[n - 1].url : undefined;
  };

  /** Um campo escalar do objeto do LLM -> Campo (ou nao_encontrado). */
  const campoDe = (obj: unknown): Campo => {
    if (!obj || typeof obj !== "object") return campoNaoEncontrado(now);
    const o = obj as Record<string, unknown>;
    const valor = cleanStr(o.valor);
    if (!valor || cleanStr(o.status) === "nao_encontrado") return campoNaoEncontrado(now);
    return campoFato(valor, fonteDe(o.fonteIndex), now);
  };

  /** Uma lista do LLM -> Campo[] (só itens com valor). */
  const listaDe = (arr: unknown): Campo[] => {
    if (!Array.isArray(arr)) return [];
    const out: Campo[] = [];
    for (const item of arr) {
      const valor = cleanStr((item as Record<string, unknown>)?.valor);
      if (!valor) continue;
      out.push(campoFato(valor, fonteDe((item as Record<string, unknown>)?.fonteIndex), now));
    }
    return out;
  };

  const produtosDe = (arr: unknown): Produto[] => {
    if (!Array.isArray(arr)) return [];
    const out: Produto[] = [];
    for (const item of arr) {
      const o = item as Record<string, unknown>;
      const nome = cleanStr(o?.nome);
      if (!nome) continue;
      out.push({
        nome,
        descricao: cleanStr(o?.descricao) || null,
        fonte_url: fonteDe(o?.fonteIndex),
        data_coleta: now,
      });
    }
    return out;
  };

  const provas = (raw.provas ?? {}) as Record<string, unknown>;
  const posicionamento: Posicionamento = {
    tagline: campoDe(raw.tagline),
    proposito: campoDe(raw.proposito),
    posicionamento: campoDe(raw.posicionamento),
    diferenciais: listaDe(raw.diferenciais),
    produtos: produtosDe(raw.produtos),
    provas: {
      clientes_citados: listaDe(provas.clientes_citados),
      depoimentos: campoDe(provas.depoimentos),
      premiacoes: listaDe(provas.premiacoes),
      big_numbers: listaDe(provas.big_numbers),
    },
  };
  return { posicionamento, paginas, pages };
}
