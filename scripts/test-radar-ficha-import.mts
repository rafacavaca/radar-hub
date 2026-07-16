/**
 * Smoke do IMPORT DA FICHA (contrato v1). Prova o ciclo diagnóstico→Ficha→Radar:
 *  (1) parseFicha honesto: version 1 ok; version 2 e sem version → RECUSA clara;
 *  (2) diffFicha mostra o que VAI mudar (nada aplicado ainda);
 *  (3) applyFicha aplica só os `definido`, org-scoped:
 *      - a régua muda DE VERDADE (o teste do contrato: score 72 era Alta no
 *        padrão 70/40 → vira MÉDIA com o corte 80/50 da Ficha);
 *      - rótulo aplicado; conta nova criada; base local gravada; áreas ativas
 *        exatamente as da Ficha; selos viram "definido" + `disseram` guardado;
 *      - `validar:true` NÃO entra como fato (vira sugestão no relatório);
 *      - parâmetro `pendente` NÃO é aplicado e é reportado.
 * Zero rede — stores JSON isolados (RADAR_DATA_DIR).
 *
 * Uso: npm run smoke:ficha
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-ficha-"));
delete process.env.RADAR_DB;

const { parseFicha, diffFicha, applyFicha, loadCurrentState } = await import("@/lib/implantacao/ficha");
const { loadPrioridade, nivelPorCorte } = await import("@/lib/prioridade");
const { loadVocab } = await import("@/lib/vocab");
const { loadWatchlist, pillarOf } = await import("@/lib/watchlist");
const { loadActiveLensesFor } = await import("@/lib/lenses");
const { loadBaseLocal } = await import("@/lib/base-local");
const { loadParametrizacao, statusDe } = await import("@/lib/parametrizacao");

type Criterio = { nome: string; feito: boolean };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean) => criterios.push({ nome: n, feito: f });

console.log("\n=== Smoke IMPORT DA FICHA — contrato v1 ===\n");

// ── 1. parseFicha (versão) ──
add("version 1 → aceita", parseFicha({ ficha_version: 1, agencia: "Teste" }).ok === true);
const v2 = parseFicha({ ficha_version: 2 });
add("version 2 → RECUSA com mensagem", v2.ok === false && /versão 2/i.test((v2 as { error: string }).error));
add("sem version → RECUSA", parseFicha({ agencia: "x" }).ok === false);
add("JSON inválido → RECUSA", parseFicha("{ nÃ£o Ã© json").ok === false);

// ── Ficha de exemplo (o que o instrumento emitiria) ──
const ficha = {
  ficha_version: 1,
  agencia: "Agência Teste",
  criterio_agencia: {
    prioridade: { status: "definido", valor: { alta_a_partir_de: 80, media_a_partir_de: 50 }, disseram: "Esse eu agiria (80), esse eu ignoraria (35)." },
    rotulos: { status: "definido", valor: { concorrentes: "Rivais", oportunidade: "Gancho" }, disseram: "A gente chama de gancho." },
    cadencia: { status: "pendente", valor: { varredura: "segunda 06:00" } },
    alertas: { status: "definido", valor: [{ regra: "concorrente sobre conta-chave" }], disseram: "Perdemos cliente quando o concorrente chega antes." },
  },
  contas: [
    {
      nome: "Cliente Novo A",
      concorrentes: { status: "definido", valor: [{ nome: "Rival X", validar: false }, { nome: "Rival Y", validar: true }] },
      base_conhecimento: { status: "definido", valor: "Vende X para Y; diferencial Z.", origem: "local" },
      areas_ativas: { status: "definido", valor: ["comercial"] },
      fontes_temas: { status: "definido", valor: { fontes: ["portal X"], temas: ["exportação"] } },
    },
  ],
};

// ── 2. diffFicha (nada muda ainda) ──
const parsed = parseFicha(ficha);
if (!parsed.ok) { console.log("❌ parse falhou:", parsed.error); process.exit(1); }
const current0 = await loadCurrentState();
const diff = diffFicha(parsed.ficha, current0, "Agência Teste");
const todasLinhas = diff.grupos.flatMap((g) => g.linhas).join(" | ");
add("diff mostra Alta 70 → 80", /Alta 70 → 80/.test(todasLinhas));
add("diff mostra rótulo novo (Rivais)", /Rivais/.test(todasLinhas) && /\(novo\)/.test(todasLinhas));
add("diff mostra conta nova a criar", diff.grupos.some((g) => g.titulo.includes("Cliente Novo A")) && /criada/.test(todasLinhas));
add("diff marca 'a validar' (Rival Y)", /a validar/.test(todasLinhas));
// NADA aplicado ainda:
add("diff é read-only: prioridade ainda no padrão 70/40", (await loadPrioridade()).alta === 70);

// ── 3. applyFicha ──
const before72 = nivelPorCorte(72, await loadPrioridade()); // "Alta" no padrão
const rep = await applyFicha(parsed.ficha, new Date("2026-07-16T12:00:00Z"));

const corte = await loadPrioridade();
add("aplicou a régua (corte 80/50)", corte.alta === 80 && corte.media === 50);
add("A RÉGUA MUDA DE VERDADE: 72 era Alta no padrão → vira MÉDIA com a Ficha", before72 === "Alta" && nivelPorCorte(72, corte) === "Média");

const vocab = await loadVocab();
add("aplicou o rótulo (concorrentes → Rivais)", vocab.concorrentes === "Rivais");

const wl = await loadWatchlist();
const contaA = wl.clients.find((c) => c.name === "Cliente Novo A");
add("criou a conta nova", !!contaA);
const concs = (contaA?.competitors ?? []).filter((k) => pillarOf(k, contaA?.mode) === "concorrente").map((c) => c.name);
add("adicionou o concorrente CONFIRMADO (Rival X)", concs.includes("Rival X"));
add("NÃO adicionou o 'a validar' como fato (Rival Y ausente)", !concs.includes("Rival Y"));
add("relatório: Rival Y aparece como sugestão ignorada", rep.ignorado.some((i) => /Rival Y/.test(i.detalhe)));

const base = await loadBaseLocal("Cliente Novo A");
add("gravou a base local", base.includes("diferencial Z"));

const ativas = (await loadActiveLensesFor("Cliente Novo A")).map((l) => l.id);
add("áreas ativas = exatamente as da Ficha (só comercial)", ativas.length === 1 && ativas[0] === "comercial");

const registro = await loadParametrizacao("__agencia__");
add("selo regua_prioridade = definido", statusDe(registro, "regua_prioridade") === "definido");
add("selo rotulos = definido", statusDe(registro, "rotulos") === "definido");
add("selo concorrentes = definido", statusDe(registro, "concorrentes") === "definido");
add("selo clientes = definido (conta revista)", statusDe(registro, "clientes") === "definido");
add("carimbou implantadoEm", !!registro.implantadoEm);
add("guardou o 'disseram' da prioridade (Mapa de Tradução)", (registro.disseram.regua_prioridade ?? "").includes("agiria"));

add("pendente NÃO aplicado + reportado (cadência)", rep.pendente.some((p) => /Cadência/.test(p.param)));
add("fontes_temas reportado como pendente (não aplicado)", rep.pendente.some((p) => /Fontes e temas/.test(p.param)));
add("relatório tem aplicados", rep.aplicado.length >= 4);

// ── Resultado ──
console.log("── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nIMPORT DA FICHA VERDE ✅ — parse honesto, diff read-only, apply real e org-scoped.\n" : "\nIMPORT VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
