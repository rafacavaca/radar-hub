/**
 * CONTEXTO do BRAIN NATIVO — transforma os itens CONFIRMADOS de um cliente no
 * texto que ancora os analistas (o mesmo papel do `formatContext` do Brain do
 * Formare, mas honesto: diz que é "da implantação", confirmada por vocês).
 *
 * Só o CONFIRMADO entra — o `inferido` (a dúvida da IA) nunca alimenta análise.
 * Plugado na costura NÃO-DONA do brain.ts: quando a org tem conhecimento
 * confirmado, ele SUPERA a base local enxuta (mode `local`) — e o rótulo deixa
 * de dizer "enxuta".
 */

import type { BrainContext } from "@/lib/brain";

import { loadBrainItems } from "./store";
import type { BrainItem } from "./schema";

const CONTEXT_MAX_CHARS = 6000;
const ITEM_MAX_CHARS = 320;

function line(i: BrainItem): string {
  const clean = i.texto.replace(/\s+/g, " ").trim().slice(0, ITEM_MAX_CHARS);
  return `- (${i.tipo}) ${clean}`;
}

/** Monta o contexto textual dos itens confirmados — verdade primeiro, no orçamento. */
export function formatNativeContext(cliente: string, confirmados: BrainItem[]): string {
  const verdade = confirmados.filter((i) => i.autoridade === "verdade");
  const referencia = confirmados.filter((i) => i.autoridade === "referencia");

  const parts: string[] = [
    `BASE DE CONHECIMENTO DE ${cliente.toUpperCase()} — construída e confirmada na implantação (${confirmados.length} fatos):`,
  ];
  let budget = CONTEXT_MAX_CHARS - parts[0].length;

  const push = (l: string): boolean => {
    if (l.length + 1 > budget) return false;
    parts.push(l);
    budget -= l.length + 1;
    return true;
  };

  if (verdade.length > 0) {
    push("\nVERDADE INSTITUCIONAL (confirmada):");
    for (const i of verdade) if (!push(line(i))) break;
  }
  if (referencia.length > 0) {
    push("\nREFERÊNCIA (confirmada):");
    for (const i of referencia) if (!push(line(i))) break;
  }
  return parts.join("\n");
}

/**
 * O contexto do Brain NATIVO da org para este cliente — só os CONFIRMADOS.
 * `null` quando não há nada confirmado (aí o brain.ts cai na base local / none).
 * Nunca lança (a costura do brain.ts nunca pode derrubar o loop).
 */
export async function nativeBrain(
  cliente: string,
): Promise<Extract<BrainContext, { mode: "nativo" }> | null> {
  try {
    const confirmados = (await loadBrainItems(cliente)).filter((i) => i.status === "confirmado");
    if (confirmados.length === 0) return null;
    return { mode: "nativo", context: formatNativeContext(cliente, confirmados), nodeCount: confirmados.length };
  } catch {
    return null;
  }
}
