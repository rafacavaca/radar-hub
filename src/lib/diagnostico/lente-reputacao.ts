/**
 * F1c — LENTE DE REVIEWS/REPUTAÇÃO. Fontes públicas: Reclame Aqui, Google,
 * G2, Capterra. Acha a página da empresa por BUSCA (site:fonte + nome),
 * valida o match pelo nome, lê e extrai: nota média (FATO, na escala da
 * fonte), nº de avaliações (FATO) e temas de elogio/reclamação (DERIVADOS —
 * interpretação sobre textos reais, com citações como evidência).
 *
 * REALIDADE TÉCNICA (honesta): Reclame Aqui costuma ser alcançável; G2 e
 * Capterra são anti-scrape pesado; Google reviews não tem página estável
 * scrapeável. O que não alcançar vira status "nao_coletado" com o porquê —
 * NUNCA nota/review inventada, NUNCA fingir cobertura.
 */

import { scrape, searchWeb } from "@/lib/firecrawl";
import { completeViaGateway } from "@/lib/gateway";
import {
  reviewNaoColetado,
  type BlocoReputacao,
  type FonteReview,
  type ReviewFonte,
} from "@/lib/diagnostico/schema";

const PAGE_CHARS = 3500;

const FONTES: Array<{ fonte: FonteReview; dominio: string; escala: string }> = [
  { fonte: "reclame_aqui", dominio: "reclameaqui.com.br", escala: "0-10" },
  { fonte: "g2", dominio: "g2.com", escala: "0-5" },
  { fonte: "capterra", dominio: "capterra.com", escala: "0-5" },
];

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** O resultado da busca é mesmo desta empresa? (nome no título/URL). */
function bateNome(hit: { url: string; title: string }, name: string): boolean {
  const alvo = norm(name);
  return norm(hit.title).includes(alvo) || norm(decodeURIComponent(hit.url)).replace(/[/-]/g, " ").includes(alvo);
}

async function acharPagina(fonte: { dominio: string }, name: string): Promise<string | null> {
  try {
    const hits = await searchWeb(`site:${fonte.dominio} ${name}`, 4);
    const hit = hits.find((h) => h.url.includes(fonte.dominio) && bateNome(h, name));
    return hit?.url ?? null;
  } catch {
    return null;
  }
}

const SYSTEM =
  "Você lê a página de REVIEWS de uma empresa numa fonte pública (Reclame Aqui, G2 ou Capterra) e extrai a reputação. " +
  "REGRAS DE HONESTIDADE (invioláveis): (1) nota = número SÓ se estiver EXPLÍCITO na página, na escala da própria fonte — NUNCA estime; " +
  "(2) n_avaliacoes = número só se explícito; (3) temas_elogio/temas_reclamacao = padrões que aparecem em TEXTOS DE REVIEW presentes na página (máx 4 cada, curtos); " +
  "(4) citacoes = até 3 trechos LITERAIS de reviews que evidenciam os temas; se não há textos de review visíveis, temas e citacoes ficam vazios; " +
  "(5) se a página não mostra reviews desta empresa (bloqueio, login, página errada), use coletado:false; " +
  "(6) HOMÔNIMOS: confira que a página é da empresa CERTA (segmento/descrição/site coerentes com o site informado) — nome igual de outra empresa/país/segmento ⇒ coletado:false; " +
  "(7) página de empresa SEM NENHUMA avaliação (0 reviews) ⇒ coletado:false — '0.0' de quem nunca foi avaliado NÃO é nota. " +
  'Responda SÓ JSON: {"coletado":true|false,"nota":7.8|null,"n_avaliacoes":123|null,"temas_elogio":[],"temas_reclamacao":[],"citacoes":[]}';

type RawReview = {
  coletado?: unknown;
  nota?: unknown;
  n_avaliacoes?: unknown;
  temas_elogio?: unknown;
  temas_reclamacao?: unknown;
  citacoes?: unknown;
};

function strArr(v: unknown, max: number): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").map((s) => s.trim()).filter(Boolean).slice(0, max) : [];
}

async function coletarFonte(
  def: { fonte: FonteReview; dominio: string; escala: string },
  name: string,
  siteUrl: string,
  now: string,
): Promise<ReviewFonte> {
  const url = await acharPagina(def, name);
  if (!url) {
    return reviewNaoColetado(def.fonte, now, `nenhuma página de "${name}" achada em ${def.dominio}`);
  }

  let md = "";
  try {
    md = (await scrape(url, { onlyMainContent: true, waitFor: 4000 })).markdown.slice(0, PAGE_CHARS);
  } catch {
    md = "";
  }
  if (!md.trim()) {
    return { ...reviewNaoColetado(def.fonte, now, `página achada mas bloqueada/vazia (anti-scrape)`), fonte_url: url };
  }

  let parsed: RawReview = {};
  try {
    const content = await completeViaGateway({
      system: SYSTEM,
      prompt: `EMPRESA: ${name} (site oficial: ${siteUrl})\nFONTE: ${def.dominio} (escala ${def.escala})\nPÁGINA: ${url}\n\n${md}\n\nExtraia a reputação, honesto.`,
    });
    const m = content.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]) as RawReview;
  } catch {
    parsed = {};
  }

  const notaRaw = Number(parsed.nota);
  const nota = Number.isFinite(notaRaw) && notaRaw >= 0 && notaRaw <= 10 ? notaRaw : null;
  const nRaw = Number(parsed.n_avaliacoes);
  const n = Number.isInteger(nRaw) && nRaw >= 0 ? nRaw : null;
  const temasElogio = strArr(parsed.temas_elogio, 4);
  const temasReclamacao = strArr(parsed.temas_reclamacao, 4);
  const citacoes = strArr(parsed.citacoes, 3).map((c) => c.slice(0, 200));

  // honesto: temas sem NENHUMA citação de evidência não ficam (interpretação sem lastro)
  const temEvidencia = citacoes.length > 0;
  // nota só VALE lastreada em avaliações reais: 0.0 de página nunca avaliada
  // (ou homônima sem reviews) não é reputação — é ausência de dado.
  const notaValida = nota !== null && ((n !== null && n >= 1) || temEvidencia);
  const coletado = parsed.coletado === true && (notaValida || (n !== null && n >= 1) || temEvidencia);
  if (!coletado) {
    return {
      ...reviewNaoColetado(def.fonte, now, "página lida mas sem avaliações reais desta empresa (vazia ou homônima)"),
      fonte_url: url,
    };
  }

  return {
    fonte: def.fonte,
    status: "coletado",
    nota: notaValida ? nota : null,
    escala: def.escala,
    n_avaliacoes: n,
    temas_elogio: temEvidencia ? temasElogio : [],
    temas_reclamacao: temEvidencia ? temasReclamacao : [],
    citacoes,
    fonte_url: url,
    data_coleta: now,
    observacao: !temEvidencia && (temasElogio.length || temasReclamacao.length) ? "temas descartados: sem citação de evidência" : null,
  };
}

export async function runLenteReputacao(name: string, siteUrl: string): Promise<BlocoReputacao> {
  const now = new Date().toISOString();

  // RA/G2/Capterra em paralelo; Google marcado honesto (sem página scrapeável estável)
  const coletadas = await Promise.all(FONTES.map((f) => coletarFonte(f, name, siteUrl, now)));
  const google = reviewNaoColetado(
    "google",
    now,
    "Google reviews não tem página pública scrapeável estável (requer API paga) — pendente",
  );

  return { fontes: [...coletadas, google], data_coleta: now };
}
