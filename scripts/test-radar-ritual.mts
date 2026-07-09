/**
 * Smoke RITUAL F1 — digest matinal + estados do briefing. Roda o motor REAL
 * (buildDigest/ensureDigest/setEstado) sobre material SEMEADO em data dir
 * isolado (zero rede/LLM — o digest é determinístico de propósito).
 *
 * Prova:
 *  1. Leitura forte, alerta não visto e relatório novo ENTRAM; leitura fraca
 *     (score < corte) e alerta já visto FICAM DE FORA.
 *  2. Todo item tem id estável, origem e data (fonte quando a origem traz).
 *  3. Atuado/Ignorado somem do digest re-gerado.
 *  4. ADIADO some HOJE e VOLTA AMANHÃ (do snapshot), mesmo sem material.
 *  5. Dia tranquilo: sem material e sem adiados → tranquilo=true, zero itens
 *     (nunca urgência fabricada) — e falha de coleta vira observação visível.
 *  6. ensureDigest é idempotente por dia (2ª chamada devolve o salvo).
 *  7. Cap por cliente vira OBSERVAÇÃO (nunca corte silencioso).
 *
 * Uso: npm run smoke:ritual
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-ritual-"));
delete process.env.RADAR_DB; // modo clássico (JSON isolado)

const { buildDigest, ensureDigest, loadDigest } = await import("@/lib/digest");
const { setEstado, loadEstados } = await import("@/lib/briefing-estado");
const { localDayKey } = await import("@/lib/schedules");

import type { DigestMaterial, DigestItem } from "@/lib/digest";
import type { AlertaDisparo } from "@/lib/diagnostico/schema";
import type { LensReading } from "@/lib/types";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke RITUAL F1 — digest + briefing (material semeado) ===\n");

const hoje = new Date("2026-07-10T09:00:00.000Z"); // 06:00 em Brasília
const amanha = new Date("2026-07-11T09:00:00.000Z");

const leitura = (id: string, score: number): LensReading => ({
  id,
  clientName: "Moovefy",
  lens: "comercial",
  sinal: `Concorrente lançou plano PME (${id})`,
  leitura: "Ataque direto à tua faixa de entrada.",
  acao: "Preparar resposta comercial nesta semana.",
  score,
  fonte: { url: "https://exemplo.test/post", titulo: "Post do concorrente" },
  eventIds: [id],
  publishedAt: "2026-07-09T12:00:00.000Z",
  collectedAt: "2026-07-10T08:00:00.000Z",
  createdAt: "2026-07-10T08:00:00.000Z",
});

const disparo = (id: string, visto: boolean): AlertaDisparo => ({
  id,
  clientName: "TAGAT Foodtech",
  concorrente_id: "intelia",
  concorrente_nome: "Intelia",
  regra: "tagline_mudou",
  movimento: {
    campo: "posicionamento.tagline",
    campo_label: "Tagline",
    de: "BEYOND DATA",
    para: "BEYOND FARMS",
    tipo: "mudança",
    data_deteccao: "2026-07-10T07:00:00.000Z",
    fonte_url_de: "https://intelia.com",
    fonte_url_para: "https://intelia.com",
    data_de: "2026-07-03T07:00:00.000Z",
    data_para: "2026-07-10T07:00:00.000Z",
    severidade: "alta",
  },
  data: "2026-07-10T07:00:00.000Z",
  visto,
});

const material: DigestMaterial = {
  clientes: ["Moovefy", "TAGAT Foodtech"],
  loop: {
    items: [],
    readings: [leitura("r-forte", 78), leitura("r-fraca", 40)],
    events: [],
    ranAt: "2026-07-10T08:00:00.000Z",
    failures: ["coleta Rush (blog): timeout"],
  },
  disparos: [disparo("d-novo", false), disparo("d-visto", true)],
  relatoriosNovos: [
    {
      id: "rel-1",
      clientName: "Moovefy",
      kind: "agendado",
      titulo: "Radar comercial da semana",
      corpo: "…",
      fontes: [],
      origem: "toda quinta, radar comercial",
      createdAt: "2026-07-10T06:10:00.000Z",
    } as DigestMaterial["relatoriosNovos"][number],
  ],
};

// ── 1+2: montagem básica ──
const d1 = buildDigest(material, {}, hoje);
const ids = d1.itens.map((i) => i.id);
add(
  "Entram: leitura forte + alerta não visto + relatório novo (3 itens)",
  d1.itens.length === 3 && ids.includes("lr:r-forte") && ids.includes("al:d-novo") && ids.includes("rep:rel-1"),
  ids.join(", "),
);
add(
  "Ficam fora: leitura fraca (score<corte) e alerta JÁ VISTO",
  !ids.includes("lr:r-fraca") && !ids.includes("al:d-visto"),
);
add(
  "Todo item tem origem + data; leitura e alerta citam fonte",
  d1.itens.every((i) => i.origem && i.data) &&
    d1.itens.filter((i) => i.kind !== "relatorio").every((i) => Boolean(i.fonte?.url)),
);
add(
  "Falha de coleta vira observação visível (honestidade)",
  d1.observacoes.some((o) => o.includes("Rush")),
  d1.observacoes.join(" | "),
);

// ── 3+4: estados — atuado some; adiado some hoje e volta amanhã ──
const itemForte = d1.itens.find((i) => i.id === "lr:r-forte")!;
await setEstado("lr:r-forte", "atuado");
await setEstado("al:d-novo", "adiado", { now: hoje, item: d1.itens.find((i) => i.id === "al:d-novo")! });
const estados = await loadEstados();
const d2 = buildDigest(material, estados, hoje);
add(
  "Atuado e Adiado somem do digest de HOJE",
  !d2.itens.some((i) => i.id === "lr:r-forte") && !d2.itens.some((i) => i.id === "al:d-novo") && d2.adiados.length === 0,
  `itens=${d2.itens.map((i) => i.id).join(",")}`,
);
const d3 = buildDigest({ ...material, loop: null, disparos: [], relatoriosNovos: [] }, estados, amanha);
add(
  "ADIADO volta AMANHÃ (do snapshot), mesmo sem material novo",
  d3.adiados.length === 1 && d3.adiados[0].id === "al:d-novo" && d3.adiados[0].titulo.includes("Intelia"),
  d3.adiados[0]?.titulo ?? "não voltou",
);
add("Dia com SÓ adiados não é 'tranquilo' (tem trabalho voltando)", d3.tranquilo === false);

// ── 5: dia tranquilo ──
const dTranquilo = buildDigest({ clientes: ["Moovefy"], loop: null, disparos: [], relatoriosNovos: [] }, {}, hoje);
add(
  "DIA TRANQUILO: sem material e sem adiados → tranquilo=true, zero itens, com observação honesta",
  dTranquilo.tranquilo && dTranquilo.itens.length === 0 && dTranquilo.observacoes.some((o) => o.includes("não foi coletado")),
  dTranquilo.observacoes.join(" | "),
);

// ── 6: ensureDigest idempotente por dia ──
mkdirSync(process.env.RADAR_DATA_DIR!, { recursive: true });
writeFileSync(join(process.env.RADAR_DATA_DIR!, "watchlist.json"), JSON.stringify({ clients: [] }), "utf8");
const e1 = await ensureDigest(hoje);
const e2 = await ensureDigest(hoje);
const salvo = await loadDigest(localDayKey(hoje));
add(
  "ensureDigest gera 1x e reusa (idempotente por dia local)",
  e1.geradoEm === e2.geradoEm && salvo?.geradoEm === e1.geradoEm,
  `geradoEm=${e1.geradoEm}`,
);

// ── 7: cap por cliente vira observação ──
const muitas: LensReading[] = Array.from({ length: 9 }, (_, i) => leitura(`r-m-${i}`, 90 - i));
const dCap = buildDigest(
  { clientes: ["Moovefy"], loop: { items: [], readings: muitas, ranAt: "2026-07-10T08:00:00.000Z" }, disparos: [], relatoriosNovos: [] },
  {},
  hoje,
);
add(
  "Cap por cliente (6) aplicado COM observação (nunca corte silencioso)",
  dCap.itens.length === 6 && dCap.observacoes.some((o) => o.includes("+3")),
  dCap.observacoes.join(" | "),
);

// ── 8: e-mail (placeholder) — render puro cobre item e dia tranquilo ──
const { renderDigestEmailHTML, maybeSendDigestEmail } = await import("@/lib/digest-email");
const htmlCheio = renderDigestEmailHTML(d1, "https://radar.test");
const htmlCalmo = renderDigestEmailHTML(dTranquilo, "https://radar.test");
add(
  "E-mail: render traz os itens (com cliente/fonte) e a versão 'dia tranquilo'",
  htmlCheio.includes("Intelia") && htmlCheio.includes("Moovefy") && htmlCalmo.includes("Dia tranquilo"),
);
delete process.env.RESEND_API_KEY;
const envio = await maybeSendDigestEmail(d1, "formare");
add("E-mail: sem provedor configurado → 'sem-config' (opt-in, zero efeito)", envio === "sem-config", envio);

// ── Resultado ──
console.log("── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
void itemForte;
console.log(ok ? "\nRITUAL F1 (motor) VERDE ✅ — digest honesto, inbox com estados, adiado volta amanhã.\n" : "\nRITUAL F1 VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
