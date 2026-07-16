/**
 * Smoke da RÉGUA DE PRIORIDADE (P7, org-level). Prova o que o Rafael exigiu —
 * "mudar a régua muda o texto na interface; se não muda, é decorativo":
 *  (1) padrão do sistema = 70/40 quando a agência nunca afinou;
 *  (2) salvar muda o corte, e a MESMA função que a interface usa (nivelPorCorte)
 *      passa a devolver outra palavra pro mesmo score — o efeito é real;
 *  (3) sanitize honesto: media<alta sempre, tudo preso a 1..100 (senão a palavra
 *      fica incoerente e some "Média" pra sempre);
 *  (4) é CRITÉRIO DA AGÊNCIA — chave única, não por-cliente.
 * Zero rede — store JSON isolado (RADAR_DATA_DIR).
 *
 * Uso: npm run smoke:prioridade
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-prioridade-"));
delete process.env.RADAR_DB;

const { loadPrioridade, savePrioridade, nivelPorCorte, sanitizarCorte, CORTE_PADRAO, corteCustomizado } = await import("@/lib/prioridade");

type Criterio = { nome: string; feito: boolean };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean) => criterios.push({ nome: n, feito: f });

console.log("\n=== Smoke P7 — régua de prioridade org-level ===\n");

// ── 1. PADRÃO DO SISTEMA (nunca afinada) ──
const inicial = await loadPrioridade();
add("padrão do sistema = 70/40 quando nunca afinada", inicial.alta === 70 && inicial.media === 40);
add("nível padrão: 72→Alta, 55→Média, 25→Baixa", nivelPorCorte(72, inicial) === "Alta" && nivelPorCorte(55, inicial) === "Média" && nivelPorCorte(25, inicial) === "Baixa");
add("corteCustomizado(padrão) = false", corteCustomizado(inicial) === false);

// ── 2. AFINAR MUDA O TEXTO (efeito real, não decorativo) ──
const salvo = await savePrioridade({ alta: 80, media: 50 });
add("salvar devolve o corte novo (80/50)", salvo.alta === 80 && salvo.media === 50);
const recarregado = await loadPrioridade();
add("recarregar reflete o corte salvo (80/50)", recarregado.alta === 80 && recarregado.media === 50);
// O MESMO score muda de palavra — é a prova do "não decorativo":
add("72 era Alta no padrão, vira MÉDIA com corte 80/50", nivelPorCorte(72, inicial) === "Alta" && nivelPorCorte(72, recarregado) === "Média");
add("85 segue Alta; 45 vira Baixa com corte 80/50", nivelPorCorte(85, recarregado) === "Alta" && nivelPorCorte(45, recarregado) === "Baixa");
add("corteCustomizado(80/50) = true", corteCustomizado(recarregado) === true);

// ── 3. SANITIZE HONESTO (a palavra nunca fica incoerente) ──
add("media ≥ alta é preso a alta-1 (não some 'Média')", sanitizarCorte({ alta: 60, media: 60 }).media === 59 && sanitizarCorte({ alta: 60, media: 90 }).media === 59);
add("acima de 100 e negativos são presos a 2..100 / 1..alta-1", (() => { const c = sanitizarCorte({ alta: 999, media: -5 }); return c.alta === 100 && c.media === 1; })());
add("lixo (NaN/undefined) cai no padrão 70/40", (() => { const c = sanitizarCorte({ alta: "abc", media: undefined }); return c.alta === CORTE_PADRAO.alta && c.media === CORTE_PADRAO.media; })());
add("sanitizarCorte(null) = padrão", (() => { const c = sanitizarCorte(null); return c.alta === 70 && c.media === 40; })());

// ── 4. persistir lixo não quebra a leitura (store nunca lança) ──
await savePrioridade({ alta: 200, media: 200 });
const apos = await loadPrioridade();
add("salvar corte inválido é saneado na ida (100/99), leitura coerente", apos.alta === 100 && apos.media === 99 && nivelPorCorte(99, apos) === "Média");

// ── Resultado ──
console.log("── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nP7 VERDE ✅ — régua da agência com efeito real, sanitize honesto.\n" : "\nP7 VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
