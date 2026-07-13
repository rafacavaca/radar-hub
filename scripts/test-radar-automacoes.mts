/**
 * Smoke AUTOMAÇÕES — o painel que liga/desliga o que roda sozinho. Prova a regra
 * INEGOCIÁVEL do Rafael: DEFAULT OFF (nada varre sozinho) + a lógica de "devida"
 * (frequência/dia + 1x/dia, fuso Brasil). Zero rede — testa as peças puras + store.
 *
 * Uso: npm run smoke:automacoes
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-auto-"));
delete process.env.RADAR_DB;

const { loadAutomacoes, saveAutomacoes, automacaoDevida, automacoesOff, marcarRodou, sanitizarCadencia } = await import("@/lib/automacoes");
const { localDayKey, localWeekday } = await import("@/lib/schedules");

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke AUTOMAÇÕES — default OFF + devida por cadência ===\n");

// ── 1. DEFAULT OFF (o pedido central) ──
const off = await loadAutomacoes();
add("Default: digest DESLIGADO", off.digest.enabled === false);
add("Default: varredura DESLIGADA", off.diagnostico.enabled === false);

const seg = new Date("2026-07-13T12:00:00.000Z"); // segunda 09h BRT
add("Desligada NUNCA é devida (nada roda sozinho)", automacaoDevida(off.digest, seg) === false && automacaoDevida(off.diagnostico, seg) === false);

// ── 2. LIGAR diária → devida hoje; após rodar → não de novo hoje ──
const diaria = { enabled: true, cadencia: { tipo: "diaria" as const } };
add("Ligada diária é devida hoje", automacaoDevida(diaria, seg) === true);
add("Já rodou hoje → não é devida de novo (1x/dia)", automacaoDevida({ ...diaria, lastRunDay: localDayKey(seg) }, seg) === false);
const ontem = new Date(seg.getTime() - 24 * 3600 * 1000);
add("Rodou ONTEM → devida hoje (novo dia)", automacaoDevida({ ...diaria, lastRunDay: localDayKey(ontem) }, seg) === true);

// ── 3. Semanal → devida SÓ no dia certo ──
const hojeWd = localWeekday(seg);
const semanalHoje = { enabled: true, cadencia: { tipo: "semanal" as const, weekday: hojeWd } };
const semanalOutro = { enabled: true, cadencia: { tipo: "semanal" as const, weekday: (hojeWd + 2) % 7 } };
add("Semanal no dia certo é devida", automacaoDevida(semanalHoje, seg) === true, `weekday hoje=${hojeWd}`);
add("Semanal em outro dia NÃO é devida", automacaoDevida(semanalOutro, seg) === false);

// ── 4. persistência + marcarRodou (via store, RADAR_DATA_DIR isolado) ──
let cfg = automacoesOff();
cfg.digest = { enabled: true, cadencia: { tipo: "semanal", weekday: 3 } };
await saveAutomacoes(cfg);
const relido = await loadAutomacoes();
add("Salva e relê (digest ligado, semanal quarta)", relido.digest.enabled && relido.digest.cadencia.tipo === "semanal" && (relido.digest.cadencia as { weekday: number }).weekday === 3);
add("O outro segue OFF (não liga o que não pedi)", relido.diagnostico.enabled === false);

await marcarRodou("digest", seg);
add("marcarRodou grava lastRunDay (trava 1x/dia)", (await loadAutomacoes()).digest.lastRunDay === localDayKey(seg));

// ── 5. sanitização (weekday inválido → 1; tipo desconhecido → diária) ──
add("Cadência inválida vira diária", sanitizarCadencia({ tipo: "xxx" } as never).tipo === "diaria");
const s = sanitizarCadencia({ tipo: "semanal", weekday: 99 } as never);
add("weekday fora de 0-6 vira 1 (segunda)", s.tipo === "semanal" && s.weekday === 1);

// ── Resultado ──
console.log("── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nAUTOMAÇÕES VERDE ✅ — default OFF, devida só quando ligado e no dia certo.\n" : "\nAUTOMAÇÕES VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
