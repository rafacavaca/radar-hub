/**
 * ANALISTA "VENDEDOR" (2º template — modo "carteira" / sales-enablement).
 *
 * Análogo ao cruzamento interno×externo, mas para uma DISTRIBUIDORA que vende
 * POR LINHA de produto a uma carteira de hospitais-clientes. Para cada SINAL
 * PÚBLICO de um hospital (notícia, novo serviço, investimento, vaga, mudança de
 * cobertura), o analista responde: qual LINHA de produto o sinal aciona, qual
 * GATILHO de compra, e qual ÂNGULO/objeção preparar — casando com a matriz
 * hospital↔linha e o modo de compra (do contexto do Brain).
 *
 * HONESTIDADE (no prompt e no código):
 *   - só gera item quando o sinal REALMENTE indica um gatilho plausível;
 *   - nunca inventa edital, número, valor ou capacidade;
 *   - a fonte é sempre a do evento real (eventIndex) — nunca inventada;
 *   - o HOSPITAL é derivado do próprio evento (não se confia no LLM pra isso).
 *
 * Campos são strings CURTAS -> JSON seguro. Parsing defensivo: malformado -> [].
 */

import { createHash } from "node:crypto";

import { completeViaGateway } from "@/lib/gateway";
import type { RawEvent, SalesReading } from "@/lib/types";

type RawEntry = {
  sinal?: unknown;
  linha?: unknown;
  gatilho?: unknown;
  angulo?: unknown;
  score?: unknown;
  eventIndex?: unknown;
};

function stableId(eventId: string, sinal: string): string {
  return createHash("sha1").update(`sales:${eventId}:${sinal}`).digest("hex").slice(0, 16);
}

function buildEventsBlock(events: RawEvent[]): string {
  return events
    .map((event, index) => {
      const n = index + 1;
      const body = event.description || event.excerpt || "(sem descrição)";
      return `${n}. [${event.competitorName}] ${event.title} — ${body}`;
    })
    .join("\n");
}

const SYSTEM =
  "Você é o ANALISTA VENDEDOR do Radar, a serviço de uma DISTRIBUIDORA que vende POR LINHA de produto para uma carteira de HOSPITAIS-CLIENTES. " +
  "Para cada SINAL PÚBLICO de um hospital (notícia, novo serviço/leitos, investimento, vaga, mudança de cobertura), diga se ele abre uma OPORTUNIDADE DE VENDA e mapeie: " +
  "'linha' (qual das LINHAS de produto do cliente o sinal aciona — use EXATAMENTE uma das linhas listadas no contexto), " +
  "'gatilho' (o gatilho de compra: por que isto é oportunidade AGORA — licitação/edital aberto, novo serviço/leitos, ampliação de hemodinâmica/ortopedia, vaga de cirurgião, mudança de cobertura/OPME…), " +
  "'angulo' (o ângulo de abordagem ou a objeção a preparar — ex.: registro ANVISA do dispositivo, cobertura do plano para a OPME, prazo/assistência técnica). " +
  "Use a MATRIZ hospital↔linha e o MODO DE COMPRA de cada hospital do contexto (licitação / relacionamento / operadora). " +
  "REGRAS DE HONESTIDADE (invioláveis): (1) só gere um item quando o sinal REALMENTE indica um gatilho de compra plausível — não force; " +
  "(2) NUNCA invente edital, número, valor, especialidade ou capacidade que não esteja no sinal ou na matriz; " +
  "(3) se o sinal não casa com nenhuma linha do cliente, IGNORE (não gere item); " +
  "(4) score 0-100 = valor/urgência da oportunidade pro vendedor; " +
  "(5) seja SELETIVO e CONCISO: gere NO MÁXIMO os 8 gatilhos mais valiosos. " +
  'Responda SÓ com um array JSON válido (campos CURTOS, uma frase cada), sem texto fora: ' +
  '[ { "sinal": "...", "linha": "...", "gatilho": "...", "angulo": "...", "score": 0, "eventIndex": 1 } ]. ' +
  "Se nenhum sinal abrir oportunidade, responda [].";

function buildPrompt(clientName: string, brainContext: string, events: RawEvent[]): string {
  return `CLIENTE (distribuidora): ${clientName}

CONTEXTO — LINHAS DE PRODUTO + CARTEIRA DE HOSPITAIS (a matriz; casa à risca):
${brainContext}

SINAIS PÚBLICOS RECENTES DOS HOSPITAIS (cada um marcado com [Hospital]):
${buildEventsBlock(events)}

TAREFA:
Para cada sinal que abra uma oportunidade de venda para ${clientName}, gere um item mapeando a LINHA, o GATILHO e o ÂNGULO — casando com a matriz e o modo de compra do hospital. Ignore sinais que não abrem oportunidade. Aplique as regras de honestidade à risca.`;
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
 * Lê os sinais dos hospitais pela lente "vendedor". Devolve 0..N leituras de
 * venda, ordenadas por score. Nunca lança por resposta malformada do LLM (-> []).
 */
export async function analyzeVendedor(
  allEvents: RawEvent[],
  clientName: string,
  brainContext: string,
): Promise<SalesReading[]> {
  if (allEvents.length === 0) return [];

  // CAP: como no cruzamento, muitos eventos estouram o teto de 40s do gateway.
  const events = allEvents.slice(0, 12);

  const content = await completeViaGateway({
    system: SYSTEM,
    prompt: buildPrompt(clientName, brainContext, events),
  });

  const entries = extractJsonArray(content);
  const createdAt = new Date().toISOString();
  const readings: SalesReading[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;

    const sinal = cleanString(entry.sinal);
    const linha = cleanString(entry.linha);
    const gatilho = cleanString(entry.gatilho);
    const angulo = cleanString(entry.angulo);
    if (!sinal || !linha || !gatilho || !angulo) continue;

    const eventIndex = Number(entry.eventIndex);
    if (!Number.isInteger(eventIndex) || eventIndex < 1 || eventIndex > events.length) continue;
    const event = events[eventIndex - 1];

    readings.push({
      id: stableId(event.id, sinal),
      clientName,
      sinal,
      hospital: event.competitorName, // derivado do evento — nunca do LLM
      linha,
      gatilho,
      angulo,
      score: clampScore(entry.score),
      fonte: { url: event.url, titulo: event.title },
      eventIds: [event.id],
      publishedAt: event.publishedAt,
      collectedAt: event.collectedAt,
      createdAt,
    });
  }

  readings.sort((a, b) => b.score - a.score);
  return readings;
}
