/**
 * Smoke test da F12 — o "juiz" da COLETA POR MUDANÇA (produto/vagas).
 *
 * O coração é a extração estrutural + o diff — puros, testáveis sem rede:
 *   1. structuralItems: extrai títulos/itens de lista/links (os "itens" da
 *      página — vagas, produtos) e ignora parágrafo corrido/ruído;
 *   2. diffItems: baseline (sem anterior) e estado igual -> sem mudança; item
 *      NOVO -> detectado em `added`; item que saiu -> `removed`;
 *   3. roteamento: produto/vagas são coletáveis por método "diff"; blog/notícias
 *      por "list" — e o "em breve" só sobra pra tipo realmente não coletado.
 *
 * Custo: 0 rede, 0 LLM. Uso: npm run smoke:f12
 */

import { config } from "dotenv";

config({ path: ".env.local" });

const { structuralItems, diffItems } = await import("@/lib/collectors/content-diff");
const { collectionMethod, COLLECTIBLE_KINDS } = await import("@/lib/watchlist");

type Criterio = { nome: string; feito: boolean; detalhe?: string };

const PAGINA_VAGAS_ANTES = `
# Carreiras na Brainr

Junte-se ao time.

## Vagas abertas
- [Engenheiro de Software Backend](/vagas/backend)
- [Product Designer](/vagas/designer)

Texto corrido de rodapé que muda toda hora e não deve virar item porque é um parágrafo longo qualquer sobre a empresa.
`;

const PAGINA_VAGAS_DEPOIS = `
# Carreiras na Brainr

Junte-se ao time.

## Vagas abertas
- [Engenheiro de Software Backend](/vagas/backend)
- [Product Designer](/vagas/designer)
- [Head de Vendas Agro](/vagas/head-vendas)

Outro texto corrido de rodapé, diferente do anterior, mas ainda um parágrafo qualquer.
`;

function rodar(): Criterio[] {
  const criterios: Criterio[] = [];

  // 1) structuralItems pega os itens (vagas), ignora o parágrafo corrido.
  const itens = structuralItems(PAGINA_VAGAS_ANTES);
  const pegouVagas = itens.some((i) => /Backend/i.test(i)) && itens.some((i) => /Designer/i.test(i));
  const ignorouParagrafo = !itens.some((i) => /rodapé que muda toda hora/i.test(i));
  criterios.push({
    nome: "Retrato estrutural pega os itens (vagas) e ignora parágrafo/ruído",
    feito: pegouVagas && ignorouParagrafo,
    detalhe: `${itens.length} itens; pegou vagas=${pegouVagas}, ignorou ruído=${ignorouParagrafo}`,
  });

  // 2) baseline / igual -> sem mudança.
  const antes = structuralItems(PAGINA_VAGAS_ANTES);
  const igual = diffItems(antes, antes);
  criterios.push({
    nome: "Estado igual -> nenhuma mudança (não gera sinal à toa)",
    feito: !igual.changed && igual.added.length === 0,
    detalhe: `changed=${igual.changed}`,
  });

  // 3) vaga nova -> detectada em `added`; nada removido.
  const depois = structuralItems(PAGINA_VAGAS_DEPOIS);
  const diff = diffItems(antes, depois);
  const achouNova = diff.added.some((i) => /Head de Vendas Agro/i.test(i));
  criterios.push({
    nome: "Vaga NOVA -> detectada no diff (o sinal 'abriu vaga')",
    feito: diff.changed && achouNova && diff.removed.length === 0,
    detalhe: `added=[${diff.added.join(" | ").slice(0, 60)}], removed=${diff.removed.length}`,
  });

  // 4) item que SAIU -> removed.
  const saiu = diffItems(depois, antes);
  criterios.push({
    nome: "Item que saiu -> detectado em removed (vaga fechada)",
    feito: saiu.changed && saiu.removed.some((i) => /Head de Vendas Agro/i.test(i)),
    detalhe: `removed=[${saiu.removed.join(" | ").slice(0, 50)}]`,
  });

  // 5) roteamento: produto/vagas = diff; blog = list; e ambos coletáveis.
  const rota =
    collectionMethod("produto") === "diff" &&
    collectionMethod("vagas") === "diff" &&
    collectionMethod("blog") === "list" &&
    COLLECTIBLE_KINDS.has("produto") &&
    COLLECTIBLE_KINDS.has("vagas");
  criterios.push({
    nome: "Roteamento: produto/vagas por 'diff', blog por 'list' — todos coletáveis",
    feito: rota,
    detalhe: `produto=${collectionMethod("produto")}, vagas=${collectionMethod("vagas")}, blog=${collectionMethod("blog")}`,
  });

  return criterios;
}

function main(): void {
  console.log("\n=== Smoke F12 — Coleta por mudança (produto/vagas) ===\n");
  let tudoVerde = true;
  for (const c of rodar()) {
    console.log(`${c.feito ? "✅" : "⬜"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
    if (!c.feito) tudoVerde = false;
  }
  console.log();
  if (tudoVerde) {
    console.log("F12 VERDE ✅ — produto/vagas viram sinal por mudança; invisíveis destravados.");
    process.exit(0);
  }
  console.log("F12 ainda NÃO completa — critérios acima em branco.");
  process.exit(1);
}

main();
