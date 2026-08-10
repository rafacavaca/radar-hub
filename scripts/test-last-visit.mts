/**
 * Smoke LAST-VISIT — o "desde sua última visita". Prova, contra o Supabase REAL:
 *  1. markVisit/getLastVisit são POR-USUÁRIO (a visita de X ≠ a de Y).
 *  2. São ORG-SCOPED (a visita na org A não aparece na org B).
 *  3. countSignalsSince conta só os sinais COLETADOS depois da data, org-scoped.
 *
 * Uso: npm run smoke:visita
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const URL = process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) { console.log("Sem chaves Supabase — smoke visita não roda."); process.exit(1); }

process.env.RADAR_DB = "supabase";
process.env.RADAR_ADMIN_CONTEXT = "1";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke LAST-VISIT — 'desde sua última visita' ===\n");

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const { runAsOrgCollector } = await import("@/lib/db/collector-org");
const { getLastVisit, markVisit } = await import("@/lib/last-visit");
const { countSignalsSince } = await import("@/lib/db/repo-signals");

const stamp = process.env.RADAR_ISO_STAMP || "vis";
const a = { slug: `test-vis-a-${stamp}`, name: "Org A (vis)" };
const b = { slug: `test-vis-b-${stamp}`, name: "Org B (vis)" };
await admin.from("orgs").delete().in("slug", [a.slug, b.slug]);
const { data: aRow } = await admin.from("orgs").insert(a).select("id").single();
const { data: bRow } = await admin.from("orgs").insert(b).select("id").single();
const aId = aRow!.id as string;
const bId = bRow!.id as string;

const cli = `Cliente ${stamp}`;
const userX = `user-X-${stamp}`;
const userY = `user-Y-${stamp}`;
const visitaX = "2026-08-01T00:00:00.000Z";

// ── 1/2. última visita por-usuário + org-scoped ──
await runAsOrgCollector(aId, () => markVisit(cli, userX, visitaX));
const vX_A = await runAsOrgCollector(aId, () => getLastVisit(cli, userX));
const vY_A = await runAsOrgCollector(aId, () => getLastVisit(cli, userY));
const vX_B = await runAsOrgCollector(bId, () => getLastVisit(cli, userX));
add("getLastVisit devolve a visita DO usuário (X vê a de X)", vX_A === visitaX, `X@A=${vX_A}`);
add("Por-usuário: Y NÃO herda a visita de X", vY_A === null, `Y@A=${vY_A ?? "null"}`);
add("Org-scoped: a visita de X na org A NÃO aparece na org B", vX_B === null, `X@B=${vX_B ?? "null"}`);

// ── 3. countSignalsSince ──
const sinal = (org: string, id: string, ts: string) => ({
  id, org_id: org, client_id: cli, competitor_id: "r", ts,
  data: { id, clientName: cli, kind: "blog", competitorName: "R", source: "r", collectedAt: ts, title: id, url: "https://ex.test/" + id },
});
await admin.from("signals").insert([
  sinal(aId, `antes-${stamp}`, "2026-07-20T10:00:00.000Z"), // antes da visita
  sinal(aId, `depois1-${stamp}`, "2026-08-05T10:00:00.000Z"), // depois
  sinal(aId, `depois2-${stamp}`, "2026-08-06T10:00:00.000Z"), // depois
]);
const nA = await runAsOrgCollector(aId, () => countSignalsSince(cli, visitaX));
const nB = await runAsOrgCollector(bId, () => countSignalsSince(cli, visitaX));
add("countSignalsSince conta só os DEPOIS da visita (2 de 3)", nA === 2, `A=${nA}`);
add("countSignalsSince é org-scoped (B não conta os de A)", nB === 0, `B=${nB}`);

await admin.from("orgs").delete().in("slug", [a.slug, b.slug]);

console.log("── Resultado ──");
let ok = true;
for (const c of criterios) { console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`); if (!c.feito) ok = false; }
console.log(ok ? "\nLAST-VISIT VERDE ✅ — por-usuário, org-scoped, novidade desde a data.\n" : "\nLAST-VISIT VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
