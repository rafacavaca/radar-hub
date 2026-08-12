/**
 * Smoke SELEÇÃO DE EVENTOS (analista) — o fix do ponto cego: antes o analista lia
 * só os 12 mais recentes NO GERAL, então um concorrente barulhento tapava os
 * outros (sumiam do Briefing/Visão). Agora é round-robin POR CONCORRENTE, teto 20.
 * Puro, sem rede. Uso: npm run smoke:select
 */
import { selecionarEventos } from "@/lib/analyst-lens";

type Crit = { nome: string; ok: boolean; det?: string };
const crit: Crit[] = [];
const add = (n: string, ok: boolean, d?: string) => crit.push({ nome: n, ok, det: d });

console.log("\n=== Smoke SELEÇÃO DE EVENTOS — round-robin por concorrente (teto 20) ===\n");

const ev = (comp: string, id: string, iso: string) =>
  ({ id, competitorName: comp, url: "https://ex.test/" + id, title: id, collectedAt: iso }) as unknown as Parameters<typeof selecionarEventos>[0][number];

// "Barulhento" com 15 eventos (os mais recentes) + 8 concorrentes com 2 cada = 31, 9 concorrentes.
const events: ReturnType<typeof ev>[] = [];
for (let i = 0; i < 15; i++) events.push(ev("Barulhento", `b-${i}`, `2026-08-12T${String(23 - i).padStart(2, "0")}:00:00.000Z`));
for (const o of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
  events.push(ev(o, `${o}-0`, "2026-08-11T10:00:00.000Z"));
  events.push(ev(o, `${o}-1`, "2026-08-10T10:00:00.000Z"));
}

const sel = selecionarEventos(events, 20);
const comps = new Set(sel.map((e) => e.competitorName));
const barulho = sel.filter((e) => e.competitorName === "Barulhento").length;

add("teto TOTAL = 20", sel.length === 20, `n=${sel.length}`);
add("cobre TODOS os 9 concorrentes (nenhum no escuro)", comps.size === 9, `concorrentes=${comps.size}`);
add("o barulhento NÃO monopoliza (round-robin: ~4, não 15)", barulho <= 5, `barulhento=${barulho}`);
add("cada um dos 8 menores entra com pelo menos 1", ["A", "B", "C", "D", "E", "F", "G", "H"].every((o) => sel.some((e) => e.competitorName === o)));

// <= 20 eventos → devolve todos, por recência.
const poucos = [ev("X", "x2", "2026-08-08T00:00:00Z"), ev("X", "x1", "2026-08-10T00:00:00Z"), ev("Y", "y1", "2026-08-09T00:00:00Z")];
const selP = selecionarEventos(poucos, 20);
add("<= 20 eventos → devolve todos, mais recente 1º", selP.length === 3 && selP[0].id === "x1", `n=${selP.length} 1º=${selP[0]?.id}`);

console.log("── Resultado ──");
let ok = true;
for (const c of crit) { console.log(`${c.ok ? "✅" : "❌"} ${c.nome}${c.det ? `  — ${c.det}` : ""}`); if (!c.ok) ok = false; }
console.log(ok ? "\nSELEÇÃO VERDE ✅ — todo concorrente ativo é analisado, teto 20.\n" : "\nSELEÇÃO VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
