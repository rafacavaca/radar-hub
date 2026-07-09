/**
 * LENTE 4 — MATURIDADE DE COMUNICAÇÃO (F3). Um LLM pontua profissionalismo /
 * consistência / modernidade do concorrente a partir do posicionamento extraído.
 *
 * É OPINIÃO, não fato: `tipo:"opiniao"`, sempre com evidência e data. É um
 * RASCUNHO pro estrategista, não um veredito. Se há pouco material, `nao_avaliado`.
 */

import { completeViaGateway } from "@/lib/gateway";
import type { Maturidade, Posicionamento } from "@/lib/diagnostico/schema";

const NIVEIS = ["icônica", "proprietária", "diferenciada", "padronizada", "clichê", "desestruturada", "defasada"];

const SYSTEM =
  "Você avalia a MATURIDADE DE COMUNICAÇÃO de um concorrente B2B a partir do posicionamento/mensagem extraído do site dele. " +
  "Isto é OPINIÃO (rotulada), não fato — um rascunho pro estrategista. " +
  `Dê um 'nivel' (UMA de: ${NIVEIS.join(", ")}), um 'score' 0-100 (profissionalismo + consistência + modernidade), e a 'evidencia' (1-2 frases do que sustenta, citando o que viu no material). ` +
  "HONESTIDADE: se o material é raso demais pra julgar, responda {\"status\":\"nao_avaliado\"}. Não invente. " +
  'Responda SÓ JSON: {"nivel":"...","score":0,"evidencia":"..."} ou {"status":"nao_avaliado"}.';

function resumo(p: Posicionamento): string {
  const val = (v: { valor: string | null } | undefined) => v?.valor ?? "—";
  return [
    `tagline: ${val(p.tagline)}`,
    `posicionamento: ${val(p.posicionamento)}`,
    `propósito: ${val(p.proposito)}`,
    `diferenciais (${p.diferenciais.length}): ${p.diferenciais.map((d) => d.valor).join(" · ") || "—"}`,
    `produtos (${p.produtos.length}): ${p.produtos.map((pr) => pr.nome).join(", ") || "—"}`,
    `provas: clientes=${p.provas.clientes_citados.length}, depoimentos=${p.provas.depoimentos.status === "encontrado" ? "sim" : "—"}, premiações=${p.provas.premiacoes.length}, big_numbers=${p.provas.big_numbers.length}`,
  ].join("\n");
}

export async function runLente4(name: string, p: Posicionamento): Promise<Maturidade> {
  const now = new Date().toISOString();
  const naoAvaliado: Maturidade = { nivel: null, evidencia: null, score: null, tipo: "opiniao", data_coleta: now, status: "nao_avaliado" };

  let content = "";
  try {
    content = await completeViaGateway({ system: SYSTEM, prompt: `CONCORRENTE: ${name}\n\nPOSICIONAMENTO EXTRAÍDO:\n${resumo(p)}\n\nAvalie a maturidade de comunicação (opinião, com evidência).` });
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
