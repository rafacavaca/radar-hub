/**
 * Smoke test da F6 — o "juiz" dos ANALISTAS POR ÓTICA.
 *
 * O que prova (da spec do Rafael):
 *   1. config: defaults semeados por cliente (3 lentes ativas, régua padrão);
 *   2. editar a régua persiste; reset volta ao padrão; desligar tira das ativas;
 *   3. A RÉGUA MANDA: com réguas cirúrgicas e um sinal de teste que menciona
 *      preço+campanha (e NADA de integração), comercial e marketing produzem
 *      leitura e produto NÃO — 1 sinal -> exatamente 2 leituras (e o irrelevante
 *      não aparece na lente dele). Isto também prova que EDITAR a régua muda o
 *      que sobe (as réguas do teste são editadas de propósito);
 *   4. fontes das leituras = o evento REAL (url mapeada — nunca inventada);
 *   5. visão GERAL deduplica: 2 leituras do mesmo sinal viram 1 item com as
 *      2 lentes marcadas.
 *
 * Custo: 3 chamadas ao gateway (uma por lente). 0 créditos Firecrawl.
 * Uso: npm run smoke:f6
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { config } from "dotenv";

config({ path: ".env.local" });

// dir ISOLADO antes de importar as libs (config/watchlist de teste).
const TEMP_DIR = mkdtempSync(join(tmpdir(), "radar-lenses-"));
process.env.RADAR_DATA_DIR = TEMP_DIR;

const { activeLensesFor, lensesFor, LENS_DEFAULTS, resetLens, updateLens } = await import(
  "@/lib/lenses"
);
const { analyzeLens } = await import("@/lib/analyst-lens");
const { buildGeneralItems } = await import("@/lib/loop");

import type { LensConfig } from "@/lib/lenses";
import type { LensReading, RawEvent } from "@/lib/types";

const CLIENTE = "Moovefy";

type Criterio = { nome: string; feito: boolean; detalhe?: string };

/** O sinal de teste: fala de PREÇO e CAMPANHA/posicionamento; nada de integração. */
const EVENTO: RawEvent = {
  id: "evt-smoke-f6",
  source: "concorrente-x",
  competitorName: "Concorrente X",
  kind: "news",
  url: "https://example.com/concorrente-x/corte-de-precos",
  title: "Concorrente X corta preços em 30% e lança campanha 'CRM premium pela metade do preço'",
  description:
    "O Concorrente X anunciou corte de 30% nos preços de todos os planos e uma campanha " +
    "agressiva de posicionamento contra CRMs 'caros', com nova mensagem no site.",
  collectedAt: new Date().toISOString(),
};

const BRAIN =
  "A Moovefy vende CRM/SFA B2B customizável para indústrias e distribuidores; " +
  "diferencial é adaptação ao processo do cliente (não é o mais barato do mercado).";

/** Réguas CIRÚRGICAS (verificáveis): cada lente só sobe com a palavra-chave dela. */
const REGUAS: Record<string, string> = {
  comercial:
    "Um movimento SÓ é relevante se mencionar explicitamente PREÇO, desconto ou condição " +
    "comercial do concorrente. Qualquer outro assunto: ignore e não gere leitura.",
  marketing:
    "Um movimento SÓ é relevante se mencionar explicitamente campanha, mensagem ou " +
    "posicionamento do concorrente. Qualquer outro assunto: ignore e não gere leitura.",
  produto:
    "Um movimento SÓ é relevante se mencionar explicitamente integração com ERP. " +
    "Preço, campanha, posicionamento ou qualquer outro assunto: ignore e não gere leitura.",
};

async function rodar(): Promise<Criterio[]> {
  const criterios: Criterio[] = [];

  // 1) Defaults semeados.
  const lentes = lensesFor(CLIENTE);
  const seedOk =
    lentes.length === 3 &&
    lentes.every((l) => l.enabled && l.regua.length > 30) &&
    lentes.some((l) => l.id === "produto" && l.regua === LENS_DEFAULTS.produto.regua);
  criterios.push({
    nome: "Config semeada: 3 lentes ativas com régua padrão pré-preenchida",
    feito: seedOk,
    detalhe: `${lentes.length} lentes; ativas=${lentes.filter((l) => l.enabled).length}`,
  });

  // 2) Editar persiste; reset volta; desligar sai das ativas.
  let crudOk = false;
  let crudDetalhe = "";
  try {
    updateLens(CLIENTE, "produto", { regua: REGUAS.produto });
    const editada = lensesFor(CLIENTE).find((l) => l.id === "produto")?.regua === REGUAS.produto;
    resetLens(CLIENTE, "produto");
    const resetada =
      lensesFor(CLIENTE).find((l) => l.id === "produto")?.regua === LENS_DEFAULTS.produto.regua;
    updateLens(CLIENTE, "marketing", { enabled: false });
    const saiu = !activeLensesFor(CLIENTE).some((l) => l.id === "marketing");
    updateLens(CLIENTE, "marketing", { enabled: true });
    const voltou = activeLensesFor(CLIENTE).some((l) => l.id === "marketing");
    crudOk = editada && resetada && saiu && voltou;
    crudDetalhe = `editar=${editada}, reset=${resetada}, desligar sai=${saiu}, ligar volta=${voltou}`;
  } catch (err) {
    crudDetalhe = `falhou: ${(err as Error).message}`;
  }
  criterios.push({
    nome: "Editar régua persiste · reset volta ao padrão · desligar tira das ativas",
    feito: crudOk,
    detalhe: crudDetalhe,
  });

  // 3+4) A régua manda (2 lentes pegam, 1 ignora) e as fontes são reais.
  const readings: LensReading[] = [];
  const porLente: Record<string, number> = {};
  try {
    for (const id of ["comercial", "produto", "marketing"] as const) {
      const lens: LensConfig = {
        id,
        enabled: true,
        team: lensesFor(CLIENTE).find((l) => l.id === id)?.team ?? "time",
        action: id === "comercial" ? "abordagem" : id === "produto" ? "nota_roadmap" : "brief_conteudo",
        regua: REGUAS[id],
      };
      const out = await analyzeLens(lens, [EVENTO], CLIENTE, BRAIN);
      porLente[id] = out.length;
      readings.push(...out);
    }
    const duasLeituras =
      (porLente.comercial ?? 0) >= 1 && (porLente.marketing ?? 0) >= 1 && porLente.produto === 0;
    criterios.push({
      nome: "A régua manda: sinal de preço+campanha -> comercial e marketing leem, produto ignora",
      feito: duasLeituras,
      detalhe: `comercial=${porLente.comercial}, marketing=${porLente.marketing}, produto=${porLente.produto}`,
    });

    const fontesReais = readings.every((r) => r.fonte.url === EVENTO.url);
    criterios.push({
      nome: "Toda leitura cita a fonte REAL do sinal (mapeada, nunca inventada)",
      feito: readings.length > 0 && fontesReais,
      detalhe: `${readings.length} leitura(s), fontes ok=${fontesReais}`,
    });
  } catch (err) {
    criterios.push({
      nome: "A régua manda: sinal de preço+campanha -> comercial e marketing leem, produto ignora",
      feito: false,
      detalhe: `falhou: ${(err as Error).message}`,
    });
  }

  // 5) Geral deduplica: leituras do MESMO sinal viram 1 item com N lentes.
  const geral = buildGeneralItems(readings);
  const item = geral[0];
  const dedupeOk =
    geral.length === 1 &&
    (item?.lentes?.length ?? 0) === readings.length &&
    readings.length >= 2;
  criterios.push({
    nome: "Visão Geral deduplica: 1 sinal com 2 leituras vira 1 item marcado com as 2 lentes",
    feito: dedupeOk,
    detalhe: item
      ? `${geral.length} item; lentes=[${(item.lentes ?? []).join(", ")}]`
      : "geral vazio",
  });

  return criterios;
}

async function main(): Promise<void> {
  console.log("\n=== Smoke F6 — Analistas por ótica (a régua manda) ===\n");
  let tudoVerde = true;
  try {
    for (const c of await rodar()) {
      console.log(`${c.feito ? "✅" : "⬜"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
      if (!c.feito) tudoVerde = false;
    }
  } finally {
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  console.log();
  if (tudoVerde) {
    console.log("F6 VERDE ✅ — cada lente lê pela própria régua, com fontes reais.");
    process.exit(0);
  }
  console.log("F6 ainda NÃO completa — critérios acima em branco.");
  process.exit(1);
}

main().catch((err) => {
  console.error("Smoke falhou com erro:", err);
  process.exit(1);
});
