/**
 * Smoke F1d — BATTLECARD. Gera o battlecard REAL da Intelia (diag salvo em
 * prod + Brain da TAGAT via fetchClientBrain — fixture/live) e prova:
 *   1. Forças/fraquezas SÓ com evidência (toda linha tem fonte_url).
 *   2. "Como ganhar" ancorado no Brain; diferencial null ⇒ resposta null.
 *   3. Cliente SEM Brain (mode none) ⇒ TODOS os nosso_diferencial null —
 *      o card DIZ que não cobre em vez de forçar.
 *   4. Abordagem: rascunho de e-mail não-vazio gerado só do battlecard.
 *
 * Custo: 3 chamadas de LLM (2 battlecards + 1 abordagem). Sem scrape novo.
 * Uso: npm run smoke:battlecard
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";

const { gerarBattlecard, gerarAbordagem } = await import("@/lib/diagnostico/battlecard");
import type { DiagnosticoConcorrente } from "@/lib/diagnostico/schema";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke F1d — Battlecard (Intelia × TAGAT) ===\n");

// diag REAL salvo (leitura direta; nada é escrito no store neste smoke)
const file = JSON.parse(readFileSync("data/diagnostico.json", "utf8")) as { diagnosticos: DiagnosticoConcorrente[] };
const diag = file.diagnosticos.find((d) => d.concorrente_id === "intelia" && d.clientName === "TAGAT Foodtech");
if (!diag) {
  console.error("❌ diag da Intelia não existe em prod — rode o diagnóstico antes.");
  process.exit(1);
}

// ── 1-2. Battlecard real (Brain da TAGAT) ────────────────────────────────────
const card = await gerarBattlecard(diag);

console.log(`BRAIN: ${card.brain_mode}\n`);
console.log(`QUEM SÃO: ${card.quem_sao}\n`);
console.log("FORÇAS:");
for (const f of card.forcas) console.log(`  + ${f.texto}  ⟵ ${f.fonte_url ?? "SEM FONTE"}`);
console.log("FRAQUEZAS:");
for (const f of card.fraquezas) console.log(`  − ${f.texto}  ⟵ ${f.fonte_url ?? "SEM FONTE"}`);
console.log("COMO GANHAR:");
for (const g of card.como_ganhar) {
  console.log(`  • Fraqueza: ${g.fraqueza}`);
  console.log(g.nosso_diferencial ? `    Nosso diferencial: ${g.nosso_diferencial}\n    Na conversa: ${g.resposta ?? "—"}` : "    (sem diferencial nosso mapeado — alimentar o Brain)");
}
console.log("OBJEÇÕES:");
for (const o of card.objecoes) console.log(`  “${o.objecao}” → ${o.resposta}`);

add("quem_sao preenchido", card.quem_sao.length > 20, `${card.quem_sao.length} chars`);
add(
  "Toda força/fraqueza tem fonte (evidência indexada; sem evidência = descartada)",
  [...card.forcas, ...card.fraquezas].length > 0 && [...card.forcas, ...card.fraquezas].every((f) => Boolean(f.fonte_url)),
  `forcas=${card.forcas.length} · fraquezas=${card.fraquezas.length}`,
);
add(
  "como_ganhar ≥1 e invariante: diferencial null ⇒ resposta null",
  card.como_ganhar.length >= 1 && card.como_ganhar.every((g) => (g.nosso_diferencial === null ? g.resposta === null : true)),
  `itens=${card.como_ganhar.length} · com diferencial=${card.como_ganhar.filter((g) => g.nosso_diferencial).length}`,
);
add(
  "Brain da TAGAT disponível (fixture/live) e rotulado no card",
  card.brain_mode === "fixture" || card.brain_mode === "live",
  `brain_mode=${card.brain_mode}`,
);

// ── 3. Cliente SEM Brain ⇒ 'como ganhar' não força ──────────────────────────
const semBrain = await gerarBattlecard({ ...diag, clientName: "Cliente Sem Brain" });
add(
  "Cliente sem Brain (mode none): TODOS os nosso_diferencial = null (diz, não força)",
  semBrain.brain_mode === "none" && semBrain.como_ganhar.every((g) => g.nosso_diferencial === null && g.resposta === null),
  `brain_mode=${semBrain.brain_mode} · itens=${semBrain.como_ganhar.length} · forçados=${semBrain.como_ganhar.filter((g) => g.nosso_diferencial).length}`,
);

// ── 4. Abordagem a partir do battlecard ──────────────────────────────────────
const abordagem = await gerarAbordagem({ ...diag, battlecard: card });
console.log(`\nABORDAGEM (rascunho):\n${abordagem}\n`);
add(
  "Abordagem: rascunho de e-mail não-vazio, com assunto, citando o contexto do card",
  abordagem.length > 150 && /assunto/i.test(abordagem.split("\n")[0] ?? ""),
  `${abordagem.length} chars`,
);

// ── Resultado ────────────────────────────────────────────────────────────────
console.log("\n── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nF1d VERDE ✅ — battlecard citado, ancorado no Brain, honesto onde não cobre.\n" : "\nF1d VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
