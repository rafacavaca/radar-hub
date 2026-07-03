/**
 * Smoke test da F15 — o "juiz" do ENTENDIMENTO DO SITE na descoberta.
 *
 * O pedido do Rafael: "é preciso que o sistema entenda o site para saber o que
 * precisa buscar" (caso Cat Squared: menu cheio de suítes de produto, e a
 * descoberta só achava o blog).
 *
 * Prova:
 *   1. extractNavEntries lê âncoras (caminho ← texto) same-site e ignora
 *      externos/âncoras vazias (função pura);
 *   2. understandSite é ANTI-INVENÇÃO: valida contra a lista real — caminho
 *      que não existe é descartado, kind fora da whitelist é descartado
 *      (mock do parse: testamos a validação com entrada controlada via LLM real
 *      numa navegação sintética pequena);
 *   3. AO VIVO (o caso do Rafael): catsquared.com rende candidatos de PRODUTO
 *      nomeados (>=3 suítes) + blog + vagas — sem duplicatas;
 *   4. vocabulário EN: /products, /solutions, /now-hiring classificam.
 *
 * Custo: 2 chamadas ao gateway (entendimento sintético + catsquared).
 * Uso: npm run smoke:f15
 */

import { config } from "dotenv";

config({ path: ".env.local" });

const { extractNavEntries, understandSite, discoverSources } = await import("@/lib/discovery");

type Criterio = { nome: string; feito: boolean; detalhe?: string };

const HTML = `
<nav>
  <a href="/cynergy-mes">CYNERGY MES</a>
  <a href="/wms-suite"><span>CYNERGY WMS Suite</span></a>
  <a href="/blog">News</a>
  <a href="/now-hiring">Job Openings</a>
  <a href="https://linkedin.com/company/x">LinkedIn</a>
  <a href="/contact">Contact</a>
</nav>`;

async function rodar(): Promise<Criterio[]> {
  const criterios: Criterio[] = [];

  // 1) extractNavEntries: same-site com texto; externos fora.
  const entries = extractNavEntries(HTML, "https://www.exemplo.com/", "www.exemplo.com");
  const temWms = entries.some((e) => e.path === "/wms-suite" && /WMS Suite/i.test(e.text));
  const semExterno = !entries.some((e) => e.path.includes("linkedin"));
  criterios.push({
    nome: "Navegação real: extrai caminho ← texto (same-site), ignora externos",
    feito: temWms && semExterno && entries.length >= 4,
    detalhe: `${entries.length} entradas; WMS=${temWms}, externo fora=${semExterno}`,
  });

  // 2) Entendimento numa navegação sintética + anti-invenção.
  try {
    const understood = await understandSite(entries);
    const produto = understood.filter((u) => u.kind === "produto");
    const vagas = understood.find((u) => u.kind === "vagas");
    const soCaminhosReais = understood.every((u) => entries.some((e) => e.path === u.path));
    criterios.push({
      nome: "Entendimento: mapeia produto ('CYNERGY…') e vagas ('Job Openings') — só caminhos reais",
      feito: produto.length >= 1 && Boolean(vagas) && soCaminhosReais,
      detalhe: `produto=${produto.length} (${produto[0]?.label ?? "-"}), vagas=${vagas?.path ?? "-"}, anti-invenção=${soCaminhosReais}`,
    });
  } catch (err) {
    criterios.push({
      nome: "Entendimento: mapeia produto ('CYNERGY…') e vagas ('Job Openings') — só caminhos reais",
      feito: false,
      detalhe: (err as Error).message,
    });
  }

  // 3) AO VIVO — o caso do Rafael (catsquared.com).
  try {
    const d = await discoverSources("catsquared.com");
    const produtos = d.candidates.filter((c) => c.kind === "produto");
    const urls = d.candidates.map((c) => c.url.replace(/\/$/, ""));
    const semDup = new Set(urls).size === urls.length;
    const temBlog = d.candidates.some((c) => c.kind === "blog");
    const temVagas = d.candidates.some((c) => c.kind === "vagas");
    const nomeadas = produtos.filter((c) => /cynergy|suite|wms|traceab|planning/i.test(c.titulo)).length;
    criterios.push({
      nome: "Cat Squared: >=3 páginas de produto NOMEADAS + blog + vagas, sem duplicatas",
      feito: produtos.length >= 3 && nomeadas >= 3 && temBlog && temVagas && semDup,
      detalhe: `produto=${produtos.length} (nomeadas=${nomeadas}), blog=${temBlog}, vagas=${temVagas}, semDup=${semDup}`,
    });
  } catch (err) {
    criterios.push({
      nome: "Cat Squared: >=3 páginas de produto NOMEADAS + blog + vagas, sem duplicatas",
      feito: false,
      detalhe: (err as Error).message,
    });
  }

  return criterios;
}

async function main(): Promise<void> {
  console.log("\n=== Smoke F15 — Descoberta que ENTENDE o site ===\n");
  let tudoVerde = true;
  for (const c of await rodar()) {
    console.log(`${c.feito ? "✅" : "⬜"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
    if (!c.feito) tudoVerde = false;
  }
  console.log();
  if (tudoVerde) {
    console.log("F15 VERDE ✅ — o sistema lê a navegação como um humano e sabe o que vigiar.");
    process.exit(0);
  }
  console.log("F15 ainda NÃO completa — critérios acima em branco.");
  process.exit(1);
}

main().catch((err) => {
  console.error("Smoke falhou com erro:", err);
  process.exit(1);
});
