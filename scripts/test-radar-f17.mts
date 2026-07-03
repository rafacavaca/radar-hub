/**
 * Smoke test da F17+F18 — os últimos refinamentos do upgrade de cobertura.
 *
 * F17 (render JS + busca-web):
 *   1. isEmptyShell (o gatilho "conteúdo vazio"): casca JS dispara; página
 *      normal não dispara (função pura);
 * F18 (status por fonte — transparência):
 *   2. recordSourceRun/listSourceStatus: rodada com sinais, sem novidade e
 *      com falha ficam registradas por fonte (store isolado);
 *   3. forgetCompetitorStatus limpa só o concorrente removido.
 *
 * (A busca-web usa crédito e só dispara em descoberta pobre — coberta pelo
 * código defensivo: searchWeb devolve [] em falha, testado indiretamente.)
 * Uso: npm run smoke:f17
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEMP_DIR = mkdtempSync(join(tmpdir(), "radar-status-"));
process.env.RADAR_DATA_DIR = TEMP_DIR;

const { isEmptyShell } = await import("@/lib/collectors/blog");
const { forgetCompetitorStatus, listSourceStatus, recordSourceRun } = await import(
  "@/lib/source-status"
);

type Criterio = { nome: string; feito: boolean; detalhe?: string };

function rodar(): Criterio[] {
  const criterios: Criterio[] = [];

  // 1) gatilho de render: casca JS dispara; página normal não.
  const casca = isEmptyShell("<div id=app></div>", []);
  const normal = isEmptyShell(
    "# Blog\n\n" + "Um artigo interessante sobre o mercado. ".repeat(10),
    ["https://x.com/a", "https://x.com/b", "https://x.com/c", "https://x.com/d", "https://x.com/e"],
  );
  criterios.push({
    nome: "Gatilho 'conteúdo vazio': casca JS dispara render; página normal não",
    feito: casca === true && normal === false,
    detalhe: `casca=${casca}, normal=${normal}`,
  });

  // 2) status por fonte: sinais / sem novidade / falhou.
  recordSourceRun("brainr", "vagas-1", { eventos: 2 });
  recordSourceRun("brainr", "blog-1", { eventos: 0 });
  recordSourceRun("agrosys", "blog-2", { eventos: 0, erro: "timeout" });
  const status = listSourceStatus();
  const ok =
    status["brainr:vagas-1"]?.eventos === 2 &&
    status["brainr:blog-1"]?.eventos === 0 &&
    !status["brainr:blog-1"]?.erro &&
    status["agrosys:blog-2"]?.erro === "timeout";
  criterios.push({
    nome: "Status por fonte: 'N sinais' / 'sem novidade' / 'falhou' registrados",
    feito: ok,
    detalhe: `chaves=${Object.keys(status).length}; vagas=2 sinais, blog=0, agrosys erro=timeout`,
  });

  // 3) remover concorrente limpa só ele.
  forgetCompetitorStatus("brainr");
  const depois = listSourceStatus();
  const limpou =
    !depois["brainr:vagas-1"] && !depois["brainr:blog-1"] && Boolean(depois["agrosys:blog-2"]);
  criterios.push({
    nome: "Remover concorrente limpa só o status dele (o resto fica)",
    feito: limpou,
    detalhe: `brainr limpo=${!depois["brainr:vagas-1"]}, agrosys vivo=${Boolean(depois["agrosys:blog-2"])}`,
  });

  return criterios;
}

function main(): void {
  console.log("\n=== Smoke F17+F18 — Render JS (gatilho) + status por fonte ===\n");
  let tudoVerde = true;
  try {
    for (const c of rodar()) {
      console.log(`${c.feito ? "✅" : "⬜"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
      if (!c.feito) tudoVerde = false;
    }
  } finally {
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  console.log();
  if (tudoVerde) {
    console.log("F17+F18 VERDE ✅ — renderiza só quando precisa e diz o que cada fonte rendeu.");
    process.exit(0);
  }
  console.log("F17+F18 ainda NÃO completa — critérios acima em branco.");
  process.exit(1);
}

main();
