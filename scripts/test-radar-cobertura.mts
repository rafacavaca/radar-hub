/**
 * Smoke Onda 3 · E3 — Cobertura de conteúdo. Gera a cobertura real do mercado
 * TAGAT (diagnósticos salvos) e prova honestidade estrutural + escopo.
 *
 * Prova:
 *  1. Temas derivados do conteúdo real; cada tema só marca concorrentes que
 *     EXISTEM na base (nunca inventa nome).
 *  2. whitespace = tema coberto por ≤1 concorrente (computado em código).
 *  3. Nota de escopo presente (cobertura ≠ ranking de SEO).
 *  4. <2 concorrentes com conteúdo → erro claro (não força análise vazia).
 *
 * Uso: npm run smoke:cobertura
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";

const { analisarCobertura } = await import("@/lib/diagnostico/cobertura");
import type { DiagnosticoConcorrente } from "@/lib/diagnostico/schema";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke E3 — Cobertura de conteúdo ===\n");

const file = JSON.parse(readFileSync("data/diagnostico.json", "utf8")) as { diagnosticos: DiagnosticoConcorrente[] };
const diags = file.diagnosticos.filter((d) => d.clientName === "TAGAT Foodtech");

const cob = await analisarCobertura("TAGAT Foodtech", diags);
console.log(`concorrentes na base: ${cob.concorrentes.join(", ")}`);
console.log("TEMAS × cobertura:");
for (const t of cob.temas) console.log(`  ${t.whitespace ? "◦" : "●"} ${t.tema.padEnd(28)} ${t.cobertoPor.join(", ") || "(ninguém)"}`);

const nomesValidos = new Set(cob.concorrentes);
add("≥4 temas derivados do conteúdo real", cob.temas.length >= 4, `${cob.temas.length} temas`);
add(
  "Nunca inventa concorrente: toda cobertura ∈ base",
  cob.temas.every((t) => t.cobertoPor.every((n) => nomesValidos.has(n))),
  "invariante",
);
add(
  "whitespace = coberto por ≤1 concorrente (computado)",
  cob.temas.every((t) => t.whitespace === (t.cobertoPor.length <= 1)),
  `whitespace=${cob.temas.filter((t) => t.whitespace).length}/${cob.temas.length}`,
);
add("Nota de escopo (cobertura ≠ SEO ranking) presente", /não é ranking de SEO/i.test(cob.observacao), "ok");
add("Rotulado derivado", cob.tipo === "derivado", `tipo=${cob.tipo}`);

// <2 concorrentes → erro
let errou = false;
try {
  await analisarCobertura("TAGAT Foodtech", diags.slice(0, 1));
} catch {
  errou = true;
}
add("<2 concorrentes com conteúdo → erro claro (não força análise)", errou, "lançou");

console.log("\n── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nE3 VERDE ✅ — cobertura honesta (temas reais, whitespace computado, escopo declarado).\n" : "\nE3 VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
