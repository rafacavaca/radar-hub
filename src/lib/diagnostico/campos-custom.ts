/**
 * D — extração dos CAMPOS CUSTOMIZADOS (definidos pelo usuário) a partir das
 * páginas JÁ coletadas pela Lente 1 (sem re-scrape). Ex.: "Tom de voz",
 * "Precificação", "Público-alvo".
 *
 * HONESTIDADE (o motor configurável herda a regra de ouro): cada campo é FATO
 * com fonte (a página [N] de onde saiu) + data, OU nao_encontrado. NUNCA
 * inventa uma resposta plausível pra "completar" o campo.
 */

import { completeViaGateway } from "@/lib/gateway";
import { campoFato, campoNaoEncontrado, type CampoCustom } from "@/lib/diagnostico/schema";
import type { Page } from "@/lib/diagnostico/lente1";

/** Definição do campo (o que o usuário configurou). */
export type CampoCustomDef = { chave: string; pergunta: string };

const SYSTEM =
  "Você é o EXTRATOR DE CAMPOS CUSTOMIZADOS do Radar. Recebe páginas do site de UM concorrente e uma lista de PERGUNTAS definidas pelo usuário. Para cada pergunta, responda SÓ com o que está EXPLÍCITO ou claramente evidenciado no material. " +
  "REGRA DE OURO (inviolável): se o material não permite responder com segurança, use status:'nao_encontrado' e valor null — NUNCA invente ou deduza além do que está escrito. " +
  "Respostas CURTAS (1-2 frases). Para cada resposta achada, informe 'fonteIndex' = o número [N] da página que a sustenta. " +
  'Responda SÓ um objeto JSON: {"respostas":[{"chave":"<a mesma chave>","valor":"..."|null,"status":"encontrado"|"nao_encontrado","fonteIndex":1}]}';

function buildPrompt(name: string, pages: Page[], defs: CampoCustomDef[]): string {
  const blocks = pages.map((p, i) => `[${i + 1}] (${p.label}) ${p.url}\n${p.markdown}`).join("\n\n---\n\n");
  const perguntas = defs.map((d, i) => `${i + 1}. chave "${d.chave}": ${d.pergunta}`).join("\n");
  return `CONCORRENTE: ${name}\n\nPÁGINAS (cite a fonte por [N]):\n\n${blocks}\n\nPERGUNTAS (responda cada uma SÓ com base no material acima):\n${perguntas}`;
}

type RawResp = { chave?: unknown; valor?: unknown; status?: unknown; fonteIndex?: unknown };

/**
 * Extrai os campos custom. Sem defs → []. Nunca lança (falha de LLM → todos
 * nao_encontrado, honesto). Preserva a ordem/rótulos definidos pelo usuário.
 */
export async function runCamposCustom(name: string, pages: Page[], defs: CampoCustomDef[]): Promise<CampoCustom[]> {
  const now = new Date().toISOString();
  const limpos = defs
    .map((d) => ({ chave: d.chave.trim(), pergunta: d.pergunta.trim() }))
    .filter((d) => d.chave && d.pergunta)
    .slice(0, 8);
  if (limpos.length === 0 || pages.length === 0) {
    return limpos.map((d) => ({ chave: d.chave, pergunta: d.pergunta, resposta: campoNaoEncontrado(now) }));
  }

  let raw: { respostas?: RawResp[] } = {};
  try {
    const content = await completeViaGateway({ system: SYSTEM, prompt: buildPrompt(name, pages, limpos) });
    const m = content.match(/\{[\s\S]*\}/);
    if (m) raw = JSON.parse(m[0]) as { respostas?: RawResp[] };
  } catch {
    raw = {};
  }

  const porChave = new Map<string, RawResp>();
  for (const r of Array.isArray(raw.respostas) ? raw.respostas : []) {
    const chave = typeof r.chave === "string" ? r.chave.trim().toLowerCase() : "";
    if (chave) porChave.set(chave, r);
  }

  const fonteDe = (fonteIndex: unknown): string | undefined => {
    const n = Number(fonteIndex);
    return Number.isInteger(n) && n >= 1 && n <= pages.length ? pages[n - 1].url : undefined;
  };

  // preserva as defs do usuário (não confia na lista devolvida pelo LLM)
  return limpos.map((d) => {
    const r = porChave.get(d.chave.toLowerCase());
    const valor = typeof r?.valor === "string" ? r.valor.trim() : "";
    const achado = valor && String(r?.status) !== "nao_encontrado";
    return {
      chave: d.chave,
      pergunta: d.pergunta,
      resposta: achado ? campoFato(valor, fonteDe(r?.fonteIndex), now) : campoNaoEncontrado(now),
    };
  });
}
