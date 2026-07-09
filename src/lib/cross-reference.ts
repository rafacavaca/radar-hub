/**
 * INTERNO × EXTERNO (F9) — o cruzamento que é a mina de ouro do Radar.
 *
 * Conecta o SENSOR EXTERNO (movimentos de concorrentes que o Radar coleta) com
 * o CÉREBRO INTERNO (o Brain do cliente: o que ele faz, tem, começou ou deixou
 * parado). Pra cada movimento externo relevante, dá um VEREDITO:
 *
 *   - ja_temos          → o mercado quer X e o cliente JÁ TEM (arma vendas/mkt);
 *   - meio_pronto        → o cliente COMEÇOU X e parou / tem parcial (o ouro:
 *                          reativar antes do concorrente consolidar);
 *   - gap               → o mercado quer X e o cliente NÃO tem (decidir se entra);
 *   - sem_dado_interno   → o Brain NÃO diz nada sobre a capacidade interna nisto
 *                          (HONESTO — não chuta; sugere enriquecer o Brain).
 *
 * HONESTIDADE (a regra que torna isto confiável, no prompt e no código):
 *   - ja_temos / meio_pronto SÓ com evidência no Brain; na dúvida -> sem_dado_interno;
 *   - nunca inventa feature, roadmap ou projeto interno;
 *   - fontes mapeadas do evento real (eventIndex) — nunca inventadas.
 *
 * Campos são strings CURTAS -> JSON seguro (sem o problema de markdown-em-JSON
 * dos relatórios). Parsing defensivo: resposta malformada -> [] (não derruba).
 */

import { createHash } from "node:crypto";

import { completeViaGateway } from "@/lib/gateway";
import type { Fonte, RawEvent } from "@/lib/types";

export type CrossVerdict = "ja_temos" | "meio_pronto" | "gap" | "sem_dado_interno";

export type CrossInsight = {
  id: string;
  clientName: string;
  /** o movimento externo (1 frase, citando o concorrente). */
  sinal: string;
  /** o que o mercado/concorrente está fazendo (a demanda externa). */
  externo: string;
  /** o que se sabe do cliente por dentro — ou o reconhecimento honesto de que não se sabe. */
  interno: string;
  verdict: CrossVerdict;
  /** a oportunidade/ação recomendada dado o veredito. */
  oportunidade: string;
  /** impacto pro cliente (0-100). */
  score: number;
  fonte: Fonte;
  concorrente?: string;
  eventIds: string[];
  publishedAt?: string | null;
  collectedAt?: string;
  createdAt: string;
};

const VERDICTS: readonly string[] = ["ja_temos", "meio_pronto", "gap", "sem_dado_interno"];

type RawEntry = {
  sinal?: unknown;
  externo?: unknown;
  interno?: unknown;
  verdict?: unknown;
  oportunidade?: unknown;
  score?: unknown;
  eventIndex?: unknown;
};

function stableId(eventId: string, sinal: string): string {
  return createHash("sha1").update(`cross:${eventId}:${sinal}`).digest("hex").slice(0, 16);
}

/** Corpo curto — descrições longas somadas estouram o teto de 40s do gateway. */
function shortBody(event: RawEvent): string {
  return (event.description || event.excerpt || "(sem descrição)").replace(/\s+/g, " ").trim().slice(0, 160);
}

/** Mais recente primeiro (publicação, senão coleta). */
function byRecencyDesc(a: RawEvent, b: RawEvent): number {
  return (b.publishedAt || b.collectedAt || "").localeCompare(a.publishedAt || a.collectedAt || "");
}

function buildEventsBlock(events: RawEvent[]): string {
  return events
    .map((event, index) => `${index + 1}. [${event.competitorName}] ${event.title} — ${shortBody(event)}`)
    .join("\n");
}

const SYSTEM =
  "Você é o ANALISTA DE CRUZAMENTO INTERNO×EXTERNO do Radar — a análise mais valiosa da inteligência de mercado B2B. " +
  "Seu trabalho: cruzar cada MOVIMENTO EXTERNO (o que concorrentes/mercado fazem) com o CONHECIMENTO INTERNO do cliente (o que ele faz, tem, começou ou deixou parado, segundo o Brain). " +
  "Para cada movimento externo que tenha relação com uma capacidade/produto do cliente, dê um veredito: " +
  "'ja_temos' (o cliente JÁ tem essa capacidade — arma vendas/marketing), " +
  "'meio_pronto' (o Brain indica que o cliente COMEÇOU algo parecido e parou, ou tem parcial — reativar), " +
  "'gap' (o mercado quer isso e o cliente NÃO tem — avaliar entrar), " +
  "'sem_dado_interno' (o Brain NÃO diz nada sobre a capacidade interna do cliente neste tema). " +
  "REGRAS DE HONESTIDADE (invioláveis): (1) 'ja_temos' e 'meio_pronto' SÓ com evidência EXPLÍCITA no Brain — se o Brain é silencioso sobre o que o cliente tem/faz por dentro neste tema, o veredito é OBRIGATORIAMENTE 'sem_dado_interno'; " +
  "(2) NUNCA invente feature, roadmap, projeto parado ou capacidade — na dúvida, 'sem_dado_interno'; " +
  "(3) no campo 'interno', se for sem_dado_interno, escreva algo como 'O Brain não registra o que a <cliente> tem internamente sobre isto'. " +
  "(4) score 0-100 = valor da oportunidade pro cliente; " +
  "(5) seja SELETIVO e CONCISO: gere NO MÁXIMO os 8 cruzamentos mais valiosos (o motor tem tempo limitado). " +
  'Responda SÓ com um array JSON válido (campos CURTOS, uma frase cada), sem texto fora: ' +
  '[ { "sinal": "...", "externo": "...", "interno": "...", "verdict": "gap", "oportunidade": "...", "score": 0, "eventIndex": 1 } ]. ' +
  "Se nenhum movimento se cruzar com o cliente, responda [].";

function buildPrompt(clientName: string, brainContext: string, events: RawEvent[]): string {
  return `CLIENTE: ${clientName}

CONHECIMENTO INTERNO DO CLIENTE (o Brain — o que ele faz/tem; se algo não está aqui, o Brain É SILENCIOSO sobre isso):
${brainContext}

MOVIMENTOS EXTERNOS RECENTES (concorrentes):
${buildEventsBlock(events)}

TAREFA:
Cruze cada movimento externo com o conhecimento interno do cliente ${clientName}. Gere um insight só para os que se cruzam de verdade. Aplique os vereditos e as regras de honestidade à risca — se o Brain não fala da capacidade interna, é 'sem_dado_interno'.`;
}

function extractJsonArray(content: string): RawEntry[] {
  try {
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? (parsed as RawEntry[]) : [];
  } catch {
    return [];
  }
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Cruza os movimentos externos com o Brain do cliente. Devolve 0..N insights.
 * Nunca lança por resposta malformada do LLM (-> []).
 */
export async function crossReference(
  allEvents: RawEvent[],
  clientName: string,
  brainContext: string,
): Promise<CrossInsight[]> {
  if (allEvents.length === 0) return [];

  // CAP: cruzamento com muitos eventos estoura o teto de 40s do gateway
  // (geração longa). Os 12 movimentos MAIS RECENTES bastam pros cruzamentos do dia.
  const events = [...allEvents].sort(byRecencyDesc).slice(0, 12);

  const content = await completeViaGateway({
    system: SYSTEM,
    prompt: buildPrompt(clientName, brainContext, events),
  });

  const entries = extractJsonArray(content);
  const createdAt = new Date().toISOString();
  const insights: CrossInsight[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;

    const sinal = cleanString(entry.sinal);
    const externo = cleanString(entry.externo);
    const interno = cleanString(entry.interno);
    const oportunidade = cleanString(entry.oportunidade);
    const verdict = cleanString(entry.verdict) as CrossVerdict;
    if (!sinal || !externo || !interno || !oportunidade) continue;
    if (!VERDICTS.includes(verdict)) continue;

    const eventIndex = Number(entry.eventIndex);
    if (!Number.isInteger(eventIndex) || eventIndex < 1 || eventIndex > events.length) continue;
    const event = events[eventIndex - 1];

    insights.push({
      id: stableId(event.id, sinal),
      clientName,
      sinal,
      externo,
      interno,
      verdict,
      oportunidade,
      score: clampScore(entry.score),
      fonte: { url: event.url, titulo: event.title },
      concorrente: event.competitorName,
      eventIds: [event.id],
      publishedAt: event.publishedAt,
      collectedAt: event.collectedAt,
      createdAt,
    });
  }

  // Ordena: prioriza o veredito acionável (meio_pronto/gap/ja_temos) e o score.
  const rank: Record<CrossVerdict, number> = {
    meio_pronto: 3,
    gap: 2,
    ja_temos: 1,
    sem_dado_interno: 0,
  };
  insights.sort((a, b) => rank[b.verdict] - rank[a.verdict] || b.score - a.score);
  return insights;
}
