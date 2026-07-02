/**
 * Smoke test da F2 — o "juiz" do CADASTRO DE QUEM VIGIAR (watchlist).
 *
 * Prova, num diretório ISOLADO (RADAR_DATA_DIR temporário — não toca no
 * data/ real), que:
 *   1. o seed preserva o F1 (Moovefy + RD Station habilitado);
 *   2. adicionar concorrente persiste no disco e entra no plano de coleta;
 *   3. pausar tira do plano / reativar devolve;
 *   4. remover apaga da lista;
 *   5. entradas inválidas são rejeitadas com mensagem amigável SEM corromper a lista;
 *   6. o alvo do seed é exatamente o que o coletor do F1 varria (continuidade).
 *
 * Não gasta créditos Firecrawl nem chamadas de LLM — só disco.
 * Uso: npm run smoke:f2
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// IMPORTANTE: definir o data dir isolado ANTES de importar a lib.
const TEMP_DIR = mkdtempSync(join(tmpdir(), "radar-watchlist-"));
process.env.RADAR_DATA_DIR = TEMP_DIR;

const {
  addCompetitor,
  planCollection,
  readWatchlist,
  removeCompetitor,
  setCompetitorEnabled,
  WATCHLIST_SEED,
} = await import("@/lib/watchlist");

type Criterio = { nome: string; feito: boolean; detalhe?: string };

function alvoIds(): string[] {
  return planCollection(readWatchlist()).map((t) => t.competitor.id);
}

/** Relê o arquivo DIRETO do disco (prova persistência, não só memória). */
function idsNoDisco(): string[] {
  const raw = JSON.parse(readFileSync(join(TEMP_DIR, "watchlist.json"), "utf8"));
  return raw.clients.flatMap((c: { competitors: Array<{ id: string }> }) =>
    c.competitors.map((comp) => comp.id),
  );
}

function rodar(): Criterio[] {
  const criterios: Criterio[] = [];
  const CLIENTE = "Moovefy";

  // 1) Seed preserva o F1.
  const seedLido = readWatchlist();
  const rd = seedLido.clients
    .find((c) => c.name === CLIENTE)
    ?.competitors.find((c) => c.id === "rd-station");
  criterios.push({
    nome: "Seed preserva o F1 (Moovefy + RD Station habilitado)",
    feito: Boolean(rd?.enabled),
    detalhe: rd ? `rd-station enabled=${rd.enabled}` : "rd-station ausente do seed",
  });

  // 2) Adicionar concorrente persiste e entra no plano.
  let addOk = false;
  let addDetalhe = "";
  try {
    addCompetitor(CLIENTE, {
      name: "HubSpot",
      blogUrl: "https://br.hubspot.com/blog",
      siteUrl: "https://br.hubspot.com/",
    });
    const noDisco = idsNoDisco().includes("hubspot");
    const noPlano = alvoIds().includes("hubspot");
    addOk = noDisco && noPlano;
    addDetalhe = `no disco=${noDisco}, no plano de coleta=${noPlano}`;
  } catch (err) {
    addDetalhe = `falhou: ${(err as Error).message}`;
  }
  criterios.push({
    nome: "Adicionar concorrente persiste no disco e entra no plano",
    feito: addOk,
    detalhe: addDetalhe,
  });

  // 3) Pausar tira do plano; reativar devolve.
  let toggleOk = false;
  let toggleDetalhe = "";
  try {
    setCompetitorEnabled(CLIENTE, "hubspot", false);
    const saiu = !alvoIds().includes("hubspot");
    setCompetitorEnabled(CLIENTE, "hubspot", true);
    const voltou = alvoIds().includes("hubspot");
    toggleOk = saiu && voltou;
    toggleDetalhe = `pausado sai do plano=${saiu}, reativado volta=${voltou}`;
  } catch (err) {
    toggleDetalhe = `falhou: ${(err as Error).message}`;
  }
  criterios.push({
    nome: "Pausar tira do plano de coleta / reativar devolve",
    feito: toggleOk,
    detalhe: toggleDetalhe,
  });

  // 4) Remover apaga da lista (e do disco).
  let removeOk = false;
  let removeDetalhe = "";
  try {
    removeCompetitor(CLIENTE, "hubspot");
    removeOk = !idsNoDisco().includes("hubspot") && !alvoIds().includes("hubspot");
    removeDetalhe = removeOk ? "hubspot removido do disco e do plano" : "hubspot ainda presente";
  } catch (err) {
    removeDetalhe = `falhou: ${(err as Error).message}`;
  }
  criterios.push({
    nome: "Remover apaga o concorrente",
    feito: removeOk,
    detalhe: removeDetalhe,
  });

  // 5) Entradas inválidas rejeitadas com mensagem amigável, lista intacta.
  const casosInvalidos: Array<{ caso: string; fn: () => void }> = [
    { caso: "nome vazio", fn: () => addCompetitor(CLIENTE, { name: "  ", blogUrl: "https://x.com/blog" }) },
    { caso: "URL inválida", fn: () => addCompetitor(CLIENTE, { name: "Alguém", blogUrl: "nao-e-url" }) },
    { caso: "duplicado", fn: () => addCompetitor(CLIENTE, { name: "RD Station", blogUrl: "https://outro.com/blog" }) },
  ];
  const antes = JSON.stringify(readWatchlist());
  const rejeicoes: string[] = [];
  for (const { caso, fn } of casosInvalidos) {
    try {
      fn();
      rejeicoes.push(`${caso}: ACEITO (errado!)`);
    } catch (err) {
      const msg = (err as Error).message;
      // mensagem amigável = pt-BR, sem stack/jargão — checamos que existe e é curta.
      if (msg.length > 0 && msg.length < 120) rejeicoes.push(`${caso}: rejeitado`);
      else rejeicoes.push(`${caso}: rejeitado com msg estranha`);
    }
  }
  const intacta = JSON.stringify(readWatchlist()) === antes;
  const todasRejeitadas = rejeicoes.every((r) => r.endsWith(": rejeitado"));
  criterios.push({
    nome: "Entradas inválidas rejeitadas (msg amigável) sem corromper a lista",
    feito: todasRejeitadas && intacta,
    detalhe: `${rejeicoes.join("; ")}; lista intacta=${intacta}`,
  });

  // 6) Continuidade do F1: o alvo do seed é o MESMO blog que o coletor do F1 varria.
  const alvoSeed = planCollection(WATCHLIST_SEED)[0];
  const continuidade =
    alvoSeed?.clientName === "Moovefy" &&
    alvoSeed?.source.url === "https://www.rdstation.com/blog/";
  criterios.push({
    nome: "Continuidade: alvo do seed == blog que o F1 varria",
    feito: continuidade,
    detalhe: alvoSeed
      ? `${alvoSeed.clientName} <- ${alvoSeed.competitor.name} (${alvoSeed.source.url})`
      : "seed sem alvo de coleta",
  });

  // 7) FONTES (descoberta): adicionar com múltiplas fontes -> só as coletáveis
  //    entram no plano; produto/vagas ficam registradas (fase futura).
  let fontesOk = false;
  let fontesDetalhe = "";
  try {
    addCompetitor(CLIENTE, {
      name: "Pipefy",
      siteUrl: "https://www.pipefy.com/",
      sources: [
        { kind: "blog", url: "https://www.pipefy.com/blog/" },
        { kind: "vagas", url: "https://www.pipefy.com/careers/" },
      ],
    });
    const alvos = planCollection(readWatchlist()).filter((t) => t.competitor.id === "pipefy");
    const registrado = readWatchlist()
      .clients.find((c) => c.name === CLIENTE)
      ?.competitors.find((c) => c.id === "pipefy");
    fontesOk =
      alvos.length === 1 &&
      alvos[0].source.kind === "blog" &&
      registrado?.sources.length === 2;
    fontesDetalhe = `plano coleta=${alvos.map((t) => t.source.kind).join(",") || "nada"}; registradas=${registrado?.sources.length ?? 0}`;
    removeCompetitor(CLIENTE, "pipefy");
  } catch (err) {
    fontesDetalhe = `falhou: ${(err as Error).message}`;
  }
  criterios.push({
    nome: "Fontes múltiplas: coletáveis entram no plano, vagas fica só registrada",
    feito: fontesOk,
    detalhe: fontesDetalhe,
  });

  // 8) MIGRAÇÃO: arquivo no formato antigo (blogUrl) é lido e vira `sources`.
  let migraOk = false;
  let migraDetalhe = "";
  try {
    const legado = {
      clients: [
        {
          name: CLIENTE,
          competitors: [
            {
              id: "antigo",
              name: "Antigo",
              blogUrl: "https://antigo.com/blog/",
              enabled: true,
            },
          ],
        },
      ],
    };
    writeFileSync(join(TEMP_DIR, "watchlist.json"), JSON.stringify(legado), "utf8");
    const lido = readWatchlist();
    const migrado = lido.clients[0].competitors.find((c) => c.id === "antigo");
    const noPlano = planCollection(lido).some(
      (t) => t.competitor.id === "antigo" && t.source.url === "https://antigo.com/blog/",
    );
    migraOk = migrado?.sources?.[0]?.kind === "blog" && noPlano;
    migraDetalhe = `sources=${migrado?.sources?.length ?? 0}, no plano=${noPlano}`;
  } catch (err) {
    migraDetalhe = `falhou: ${(err as Error).message}`;
  }
  criterios.push({
    nome: "Migração: formato antigo (blogUrl) vira fontes sem perder o alvo",
    feito: migraOk,
    detalhe: migraDetalhe,
  });

  return criterios;
}

function main(): void {
  console.log("\n=== Smoke F2 — Cadastro de quem vigiar (watchlist) ===\n");
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
    console.log("F2 (watchlist) VERDE ✅ — o Rafael dirige quem o Radar observa.");
    process.exit(0);
  }
  console.log("F2 ainda NÃO completa — critérios acima em branco.");
  process.exit(1);
}

main();
