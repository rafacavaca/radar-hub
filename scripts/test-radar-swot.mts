/**
 * Smoke Onda 3 · F — SWOT vivo. Gera o SWOT real da Intelia (diag salvo + Brain)
 * e prova:
 *  1. Forças/Fraquezas ANCORADAS em evidência (toda linha com fonte_url).
 *  2. Oportunidades/Ameaças existem como leitura (síntese; fonte opcional).
 *  3. Rotulado tipo:"derivado" + brain_mode coerente.
 *  4. Cliente SEM Brain (none) ⇒ ainda produz SWOT (leitura externa conservadora),
 *     forças/fraquezas seguem citadas.
 *
 * Uso: npm run smoke:swot
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";

const { gerarSwot } = await import("@/lib/diagnostico/swot");
import type { DiagnosticoConcorrente } from "@/lib/diagnostico/schema";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke F (Onda 3) — SWOT vivo (Intelia) ===\n");

const file = JSON.parse(readFileSync("data/diagnostico.json", "utf8")) as { diagnosticos: DiagnosticoConcorrente[] };
const diag = file.diagnosticos.find((d) => d.concorrente_id === "intelia" && d.clientName === "TAGAT Foodtech");
if (!diag) {
  console.error("❌ diag Intelia não existe.");
  process.exit(1);
}

const swot = await gerarSwot(diag);
const show = (t: string, itens: { texto: string; fonte_url?: string }[]) => {
  console.log(`${t}:`);
  for (const i of itens) console.log(`  · ${i.texto}${i.fonte_url ? `  ⟵ ${i.fonte_url}` : ""}`);
};
console.log(`BRAIN: ${swot.brain_mode}\n`);
show("FORÇAS", swot.forcas);
show("FRAQUEZAS", swot.fraquezas);
show("OPORTUNIDADES (leitura)", swot.oportunidades);
show("AMEAÇAS (leitura)", swot.ameacas);

add("Forças e fraquezas existem e TODAS têm fonte (evidência)", swot.forcas.length + swot.fraquezas.length >= 2 && [...swot.forcas, ...swot.fraquezas].every((i) => Boolean(i.fonte_url)), `F=${swot.forcas.length} W=${swot.fraquezas.length}`);
add("Oportunidades + Ameaças presentes (leitura estratégica)", swot.oportunidades.length + swot.ameacas.length >= 2, `O=${swot.oportunidades.length} T=${swot.ameacas.length}`);
add("Rotulado derivado + brain_mode válido", swot.tipo === "derivado" && ["live", "fixture", "none"].includes(swot.brain_mode), `tipo=${swot.tipo} brain=${swot.brain_mode}`);

// cliente sem Brain
const semBrain = await gerarSwot({ ...diag, clientName: "Cliente Sem Brain" });
add("Sem Brain (none): ainda gera SWOT com forças/fraquezas citadas", semBrain.brain_mode === "none" && [...semBrain.forcas, ...semBrain.fraquezas].every((i) => Boolean(i.fonte_url)), `brain=${semBrain.brain_mode} · F+W=${semBrain.forcas.length + semBrain.fraquezas.length}`);

console.log("\n── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nF (SWOT) VERDE ✅ — forças/fraquezas citadas; oport./ameaças como leitura; honesto sem Brain.\n" : "\nF (SWOT) VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
