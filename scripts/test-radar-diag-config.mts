/**
 * Smoke D — FONTES E CAMPOS DEFINIDOS PELO USUÁRIO. Lógica determinística (sem
 * rede): config store + extração honesta (com páginas sintéticas + LLM real
 * SÓ se disponível — a honestidade é validada estruturalmente) + movimento de
 * campo custom entre varreduras. Data dir isolado.
 *
 * Prova:
 *  1. Config store: salva/sanitiza (URL inválida cai; campos vazios caem).
 *  2. runCamposCustom preserva as chaves do usuário; sem páginas → nao_encontrado
 *     (nunca inventa).
 *  3. Campo custom que MUDA entre varreduras vira movimento (motor configurável).
 *  4. Campo custom que aparece pela 1ª vez = primeira_coleta (não movimento).
 *
 * Uso: npm run smoke:diag-config
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-diagcfg-"));

const { getDiagConfig, setDiagConfig } = await import("@/lib/diagnostico/config");
const { runCamposCustom } = await import("@/lib/diagnostico/campos-custom");
const { diffSnapshots } = await import("@/lib/diagnostico/movimento");
const { campoFato, campoNaoEncontrado, canalNaoLocalizado } = await import("@/lib/diagnostico/schema");

import type { CampoCustom, Snapshot } from "@/lib/diagnostico/schema";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke D — Config + campos custom ===\n");

// ── 1. Config store (sanitização) ────────────────────────────────────────────
const saved = setDiagConfig("TAGAT Foodtech", "intelia", {
  fontesExtras: ["https://intelia.com/blog", "não-é-url", "ftp://x"],
  temas: ["rastreabilidade", "  ", "exportação"],
  camposCustom: [
    { chave: "Tom de voz", pergunta: "Qual o tom?" },
    { chave: "", pergunta: "sem chave — deve cair" },
    { chave: "Vazio", pergunta: "" },
  ],
});
console.log("CONFIG salva:", JSON.stringify(saved));
add("URL inválida descartada (só http/https entra)", saved.fontesExtras.length === 1 && saved.fontesExtras[0] === "https://intelia.com/blog", `fontes=${saved.fontesExtras.length}`);
add("Temas vazios caem", saved.temas.length === 2, `temas=${saved.temas.join(",")}`);
add("Campos sem chave/pergunta caem", saved.camposCustom.length === 1 && saved.camposCustom[0].chave === "Tom de voz", `campos=${saved.camposCustom.length}`);
add("getDiagConfig lê o que foi salvo", getDiagConfig("TAGAT Foodtech", "intelia").camposCustom.length === 1, "roundtrip");

// ── 2. Extração honesta sem páginas → nao_encontrado, preservando chaves ──────
const semPaginas = await runCamposCustom("Intelia", [], [{ chave: "Tom de voz", pergunta: "Qual o tom?" }, { chave: "Precificação", pergunta: "Como cobram?" }]);
add(
  "Sem páginas: preserva as 2 chaves e marca nao_encontrado (nunca inventa)",
  semPaginas.length === 2 && semPaginas.every((c) => c.resposta.status === "nao_encontrado" && c.resposta.valor === null),
  `chaves=${semPaginas.map((c) => c.chave).join(",")}`,
);

// ── 3-4. Movimento de campo custom ────────────────────────────────────────────
function snap(data: string, campos: CampoCustom[]): Snapshot {
  return {
    data,
    posicionamento: {
      tagline: campoNaoEncontrado(data),
      proposito: campoNaoEncontrado(data),
      posicionamento: campoNaoEncontrado(data),
      diferenciais: [],
      produtos: [],
      provas: { clientes_citados: [], depoimentos: campoNaoEncontrado(data), premiacoes: [], big_numbers: [] },
    },
    canais: {
      site: { presente: true, url: "https://intelia.com", frequencia: null, recencia: null, tipo_conteudo: null, engajamento: null, status: "encontrado" },
      linkedin: canalNaoLocalizado(), youtube: canalNaoLocalizado(), instagram: canalNaoLocalizado(), facebook: canalNaoLocalizado(), blog: canalNaoLocalizado(),
    },
    campos_custom: campos,
  };
}
const campo = (data: string, valor: string): CampoCustom => ({ chave: "Tom de voz", pergunta: "Qual o tom?", resposta: campoFato(valor, "https://intelia.com", data) });

const s1 = snap("2026-07-01T10:00:00.000Z", [campo("2026-07-01T10:00:00.000Z", "técnico e direto")]);
const s2 = snap("2026-07-08T10:00:00.000Z", [campo("2026-07-08T10:00:00.000Z", "próximo e consultivo")]);

// primeira coleta (histórico vazio → baseline; s1 é baseline, s2 compara com s1)
const movs = diffSnapshots([s1], s2, "2026-07-08T10:00:00.000Z");
const movCampo = movs.find((m) => m.campo === "campo_custom.Tom de voz");
console.log(`\nMOVIMENTO: ${movCampo ? `${movCampo.campo_label}: ${movCampo.de} → ${movCampo.para} [${movCampo.severidade}]` : "NÃO DETECTADO"}`);
add(
  "Campo custom que MUDA vira movimento (mudança, severidade média)",
  movCampo?.tipo === "mudança" && movCampo.de === "técnico e direto" && movCampo.para === "próximo e consultivo" && movCampo.severidade === "média",
  movCampo ? `${movCampo.de} → ${movCampo.para}` : "NÃO DETECTADO",
);

// primeira_coleta: campo novo que não existia no baseline
const s0 = snap("2026-06-24T10:00:00.000Z", []);
const movsPrimeira = diffSnapshots([s0], snap("2026-07-01T10:00:00.000Z", [campo("2026-07-01T10:00:00.000Z", "técnico")]), "2026-07-01T10:00:00.000Z");
const movPrim = movsPrimeira.find((m) => m.campo === "campo_custom.Tom de voz");
add("Campo custom que aparece pela 1ª vez = primeira_coleta (não movimento)", movPrim?.tipo === "primeira_coleta", movPrim ? `tipo=${movPrim.tipo}` : "NÃO DETECTADO");

// ── Resultado ────────────────────────────────────────────────────────────────
console.log("\n── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nD VERDE ✅ — config sanitizada; campos custom honestos; movimento configurável.\n" : "\nD VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
