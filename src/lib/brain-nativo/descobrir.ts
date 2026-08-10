/**
 * DESCOBERTA do BRAIN NATIVO (D14, F1) — lê o SITE do cliente e extrai
 * conhecimento, REUSANDO a Lente 1 do diagnóstico (o mesmo extrator honesto, com
 * fonte + data por campo). NÃO reimplementa descoberta — compõe o primitivo.
 *
 * Tudo entra como `inferido` (a dúvida da IA) — NUNCA como verdade automática. O
 * humano promove na aba Revisar. Custo medido (Firecrawl + LLM) via runWithUsage.
 *
 * Mapa Posicionamento → tipos do Brain:
 *   tagline/propósito/posicionamento/diferenciais → posicionamento (verdade)
 *   produtos                                       → oferta_produto (verdade)
 *   provas (clientes/depoimentos/prêmios/números)  → institucional (referência)
 */

import { runLente1 } from "@/lib/diagnostico/lente1";
import { normalizeSiteUrl } from "@/lib/discovery";
import { runWithUsage } from "@/lib/usage/context";
import type { Campo, Posicionamento, Produto } from "@/lib/diagnostico/schema";

import { addBrainItems, brainItemId } from "./store";
import type { BrainAutoridade, BrainItem, BrainTipo } from "./schema";

/** Um Campo ACHADO (valor não-nulo) vira um item inferido — com fonte + data. */
function campoParaItem(c: Campo | undefined | null, tipo: BrainTipo, autoridade: BrainAutoridade): BrainItem | null {
  if (!c || c.status !== "encontrado" || !c.valor) return null;
  const texto = c.valor.replace(/\s+/g, " ").trim();
  if (!texto) return null;
  return { id: brainItemId(tipo, texto), texto, tipo, autoridade, status: "inferido", origem: "site", fonte_url: c.fonte_url, data: c.data_coleta };
}

function produtoParaItem(p: Produto): BrainItem | null {
  const texto = (p.descricao ? `${p.nome} — ${p.descricao}` : p.nome).replace(/\s+/g, " ").trim();
  if (!texto) return null;
  return { id: brainItemId("oferta_produto", texto), texto, tipo: "oferta_produto", autoridade: "verdade", status: "inferido", origem: "site", fonte_url: p.fonte_url, data: p.data_coleta };
}

/** Extrai os itens (inferidos) do Posicionamento da Lente 1 — pura, dedupe por id. */
export function itensDoPosicionamento(pos: Posicionamento): BrainItem[] {
  const bruto: Array<BrainItem | null> = [
    campoParaItem(pos.tagline, "posicionamento", "verdade"),
    campoParaItem(pos.proposito, "posicionamento", "verdade"),
    campoParaItem(pos.posicionamento, "posicionamento", "verdade"),
    ...pos.diferenciais.map((d) => campoParaItem(d, "posicionamento", "verdade")),
    ...pos.produtos.map((p) => produtoParaItem(p)),
    ...pos.provas.clientes_citados.map((c) => campoParaItem(c, "institucional", "referencia")),
    campoParaItem(pos.provas.depoimentos, "institucional", "referencia"),
    ...pos.provas.premiacoes.map((c) => campoParaItem(c, "institucional", "referencia")),
    ...pos.provas.big_numbers.map((c) => campoParaItem(c, "institucional", "referencia")),
  ];
  const seen = new Set<string>();
  const itens: BrainItem[] = [];
  for (const it of bruto) {
    if (!it || seen.has(it.id)) continue;
    seen.add(it.id);
    itens.push(it);
  }
  return itens;
}

export type DescobertaResult = {
  ok: boolean;
  added: number;
  skipped: number;
  encontrados: number;
  paginas: string[];
  erro?: string;
};

/**
 * Descobre conhecimento do SITE do cliente e grava como itens INFERIDOS (aguardam
 * a curadoria). Nunca lança; devolve `erro` honesto quando o site não deu fatos.
 */
export async function descobrirDoSite(cliente: string, siteUrl: string): Promise<DescobertaResult> {
  const vazio = (erro: string): DescobertaResult => ({ ok: false, added: 0, skipped: 0, encontrados: 0, paginas: [], erro });
  if (!siteUrl?.trim()) return vazio("Informe o site do cliente.");
  const url = normalizeSiteUrl(siteUrl);
  try {
    const lente1 = await runWithUsage({ clientName: cliente, feature: "brain_descoberta" }, () => runLente1(cliente, url));
    const itens = itensDoPosicionamento(lente1.posicionamento);
    if (itens.length === 0) {
      return { ok: true, added: 0, skipped: 0, encontrados: 0, paginas: lente1.paginas, erro: "O site não deixou fatos claros pra extrair (nada foi inventado)." };
    }
    const { added, skipped } = await addBrainItems(cliente, itens);
    return { ok: true, added, skipped, encontrados: itens.length, paginas: lente1.paginas };
  } catch (e) {
    return vazio(e instanceof Error ? e.message : "falha ao ler o site");
  }
}
