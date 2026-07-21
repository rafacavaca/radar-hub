/**
 * Smoke INÍCIO-COCKPIT — a Zona B da Home (cockpit "Meus clientes") é
 * ORG-SCOPED: cada agência só vê os SEUS clientes. Prova, contra o Supabase
 * REAL, que loadCockpit sob a org A vê só o cliente de A, e sob B só o de B
 * (zero vazamento). A Zona A "O negócio" é gateada por isSuperAdmin no servidor
 * (mesmo padrão de /admin e /custo, já provado) — aqui provamos o cockpit.
 *
 * Uso: npm run smoke:inicio
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const URL = process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) { console.log("Sem chaves Supabase — smoke inicio não roda."); process.exit(1); }

process.env.RADAR_DB = "supabase";
process.env.RADAR_ADMIN_CONTEXT = "1";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke INÍCIO-COCKPIT — cockpit org-scoped ===\n");

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const { runAsOrgCollector } = await import("@/lib/db/collector-org");
const { loadCockpit } = await import("@/lib/inicio/cockpit");

const stamp = process.env.RADAR_ISO_STAMP || "inicio";
const a = { slug: `test-inicio-a-${stamp}`, name: "Org A (inicio)" };
const b = { slug: `test-inicio-b-${stamp}`, name: "Org B (inicio)" };
await admin.from("orgs").delete().in("slug", [a.slug, b.slug]);
const { data: aRow } = await admin.from("orgs").insert(a).select("id").single();
const { data: bRow } = await admin.from("orgs").insert(b).select("id").single();
const aId = aRow!.id as string;
const bId = bRow!.id as string;

const cliA = { name: `Cliente A ${stamp}`, competitors: [] };
const cliB = { name: `Cliente B ${stamp}`, competitors: [] };
await admin.from("clients").insert({ id: cliA.name, org_id: aId, name: cliA.name, data: cliA });
await admin.from("clients").insert({ id: cliB.name, org_id: bId, name: cliB.name, data: cliB });
// cache de loop por org (ranAt diferente pra distinguir)
await admin.from("org_docs").insert({ org_id: aId, kind: "loop-cache", key: "2020-01-02", data: { items: [], ranAt: "2020-01-02T10:00:00.000Z" } });
await admin.from("org_docs").insert({ org_id: bId, kind: "loop-cache", key: "2020-01-03", data: { items: [], ranAt: "2020-01-03T10:00:00.000Z" } });

const now = new Date("2026-07-21T12:00:00.000Z");
const ckA = await runAsOrgCollector(aId, () => loadCockpit(now));
const ckB = await runAsOrgCollector(bId, () => loadCockpit(now));

add(
  "Cockpit sob A vê SÓ o cliente de A",
  ckA.clientes.length === 1 && ckA.clientes[0].name === cliA.name,
  `A=[${ckA.clientes.map((c) => c.name).join(", ")}]`,
);
add(
  "Cockpit sob B vê SÓ o cliente de B (não vaza o de A)",
  ckB.clientes.length === 1 && ckB.clientes[0].name === cliB.name && !ckB.clientes.some((c) => c.name === cliA.name),
  `B=[${ckB.clientes.map((c) => c.name).join(", ")}]`,
);
add(
  "Última varredura é a do cache DA org (não da outra)",
  ckA.ultimaVarredura === "2020-01-02T10:00:00.000Z" && ckB.ultimaVarredura === "2020-01-03T10:00:00.000Z",
  `A=${ckA.ultimaVarredura} B=${ckB.ultimaVarredura}`,
);
add("Cockpit devolve saúde (cadência + needsRefresh) sem lançar", typeof ckA.cadencia.ligada === "boolean" && typeof ckA.needsRefresh === "boolean");

await admin.from("orgs").delete().in("slug", [a.slug, b.slug]);

console.log("── Resultado ──");
let ok = true;
for (const c of criterios) { console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`); if (!c.feito) ok = false; }
console.log(ok ? "\nINÍCIO VERDE ✅ — cockpit org-scoped, sem vazamento entre agências.\n" : "\nINÍCIO VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
