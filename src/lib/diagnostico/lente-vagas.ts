/**
 * C2 — COLETOR DE VAGAS. Contratação é sinal de expansão/roadmap: para onde o
 * concorrente cresce (nova área = novo produto/mercado provável). Acha a página
 * de carreiras PELOS LINKS da home (inclui ATS externo: gupy/greenhouse/lever),
 * lê e extrai {total, áreas, exemplos}.
 *
 * HONESTIDADE: total só se explícito; áreas/vagas só as REAIS da página; ATS
 * JS-pesado que não expõe dado → nao_encontrado com observacao. Nunca inventa vaga.
 */

import { scrape } from "@/lib/firecrawl";
import { completeViaGateway } from "@/lib/gateway";
import { vagasNaoEncontrado, type BlocoVagas, type VagaItem } from "@/lib/diagnostico/schema";

const CAREERS_RE = /(careers?|carreiras?|vagas|trabalhe|jobs|join-us|work-with-us|oportunidades|nossas-vagas|talent)/i;
const ATS_RE = /(gupy\.io|greenhouse\.io|lever\.co|workable\.com|kenoby|solides|abler|recrut)/i;
const PAGE_CHARS = 4000;

function acharCareers(homeMd: string, links: string[], siteUrl: string): string | null {
  let host = "";
  try {
    host = new URL(siteUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  // 1. link de ATS externo (carreiras terceirizadas) — prioridade
  const ats = links.find((l) => ATS_RE.test(l));
  if (ats) return ats;
  // 2. link interno de carreiras (href OU âncora no markdown)
  const interno = links.find((l) => {
    try {
      return new URL(l).hostname.replace(/^www\./, "") === host && CAREERS_RE.test(l);
    } catch {
      return false;
    }
  });
  if (interno) return interno;
  // 3. âncora textual no markdown (ex.: "[Trabalhe conosco](/x)")
  const m = homeMd.match(/\[([^\]]*(?:carreira|vaga|trabalhe|career|job)[^\]]*)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/i);
  if (m) {
    try {
      return new URL(m[2], siteUrl).toString();
    } catch {
      return null;
    }
  }
  return null;
}

const SYSTEM =
  "Você lê a PÁGINA DE CARREIRAS/VAGAS de uma empresa e extrai o estado de contratação. " +
  "REGRAS DE HONESTIDADE (invioláveis): (1) total = número de vagas SÓ se explícito na página; senão null; " +
  "(2) areas = áreas/departamentos que aparecem nas vagas (ex.: Engenharia, Vendas, Produto), máx 8, SÓ as reais; " +
  "(3) exemplos = até 6 títulos de vaga REAIS da página, com a área quando der; " +
  "(4) se a página não lista vagas (vazia, só formulário, ATS que não renderizou), use encontrou:false. " +
  'Responda SÓ JSON: {"encontrou":true|false,"total":12|null,"areas":["..."],"exemplos":[{"titulo":"...","area":"..."|null}]}';

type Raw = { encontrou?: unknown; total?: unknown; areas?: unknown; exemplos?: unknown };

export async function runLenteVagas(name: string, siteUrl: string): Promise<BlocoVagas> {
  const now = new Date().toISOString();

  let homeMd = "";
  let links: string[] = [];
  try {
    const home = await scrape(siteUrl, { formats: ["markdown", "links"], onlyMainContent: false });
    homeMd = home.markdown;
    links = home.links ?? [];
  } catch {
    return vagasNaoEncontrado(now, "home inacessível nesta varredura");
  }

  const careersUrl = acharCareers(homeMd, links, siteUrl);
  if (!careersUrl) return vagasNaoEncontrado(now, "sem página de carreiras/vagas encontrada no site");

  let md = "";
  try {
    md = (await scrape(careersUrl, { waitFor: 3000, onlyMainContent: true })).markdown.slice(0, PAGE_CHARS);
  } catch {
    md = "";
  }
  if (!md.trim()) return { ...vagasNaoEncontrado(now, "página de vagas não expôs conteúdo (ATS JS-pesado?)"), fonte_url: careersUrl };

  let raw: Raw = {};
  try {
    const content = await completeViaGateway({ system: SYSTEM, prompt: `EMPRESA: ${name}\nPÁGINA DE VAGAS: ${careersUrl}\n\n${md}\n\nExtraia o estado de contratação, honesto.` });
    const m = content.match(/\{[\s\S]*\}/);
    if (m) raw = JSON.parse(m[0]) as Raw;
  } catch {
    raw = {};
  }

  const areas = Array.isArray(raw.areas) ? raw.areas.filter((a): a is string => typeof a === "string").map((a) => a.trim()).filter(Boolean).slice(0, 8) : [];
  const exemplos: VagaItem[] = Array.isArray(raw.exemplos)
    ? raw.exemplos
        .map((e) => {
          const o = e as Record<string, unknown>;
          const titulo = typeof o?.titulo === "string" ? o.titulo.trim() : "";
          return titulo ? { titulo, area: typeof o?.area === "string" && o.area.trim() ? o.area.trim() : null } : null;
        })
        .filter((x): x is VagaItem => Boolean(x))
        .slice(0, 6)
    : [];
  const totalRaw = Number(raw.total);
  const total = Number.isInteger(totalRaw) && totalRaw >= 0 ? totalRaw : null;

  const meaningful = raw.encontrou === true && (areas.length > 0 || exemplos.length > 0 || total !== null);
  if (!meaningful) return { ...vagasNaoEncontrado(now, "página lida, mas sem vagas claras desta empresa"), fonte_url: careersUrl };

  return { status: "encontrado", total, areas, exemplos, fonte_url: careersUrl, data_coleta: now, observacao: total === null ? "total não explícito na página" : null };
}
