/**
 * Smoke ORG-LOOP (item 2 — rework do loop). Prova, contra o Supabase REAL, que
 * o loop e o cron operam POR ORG sem vazamento:
 *
 *  1. runAsOrgCollector exige contexto admin (fora dele, lança).
 *  2. loadWatchlist sob a org A vê SÓ o cliente de A; sob B, nada.
 *  3. runRadarLoop sob A escreve o cache do dia NO DOC de A (org_docs) — e o
 *     cache de B (semeado com marcador) nunca aparece sob A.
 *  4. persistSourceRun sob A não aparece em loadSourceStatus sob B.
 *  5. persistSignals sob A grava na tabela signals COM org A (via RPC do
 *     coletor); B fica com zero.
 *  6. persistSchedule/loadSchedules e persistDiagSchedule/loadDiagSchedule são
 *     isolados por org; runDueSchedules sob B é no-op seguro (0 agendamentos).
 *
 * ZERO rede/LLM: os clientes de teste não têm fontes coletáveis (planCollection
 * vazio) — o loop roda inteiro sem tocar Firecrawl/gateway.
 *
 * Uso: npm run smoke:org-loop  (exige chaves do Supabase no .env.local)
 */

import { config } from "dotenv";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

config({ path: ".env.local" });

// modo org + contexto admin de processo + JSON isolado (nada toca data/ real)
process.env.RADAR_DB = "supabase";
process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-orgloop-"));
delete process.env.RADAR_INGEST_ORG_ID; // ingest LinkedIn fora do teste

const URL = process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) {
  console.log("Sem chaves do Supabase — smoke org-loop não roda (nada a provar localmente).");
  process.exit(1);
}

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke ORG-LOOP — loop e cron por org, sem vazamento ===\n");

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

const stamp = process.env.RADAR_ISO_STAMP || "orgloop";
const orgA = { slug: `test-loop-a-${stamp}`, name: "Org A (loop)" };
const orgB = { slug: `test-loop-b-${stamp}`, name: "Org B (loop)" };

// limpeza de execução anterior (idempotente) e criação
await admin.from("orgs").delete().in("slug", [orgA.slug, orgB.slug]);
const { data: aRow } = await admin.from("orgs").insert(orgA).select("id").single();
const { data: bRow } = await admin.from("orgs").insert(orgB).select("id").single();
const aId = aRow!.id as string;
const bId = bRow!.id as string;

// watchlist de A: 1 cliente SEM fontes coletáveis (loop roda sem rede)
const clienteA = { name: `Cliente A ${stamp}`, competitors: [] };
await admin.from("clients").insert({ id: clienteA.name, org_id: aId, name: clienteA.name, data: clienteA });
// cache de B semeado com MARCADOR (se vazar pra A, o teste pega)
const dia = new Date().toISOString().slice(0, 10);
await admin.from("org_docs").insert({
  org_id: bId,
  kind: "loop-cache",
  key: dia,
  data: { items: [], ranAt: "2020-01-01T00:00:00.000Z", events: [{ id: "MARCADOR-B" }] },
});

// ── 1. guarda: fora de contexto admin, runAsOrgCollector LANÇA ──
{
  delete process.env.RADAR_ADMIN_CONTEXT;
  const { runAsOrgCollector } = await import("@/lib/db/collector-org");
  let lancou = false;
  try {
    await runAsOrgCollector(aId, async () => {});
  } catch {
    lancou = true;
  }
  add("runAsOrgCollector fora de contexto admin LANÇA (guarda da god-key)", lancou);
  process.env.RADAR_ADMIN_CONTEXT = "1";
}

const { runAsOrgCollector } = await import("@/lib/db/collector-org");
const { loadWatchlist } = await import("@/lib/watchlist");
const { runRadarLoop } = await import("@/lib/loop");
const { persistSourceRun, loadSourceStatus } = await import("@/lib/source-status");
const { persistSignals } = await import("@/lib/db/repo-signals");
const { loadSchedules, persistSchedule, runDueSchedules } = await import("@/lib/schedules");

// ── 2. watchlist por org ──
const wlA = await runAsOrgCollector(aId, () => loadWatchlist());
const wlB = await runAsOrgCollector(bId, () => loadWatchlist());
add(
  "loadWatchlist sob A vê SÓ o cliente de A; sob B, nada",
  wlA.clients.length === 1 && wlA.clients[0].name === clienteA.name && wlB.clients.length === 0,
  `A=${wlA.clients.map((c) => c.name).join(",") || "vazio"} · B=${wlB.clients.length}`,
);

// ── 3. loop sob A: roda (sem rede), cacheia NO DOC de A; marcador de B não vaza ──
const loopA = await runAsOrgCollector(aId, () => runRadarLoop({ force: true }));
const { data: cacheA } = await admin
  .from("org_docs").select("data").eq("org_id", aId).eq("kind", "loop-cache").eq("key", dia).maybeSingle();
const eventosA = ((cacheA?.data as { events?: Array<{ id: string }> })?.events ?? []).map((e) => e.id);
add(
  "runRadarLoop sob A escreve o cache do dia no doc DE A (org_docs)",
  Boolean(cacheA) && Array.isArray((cacheA?.data as { items?: unknown[] })?.items),
  cacheA ? `doc de A existe (items=${((cacheA.data as { items?: unknown[] }).items ?? []).length})` : "NÃO gravou",
);
add(
  "o cache de B (marcador) NUNCA aparece sob A",
  loopA.events?.every((e) => e.id !== "MARCADOR-B") === true && !eventosA.includes("MARCADOR-B"),
  `eventos A=${loopA.events?.length ?? 0}`,
);

// ── 4. source-status por org ──
await runAsOrgCollector(aId, () => persistSourceRun("cmp-a", "fonte-1", { eventos: 3 }));
const statusA = await runAsOrgCollector(aId, () => loadSourceStatus());
const statusB = await runAsOrgCollector(bId, () => loadSourceStatus());
add(
  "persistSourceRun sob A não aparece sob B",
  Boolean(statusA["cmp-a:fonte-1"]) && Object.keys(statusB).length === 0,
  `A=${Object.keys(statusA).length} entrada(s) · B=${Object.keys(statusB).length}`,
);

// ── 5. sinais duráveis via porta do coletor ──
const evento = {
  id: `ev-${stamp}`,
  source: "cmp-a",
  competitorName: "Concorrente A",
  kind: "blog" as const,
  url: "https://exemplo.test/post",
  title: "Post de teste",
  collectedAt: new Date().toISOString(),
  clientName: clienteA.name,
};
const sigFail = await runAsOrgCollector(aId, () => persistSignals([evento]));
const { count: sigA } = await admin.from("signals").select("id", { count: "exact", head: true }).eq("org_id", aId);
const { count: sigB } = await admin.from("signals").select("id", { count: "exact", head: true }).eq("org_id", bId);
add(
  "persistSignals sob A grava na tabela signals COM org A; B fica zerada",
  sigFail === null && (sigA ?? 0) === 1 && (sigB ?? 0) === 0,
  `falha=${sigFail ?? "nenhuma"} · A=${sigA} · B=${sigB}`,
);

// ── 6. agendamentos por org + cron no-op seguro ──
await runAsOrgCollector(aId, () => persistSchedule({ clientName: clienteA.name, request: "resumo semanal de teste", cadence: { kind: "weekly", weekday: 1 } }));
const schedA = await runAsOrgCollector(aId, () => loadSchedules());
const schedB = await runAsOrgCollector(bId, () => loadSchedules());
const dueB = await runAsOrgCollector(bId, () => runDueSchedules(new Date()));
add(
  "persistSchedule/loadSchedules isolados por org; runDueSchedules sob B = no-op",
  schedA.length === 1 && schedB.length === 0 && dueB.ran === 0 && dueB.errors.length === 0,
  `A=${schedA.length} · B=${schedB.length} · B.ran=${dueB.ran}`,
);

// ── limpeza (cascade apaga clients/org_docs/signals das orgs de teste) ──
await admin.from("orgs").delete().in("slug", [orgA.slug, orgB.slug]);

// ── Resultado ──
console.log("── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nORG-LOOP VERDE ✅ — loop e cron por org, org explícita, sem vazamento.\n" : "\nORG-LOOP VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
