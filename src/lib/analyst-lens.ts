/**
 * ANALISTA-LENTE (F6) — um analista-agente POR LENTE (comercial, produto,
 * marketing), no mesmo padrão dos especialistas do Formare: a identidade é
 * fixa (a pergunta que a lente responde), mas a RÉGUA é a do Rafael (editável
 * na tela Analistas) e entra LITERALMENTE na instrução.
 *
 * Contrato de honestidade (herdado do analista do F1 e do Pergunte ao Radar):
 * - só produz leitura se o sinal PASSA na régua — não passou, ignora (por isso
 *   1 sinal vira 0..3 leituras);
 * - a leitura ancora no que se sabe do cliente (Brain) e cita o movimento real;
 * - PRODUTO é honesto quando o Brain é raso: se não há dado interno (roadmap,
 *   features paradas), diz "não sei o que vocês têm internamente sobre isto"
 *   em vez de chutar;
 * - fontes são MAPEADAS do evento real (eventIndex) — nunca inventadas.
 *
 * Parsing defensivo: resposta malformada -> [] (nunca derruba o loop).
 */

import { createHash } from "node:crypto";

import { completeViaGateway } from "@/lib/gateway";
import { LENS_QUESTION, type LensConfig } from "@/lib/lenses";
import type { LensReading, RawEvent } from "@/lib/types";

/** Forma crua de uma leitura vinda do LLM, antes de validar/normalizar. */
type RawLensEntry = {
  sinal?: unknown;
  leitura?: unknown;
  acao?: unknown;
  contaAfetada?: unknown;
  score?: unknown;
  eventIndex?: unknown;
};

function stableReadingId(lens: string, eventId: string, sinal: string): string {
  return createHash("sha1").update(`${lens}:${eventId}:${sinal}`).digest("hex").slice(0, 16);
}

/** Bloco numerado de movimentos (1..N) — mesmo formato do analista geral. */
function buildEventsBlock(events: RawEvent[]): string {
  return events
    .map((event, index) => {
      const n = index + 1;
      const category = event.category ?? "sem categoria";
      const body = event.description || event.excerpt || "(sem descrição)";
      return `${n}. [${event.competitorName}] ${event.title} [${category}] — ${event.url}\n   ${body}`;
    })
    .join("\n");
}

/** Instrução do analista-lente: identidade fixa + a régua DO RAFAEL. */
function buildSystem(lens: LensConfig): string {
  const extraProduto =
    lens.id === "produto"
      ? " REGRA DE HONESTIDADE INTERNA: você só sabe do cliente o que está no contexto fornecido. Se o contexto NÃO diz o que o cliente tem, está desenvolvendo ou deixou parado sobre o tema, escreva na leitura que não sabe o que eles têm internamente sobre isto (e recomende verificar) — NUNCA invente roadmap, features ou projetos internos."
      : "";
  const extraComercial =
    lens.id === "comercial"
      ? ' Se conseguir identificar do contexto uma conta/cliente específico afetado, preencha "contaAfetada"; se não, omita o campo — NUNCA invente nome de conta.'
      : "";

  return (
    `Você é o ANALISTA ${lens.id.toUpperCase()} do Radar — inteligência de mercado B2B. ` +
    `Você lê movimentos de concorrentes e responde UMA pergunta, sempre para o ${lens.team}: "${LENS_QUESTION[lens.id]}" ` +
    `SUA RÉGUA DE RELEVÂNCIA (definida pelo dono da agência — siga à risca): ${lens.regua} ` +
    "Regras: (1) um movimento SÓ vira leitura se PASSA na régua — na dúvida, NÃO gere (menos e certeiro vence mais e raso); " +
    "(2) a leitura é escrita NO IDIOMA DESTE TIME, ancorada no que se sabe do cliente — cite o produto/público/diferencial afetado; " +
    "(3) HONESTIDADE: nunca invente fatos, números, contas ou lançamentos; o que não está no material não existe;" +
    extraProduto +
    extraComercial +
    " (4) score 0-100 = impacto PARA ESTE TIME, não popularidade."
  );
}

function buildPrompt(lens: LensConfig, clientName: string, brainContext: string, events: RawEvent[]): string {
  return `CLIENTE: ${clientName}

O QUE SABEMOS DO CLIENTE (contexto confirmado):
${brainContext}

MOVIMENTOS RECENTES DOS CONCORRENTES (cada um marcado com [Concorrente]):
${buildEventsBlock(events)}

TAREFA (lente ${lens.id}):
Aplique SUA RÉGUA a cada movimento. Para os que PASSAM, gere uma leitura para o ${lens.team}. Os que não passam, ignore (não gere nada para eles).
Cada leitura precisa ter:
- sinal: o que o concorrente fez (1 frase objetiva, citando o concorrente).
- leitura: o que isso significa PARA ESTE TIME do cliente ${clientName} — no idioma do time, ancorado no que sabemos.
- acao: 1 ação concreta no formato desta lente (${lens.action === "abordagem" ? "abordagem/argumento comercial" : lens.action === "nota_roadmap" ? "recomendação de roadmap" : "recomendação de conteúdo/discurso"}).
${lens.id === "comercial" ? "- contaAfetada: a conta/cliente afetado, SÓ se identificável no contexto (senão omita).\n" : ""}- score: inteiro 0-100 (impacto para este time).
- eventIndex: o número (N) do movimento correspondente.

Responda SÓ com um array JSON válido, sem texto fora dele:
[ { "sinal": "...", "leitura": "...", "acao": "...", "score": 0, "eventIndex": 1 } ]
Se NENHUM movimento passar na sua régua, responda [].`;
}

/** Extrai o primeiro array JSON do texto do LLM. Falhou/ausente -> []. */
function extractJsonArray(content: string): RawLensEntry[] {
  try {
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? (parsed as RawLensEntry[]) : [];
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
 * Roda UMA lente sobre os movimentos de um cliente.
 * Devolve 0..N leituras — só dos movimentos que passaram na régua da lente.
 */
export async function analyzeLens(
  lens: LensConfig,
  events: RawEvent[],
  clientName: string,
  brainContext: string,
): Promise<LensReading[]> {
  if (events.length === 0) return [];

  const content = await completeViaGateway({
    system: buildSystem(lens),
    prompt: buildPrompt(lens, clientName, brainContext, events),
  });

  const entries = extractJsonArray(content);
  const createdAt = new Date().toISOString();
  const readings: LensReading[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;

    const sinal = cleanString(entry.sinal);
    const leitura = cleanString(entry.leitura);
    const acao = cleanString(entry.acao);
    if (!sinal || !leitura || !acao) continue;

    const eventIndex = Number(entry.eventIndex);
    if (!Number.isInteger(eventIndex) || eventIndex < 1 || eventIndex > events.length) continue;
    const event = events[eventIndex - 1];

    const contaAfetada = cleanString(entry.contaAfetada);

    readings.push({
      id: stableReadingId(lens.id, event.id, sinal),
      clientName,
      lens: lens.id,
      sinal,
      leitura,
      acao,
      contaAfetada: lens.id === "comercial" && contaAfetada ? contaAfetada : undefined,
      score: clampScore(entry.score),
      fonte: { url: event.url, titulo: event.title },
      concorrente: event.competitorName,
      eventIds: [event.id],
      createdAt,
    });
  }

  readings.sort((a, b) => b.score - a.score);
  return readings;
}
