/**
 * SEED — pilar CLIENTES da TAGAT Foodtech (F1a).
 *
 * Idempotente: adiciona as CONTAS-CHAVE da TAGAT (ex.: Bom Gosto) como entidades
 * `pillar: "conta-chave"` na watchlist, cada uma com PERFIL. NÃO muda o `mode` da
 * TAGAT (fica "concorrentes" — os dois pilares COEXISTEM) e NÃO toca nos 5
 * concorrentes já vigiados (Mtech, Brainr, Agrosys, CAT2, Atak).
 * Re-rodar só atualiza os perfis e reforça o pilar.
 *
 *   npm run seed:tagat   (ou: npx tsx scripts/seed-tagat-clientes.mts)
 */

import { TAGAT } from "@/lib/clients/tagat";
import {
  readWatchlist,
  sourceId,
  writeWatchlist,
  type Competitor,
  type WatchSource,
} from "@/lib/watchlist";

const wl = readWatchlist();
const client = wl.clients.find((c) => c.name === TAGAT.clientName);
if (!client) {
  console.error(
    `✗ Cliente "${TAGAT.clientName}" não está na watchlist. Adicione-o primeiro (sidebar → "+ Novo cliente").`,
  );
  process.exit(1);
}

// F4 — buscas de mercado do cliente (alimentam o reforço). Idempotente.
client.market = TAGAT.marketQueries;

let added = 0;
for (const a of TAGAT.accounts) {
  const existing = client.competitors.find((c) => c.id === a.id);
  if (existing) {
    existing.profile = a.profile; // atualiza o perfil, mantém as fontes
    existing.pillar = "conta-chave"; // reforça o pilar
    existing.siteUrl = existing.siteUrl ?? a.siteUrl;
    continue;
  }
  const sources: WatchSource[] = a.sources.map((s) => ({
    id: sourceId(s.kind, s.url),
    kind: s.kind,
    url: s.url,
    label: s.label,
  }));
  const account: Competitor = {
    id: a.id,
    name: a.name,
    siteUrl: a.siteUrl,
    enabled: true,
    sources,
    profile: a.profile,
    pillar: "conta-chave",
  };
  client.competitors.push(account);
  added++;
}

writeWatchlist(wl);

const contas = client.competitors.filter((c) => c.pillar === "conta-chave");
const concorrentes = client.competitors.filter((c) => c.pillar !== "conta-chave");
console.log(
  `✓ "${client.name}" [mode=${client.mode ?? "concorrentes"}] · pilar Clientes: ${contas.length} conta(s)-chave (${added} nova(s)) · pilar Concorrentes intacto: ${concorrentes.length}.`,
);
for (const c of contas) {
  console.log(`  - [conta-chave] ${c.name}  ·  ${c.sources.length} fonte(s)  ·  ${c.profile?.tipo ?? "?"}`);
}
