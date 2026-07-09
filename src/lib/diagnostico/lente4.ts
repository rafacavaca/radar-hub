/**
 * LENTE 4 — MATURIDADE DE COMUNICAÇÃO (F3). Um LLM pontua a maturidade do
 * concorrente a partir do posicionamento extraído — RELATIVA ao mercado dele e
 * ANCORADA em prova observável.
 *
 * É OPINIÃO, não fato: `tipo:"opiniao"`, sempre com evidência e data. É um
 * RASCUNHO pro estrategista, não um veredito.
 *
 * POR QUE RELATIVA + ANCORADA (correção do colapso "todos 72"): a régua
 * "referência × defasada" é comparativa. Avaliar cada concorrente no vácuo faz
 * o LLM ancorar num score-médio seguro e não discriminar. Então:
 *  - passamos os PARES (perfil de prova dos outros concorrentes do cliente) pra
 *    o modelo posicionar ESTE relativamente;
 *  - damos uma RUBRICA que amarra o score à PROVA OBSERVÁVEL (clientes citados,
 *    depoimentos, premiações, big numbers, diferenciais, tagline);
 *  - proibimos empate entre perfis de prova claramente diferentes;
 *  - `nao_avaliado` quando o material é raso demais (nunca um número inventado).
 */

import { completeViaGateway } from "@/lib/gateway";
import type { Maturidade, Posicionamento } from "@/lib/diagnostico/schema";

const NIVEIS = ["icônica", "proprietária", "diferenciada", "padronizada", "clichê", "desestruturada", "defasada"];

/** Perfil de PROVA observável de um concorrente (fato contável) — a âncora. */
export type PerfilProva = { nome: string; resumo: string };

/** Sinais de prova contáveis + presença de mensagem — a base da rubrica. */
function sinaisProva(p: Posicionamento): string {
  return [
    `tagline=${p.tagline.status === "encontrado" ? "sim" : "não"}`,
    `posicionamento=${p.posicionamento.status === "encontrado" ? "sim" : "não"}`,
    `diferenciais=${p.diferenciais.length}`,
    `produtos=${p.produtos.length}`,
    `clientes_citados=${p.provas.clientes_citados.length}`,
    `depoimentos=${p.provas.depoimentos.status === "encontrado" ? "sim" : "não"}`,
    `premiações=${p.provas.premiacoes.length}`,
    `big_numbers=${p.provas.big_numbers.length}`,
  ].join(", ");
}

/** Perfil compacto pra usar como PAR na avaliação de outro concorrente. */
export function perfilProvaDe(nome: string, p: Posicionamento): PerfilProva {
  return { nome, resumo: sinaisProva(p) };
}

function resumoCompleto(p: Posicionamento): string {
  const val = (v: { valor: string | null } | undefined) => v?.valor ?? "—";
  return [
    `tagline: ${val(p.tagline)}`,
    `posicionamento: ${val(p.posicionamento)}`,
    `propósito: ${val(p.proposito)}`,
    `diferenciais (${p.diferenciais.length}): ${p.diferenciais.map((d) => d.valor).join(" · ") || "—"}`,
    `produtos (${p.produtos.length}): ${p.produtos.map((pr) => pr.nome).join(", ") || "—"}`,
    `PROVA OBSERVÁVEL → ${sinaisProva(p)}`,
    `clientes: ${p.provas.clientes_citados.map((c) => c.valor).join(", ") || "nenhum"}`,
    `premiações: ${p.provas.premiacoes.map((c) => c.valor).join(", ") || "nenhuma"}`,
    `big numbers: ${p.provas.big_numbers.map((c) => c.valor).join(", ") || "nenhum"}`,
  ].join("\n");
}

const SYSTEM =
  "Você avalia a MATURIDADE DE COMUNICAÇÃO de um concorrente B2B a partir do posicionamento/mensagem extraído do site — RELATIVA ao mercado dele. Isto é OPINIÃO (rotulada), um rascunho pro estrategista. " +
  `Escolha 'nivel' (UMA de, da melhor pra pior: ${NIVEIS.join(", ")}) e 'score' 0-100 ANCORADO na PROVA OBSERVÁVEL. ` +
  "RUBRICA (o score DEVE seguir a prova, não a impressão): " +
  "80-100 (icônica/proprietária) = posicionamento próprio forte + prova social ROBUSTA (vários clientes nomeados E depoimentos E prêmios/big numbers) + diferenciais específicos; " +
  "65-79 (diferenciada) = posicionamento claro + prova social PARCIAL (falta um ou dois: poucos clientes, ou sem depoimentos, ou sem prêmios); " +
  "45-64 (padronizada) = mensagem genérica OU prova social fraca/ausente; " +
  "0-44 (clichê/desestruturada/defasada) = mensagem vaga/inconsistente E sem prova. " +
  "REGRAS DE HONESTIDADE (invioláveis): " +
  "(1) a 'evidencia' (1-2 frases) DEVE citar a prova concreta que sustenta o nível — o que ESTE tem e o que lhe FALTA vs. os pares; " +
  "(2) NÃO dê o mesmo score a concorrentes com perfis de prova claramente diferentes (ex.: um com 9 clientes + prêmios + depoimentos não empata com outro de 0 clientes, sem depoimentos, 0 prêmios); use a régua toda, não fique no meio; " +
  "(3) se o material de ESTE concorrente é raso demais pra julgar (quase nada extraído), responda {\"status\":\"nao_avaliado\"} — nunca invente número. " +
  'Responda SÓ JSON: {"nivel":"...","score":0,"evidencia":"..."} ou {"status":"nao_avaliado"}.';

export async function runLente4(name: string, p: Posicionamento, peers: PerfilProva[] = []): Promise<Maturidade> {
  const now = new Date().toISOString();
  const naoAvaliado: Maturidade = { nivel: null, evidencia: null, score: null, tipo: "opiniao", data_coleta: now, status: "nao_avaliado" };

  // guarda determinística: material raso demais → nao_avaliado sem gastar LLM.
  const temMensagem = p.tagline.status === "encontrado" || p.posicionamento.status === "encontrado";
  const sinais = p.diferenciais.length + p.produtos.length + p.provas.clientes_citados.length + p.provas.premiacoes.length + p.provas.big_numbers.length;
  if (!temMensagem && sinais < 2) return naoAvaliado;

  const paresBloco = peers.length
    ? `\n\nPARES NO MESMO MERCADO (perfil de prova — posicione ESTE relativamente a eles):\n${peers.map((x) => `- ${x.nome}: ${x.resumo}`).join("\n")}`
    : "\n\n(Sem pares informados — avalie pela rubrica de prova observável.)";

  let content = "";
  try {
    content = await completeViaGateway({
      system: SYSTEM,
      prompt: `CONCORRENTE AVALIADO: ${name}\n\nPOSICIONAMENTO EXTRAÍDO:\n${resumoCompleto(p)}${paresBloco}\n\nAvalie a maturidade de ${name} (opinião, com evidência que cite a prova).`,
    });
  } catch {
    return naoAvaliado;
  }
  try {
    const m = content.match(/\{[\s\S]*\}/);
    const o = m ? (JSON.parse(m[0]) as Record<string, unknown>) : {};
    if (String(o.status) === "nao_avaliado") return naoAvaliado;
    const nivel = typeof o.nivel === "string" ? o.nivel.trim() : "";
    const evidencia = typeof o.evidencia === "string" ? o.evidencia.trim() : "";
    if (!nivel || !evidencia) return naoAvaliado;
    const scoreN = Number(o.score);
    return {
      nivel,
      evidencia,
      score: Number.isFinite(scoreN) ? Math.max(0, Math.min(100, Math.round(scoreN))) : null,
      tipo: "opiniao",
      data_coleta: now,
      status: "avaliado",
    };
  } catch {
    return naoAvaliado;
  }
}
