/**
 * RASCUNHO DA CAMADA ESTRATÉGICA (F3) — o Radar NÃO decide o posicionamento; ele
 * embasa. Um LLM rascunha, a partir do diagnóstico do concorrente, uma leitura
 * estratégica PRO ESTRATEGISTA do cliente: como o concorrente é percebido e que
 * ângulos o cliente poderia explorar pra se diferenciar dele.
 *
 * HONESTIDADE: é RASCUNHO, não veredito — rotulado na tela. Baseado no material;
 * a decisão de posicionamento é humana.
 */

import { completeViaGateway } from "@/lib/gateway";
import type { EstrategiaRascunho, Maturidade, Posicionamento } from "@/lib/diagnostico/schema";

const SYSTEM =
  "Você RASCUNHA uma leitura estratégica sobre um CONCORRENTE para o estrategista de uma agência (o cliente da agência é quem vai decidir). " +
  "NÃO é veredito — é um rascunho que EMBASA a decisão humana. A partir do diagnóstico do concorrente, produza: " +
  "'percepcao_atual' (como o concorrente se posiciona / provavelmente é percebido no mercado, a partir do material); " +
  "'percepcao_ideal' (uma leitura de onde o CLIENTE poderia mirar pra não colidir com esse concorrente); " +
  "'caminhos' (2-3 ângulos de posicionamento que o cliente poderia explorar pra se diferenciar deste concorrente); " +
  "'recomendacoes' (2-3 movimentos concretos, em rascunho). " +
  "HONESTIDADE: baseie-se SÓ no material; não invente dado de mercado; o posicionamento final é decisão do estrategista. " +
  'Responda SÓ JSON: {"percepcao_atual":"...","percepcao_ideal":"...","caminhos":["..."],"recomendacoes":["..."]}.';

function resumo(name: string, p: Posicionamento, mat: Maturidade | undefined): string {
  const val = (v: { valor: string | null } | undefined) => v?.valor ?? "—";
  return [
    `CONCORRENTE: ${name}`,
    `tagline: ${val(p.tagline)} · posicionamento: ${val(p.posicionamento)}`,
    `diferenciais: ${p.diferenciais.map((d) => d.valor).join(" · ") || "—"}`,
    `produtos: ${p.produtos.map((pr) => pr.nome).join(", ") || "—"}`,
    `provas: clientes=${p.provas.clientes_citados.map((c) => c.valor).join(", ") || "—"}`,
    mat?.status === "avaliado" ? `maturidade (opinião): ${mat.nivel} — ${mat.evidencia}` : "",
  ].filter(Boolean).join("\n");
}

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 3) : [];

export async function runEstrategia(
  clientName: string,
  name: string,
  p: Posicionamento,
  mat: Maturidade | undefined,
): Promise<EstrategiaRascunho> {
  const now = new Date().toISOString();
  const naoRascunhado: EstrategiaRascunho = { percepcao_atual: null, percepcao_ideal: null, caminhos: [], recomendacoes: [], data_coleta: now, status: "nao_rascunhado" };

  let content = "";
  try {
    content = await completeViaGateway({
      system: SYSTEM,
      prompt: `CLIENTE DA AGÊNCIA: ${clientName}\n\nDIAGNÓSTICO DO CONCORRENTE:\n${resumo(name, p, mat)}\n\nRascunhe a leitura estratégica (é rascunho pro estrategista).`,
    });
  } catch {
    return naoRascunhado;
  }
  try {
    const m = content.match(/\{[\s\S]*\}/);
    const o = m ? (JSON.parse(m[0]) as Record<string, unknown>) : {};
    const percepcao_atual = typeof o.percepcao_atual === "string" ? o.percepcao_atual.trim() || null : null;
    const percepcao_ideal = typeof o.percepcao_ideal === "string" ? o.percepcao_ideal.trim() || null : null;
    const caminhos = strList(o.caminhos);
    const recomendacoes = strList(o.recomendacoes);
    if (!percepcao_atual && caminhos.length === 0 && recomendacoes.length === 0) return naoRascunhado;
    return { percepcao_atual, percepcao_ideal, caminhos, recomendacoes, data_coleta: now, status: "rascunhado" };
  } catch {
    return naoRascunhado;
  }
}
