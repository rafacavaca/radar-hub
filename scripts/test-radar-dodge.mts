/**
 * Smoke — DESEMPILHAMENTO de rótulos do 2x2 (correção 2). Determinístico.
 * Prova que rótulos NUNCA se sobrepõem, MESMO com pontos coincidentes (empate
 * real num eixo) — o requisito central do fix.
 *
 * Uso: npm run smoke:dodge
 */

const { dodgeLabels } = await import("@/lib/diagnostico/label-dodge");

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke — dodge de rótulos (2x2) ===\n");

const W = 460, LH = 13, top = 22, bottom = 256;

// caso 1: DOIS pontos EXATAMENTE coincidentes (o bug original: Ploomes~Rush 72/72)
const coincidentes = [
  { label: "Ploomes", x: 300, y: 120 },
  { label: "Rush", x: 300, y: 120 }, // mesmo ponto
  { label: "RD Station", x: 300, y: 120 }, // trio empatado
];
const d1 = dodgeLabels(coincidentes, { width: W, lineHeight: LH, top, bottom });
console.log("3 pontos coincidentes (300,120):");
for (const l of d1.sort((a, b) => a.labelY - b.labelY)) console.log(`  ${l.label.padEnd(11)} rótulo y=${Math.round(l.labelY)} [${l.side}]${l.deslocado ? " deslocado" : ""}`);

function semOverlap(labels: ReturnType<typeof dodgeLabels>): boolean {
  for (const side of ["start", "end"] as const) {
    const s = labels.filter((l) => l.side === side).sort((a, b) => a.labelY - b.labelY);
    for (let i = 1; i < s.length; i++) if (s[i].labelY - s[i - 1].labelY < LH - 0.01) return false;
  }
  return true;
}
add("3 rótulos coincidentes → separados por ≥LH (nenhum embaralhado)", semOverlap(d1), `slots=${d1.map((l) => Math.round(l.labelY)).sort((a, b) => a - b).join(",")}`);
add("Todos os rótulos dentro da moldura [top,bottom]", d1.every((l) => l.labelY >= top - 0.01 && l.labelY <= bottom + 0.01), "ok");
add("Rótulos deslocados são marcados (para desenhar linha-guia)", d1.filter((l) => l.deslocado).length >= 2, `${d1.filter((l) => l.deslocado).length} deslocados`);

// caso 2: pontos bem separados NÃO são deslocados (não estraga o que já estava bom)
const separados = [
  { label: "A", x: 100, y: 40 },
  { label: "B", x: 100, y: 120 },
  { label: "C", x: 100, y: 220 },
];
const d2 = dodgeLabels(separados, { width: W, lineHeight: LH, top, bottom });
add("Pontos separados: nenhum rótulo deslocado (fica no ponto)", d2.every((l) => !l.deslocado), `deslocados=${d2.filter((l) => l.deslocado).length}`);

// caso 3: dois lados independentes (esq/dir não brigam entre si)
const doisLados = [
  { label: "Esq1", x: 80, y: 100 },
  { label: "Dir1", x: 400, y: 100 },
  { label: "Esq2", x: 80, y: 105 },
  { label: "Dir2", x: 400, y: 105 },
];
const d3 = dodgeLabels(doisLados, { width: W, lineHeight: LH, top, bottom });
add("Lados independentes: esq e dir podem compartilhar y sem colidir", semOverlap(d3), `esq=${d3.filter((l) => l.side === "start").length} dir=${d3.filter((l) => l.side === "end").length}`);

console.log("\n── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nDodge VERDE ✅ — rótulos nunca se sobrepõem, mesmo com empate real.\n" : "\nDodge VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
