/**
 * SEED — carteira Gemmini Bauru (F1 do 2º template: modo "carteira").
 *
 * Idempotente: seta `mode="carteira"` na "Gemmini Distribuidora" e adiciona os 3
 * hospitais reais (HC Bauru · Beneficência · Unimed) como subjects, cada um com
 * PERFIL (tipo, modo de compra, fit por linha) + a página pública de NOTÍCIAS
 * como fonte coletável. NÃO toca nos outros clientes (Moovefy/TAGAT).
 * Re-rodar só atualiza os perfis e mantém as fontes.
 *
 *   npm run seed:gemmini   (ou: npx tsx scripts/seed-gemmini.mts)
 */

import { GEMMINI } from "@/lib/clients/gemmini";
import {
  readWatchlist,
  sourceId,
  writeWatchlist,
  type Competitor,
  type WatchSource,
} from "@/lib/watchlist";

const wl = readWatchlist();
const client = wl.clients.find((c) => c.name === GEMMINI.clientName);
if (!client) {
  console.error(
    `✗ Cliente "${GEMMINI.clientName}" não está na watchlist. Adicione-o primeiro (sidebar → "+ Novo cliente").`,
  );
  process.exit(1);
}

client.mode = "carteira";

let added = 0;
for (const h of GEMMINI.hospitals) {
  const existing = client.competitors.find((c) => c.id === h.id);
  if (existing) {
    existing.profile = h.profile; // atualiza o perfil, mantém as fontes
    existing.siteUrl = existing.siteUrl ?? h.siteUrl;
    continue;
  }
  const sources: WatchSource[] = h.sources.map((s) => ({
    id: sourceId(s.kind, s.url),
    kind: s.kind,
    url: s.url,
    label: s.label,
  }));
  const subject: Competitor = {
    id: h.id,
    name: h.name,
    siteUrl: h.siteUrl,
    enabled: true,
    sources,
    profile: h.profile,
  };
  client.competitors.push(subject);
  added++;
}

writeWatchlist(wl);

console.log(
  `✓ "${client.name}" em modo carteira · ${client.competitors.length} hospitais (${added} novo(s)).`,
);
for (const c of client.competitors) {
  console.log(`  - ${c.name}  [${c.profile?.modoCompra ?? "?"}]  ·  ${c.sources.length} fonte(s)`);
}
