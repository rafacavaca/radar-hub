/**
 * Smoke VOCABULÁRIO (P13) — o resolvedor central de rótulos. Prova: sem
 * override sai o padrão; com override sai o custom; a sanitização descarta
 * termo desconhecido, vazio e o que é igual ao padrão (mapa mínimo); e o
 * round-trip no store bate. Zero rede — puro + store JSON isolado.
 *
 * Uso: npm run smoke:vocab
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-vocab-"));
delete process.env.RADAR_DB;

const { VOCAB_TERMS, rotulo, rotuloPadrao, rotuloSingular, sanitizarVocab, loadVocab, saveVocab } = await import("@/lib/vocab");

type Criterio = { nome: string; feito: boolean };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean) => criterios.push({ nome: n, feito: f });

console.log("\n=== Smoke VOCABULÁRIO — resolvedor + sanitização + store ===\n");

// ── 1. resolvedor ──
add("Sem override → rótulo padrão", rotulo({}, "concorrentes") === "Concorrentes");
add("Sem override (null) → padrão", rotulo(null, "areas") === "Áreas");
add("Com override → rótulo custom", rotulo({ concorrentes: "Rivais" }, "concorrentes") === "Rivais");
add("Override vazio → cai no padrão", rotulo({ concorrentes: "   " }, "concorrentes") === "Concorrentes");
add("rotuloPadrao ignora qualquer override", rotuloPadrao("prioridade") === "Prioridade");

// ── 2. sanitização (mapa mínimo) ──
const san = sanitizarVocab({ concorrentes: "Rivais", inventado: "x", areas: "  ", prioridade: "Prioridade" });
add("Sanitizar: mantém override real", san.concorrentes === "Rivais");
add("Sanitizar: descarta termo desconhecido", !("inventado" in san));
add("Sanitizar: descarta vazio", !("areas" in san));
add("Sanitizar: descarta o que == padrão (mapa mínimo)", !("prioridade" in san));
add("Sanitizar: trim no valor", sanitizarVocab({ contas_chave: "  Alvos " }).contas_chave === "Alvos");

// ── 2b. singular (coluna/campo de um item) ──
add("Singular padrão: concorrentes → 'Concorrente'", rotuloSingular({}, "concorrentes") === "Concorrente");
add("Singular padrão: areas → 'Área', contas_chave → 'Conta-chave'", rotuloSingular(null, "areas") === "Área" && rotuloSingular({}, "contas_chave") === "Conta-chave");
add("Singular custom → o termo da agência (consistente, não flexiona)", rotuloSingular({ concorrentes: "Rivais" }, "concorrentes") === "Rivais");
add("Singular de termo já-singular = igual ao plural", rotuloSingular({}, "oportunidade") === "Oportunidade");

// ── 3. catálogo ──
add("Catálogo tem os termos do pitch", VOCAB_TERMS.length >= 6 && VOCAB_TERMS.some((t) => t.key === "base_conhecimento"));

// ── 4. round-trip no store (JSON isolado) ──
const vazio = await loadVocab();
add("Store: começa vazio (sem overrides)", Object.keys(vazio).length === 0);
await saveVocab({ concorrentes: "Rivais", contas_chave: "Alvos", inventado: "x" } as never);
const lido = await loadVocab();
add("Store: persiste e relê os overrides", lido.concorrentes === "Rivais" && lido.contas_chave === "Alvos");
add("Store: não grava termo inválido", !("inventado" in lido));
add("Store: resolvedor usa o que foi salvo", rotulo(lido, "concorrentes") === "Rivais" && rotulo(lido, "areas") === "Áreas");

// ── Resultado ──
console.log("── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nVOCABULÁRIO VERDE ✅ — padrão neutro, override real, mapa mínimo.\n" : "\nVOCABULÁRIO VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
