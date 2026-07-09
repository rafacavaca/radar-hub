/**
 * Smoke da CONEXÃO META AD LIBRARY API — o juiz da Lente 3 via API oficial.
 *
 * SEM token → AMARELO (exit 0): imprime o que falta configurar (setup em
 * docs/meta-ad-library-setup.md). O sistema segue no caminho scrape (antigo).
 *
 * COM token → prova 3 coisas:
 *   1. A API responde (token válido, identidade ok).
 *   2. VEREDITO DE COBERTURA BR: consulta um anunciante-controle pesado em
 *      mídia comercial no Brasil (iFood, BR-only). Se vierem anúncios, o
 *      arquivo cobre comercial-BR (não só UE) — registrado empiricamente.
 *   3. Lente 3 real (Intelia): roda runLente3 e imprime o bloco de mídia paga
 *      como a ficha mostraria — honesto (número real OU 0-com-escopo OU erro
 *      legível; nunca inventado).
 *
 * Uso: npm run smoke:metaads
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const { metaAdsAvailable, searchMetaAds } = await import("@/lib/meta-ads");
const { runLente3 } = await import("@/lib/diagnostico/lente3");

console.log("\n=== Smoke Meta Ad Library API ===\n");

if (!metaAdsAvailable()) {
  console.log("🟡 AMARELO — META_AD_LIBRARY_TOKEN não configurado.");
  console.log("   A Lente 3 segue no caminho scrape (best-effort, quase sempre 'não localizado').");
  console.log("   Setup (passos do Rafael + troca de token): docs/meta-ad-library-setup.md");
  console.log("   Depois de configurar: systemctl restart radar-hub && npm run smoke:metaads\n");
  process.exit(0);
}

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

// ── 1+2. Controle iFood (BR-only) — API viva + veredito de cobertura BR ─────
console.log("· Controle: iFood (só BR, comercial) — testa API + cobertura do arquivo…");
const controle = await searchMetaAds("iFood", { countries: ["BR"], activeOnly: true });

if (!controle.ok) {
  add("API responde (token/identidade ok)", false, controle.error);
} else {
  add("API responde (token/identidade ok)", true, `busca devolveu ${controle.totalDaBusca} anúncio(s)`);
  const cobre = controle.ads.length > 0;
  console.log(
    cobre
      ? `  ✔ VEREDITO: arquivo COBRE comercial-BR — ${controle.ads.length} anúncio(s) do iFood ativos (páginas: ${controle.pages.slice(0, 3).join(", ")})`
      : "  ✖ VEREDITO: nenhum anúncio comercial do iFood em BR-only — arquivo provavelmente NÃO cobre comercial-BR (só UE + político). A Lente 3 continua honesta: a nota de escopo já avisa isso.",
  );
  if (controle.ads[0]?.bodies[0]) {
    console.log(`  exemplo de criativo: “${controle.ads[0].bodies[0].slice(0, 120)}”`);
  }
}

// ── 3. Lente 3 real — Intelia (o mesmo caminho da ficha) ────────────────────
if (controle.ok) {
  console.log("\n· Lente 3 real: Intelia (API Meta + scrape LinkedIn)…");
  const midia = await runLente3("Intelia");
  for (const [plat, m] of Object.entries(midia)) {
    const estado =
      m.status === "nao_localizado" ? "não localizado" : m.anuncia === false ? "sem anúncios ativos" : m.anuncia ? `anunciando (${m.n_anuncios_ativos ?? "?"})` : "—";
    console.log(`  ${plat}: ${estado}${m.observacao ? `\n     ↳ ${m.observacao}` : ""}`);
    for (const msg of m.mensagens.slice(0, 2)) console.log(`     “${msg.slice(0, 100)}”`);
  }

  const meta = midia.meta;
  add(
    "Lente 3 (meta) honesta: número real OU 0-com-nota-de-escopo OU erro legível",
    (meta.status === "encontrado" && (meta.anuncia === true ? Number.isInteger(meta.n_anuncios_ativos) : meta.n_anuncios_ativos === 0 && Boolean(meta.observacao))) ||
      (meta.status === "nao_localizado" && Boolean(meta.observacao)),
    `status=${meta.status} · anuncia=${meta.anuncia} · n=${meta.n_anuncios_ativos}`,
  );
  add(
    "Fonte pública clicável em toda plataforma consultada",
    Boolean(meta.fonte_url && midia.linkedin.fonte_url),
    `${meta.fonte_url ? "meta ✓" : "meta ✗"} · ${midia.linkedin.fonte_url ? "linkedin ✓" : "linkedin ✗"}`,
  );
}

// ── Resultado ────────────────────────────────────────────────────────────────
console.log("\n── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(
  ok
    ? "\nConexão VERDE ✅ — Lente 3 com dado oficial da Meta.\n"
    : "\nConexão VERMELHA ❌ — ver mensagem acima (token expirado? identidade pendente?). Manda o erro pro Claude.\n",
);
process.exit(ok ? 0 : 1);
