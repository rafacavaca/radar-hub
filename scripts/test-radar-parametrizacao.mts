/**
 * Smoke PARAMETRIZAÇÃO — a proveniência da implantação + o selo honesto
 * PENDENTE/DEFINIDO por parâmetro. Prova: vazio = tudo pendente (nunca default
 * silencioso), implantar marca os parâmetros e carimba a data (uma vez),
 * revisar atualiza só a data de revisão, e o round-trip no store bate.
 * Zero rede — regras puras + store JSON isolado (RADAR_DATA_DIR).
 *
 * Uso: npm run smoke:param
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-param-"));
delete process.env.RADAR_DB;

const {
  PARAM_IDS,
  parametrizacaoVazia,
  statusDe,
  completude,
  sanitizar,
  comImplantado,
  comParametro,
  comRevisao,
  registrarImplantacao,
  loadParametrizacao,
  definirParametro,
} = await import("@/lib/parametrizacao");

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke PARAMETRIZAÇÃO — proveniência + pendente/definido ===\n");

const T1 = "2026-07-15T10:00:00.000Z";
const T2 = "2026-08-14T10:00:00.000Z"; // ~30 dias depois (a afinação)

// ── 1. vazio = honesto (nada implantado, tudo pendente) ──
const vazia = parametrizacaoVazia("Moovefy");
add("Vazia: nunca implantado (implantadoEm null)", vazia.implantadoEm === null);
add("Vazia: 12 parâmetros conhecidos (P8 fundido no de prioridade)", PARAM_IDS.length === 12);
add("Vazia: TODO parâmetro é pendente (sem default silencioso)", PARAM_IDS.every((id) => statusDe(vazia, id) === "pendente"));
add("Vazia: completude 0/12", completude(vazia).definidos === 0 && completude(vazia).total === 12);

// ── 2. implantar: marca os parâmetros + carimba data (uma vez) ──
const impl = comImplantado(vazia, ["clientes", "concorrentes", "areas_ativas"], T1);
add("Implantar carimba implantadoEm", impl.implantadoEm === T1);
add("Implantar carimba revisadoEm", impl.revisadoEm === T1);
add("Implantar marca os informados como DEFINIDOS", ["clientes", "concorrentes", "areas_ativas"].every((id) => statusDe(impl, id as never) === "definido"));
add("Os não-informados seguem PENDENTES", statusDe(impl, "rotulos") === "pendente" && statusDe(impl, "cadencia") === "pendente");
add("Completude reflete 3/12", completude(impl).definidos === 3);

// ── 3. re-implantar depois: implantadoEm NÃO muda, revisadoEm sim ──
const impl2 = comImplantado(impl, ["cadencia"], T2);
add("Re-implantar preserva a data ORIGINAL de implantação", impl2.implantadoEm === T1);
add("Re-implantar atualiza revisadoEm (a régua se afina)", impl2.revisadoEm === T2);
add("Novo parâmetro entra como definido (4/12)", completude(impl2).definidos === 4);

// ── 4. definir um parâmetro / revisar ──
const comRot = comParametro(impl2, "rotulos", "definido", T2);
add("comParametro define e mantém os outros", statusDe(comRot, "rotulos") === "definido" && completude(comRot).definidos === 5);
const revisto = comRevisao(comRot, "2026-09-13T10:00:00.000Z");
add("comRevisao toca só a data de revisão", revisto.revisadoEm === "2026-09-13T10:00:00.000Z" && revisto.implantadoEm === T1);

// ── 5. sanitizar: ignora id/valor inválido (robustez contra dado sujo) ──
const suja = sanitizar("X", { implantadoEm: 123, revisadoEm: "2026-01-01T00:00:00.000Z", status: { clientes: "definido", inventado: "definido", concorrentes: "talvez" } });
add("Sanitizar: implantadoEm não-string vira null", suja.implantadoEm === null);
add("Sanitizar: mantém status válido", statusDe(suja, "clientes") === "definido");
add("Sanitizar: descarta id desconhecido", !("inventado" in suja.status));
add("Sanitizar: descarta valor inválido", statusDe(suja, "concorrentes") === "pendente");

// ── 6. round-trip no store (JSON isolado) ──
await registrarImplantacao("TAGAT", ["clientes", "concorrentes", "contas_chave"], new Date(T1));
const lido = await loadParametrizacao("TAGAT");
add("Store: registrarImplantacao persiste e relê", lido.implantadoEm === T1 && completude(lido).definidos === 3);
await definirParametro("TAGAT", "alertas", "definido", new Date(T2));
const lido2 = await loadParametrizacao("TAGAT");
add("Store: definirParametro persiste (4/12) e afina revisão", completude(lido2).definidos === 4 && lido2.revisadoEm === T2);
const outro = await loadParametrizacao("Gemmini");
add("Store: cliente sem Ficha = vazio honesto (não vaza de outro)", outro.implantadoEm === null && completude(outro).definidos === 0);

// ── Resultado ──
console.log("── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nPARAMETRIZAÇÃO VERDE ✅ — proveniência fiel, pendente/definido honesto.\n" : "\nPARAMETRIZAÇÃO VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
