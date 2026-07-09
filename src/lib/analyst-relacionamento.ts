/**
 * ANALISTA DE RELACIONAMENTO (pilar Clientes) — o motor de correlação da conta.
 *
 * Irmão do cruzamento interno×externo e do vendedor, mas com uma REGRA PRÓPRIA:
 * a OFERTA É CLASSIFICAÇÃO, NÃO PORTÃO. Para cada sinal PÚBLICO de uma CONTA-CHAVE
 * (o cliente/prospect grande do cliente do Radar), o analista acha o GATILHO (a
 * necessidade nova) e classifica o ENCAIXE com a oferta da empresa:
 *
 *   - direto     → a empresa TEM oferta que atende → jogada pronta (nomeia a oferta em brainRef);
 *   - adjacente  → tem algo PERTO (esticar) OU há dúvida ("possível encaixe — confirmar no Brain");
 *   - brecha     → white space: ninguém atende ainda → OPORTUNIDADE ESTRATÉGICA (munição p/ produto/liderança).
 *
 * NUNCA descarta um sinal que revela um gatilho real — todos caem num dos três.
 * O único filtro é "sinal sem NENHUM gatilho de negócio" (ruído puro) → não vira item.
 *
 * HONESTIDADE (no prompt e reforçada no código):
 *   - nunca inventa oferta/feature: brainRef só do contexto de oferta; na dúvida, adjacente;
 *   - "não crava 'não tem'": ausência de oferta vira brecha/adjacente, nunca um descarte;
 *   - a CONTA e a FONTE vêm do evento real (nunca do LLM);
 *   - direto SEM oferta nomeada é rebaixado a adjacente (encaixe forte exige âncora);
 *   - brecha SEMPRE tem brainRef vazio (não há oferta que ancore).
 *
 * Campos são strings CURTAS -> JSON seguro. Parsing defensivo: malformado -> [].
 */

import { createHash } from "node:crypto";

import { completeViaGateway } from "@/lib/gateway";
import type { Encaixe, Fonte, RawEvent, RelationshipPlay } from "@/lib/types";

const ENCAIXES: readonly string[] = ["direto", "adjacente", "brecha"];

type RawEntry = {
  sinal?: unknown;
  gatilho?: unknown;
  encaixe?: unknown;
  justificativa?: unknown;
  acao?: unknown;
  brainRef?: unknown;
  score?: unknown;
  eventIndex?: unknown;
  /** F2: um concorrente mirando a mesma brecha + qual (índice no bloco de concorrentes). */
  urgencia?: unknown;
  competitorIndex?: unknown;
  /** F2/F4: tendência de mercado que reforça + qual sinal de mercado a ancora (índice). */
  reforco?: unknown;
  reforcoIndex?: unknown;
};

function stableId(eventId: string, sinal: string): string {
  return createHash("sha1").update(`rel:${eventId}:${sinal}`).digest("hex").slice(0, 16);
}

/** Corpo curto pro prompt — descrições longas estouram o teto de tempo do gateway. */
function shortBody(event: RawEvent): string {
  return (event.description || event.excerpt || "(sem descrição)").replace(/\s+/g, " ").trim().slice(0, 160);
}

/** Mais recente primeiro (publicação, senão coleta) — analisamos os sinais frescos. */
function byRecencyDesc(a: RawEvent, b: RawEvent): number {
  return (b.publishedAt || b.collectedAt || "").localeCompare(a.publishedAt || a.collectedAt || "");
}

function buildEventsBlock(events: RawEvent[]): string {
  return events
    .map((event, index) => `${index + 1}. [${event.competitorName}] ${event.title} — ${shortBody(event)}`)
    .join("\n");
}

const SYSTEM =
  "Você é o ANALISTA DE RELACIONAMENTO do Radar, a serviço de uma EMPRESA B2B que quer cuidar de suas CONTAS-CHAVE (clientes e prospects grandes — NÃO são concorrentes). " +
  "Para cada SINAL PÚBLICO de uma conta (expansão, nova planta, exportação, investimento/captação, aquisição/fusão, vagas, novo produto/mercado, troca de gestão…), você faz DUAS coisas: " +
  "(A) identifica o GATILHO — a necessidade NOVA que o sinal revela pra conta; " +
  "(B) classifica o ENCAIXE dessa necessidade com a OFERTA DA EMPRESA (que vem no contexto), em um de TRÊS: " +
  "'direto' (a empresa TEM oferta que atende — nomeie a oferta no campo brainRef e proponha a jogada em acao), " +
  "'adjacente' (a empresa tem algo PERTO, dá pra esticar — OU você NÃO tem certeza se a oferta cobre isto: então diga 'possível encaixe — confirmar no Brain' e sugira confirmar), " +
  "'brecha' (o gatilho é um WHITE SPACE: a oferta descrita NÃO atende isto hoje — trate como OPORTUNIDADE ESTRATÉGICA, munição pra produto/liderança; brainRef VAZIO). " +
  "REGRA DE OURO — A OFERTA CLASSIFICA, NÃO FILTRA: NUNCA descarte um sinal que revela um gatilho real; ele SEMPRE vira um item, num dos três encaixes. " +
  "NUNCA escreva que 'a empresa não tem' como motivo pra jogar fora — falta de oferta é 'brecha' (ou 'adjacente' na dúvida), nunca um descarte. " +
  "HONESTIDADE (invioláveis): (1) brainRef só pode citar oferta que ESTEJA no contexto — nunca invente feature/produto; " +
  "(2) na dúvida entre direto e adjacente, escolha adjacente; entre adjacente e brecha, prefira adjacente se houver QUALQUER conexão plausível (o contexto de oferta pode estar incompleto); " +
  "(3) só NÃO gere item se o sinal não tiver NENHUM gatilho de negócio (ruído puro: nota social interna, efeméride); " +
  "(4) score 0-100 = valor/urgência da jogada (ou valor estratégico, se brecha). " +
  "INGREDIENTES EXTRA (some quando houver EVIDÊNCIA; senão OMITA — campo vazio): " +
  "(URGÊNCIA/concorrente) se algum MOVIMENTO DE CONCORRENTE da lista mira a MESMA necessidade da conta, preencha 'urgencia' (por que agir ANTES que o concorrente chegue) e 'competitorIndex' com o número do movimento que te alimentou; a 'acao' deve refletir esse 'aja antes'. Se nenhum concorrente se relaciona, deixe 'urgencia' vazio e NÃO invente. " +
  "(REFORÇO/mercado) se algum SINAL DE MERCADO da lista (ou o contexto/Brain) evidenciar uma TENDÊNCIA de setor que valida a jogada, preencha 'reforco' (a tendência em 1 frase) e, quando vier de um sinal de mercado, 'reforcoIndex' com o número dele; se não houver evidência, deixe vazio — NUNCA invente tendência, número ou estatística. " +
  "Seja SELETIVO e TELEGRÁFICO: no MÁXIMO 6 itens; cada campo é UMA frase curta (máx. ~20 palavras) — nada de parágrafos (a resposta tem tempo limitado). " +
  'Responda SÓ com um array JSON válido (campos CURTOS, uma frase cada), sem texto fora: ' +
  '[ { "sinal": "...", "gatilho": "...", "encaixe": "direto|adjacente|brecha", "justificativa": "...", "acao": "...", "brainRef": "...", "urgencia": "...", "competitorIndex": 0, "reforco": "...", "reforcoIndex": 0, "score": 0, "eventIndex": 1 } ]. ' +
  "Se NENHUM sinal tiver gatilho de negócio, responda [].";

/** Bloco indexado de movimentos de concorrentes (a URGÊNCIA cita pelo índice). */
function buildCompetitorBlock(competitorEvents: RawEvent[]): string {
  if (competitorEvents.length === 0) {
    return "(Nenhum movimento de concorrente disponível nesta rodada — então NÃO haverá urgência de concorrente: deixe 'urgencia' vazio.)";
  }
  return competitorEvents
    .map((event, index) => `${index + 1}. [${event.competitorName}] ${event.title} — ${shortBody(event)}`)
    .join("\n");
}

/** Bloco indexado de sinais de MERCADO (o REFORÇO cita pelo índice). */
function buildMarketBlock(marketEvents: RawEvent[]): string {
  if (marketEvents.length === 0) {
    return "(Nenhum sinal de mercado coletado — o reforço, se houver, é derivado do contexto/Brain, SEM fonte de mercado.)";
  }
  return marketEvents
    .map((event, index) => `${index + 1}. ${event.title}${event.description ? ` — ${shortBody(event)}` : ""}`)
    .join("\n");
}

function buildPrompt(
  clientName: string,
  offerContext: string,
  events: RawEvent[],
  competitorEvents: RawEvent[],
  marketEvents: RawEvent[],
): string {
  return `EMPRESA (dona das contas-chave): ${clientName}

A OFERTA DA EMPRESA (o que ${clientName} tem pra oferecer — a base do encaixe; se algo NÃO está aqui, o contexto é silencioso sobre isso — pode ser brecha OU o contexto estar incompleto):
${offerContext}

SINAIS PÚBLICOS RECENTES DAS CONTAS-CHAVE (cada um marcado com [Conta]):
${buildEventsBlock(events)}

MOVIMENTOS RECENTES DE CONCORRENTES DE ${clientName} (para a URGÊNCIA — 'competitorIndex' refere-se a esta lista):
${buildCompetitorBlock(competitorEvents)}

SINAIS DE MERCADO/SETOR (para o REFORÇO — 'reforcoIndex' refere-se a esta lista):
${buildMarketBlock(marketEvents)}

TAREFA:
Para cada sinal de CONTA que revele um gatilho de negócio, gere UM item: ache o GATILHO e classifique o ENCAIXE com a oferta de ${clientName} (direto/adjacente/brecha). Lembre: a oferta CLASSIFICA, não descarta — todo gatilho real vira item. Some URGÊNCIA (concorrente) e REFORÇO (mercado) SÓ quando houver evidência acima. Aplique as regras de honestidade à risca.`;
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

/** Prioriza o encaixe acionável agora (direto) e depois o score, sem perder as brechas. */
const ENCAIXE_RANK: Record<Encaixe, number> = { direto: 3, adjacente: 2, brecha: 1 };

/** Ordena jogadas por encaixe (direto→adjacente→brecha) e depois por score. Puro. */
export function sortRelationshipPlays(plays: RelationshipPlay[]): RelationshipPlay[] {
  return [...plays].sort(
    (a, b) => ENCAIXE_RANK[b.encaixe] - ENCAIXE_RANK[a.encaixe] || b.score - a.score,
  );
}

/**
 * Lê os sinais das contas-chave pela lente de relacionamento. Devolve 0..N
 * jogadas — SEMPRE registrando (nunca filtra por falta de oferta). Ordenadas por
 * encaixe e score. Nunca lança por resposta malformada do LLM (-> []).
 */
export async function analyzeRelacionamento(
  allEvents: RawEvent[],
  clientName: string,
  offerContext: string,
  competitorEvents: RawEvent[] = [],
  marketEvents: RawEvent[] = [],
): Promise<RelationshipPlay[]> {
  if (allEvents.length === 0) return [];

  // CAP: geração longa estoura o teto de 40s do gateway. Analisamos os sinais
  // MAIS RECENTES (poucos e frescos > muitos e mornos) e um punhado de concorrentes/mercado.
  const events = [...allEvents].sort(byRecencyDesc).slice(0, 8);
  const competitors = [...competitorEvents].sort(byRecencyDesc).slice(0, 6);
  const markets = [...marketEvents].sort(byRecencyDesc).slice(0, 4);

  const content = await completeViaGateway({
    system: SYSTEM,
    prompt: buildPrompt(clientName, offerContext, events, competitors, markets),
  });

  const entries = extractJsonArray(content);
  const createdAt = new Date().toISOString();
  const plays: RelationshipPlay[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;

    const sinal = cleanString(entry.sinal);
    const gatilho = cleanString(entry.gatilho);
    const justificativa = cleanString(entry.justificativa);
    const acao = cleanString(entry.acao);
    let encaixe = cleanString(entry.encaixe) as Encaixe;
    if (!sinal || !gatilho || !justificativa || !acao) continue;
    if (!ENCAIXES.includes(encaixe)) continue;

    const eventIndex = Number(entry.eventIndex);
    if (!Number.isInteger(eventIndex) || eventIndex < 1 || eventIndex > events.length) continue;
    const event = events[eventIndex - 1];

    // Honestidade reforçada no código:
    //  - brecha nunca ancora numa oferta (brainRef vazio por construção);
    //  - direto SEM oferta nomeada é rebaixado a adjacente (encaixe forte exige âncora).
    let brainRef = cleanString(entry.brainRef);
    if (encaixe === "brecha") {
      brainRef = "";
    } else if (!brainRef) {
      encaixe = "adjacente";
    }

    // F2 — URGÊNCIA (concorrente): só sobrevive ancorada num sinal REAL de
    // concorrente (competitorIndex válido); urgência sem fonte é descartada.
    const urgenciaText = cleanString(entry.urgencia);
    let urgencia: string | undefined;
    let urgenciaConcorrente: string | undefined;
    let urgenciaFonte: Fonte | undefined;
    if (urgenciaText) {
      const ci = Number(entry.competitorIndex);
      if (Number.isInteger(ci) && ci >= 1 && ci <= competitors.length) {
        const ce = competitors[ci - 1];
        urgencia = urgenciaText;
        urgenciaConcorrente = ce.competitorName;
        urgenciaFonte = { url: ce.url, titulo: ce.title };
      }
    }
    // F2/F4 — REFORÇO (mercado): texto da tendência; se ancorado num sinal de
    // mercado coletado (reforcoIndex válido), guarda a FONTE real; senão fica
    // derivado (sem fonte), como no F2. Nunca inventa fonte.
    const reforco = cleanString(entry.reforco) || undefined;
    let reforcoFonte: Fonte | undefined;
    if (reforco) {
      const ri = Number(entry.reforcoIndex);
      if (Number.isInteger(ri) && ri >= 1 && ri <= markets.length) {
        const me = markets[ri - 1];
        reforcoFonte = { url: me.url, titulo: me.title };
      }
    }

    plays.push({
      id: stableId(event.id, sinal),
      clientName,
      conta: event.competitorName, // derivada do evento — nunca do LLM
      sinal,
      gatilho,
      encaixe,
      justificativa,
      acao,
      brainRef: brainRef || undefined,
      ...(urgencia ? { urgencia, urgenciaConcorrente, urgenciaFonte } : {}),
      ...(reforco ? { reforco, ...(reforcoFonte ? { reforcoFonte } : {}) } : {}),
      score: clampScore(entry.score),
      fonte: { url: event.url, titulo: event.title },
      eventIds: [event.id],
      publishedAt: event.publishedAt,
      collectedAt: event.collectedAt,
      createdAt,
    });
  }

  return sortRelationshipPlays(plays);
}
