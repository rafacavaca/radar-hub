/**
 * Smoke test da F16 — o "juiz" da RODADA GRANULAR (por cliente/concorrente).
 *
 * O coração é o MERGE (função pura `mergeLoopResult`) — sem rede, sem LLM:
 *   1. rodada de UM CONCORRENTE troca só as leituras/eventos DELE; o outro
 *      concorrente do mesmo cliente e o OUTRO CLIENTE ficam intactos;
 *   2. a visão Geral é re-derivada do conjunto mesclado;
 *   3. rodada de CLIENTE inteiro troca tudo do cliente, preserva os demais;
 *   4. rodada VAZIA sem falhas ("nada novo") NÃO apaga nada — só atualiza o
 *      carimbo (honestidade: sem coleta não se joga intel fora);
 *   5. brainSources é upsert por cliente.
 *
 * Uso: npm run smoke:f16
 */

import { mergeLoopResult, type RadarLoopResult, type ClientEvent } from "@/lib/loop";
import type { LensReading } from "@/lib/types";

type Criterio = { nome: string; feito: boolean; detalhe?: string };

function reading(
  clientName: string,
  concorrente: string,
  sinal: string,
  score: number,
  eventId: string,
): LensReading {
  return {
    id: `${concorrente}-${sinal}`.replace(/\s+/g, "-").toLowerCase(),
    clientName,
    lens: "comercial",
    sinal,
    leitura: "leitura",
    acao: "ação",
    score,
    fonte: { url: `https://x.com/${eventId}`, titulo: sinal },
    concorrente,
    eventIds: [eventId],
    createdAt: "2026-07-03T10:00:00Z",
  };
}

function event(clientName: string, source: string, id: string): ClientEvent {
  return {
    id,
    source,
    competitorName: source,
    kind: "blog",
    url: `https://x.com/${id}`,
    title: id,
    collectedAt: "2026-07-03T10:00:00Z",
    clientName,
  } as ClientEvent;
}

const BASE: RadarLoopResult = {
  items: [],
  readings: [
    reading("Moovefy", "RD Station", "rd velho", 50, "ev-rd-1"),
    reading("Moovefy", "Ploomes", "ploomes velho", 60, "ev-pl-1"),
    reading("TAGAT Foodtech", "Mtech", "mtech velho", 70, "ev-mt-1"),
  ],
  crossInsights: [],
  events: [
    event("Moovefy", "rd-station", "ev-rd-1"),
    event("Moovefy", "ploomes", "ev-pl-1"),
    event("TAGAT Foodtech", "mtech", "ev-mt-1"),
  ],
  ranAt: "2026-07-03T10:00:00Z",
  brainSources: [
    { clientName: "Moovefy", mode: "live", nodeCount: 31 },
    { clientName: "TAGAT Foodtech", mode: "live", nodeCount: 12 },
  ],
};

function rodar(): Criterio[] {
  const criterios: Criterio[] = [];

  // 1) rodada de UM concorrente (Ploomes da Moovefy).
  const m1 = mergeLoopResult(
    BASE,
    { clientName: "Moovefy", competitorId: "ploomes", competitorName: "Ploomes" },
    {
      events: [event("Moovefy", "ploomes", "ev-pl-2")],
      readings: [reading("Moovefy", "Ploomes", "ploomes NOVO", 90, "ev-pl-2")],
      crossInsights: [],
      brainSource: { clientName: "Moovefy", mode: "live", nodeCount: 31 },
      failures: [],
    },
  );
  const rdIntacto = m1.readings!.some((r) => r.sinal === "rd velho");
  const tagatIntacto = m1.readings!.some((r) => r.sinal === "mtech velho");
  const ploomesTrocado =
    m1.readings!.some((r) => r.sinal === "ploomes NOVO") &&
    !m1.readings!.some((r) => r.sinal === "ploomes velho");
  const eventoTrocado =
    m1.events!.some((e) => e.id === "ev-pl-2") && !m1.events!.some((e) => e.id === "ev-pl-1");
  criterios.push({
    nome: "Rodar 1 concorrente troca SÓ ele (outro concorrente e outro cliente intactos)",
    feito: rdIntacto && tagatIntacto && ploomesTrocado && eventoTrocado,
    detalhe: `rd=${rdIntacto}, tagat=${tagatIntacto}, ploomes trocado=${ploomesTrocado}, evento=${eventoTrocado}`,
  });

  // 2) Geral re-derivada do conjunto mesclado (o novo score 90 lidera).
  const geralOk = m1.items[0]?.sinal === "ploomes NOVO" && m1.items.length === 3;
  criterios.push({
    nome: "Visão Geral re-derivada do conjunto mesclado (novo item lidera)",
    feito: geralOk,
    detalhe: `top="${m1.items[0]?.sinal}", itens=${m1.items.length}`,
  });

  // 3) rodada de CLIENTE inteiro (Moovefy) troca os dois concorrentes dela.
  const m2 = mergeLoopResult(
    BASE,
    { clientName: "Moovefy" },
    {
      events: [event("Moovefy", "rd-station", "ev-rd-9")],
      readings: [reading("Moovefy", "RD Station", "rd NOVO", 80, "ev-rd-9")],
      crossInsights: [],
      brainSource: { clientName: "Moovefy", mode: "live", nodeCount: 31 },
      failures: [],
    },
  );
  const moovefyTrocada =
    m2.readings!.some((r) => r.sinal === "rd NOVO") &&
    !m2.readings!.some((r) => r.sinal === "ploomes velho") &&
    !m2.readings!.some((r) => r.sinal === "rd velho");
  const outroClienteVivo = m2.readings!.some((r) => r.sinal === "mtech velho");
  criterios.push({
    nome: "Rodar o CLIENTE troca tudo dele; o outro cliente permanece",
    feito: moovefyTrocada && outroClienteVivo,
    detalhe: `moovefy trocada=${moovefyTrocada}, tagat vivo=${outroClienteVivo}`,
  });

  // 4) "nada novo" (vazio, sem falhas) NÃO apaga nada.
  const m3 = mergeLoopResult(
    BASE,
    { clientName: "Moovefy", competitorId: "ploomes", competitorName: "Ploomes" },
    {
      events: [],
      readings: [],
      crossInsights: [],
      brainSource: { clientName: "Moovefy", mode: "live", nodeCount: 31 },
      failures: [],
    },
  );
  const nadaApagado =
    m3.readings!.length === BASE.readings!.length && m3.events!.length === BASE.events!.length;
  const carimboNovo = m3.ranAt !== BASE.ranAt;
  criterios.push({
    nome: "'Nada novo' não apaga intel do dia (só atualiza o carimbo)",
    feito: nadaApagado && carimboNovo,
    detalhe: `leituras=${m3.readings!.length}/${BASE.readings!.length}, carimbo novo=${carimboNovo}`,
  });

  // 5) brainSources upsert (não duplica o cliente).
  const brains = m1.brainSources!.filter((b) => b.clientName === "Moovefy").length;
  criterios.push({
    nome: "brainSources: upsert por cliente (sem duplicar)",
    feito: brains === 1 && m1.brainSources!.length === 2,
    detalhe: `moovefy=${brains}, total=${m1.brainSources!.length}`,
  });

  return criterios;
}

function main(): void {
  console.log("\n=== Smoke F16 — Rodada granular (merge por escopo) ===\n");
  let tudoVerde = true;
  for (const c of rodar()) {
    console.log(`${c.feito ? "✅" : "⬜"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
    if (!c.feito) tudoVerde = false;
  }
  console.log();
  if (tudoVerde) {
    console.log("F16 VERDE ✅ — roda só o que você pediu; o resto do dia fica de pé.");
    process.exit(0);
  }
  console.log("F16 ainda NÃO completa — critérios acima em branco.");
  process.exit(1);
}

main();
