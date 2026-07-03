/**
 * Smoke test da F8 — o "juiz" dos RELATÓRIOS.
 *
 * Prova as duas formas deste lote + a entrega ao Formare, tudo em modo seguro:
 *   1. APROVEITAR DO CHAT: guardar uma resposta como relatório persiste no
 *      disco (dedupe: guardar de novo NÃO duplica);
 *   2. o relatório aparece em listReports (do cliente e no geral); apagar some;
 *   3. MONTAR SOB MEDIDA: composeReport reúne material e devolve documento com
 *      título e corpo, e as fontes são REAIS (mapeadas do material, nunca
 *      inventadas) — honesto;
 *   4. GERAR NO FORMARE (porta de escrita): a porta cria um card a partir do
 *      relatório (com a escrita ligada) OU recusa em modo seguro — em ambos o
 *      caminho é honesto (nunca perde o documento).
 *
 * Custo: 1 chamada ao gateway (composeReport). 0 créditos Firecrawl.
 * Uso: npm run smoke:f8
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { config } from "dotenv";

config({ path: ".env.local" });

const TEMP_DIR = mkdtempSync(join(tmpdir(), "radar-reports-"));
process.env.RADAR_DATA_DIR = TEMP_DIR;

const { composeReport, deleteReport, listReports, saveReport } = await import("@/lib/reports");
const { collectRecentItems } = await import("@/lib/ask");
const { sendReportToFormare } = await import("@/lib/formare-door");

const CLIENTE = "Moovefy";

type Criterio = { nome: string; feito: boolean; detalhe?: string };

async function rodar(): Promise<Criterio[]> {
  const criterios: Criterio[] = [];

  // 1) Aproveitar do chat: guardar persiste e não duplica.
  const corpo =
    "## Resumo\nResposta capturada do chat sobre os concorrentes.\n\n- Ponto um.\n- Ponto dois.";
  let dedupeOk = false;
  let dedupeDet = "";
  try {
    const a = saveReport({ clientName: CLIENTE, kind: "chat", corpo, origem: "o que os concorrentes fizeram?" });
    const b = saveReport({ clientName: CLIENTE, kind: "chat", corpo }); // mesmo corpo -> mesmo id
    dedupeOk = a.id === b.id && listReports().length === 1 && a.titulo.length > 0;
    dedupeDet = `id estável=${a.id === b.id}, total=${listReports().length}, titulo="${a.titulo.slice(0, 40)}"`;
  } catch (err) {
    dedupeDet = `falhou: ${(err as Error).message}`;
  }
  criterios.push({ nome: "Aproveitar do chat: guardar persiste e NÃO duplica", feito: dedupeOk, detalhe: dedupeDet });

  // 2) Lista por cliente e geral; apagar some.
  let listaOk = false;
  let listaDet = "";
  try {
    const doCliente = listReports(CLIENTE).length;
    const geral = listReports().length;
    const alvo = listReports()[0];
    deleteReport(alvo.id);
    const sumiu = listReports().length === geral - 1;
    listaOk = doCliente >= 1 && geral >= 1 && sumiu;
    listaDet = `cliente=${doCliente}, geral=${geral}, apagou=${sumiu}`;
  } catch (err) {
    listaDet = `falhou: ${(err as Error).message}`;
  }
  criterios.push({ nome: "Lista por cliente e geral · apagar remove", feito: listaOk, detalhe: listaDet });

  // 3) Montar sob medida: documento com título/corpo e fontes reais.
  const items = collectRecentItems();
  try {
    const draft = await composeReport(
      CLIENTE,
      "Monte um relatório curto sobre o movimento mais importante dos concorrentes e a ação recomendada.",
    );
    const fontesReais = draft.fontes.every((f) => items.some((it) => it.fonte.url === f.url));
    // guarda do bug do "titulo: json": nada de blob JSON/cerca de código no documento.
    const naoEhBlob =
      draft.titulo.trim().toLowerCase() !== "json" &&
      !/^\s*[{`]/.test(draft.corpo) &&
      !draft.corpo.includes('"corpo"');
    const bom =
      draft.titulo.trim().length > 0 && draft.corpo.trim().length > 120 && fontesReais && naoEhBlob;
    criterios.push({
      nome: "Montar sob medida: documento limpo (markdown, não blob JSON) com fontes REAIS",
      feito: bom,
      detalhe: `titulo="${draft.titulo.slice(0, 40)}", corpo=${draft.corpo.length} chars, fontes ok=${fontesReais}, limpo=${naoEhBlob}`,
    });

    // 4) Gerar no Formare a partir do relatório composto.
    const saved = saveReport({
      clientName: CLIENTE,
      kind: "sob-medida",
      titulo: draft.titulo,
      corpo: draft.corpo,
      fontes: draft.fontes,
    });
    const envio = await sendReportToFormare({
      clientName: saved.clientName,
      titulo: saved.titulo,
      corpo: saved.corpo,
    });
    const honesto =
      envio.ok &&
      ((envio.mode === "live" && "cardUrl" in envio && envio.cardUrl.includes("/cards/")) ||
        envio.mode === "dry-run");
    criterios.push({
      nome: "Gerar no Formare: relatório vira card (live) ou vai à caixa de saída (off) — sempre honesto",
      feito: honesto,
      detalhe:
        envio.mode === "live" && "cardUrl" in envio
          ? `live: ${envio.cardUrl}`
          : `modo=${envio.mode}, ok=${envio.ok}`,
    });
  } catch (err) {
    criterios.push({
      nome: "Montar sob medida: documento com título+corpo e fontes REAIS (honesto)",
      feito: false,
      detalhe: `falhou: ${(err as Error).message}`,
    });
  }

  return criterios;
}

async function main(): Promise<void> {
  console.log("\n=== Smoke F8 — Relatórios (aproveitar do chat + sob medida) ===\n");
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
    console.log("F8 VERDE ✅ — inteligência do chat/sob-medida vira documento e (opcional) card no Formare.");
    process.exit(0);
  }
  console.log("F8 ainda NÃO completa — critérios acima em branco.");
  process.exit(1);
}

main().catch((err) => {
  console.error("Smoke falhou com erro:", err);
  process.exit(1);
});
