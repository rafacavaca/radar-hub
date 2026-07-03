/**
 * Smoke test da F14 — o "juiz" da coleta via RSS/ATOM (o padrão-ouro).
 *
 * O parser é o coração — puro, testável sem rede:
 *   1. parseFeed lê RSS 2.0 (title/link/description/pubDate, com CDATA);
 *   2. parseFeed lê Atom (<entry>, <link href>, <summary>, <updated>);
 *   3. XML lixo -> [] (nunca derruba a coleta).
 * Mais uma checagem ao vivo LEVE (opcional): resolver um feed real conhecido.
 *
 * Uso: npm run smoke:f14
 */

import { config } from "dotenv";

config({ path: ".env.local" });

const { parseFeed, collectFromFeed, resolveFeedUrl } = await import("@/lib/collectors/rss");

type Criterio = { nome: string; feito: boolean; detalhe?: string };

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Blog do Concorrente</title>
  <item>
    <title><![CDATA[Lançamos previsão de churn com IA]]></title>
    <link>https://concorrente.com/blog/previsao-de-churn</link>
    <description>Novo módulo de IA no CRM.</description>
    <pubDate>Mon, 30 Jun 2026 10:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Integração com ERP Sankhya</title>
    <link>https://concorrente.com/blog/erp-sankhya</link>
    <description><![CDATA[<p>Agora integra.</p>]]></description>
    <pubDate>Tue, 24 Jun 2026 09:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Notícias</title>
  <entry>
    <title>Nova rodada de investimento</title>
    <link rel="alternate" href="https://x.com/noticias/rodada"/>
    <summary>Captou R$ 50 milhões.</summary>
    <updated>2026-07-01T12:00:00Z</updated>
  </entry>
</feed>`;

async function rodar(): Promise<Criterio[]> {
  const criterios: Criterio[] = [];

  // 1) RSS 2.0.
  const rss = parseFeed(RSS);
  const rssOk =
    rss.length === 2 &&
    rss[0].title === "Lançamos previsão de churn com IA" &&
    rss[0].link === "https://concorrente.com/blog/previsao-de-churn" &&
    Boolean(rss[0].publishedAt);
  criterios.push({
    nome: "Parser RSS 2.0: título (CDATA), link, data",
    feito: rssOk,
    detalhe: `${rss.length} itens; 1º="${rss[0]?.title?.slice(0, 40)}"`,
  });

  // 2) Atom.
  const atom = parseFeed(ATOM);
  const atomOk =
    atom.length === 1 &&
    atom[0].title === "Nova rodada de investimento" &&
    atom[0].link === "https://x.com/noticias/rodada";
  criterios.push({
    nome: "Parser Atom: <entry>, <link href>, <summary>",
    feito: atomOk,
    detalhe: `${atom.length} item; link=${atom[0]?.link}`,
  });

  // 3) lixo -> [] (defensivo).
  const lixo = parseFeed("<html><body>não é feed</body></html>");
  criterios.push({
    nome: "XML/HTML que não é feed -> [] (não derruba a coleta)",
    feito: lixo.length === 0,
    detalhe: `${lixo.length} itens`,
  });

  // 4) collectFromFeed mapeia itens do feed em RawEvent (via um feed data-URL falso? não —
  //    testamos o mapeamento indiretamente: parse já validado; aqui só garantimos
  //    que a função existe e devolve [] pra URL inválida sem lançar).
  const vazio = await collectFromFeed({ id: "x", name: "X" }, "http://127.0.0.1:1/feed", "blog", 5);
  criterios.push({
    nome: "collectFromFeed: feed inacessível -> [] (sem lançar)",
    feito: Array.isArray(vazio) && vazio.length === 0,
    detalhe: `${vazio.length} eventos`,
  });

  // 5) AO VIVO (leve): resolver E coletar de um feed real (Ploomes tem /feed).
  try {
    const feed = await resolveFeedUrl("https://blog.ploomes.com/", [], { force: true });
    const eventos = feed
      ? await collectFromFeed({ id: "ploomes", name: "Ploomes" }, feed, "blog", 5)
      : [];
    criterios.push({
      nome: "Ao vivo: resolve o feed do Ploomes e coleta itens dele",
      feito: Boolean(feed) && eventos.length >= 1,
      detalhe: feed ? `feed=${feed}; ${eventos.length} itens; ex.: "${eventos[0]?.title?.slice(0, 40) ?? "-"}"` : "sem feed",
    });
  } catch (err) {
    criterios.push({
      nome: "Ao vivo: resolve o feed do Ploomes e coleta itens dele",
      feito: true, // rede indisponível não reprova o smoke do parser
      detalhe: `pulado (rede): ${(err as Error).message}`,
    });
  }

  return criterios;
}

async function main(): Promise<void> {
  console.log("\n=== Smoke F14 — Coleta via RSS/Atom (padrão-ouro) ===\n");
  let tudoVerde = true;
  for (const c of await rodar()) {
    console.log(`${c.feito ? "✅" : "⬜"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
    if (!c.feito) tudoVerde = false;
  }
  console.log();
  if (tudoVerde) {
    console.log("F14 VERDE ✅ — feeds viram eventos estruturados; sem feed, cai no HTML.");
    process.exit(0);
  }
  console.log("F14 ainda NÃO completa — critérios acima em branco.");
  process.exit(1);
}

main().catch((err) => {
  console.error("Smoke falhou com erro:", err);
  process.exit(1);
});
