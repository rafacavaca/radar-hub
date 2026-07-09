/**
 * F1b — LENTE DE PREÇO/PLANOS. Descobre a página de preços PELO PRÓPRIO SITE
 * (link na home — não adivinha URL) e extrai estrutura {plano, preço,
 * periodicidade, features}.
 *
 * HONESTIDADE:
 * - Preço só se EXPLÍCITO na página (valor/moeda visível). "Fale com vendas" /
 *   "solicite proposta" → status "sob_consulta" — NUNCA um preço inventado.
 * - Sem página de preço no site → "nao_encontrado".
 * - Falha de coleta → "nao_encontrado" com resumo do porquê (o diff de
 *   movimento ignora lados não-lidos; queda de scrape não vira "removeu preço").
 */

import { scrape } from "@/lib/firecrawl";
import { completeViaGateway } from "@/lib/gateway";
import { precoNaoEncontrado, type BlocoPreco, type PlanoPreco } from "@/lib/diagnostico/schema";

const PRECO_FORTE = /(pre[cç]os?|pricing|valores)/i;
const PRECO_FRACO = /(planos?\b|plans?\b|assinaturas?)/i;
const PAGE_CHARS = 6000;

/**
 * Candidatos a página de preço nos links da home (href OU âncora), RANQUEADOS:
 * "preço/pricing/valores" > "planos"; empate = caminho mais raso primeiro
 * (a home costuma ter vários "planos/..." — o mais raso é a página-mãe).
 */
export function pickPricingCandidates(homeMarkdown: string, siteUrl: string): string[] {
  const links = [...homeMarkdown.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g)];
  let base: URL;
  try {
    base = new URL(siteUrl);
  } catch {
    return [];
  }
  const host = base.hostname.replace(/^www\./, "");
  const score = new Map<string, number>();
  for (const [, texto, href] of links) {
    const forte = PRECO_FORTE.test(texto) || PRECO_FORTE.test(href);
    const fraco = PRECO_FRACO.test(texto) || PRECO_FRACO.test(href);
    if (!forte && !fraco) continue;
    try {
      const url = new URL(href, base);
      if (url.hostname.replace(/^www\./, "") !== host) continue;
      url.hash = "";
      const chave = url.toString();
      const profundidade = url.pathname.split("/").filter(Boolean).length;
      const s = (forte ? 100 : 10) - profundidade;
      if ((score.get(chave) ?? -Infinity) < s) score.set(chave, s);
    } catch {
      continue;
    }
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([url]) => url);
}

/** Compatibilidade: o melhor candidato (ou null). */
export function pickPricingLink(homeMarkdown: string, siteUrl: string): string | null {
  return pickPricingCandidates(homeMarkdown, siteUrl)[0] ?? null;
}

const SYSTEM =
  "Você lê a PÁGINA DE PREÇOS/PLANOS de uma empresa e extrai a estrutura comercial. " +
  "REGRAS DE HONESTIDADE (invioláveis): (1) preco = valor LITERAL como está na página (ex.: 'R$ 499/mês', 'US$ 99'), SÓ se o número estiver visível; NUNCA invente ou estime; " +
  "(2) se a página oferece só 'fale com vendas'/'solicite uma proposta'/'sob consulta' (sem números), use sob_consulta:true e planos com preco:null; " +
  "(3) features = até 5 por plano, LITERAIS da página; (4) resumo = 1-2 frases do que a página realmente mostra (sem opinar). " +
  'Responda SÓ JSON: {"sob_consulta":true|false,"planos":[{"plano":"...","preco":"R$ ..."|null,"periodicidade":"mensal"|"anual"|null,"features":["..."]}],"resumo":"..."}';

type RawPlano = { plano?: unknown; preco?: unknown; periodicidade?: unknown; features?: unknown };

function temNumero(s: string): boolean {
  return /\d/.test(s);
}

/** Lê UMA candidata a página de preço e extrai a estrutura (validada em código). */
async function lerPaginaDePreco(name: string, pricingUrl: string, now: string): Promise<BlocoPreco> {
  let pageMd = "";
  try {
    pageMd = (await scrape(pricingUrl, { onlyMainContent: true })).markdown.slice(0, PAGE_CHARS);
  } catch {
    return { ...precoNaoEncontrado(now), fonte_url: pricingUrl, resumo: "página de preço inacessível nesta varredura" };
  }
  if (!pageMd.trim()) {
    return { ...precoNaoEncontrado(now), fonte_url: pricingUrl, resumo: "página de preço veio vazia nesta varredura" };
  }

  let parsed: { sob_consulta?: unknown; planos?: RawPlano[]; resumo?: unknown } = {};
  try {
    const content = await completeViaGateway({
      system: SYSTEM,
      prompt: `EMPRESA: ${name}\nPÁGINA DE PREÇOS: ${pricingUrl}\n\n${pageMd}\n\nExtraia a estrutura de preços, honesto.`,
    });
    const m = content.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  } catch {
    parsed = {};
  }

  const planos: PlanoPreco[] = [];
  for (const raw of Array.isArray(parsed.planos) ? parsed.planos : []) {
    const plano = typeof raw.plano === "string" ? raw.plano.trim() : "";
    if (!plano) continue;
    const precoRaw = typeof raw.preco === "string" ? raw.preco.trim() : null;
    planos.push({
      plano,
      // preço sem dígito não é preço — vira null (honesto)
      preco: precoRaw && temNumero(precoRaw) ? precoRaw : null,
      periodicidade: typeof raw.periodicidade === "string" ? raw.periodicidade : null,
      features: Array.isArray(raw.features)
        ? raw.features.filter((f): f is string => typeof f === "string").slice(0, 5)
        : [],
      fonte_url: pricingUrl,
      data_coleta: now,
    });
  }

  const temPrecoReal = planos.some((p) => p.preco);
  const resumo = typeof parsed.resumo === "string" ? parsed.resumo.slice(0, 300) : null;

  return {
    status: temPrecoReal ? "encontrado" : "sob_consulta",
    planos: planos.slice(0, 8),
    resumo,
    fonte_url: pricingUrl,
    data_coleta: now,
    tipo: "fato",
  };
}

export async function runLentePreco(name: string, siteUrl: string): Promise<BlocoPreco> {
  const now = new Date().toISOString();

  // 1. descobre candidatas pelos links da home (ranqueadas)
  let homeMd = "";
  try {
    homeMd = (await scrape(siteUrl, { onlyMainContent: false })).markdown;
  } catch {
    return { ...precoNaoEncontrado(now), resumo: "home inacessível nesta varredura" };
  }
  const candidatas = pickPricingCandidates(homeMd, siteUrl).slice(0, 2);
  if (candidatas.length === 0) return precoNaoEncontrado(now); // sem página pública de preço

  // 2. tenta as melhores candidatas; a primeira com PREÇO REAL ganha
  let melhor: BlocoPreco | null = null;
  for (const url of candidatas) {
    const bloco = await lerPaginaDePreco(name, url, now);
    if (bloco.status === "encontrado") return bloco;
    if (!melhor || (melhor.status === "nao_encontrado" && bloco.status === "sob_consulta")) melhor = bloco;
  }
  return melhor ?? precoNaoEncontrado(now);
}
