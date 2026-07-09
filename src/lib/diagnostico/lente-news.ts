/**
 * C4 — COLETOR DE RELEASES/NOTÍCIAS. Novos produtos, anúncios, PR e changelog:
 * o "o que saiu de novo". Acha a página de notícias/imprensa/blog PELOS LINKS
 * da home, lê e extrai itens recentes {título, data, resumo}. Alimenta o motor
 * de movimento (release novo = movimento).
 *
 * HONESTIDADE: só itens REAIS da página; data só se a página informa (ABSOLUTA,
 * nunca 1969); sem página → nao_encontrado. Nunca inventa release.
 */

import { scrape } from "@/lib/firecrawl";
import { completeViaGateway } from "@/lib/gateway";
import { newsNaoEncontrado, type BlocoNews, type ReleaseItem } from "@/lib/diagnostico/schema";

const NEWS_RE = /(news|noticias?|press|imprensa|novidades|releases?|comunicados?|updates?|changelog|blog|artigos?|media|sala-de-imprensa)/i;
const PAGE_CHARS = 4500;

function acharNews(homeMd: string, links: string[], siteUrl: string): string | null {
  let host = "";
  try {
    host = new URL(siteUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  const candidatos = links
    .filter((l) => {
      try {
        return new URL(l).hostname.replace(/^www\./, "") === host && NEWS_RE.test(l);
      } catch {
        return false;
      }
    })
    .map((l) => l.split("#")[0])
    // prioriza news/press/releases sobre blog (release > post)
    .sort((a, b) => rank(a) - rank(b));
  if (candidatos[0]) return candidatos[0];
  const m = homeMd.match(/\[([^\]]*(?:not[ií]cia|press|imprensa|novidade|release|changelog)[^\]]*)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/i);
  if (m) {
    try {
      return new URL(m[2], siteUrl).toString();
    } catch {
      return null;
    }
  }
  return null;
}
function rank(url: string): number {
  if (/(press|imprensa|releases?|comunicados?|news|noticias?)/i.test(url)) return 0;
  if (/(novidades?|updates?|changelog)/i.test(url)) return 1;
  return 2; // blog/artigos
}

const SYSTEM =
  "Você lê a PÁGINA DE NOTÍCIAS/IMPRENSA/BLOG de uma empresa e extrai os itens MAIS RECENTES (releases, anúncios, novidades). " +
  "REGRAS DE HONESTIDADE (invioláveis): (1) só itens REALMENTE listados na página; (2) data = data de publicação SÓ se aparecer na página, no formato AAAA-MM-DD (nunca invente/estime a data); senão null; " +
  "(3) resumo = 1 frase curta do item, se houver; (4) até 6 itens, dos mais recentes; se a página não tem itens datados/claros, itens:[]. " +
  'Responda SÓ JSON: {"itens":[{"titulo":"...","data":"2026-06-01"|null,"resumo":"..."|null}]}';

type Raw = { itens?: Array<{ titulo?: unknown; data?: unknown; resumo?: unknown }> };

function dataValida(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const ano = Number(m[1]);
  const now = new Date().getUTCFullYear();
  if (ano < 2000 || ano > now + 1) return null; // nada de 1969 nem futuro absurdo
  return `${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`;
}

export async function runLenteNews(name: string, siteUrl: string): Promise<BlocoNews> {
  const now = new Date().toISOString();

  let homeMd = "";
  let links: string[] = [];
  try {
    const home = await scrape(siteUrl, { formats: ["markdown", "links"], onlyMainContent: false });
    homeMd = home.markdown;
    links = home.links ?? [];
  } catch {
    return newsNaoEncontrado(now, "home inacessível nesta varredura");
  }

  const newsUrl = acharNews(homeMd, links, siteUrl);
  if (!newsUrl) return newsNaoEncontrado(now, "sem página de notícias/imprensa/blog encontrada no site");

  let md = "";
  try {
    md = (await scrape(newsUrl, { onlyMainContent: true })).markdown.slice(0, PAGE_CHARS);
  } catch {
    md = "";
  }
  if (!md.trim()) return { ...newsNaoEncontrado(now, "página de notícias não expôs conteúdo"), fonte_url: newsUrl };

  let raw: Raw = {};
  try {
    const content = await completeViaGateway({ system: SYSTEM, prompt: `EMPRESA: ${name}\nPÁGINA: ${newsUrl}\n\n${md}\n\nExtraia os itens recentes, honesto.` });
    const m = content.match(/\{[\s\S]*\}/);
    if (m) raw = JSON.parse(m[0]) as Raw;
  } catch {
    raw = {};
  }

  const itens: ReleaseItem[] = (Array.isArray(raw.itens) ? raw.itens : [])
    .map((it) => {
      const titulo = typeof it?.titulo === "string" ? it.titulo.trim() : "";
      if (!titulo) return null;
      return {
        titulo: titulo.slice(0, 160),
        data_publicacao: dataValida(it?.data),
        fonte_url: newsUrl,
        resumo: typeof it?.resumo === "string" && it.resumo.trim() ? it.resumo.trim().slice(0, 200) : null,
      };
    })
    .filter((x): x is ReleaseItem => Boolean(x))
    .slice(0, 6);

  if (itens.length === 0) return { ...newsNaoEncontrado(now, "página lida, mas sem itens claros"), fonte_url: newsUrl };
  return { status: "encontrado", itens, fonte_url: newsUrl, data_coleta: now };
}
