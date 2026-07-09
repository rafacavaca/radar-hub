/**
 * AGREGAÇÃO dos usage_events — funções PURAS (o painel e o smoke consomem daqui).
 *
 * O número-chave pra pricing é o CUSTO MARGINAL de monitorar mais uma entidade
 * (concorrente/conta) ou mais um cliente — por isso agregamos por recorte:
 * cliente · feature · entidade · provider · modelo, e derivamos o custo médio
 * por entidade monitorada.
 *
 * Tudo em USD, marcado como ESTIMATIVA (tabela de preço, não fatura).
 */

import type { UsageEvent } from "@/lib/usage/store";

export type Bucket = {
  chave: string;
  rotulo: string;
  chamadas: number;
  tokensIn: number;
  tokensOut: number;
  unidades: number;
  custo: number;
};

export type Totais = {
  chamadas: number;
  tokensIn: number;
  tokensOut: number;
  unidades: number;
  custo: number;
  custoProvedor: number;
};

function novo(chave: string, rotulo: string): Bucket {
  return { chave, rotulo, chamadas: 0, tokensIn: 0, tokensOut: 0, unidades: 0, custo: 0 };
}

function soma(b: Bucket, e: UsageEvent): void {
  b.chamadas += 1;
  b.tokensIn += e.tokensIn ?? 0;
  b.tokensOut += e.tokensOut ?? 0;
  b.unidades += e.unidades ?? 0;
  b.custo += e.custoEstimado;
}

/** Agrupa por uma chave derivada; ordena por custo DESC. */
export function agruparPor(
  events: UsageEvent[],
  chaveDe: (e: UsageEvent) => { chave: string; rotulo: string } | null,
): Bucket[] {
  const mapa = new Map<string, Bucket>();
  for (const e of events) {
    const k = chaveDe(e);
    if (!k) continue;
    const b = mapa.get(k.chave) ?? novo(k.chave, k.rotulo);
    soma(b, e);
    mapa.set(k.chave, b);
  }
  return [...mapa.values()].sort((a, b) => b.custo - a.custo);
}

export function porFeature(events: UsageEvent[]): Bucket[] {
  return agruparPor(events, (e) => ({ chave: e.feature, rotulo: e.feature }));
}

export function porCliente(events: UsageEvent[]): Bucket[] {
  return agruparPor(events, (e) => {
    const nome = e.clientName ?? "(sem cliente)";
    return { chave: nome, rotulo: nome };
  });
}

export function porProvider(events: UsageEvent[]): Bucket[] {
  return agruparPor(events, (e) => ({ chave: e.provider, rotulo: e.provider }));
}

export function porModelo(events: UsageEvent[]): Bucket[] {
  return agruparPor(events, (e) => ({ chave: e.modelo ?? e.provider, rotulo: e.modelo ?? e.provider }));
}

/** Por entidade monitorada (concorrente/conta) — a base do custo marginal. */
export function porEntidade(events: UsageEvent[]): Bucket[] {
  return agruparPor(events, (e) => {
    if (!e.entidadeId || (e.entidadeTipo !== "concorrente" && e.entidadeTipo !== "conta")) return null;
    const rotulo = `${e.entidadeNome ?? e.entidadeId} · ${e.entidadeTipo}`;
    return { chave: `${e.entidadeTipo}:${e.entidadeId}`, rotulo };
  });
}

export function totais(events: UsageEvent[]): Totais {
  const t: Totais = { chamadas: 0, tokensIn: 0, tokensOut: 0, unidades: 0, custo: 0, custoProvedor: 0 };
  for (const e of events) {
    t.chamadas += 1;
    t.tokensIn += e.tokensIn ?? 0;
    t.tokensOut += e.tokensOut ?? 0;
    t.unidades += e.unidades ?? 0;
    t.custo += e.custoEstimado;
    t.custoProvedor += e.custoProvedor ?? 0;
  }
  return t;
}

/**
 * CUSTO MARGINAL por entidade monitorada: custo médio de UMA entidade
 * (concorrente/conta) no período. É o número que orienta "cobrar por entidade".
 * Devolve também a extrapolação mensal (÷ dias observados × 30) quando dá.
 */
export function custoMarginalEntidade(events: UsageEvent[]): {
  entidades: number;
  custoTotal: number;
  custoMedioPorEntidade: number;
} {
  const buckets = porEntidade(events);
  const custoTotal = buckets.reduce((s, b) => s + b.custo, 0);
  return {
    entidades: buckets.length,
    custoTotal,
    custoMedioPorEntidade: buckets.length > 0 ? custoTotal / buckets.length : 0,
  };
}

/** Custo por dia (YYYY-MM-DD) — a série pro gráfico/tendência. */
export function porDia(events: UsageEvent[]): Bucket[] {
  return agruparPor(events, (e) => {
    const dia = e.ts.slice(0, 10);
    return { chave: dia, rotulo: dia };
  }).sort((a, b) => a.chave.localeCompare(b.chave));
}

export const fmtUSD = (v: number): string =>
  v >= 0.01 ? `$${v.toFixed(2)}` : v > 0 ? `$${v.toFixed(4)}` : "$0";
