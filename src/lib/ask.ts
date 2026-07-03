/**
 * PERGUNTE AO RADAR (F5) — chat livre sobre tudo que o Radar sabe, com FONTES
 * e honesto quando sabe pouco. Mesmo padrão do "Pergunte ao Brain" do Formare.
 *
 * O que o Radar "sabe" (o MATERIAL da resposta):
 *   1. Itens de inteligência dos últimos dias (os caches diários do loop —
 *      cada um com sinal, por que importa, ação, score, fonte e concorrente);
 *   2. O Brain do cliente (via porta de leitura — só conhecimento confirmado);
 *   3. A watchlist (quem está sendo vigiado — pra dizer o que NÃO cobre ainda).
 *
 * HONESTIDADE (a regra nº 1, no prompt e no código):
 *   - a resposta só afirma fatos presentes no material, citando [n];
 *   - as fontes devolvidas são MAPEADAS das citações — nunca inventadas;
 *   - se o material não cobre, o Radar diz isso e aponta a tela Vigiar.
 *
 * Parsing DEFENSIVO como no analista: resposta malformada nunca derruba a
 * rota — no pior caso devolvemos o texto cru sem fontes.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { fetchClientBrain } from "@/lib/brain";
import { completeViaGateway } from "@/lib/gateway";
import { readWatchlist } from "@/lib/watchlist";
import type { IntelligenceItem } from "@/lib/types";

const CACHE_DIR = join(process.cwd(), ".cache");
const MAX_DAYS = 14;
const MAX_ITEMS = 40;

/** Uma fonte citável devolvida ao chat (mapeada de um item citado [n]). */
export type AskSource = {
  titulo: string;
  url: string;
  concorrente?: string;
};

export type AskTurn = { role: "user" | "radar"; text: string };

export type AskAnswer = {
  resposta: string;
  fontes: AskSource[];
  /** quantos itens de inteligência existiam no material (transparência). */
  materialItens: number;
};

/**
 * Itens de inteligência dos últimos dias: lê os caches diários do loop
 * (`loop-YYYY-MM-DD.json`), do mais novo pro mais velho, deduplicando por id.
 */
export function collectRecentItems(maxDays = MAX_DAYS, maxItems = MAX_ITEMS): Array<
  IntelligenceItem & { dia: string }
> {
  if (!existsSync(CACHE_DIR)) return [];
  const files = readdirSync(CACHE_DIR)
    .filter((f) => /^loop-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse()
    .slice(0, maxDays);

  const seen = new Set<string>();
  const items: Array<IntelligenceItem & { dia: string }> = [];
  for (const file of files) {
    const dia = file.slice(5, 15); // YYYY-MM-DD
    try {
      const parsed = JSON.parse(readFileSync(join(CACHE_DIR, file), "utf8")) as {
        items?: IntelligenceItem[];
      };
      // dentro do dia, mais impacto primeiro; dias mais novos vêm antes.
      const doDia = [...(parsed.items ?? [])].sort((a, b) => b.score - a.score);
      for (const item of doDia) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push({ ...item, dia });
        if (items.length >= maxItems) return items;
      }
    } catch {
      // cache de um dia ilegível — segue pros outros.
    }
  }
  return items;
}

/** "2026-07-02" -> "02/07" (curto, pro material). */
function shortDate(dia: string): string {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
}

/** Bloco numerado do material: cada item vira uma fonte citável [n]. */
function buildMaterialBlock(items: Array<IntelligenceItem & { dia: string }>): string {
  if (items.length === 0) return "(nenhum item coletado ainda)";
  return items
    .map((item, index) => {
      const n = index + 1;
      return (
        `[${n}] (${item.concorrente ?? "?"}, ${shortDate(item.dia)}, score ${item.score}) ` +
        `Sinal: ${item.sinal} | Por que importa: ${item.porQueImporta} | ` +
        `Ação sugerida: ${item.acao} | Fonte: ${item.fonte.titulo} — ${item.fonte.url}`
      );
    })
    .join("\n");
}

/** Resumo da watchlist (pro Radar saber dizer o que ainda NÃO vigia). */
function buildWatchlistBlock(): string {
  const watchlist = readWatchlist();
  const parts: string[] = [];
  for (const client of watchlist.clients) {
    const comps = client.competitors
      .map((c) => `${c.name}${c.enabled ? "" : " (pausado)"} [${c.sources.map((s) => s.kind).join(", ") || "sem fontes"}]`)
      .join("; ");
    parts.push(`${client.name}: ${comps || "nenhum concorrente"}`);
  }
  return parts.join("\n");
}

const SYSTEM =
  "Você é o RADAR — o sistema de inteligência de mercado da agência Formare — respondendo perguntas do Rafael (o dono). " +
  "Responda APENAS com base no MATERIAL fornecido (itens de inteligência coletados, o Brain do cliente e a watchlist). Regras invioláveis: " +
  "(1) HONESTIDADE: se o material não cobre a pergunta, diga claramente que o Radar ainda não coletou isso — e, se fizer sentido, sugira adicionar o concorrente/fonte na tela Vigiar. NUNCA invente fatos, números, datas ou lançamentos. " +
  "(2) FONTES: ao afirmar um fato coletado, cite o número do item entre colchetes, ex.: [2]. Só cite números que existem no material. " +
  "(3) O Brain dos clientes é contexto confirmado — pode usar, dizendo 'segundo o Brain de <cliente>…' (sem número). " +
  "(4) Direto, útil e em pt-BR; markdown leve (negrito, listas curtas). Quando opinar/recomendar, deixe claro que é a sua leitura a partir do material. " +
  'Responda SÓ com um objeto JSON válido: {"resposta": "…", "fontesUsadas": [2, 5]} — fontesUsadas = números dos itens citados (pode ser []).';

function buildPrompt(
  question: string,
  history: AskTurn[],
  materialBlock: string,
  brainContext: string,
  watchlistBlock: string,
): string {
  const historyBlock =
    history.length > 0
      ? history
          .slice(-6)
          .map((t) => `${t.role === "user" ? "Rafael" : "Radar"}: ${t.text}`)
          .join("\n")
      : "(primeira pergunta da conversa)";

  return `QUEM O RADAR VIGIA HOJE:
${watchlistBlock}

O QUE O BRAIN SABE DOS CLIENTES (cada um rotulado):
${brainContext}

MATERIAL COLETADO (itens de inteligência, do mais recente pro mais antigo — cite por [n]):
${materialBlock}

CONVERSA ATÉ AQUI:
${historyBlock}

PERGUNTA DO RAFAEL:
${question}`;
}

/** Extrai o objeto JSON da resposta do LLM; falha -> null (nunca lança). */
function extractJson(content: string): { resposta?: unknown; fontesUsadas?: unknown } | null {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as { resposta?: unknown; fontesUsadas?: unknown };
  } catch {
    return null;
  }
}

/** Pergunta ao Radar. Nunca lança por resposta malformada do LLM. */
export async function askRadar(question: string, history: AskTurn[] = []): Promise<AskAnswer> {
  const items = collectRecentItems();

  // MULTI-CLIENTE (F7): o Brain de TODOS os clientes do Radar entra como
  // contexto, cada um rotulado (a leitura tem cache diário — barato).
  const clientNames = readWatchlist().clients.map((c) => c.name);
  const brains: string[] = [];
  for (const name of clientNames) {
    const brain = await fetchClientBrain(name);
    brains.push(`— ${name}:\n${brain.context}`);
  }

  const prompt = buildPrompt(
    question,
    history,
    buildMaterialBlock(items),
    brains.join("\n\n"),
    buildWatchlistBlock(),
  );

  const content = await completeViaGateway({ system: SYSTEM, prompt });
  const parsed = extractJson(content);

  // Resposta crua como fallback (sem fontes) — melhor que erro.
  const resposta =
    typeof parsed?.resposta === "string" && parsed.resposta.trim().length > 0
      ? parsed.resposta.trim()
      : content.trim();

  // Fontes: SÓ as citadas e que existem de verdade no material (anti-invenção).
  const fontes: AskSource[] = [];
  const seenUrls = new Set<string>();
  if (Array.isArray(parsed?.fontesUsadas)) {
    for (const raw of parsed.fontesUsadas) {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > items.length) continue;
      const item = items[n - 1];
      if (seenUrls.has(item.fonte.url)) continue;
      seenUrls.add(item.fonte.url);
      fontes.push({
        titulo: item.fonte.titulo,
        url: item.fonte.url,
        concorrente: item.concorrente,
      });
    }
  }

  return { resposta, fontes, materialItens: items.length };
}
