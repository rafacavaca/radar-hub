/**
 * Smoke da CARTEIRA GEMMINI (2º template — modo "carteira" / sales-enablement).
 *
 * O "juiz" do loop sinal→linha→gatilho. O que prova:
 *   1. A lente "vendedor" mapeia cada sinal de hospital para a LINHA Gemmini
 *      CERTA (hemodinâmica → Coronária), com gatilho + ângulo + score + fonte
 *      do evento REAL + data. 1 sinal relevante -> 1 leitura de venda bem-formada.
 *   2. HONESTIDADE: um sinal SEM oportunidade (campanha interna) não vira um
 *      gatilho forte (não força venda onde não há).
 *   3. O HOSPITAL da leitura vem do evento (não é inventado pelo LLM).
 *   4. Seam de dados: a "Gemmini Distribuidora" real está em modo carteira, com
 *      os 3 hospitais + fit por linha (o seed).
 *
 * Custo: 1 chamada ao gateway. 0 créditos Firecrawl (eventos sintéticos).
 * A coleta REAL dos sites dos hospitais é validada no checkpoint (rodada ao vivo).
 * Uso: npm run smoke:gemmini
 */

import { config } from "dotenv";

config({ path: ".env.local" });

import { GEMMINI } from "@/lib/clients/gemmini";
import { analyzeVendedor } from "@/lib/analyst-vendedor";
import { readWatchlist } from "@/lib/watchlist";
import type { RawEvent } from "@/lib/types";

type Criterio = { nome: string; feito: boolean; detalhe?: string };

const now = new Date().toISOString();
const ev = (
  id: string,
  hospital: string,
  title: string,
  description: string,
  publishedAt: string,
): RawEvent => ({
  id,
  source: id,
  competitorName: hospital,
  kind: "news",
  url: `https://example.test/${id}`,
  title,
  description,
  publishedAt,
  collectedAt: now,
});

// 3 sinais que ABREM oportunidade (um por hospital/linha) + 1 irrelevante.
const EVENTOS: RawEvent[] = [
  ev(
    "unimed-hemo",
    "Unimed Bauru",
    "Hospital Unimed Bauru inaugura nova sala de hemodinâmica com angiógrafo de última geração",
    "O HUB ampliou o serviço de hemodinâmica com uma nova sala e equipamento de imagem para procedimentos cardiovasculares e cateterismo.",
    "2026-06-20",
  ),
  ev(
    "hc-licitacao",
    "HC Bauru",
    "HC Bauru abre processo licitatório para aquisição de material médico-hospitalar e instrumental cirúrgico",
    "Edital publicado para compra de material hospitalar e instrumentais para o centro cirúrgico da unidade.",
    "2026-06-25",
  ),
  ev(
    "bene-orto",
    "Beneficência Portuguesa de Bauru",
    "Beneficência Portuguesa de Bauru amplia centro de ortopedia e realiza primeira artroplastia com nova tecnologia",
    "O hospital investiu na ampliação do centro de ortopedia e traumatologia, com nova tecnologia para artroplastias.",
    "2026-06-18",
  ),
  ev(
    "bene-vacina",
    "Beneficência Portuguesa de Bauru",
    "Hospital promove campanha interna de vacinação contra a gripe para os colaboradores",
    "Ação de saúde ocupacional voltada aos funcionários do hospital, sem relação com compra de equipamento ou OPME.",
    "2026-06-15",
  ),
];

const criterios: Criterio[] = [];
const add = (nome: string, feito: boolean, detalhe?: string) =>
  criterios.push({ nome, feito, detalhe });
const norm = (s: string) => s.toLowerCase();

console.log("\n=== Smoke Gemmini — carteira / lente vendedor ===\n");

// ── 4. Seam de dados (rápido, sem gateway) ──────────────────────────────────
const wl = readWatchlist();
const gem = wl.clients.find((c) => c.name === GEMMINI.clientName);
const hospitaisSeed = gem?.competitors ?? [];
const temFit = hospitaisSeed.every((h) => Object.keys(h.profile?.fitPorLinha ?? {}).length > 0);
add(
  "Seam de dados: Gemmini em modo carteira, 3 hospitais com fit por linha",
  gem?.mode === "carteira" && hospitaisSeed.length >= 3 && temFit,
  `mode=${gem?.mode ?? "(none)"} · hospitais=${hospitaisSeed.length} · fit=${temFit}`,
);

// ── 1-3. A lente vendedor (1 chamada ao gateway) ────────────────────────────
const leituras = await analyzeVendedor(EVENTOS, GEMMINI.clientName, GEMMINI.brainContext);

add("A lente vendedor produziu ≥2 leituras", leituras.length >= 2, `leituras=${leituras.length}`);

// bem-formadas: campos + score + fonte real + data + hospital do evento
const idsValidos = new Set(EVENTOS.map((e) => e.id));
const urlsReais = new Set(EVENTOS.map((e) => e.url));
const hospPorId = new Map(EVENTOS.map((e) => [e.id, e.competitorName]));
const bemFormada = (r: (typeof leituras)[number]) =>
  r.sinal &&
  r.linha &&
  r.gatilho &&
  r.angulo &&
  r.score >= 0 &&
  r.score <= 100 &&
  urlsReais.has(r.fonte.url) &&
  r.eventIds.every((id) => idsValidos.has(id)) &&
  Boolean(r.publishedAt || r.collectedAt) &&
  // hospital derivado do evento (nunca inventado)
  r.eventIds.every((id) => hospPorId.get(id) === r.hospital);
add(
  "Todas as leituras bem-formadas (linha/gatilho/ângulo/score/fonte real/data/hospital do evento)",
  leituras.length > 0 && leituras.every(bemFormada),
  leituras.map((r) => `${r.hospital}→${r.linha}(${r.score})`).join(" · ") || "—",
);

// mapeamento CERTO: o sinal de hemodinâmica vira a linha Coronária
const hemo = leituras.find((r) => r.eventIds.includes("unimed-hemo"));
add(
  "Hemodinâmica (Unimed) → linha Coronária",
  Boolean(hemo) && norm(hemo!.linha).includes("coron"),
  hemo ? `linha="${hemo.linha}" gatilho="${hemo.gatilho}"` : "sem leitura pro sinal de hemodinâmica",
);

// honestidade: o sinal irrelevante NÃO vira gatilho forte
const vacina = leituras.find((r) => r.eventIds.includes("bene-vacina"));
add(
  "Honesto: campanha interna de vacinação não vira gatilho forte (≥60)",
  !vacina || vacina.score < 60,
  vacina ? `gerou leitura score=${vacina.score}` : "ignorado (correto)",
);

// ── Resultado ───────────────────────────────────────────────────────────────
console.log("");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(
  ok
    ? "\nGemmini (carteira) VERDE ✅ — sinal → linha → gatilho, honesto, com fonte e data.\n"
    : "\nGemmini VERMELHO ❌ — ver acima.\n",
);
process.exit(ok ? 0 : 1);
