/**
 * Smoke test da F13 — o "juiz" da DESCOBERTA/COLETA mais funda (Motor 1).
 *
 * Puro, sem rede — trava as correções que destravaram o Agrosys:
 *   1. isLikelyPostUrl reconhece artigo FORA de /blog (padrão /container/id/slug,
 *      ex.: Agrosys /noticia/38/slug) e rejeita nav de 1 segmento e sem-hífen;
 *   2. dominantContentCluster separa os ARTIGOS (o maior grupo de conteúdo) do
 *      ruído de navegação (/segmento, /solucao) — o que fazia o Agrosys render 0
 *      ou render lixo;
 *   3. rejeita seção de autor/categoria.
 *
 * Uso: npm run smoke:f13
 */

import { isLikelyPostUrl, dominantContentCluster } from "@/lib/collectors/blog";

type Criterio = { nome: string; feito: boolean; detalhe?: string };

const HOST = "www.agrosys.com.br";
const BASE = "/blog/";

function rodar(): Criterio[] {
  const criterios: Criterio[] = [];

  // 1) artigo fora de /blog é reconhecido; nav é rejeitada.
  const artigo = isLikelyPostUrl(`https://${HOST}/noticia/38/como-a-agrosys-garante-seguranca`, HOST, BASE);
  const navCurta = isLikelyPostUrl(`https://${HOST}/a-agrosys`, HOST, BASE); // 1 seg
  const semHifen = isLikelyPostUrl(`https://${HOST}/segmento/9/aves`, HOST, BASE); // sem hífen
  const padrao = isLikelyPostUrl(`https://${HOST}/blog/marketing/meu-post-longo`, HOST, BASE);
  criterios.push({
    nome: "Heurística: pega /noticia/38/slug (fora de /blog) e o padrão /blog/cat/slug; rejeita nav",
    feito: artigo && padrao && !navCurta && !semHifen,
    detalhe: `artigo=${artigo}, padrão=${padrao}, navCurta=${navCurta}, semHifen=${semHifen}`,
  });

  // 2) cluster dominante: separa artigos do ruído de nav.
  const misturado = [
    `https://${HOST}/noticia/38/a-longa`,
    `https://${HOST}/noticia/37/b-longa`,
    `https://${HOST}/noticia/36/c-longa`,
    `https://${HOST}/solucao/1/erp-backoffice`,
    `https://${HOST}/segmento/12/fabrica-de-racoes`,
  ];
  const cluster = dominantContentCluster(misturado);
  const soNoticias = cluster.length === 3 && cluster.every((u) => u.includes("/noticia/"));
  criterios.push({
    nome: "Cluster dominante: só os artigos (/noticia), sem /solucao nem /segmento",
    feito: soNoticias,
    detalhe: `${cluster.length} no cluster: ${cluster.map((u) => new URL(u).pathname.split("/")[1]).join(",")}`,
  });

  // 3) seção de autor/categoria é rejeitada.
  const autor = isLikelyPostUrl(`https://${HOST}/blog/autor/joao-silva`, HOST, BASE);
  const categoria = isLikelyPostUrl(`https://${HOST}/blog/categoria/mercado-agro`, HOST, BASE);
  criterios.push({
    nome: "Rejeita seção de autor/categoria (não é post)",
    feito: !autor && !categoria,
    detalhe: `autor=${autor}, categoria=${categoria}`,
  });

  return criterios;
}

function main(): void {
  console.log("\n=== Smoke F13 — Descoberta/coleta mais funda (Agrosys destravado) ===\n");
  let tudoVerde = true;
  for (const c of rodar()) {
    console.log(`${c.feito ? "✅" : "⬜"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
    if (!c.feito) tudoVerde = false;
  }
  console.log();
  if (tudoVerde) {
    console.log("F13 VERDE ✅ — pega artigos fora do padrão e separa do ruído de navegação.");
    process.exit(0);
  }
  console.log("F13 ainda NÃO completa — critérios acima em branco.");
  process.exit(1);
}

main();
