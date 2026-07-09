/**
 * Smoke F1a — MOVIMENTO + ALERTA. Roda o motor REAL (aplicarMovimentos, o mesmo
 * do runDiagnostico) sobre 5 varreduras com mudanças SEMEADAS, em data dir
 * isolado (zero rede/LLM — o diff é determinístico de propósito).
 *
 * Prova:
 *  1. 1ª varredura de todas = ZERO movimentos (baseline não é movimento).
 *  2. Tagline alterada = "mudança" com de/para + AS DUAS fontes/datas (imediato).
 *  3. Campo que aparece pela 1ª vez = primeira_coleta (não mudança, não alerta).
 *  4. Anúncios 8→20 = mudança alta (imediato, numérico).
 *  5. JANELA ANTI-JITTER: produto que aparece 1x NÃO vira "novo" (pendente);
 *     vira "novo" quando CONFIRMA na varredura seguinte (caso real: re-varrer a
 *     Intelia gerou falso "produto novo" por reagrupamento do LLM).
 *  6. Flicker (item some 1 varredura e volta) = SILÊNCIO (nem removido, nem novo).
 *  7. Regra desligada: movimento registrado, alerta NÃO disparado.
 *
 * Uso: npm run smoke:movimentos
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-f1a-"));

const { aplicarMovimentos, disparosDaVarredura } = await import("@/lib/diagnostico/run");
const { saveDiagnostico } = await import("@/lib/diagnostico/store");
const { appendDisparos, getRegras, saveRegras, listDisparos } = await import("@/lib/diagnostico/alertas-store");
const { campoFato, campoNaoEncontrado, canalNaoLocalizado } = await import("@/lib/diagnostico/schema");

import type { Campo, DiagnosticoConcorrente, MidiaPaga, Produto } from "@/lib/diagnostico/schema";

// ── fabrica uma varredura sintética (só camada de fato importa pro diff) ────
function varredura(input: {
  data: string;
  tagline: string;
  proposito: Campo;
  produtos: string[];
  nAnuncios: number;
}): DiagnosticoConcorrente {
  const { data } = input;
  const produtos: Produto[] = input.produtos.map((nome) => ({
    nome,
    descricao: null,
    fonte_url: "https://intelia.com",
    data_coleta: data,
  }));
  const midia: MidiaPaga = {
    meta: {
      anuncia: true,
      n_anuncios_ativos: input.nAnuncios,
      mensagens: [],
      fonte_url: "https://www.facebook.com/ads/library/?q=Intelia",
      data_coleta: data,
      status: "encontrado",
    },
    linkedin: { anuncia: null, n_anuncios_ativos: null, mensagens: [], data_coleta: data, status: "nao_localizado" },
    google: { anuncia: null, n_anuncios_ativos: null, mensagens: [], data_coleta: data, status: "nao_localizado" },
  };
  return {
    clientName: "TAGAT Foodtech",
    concorrente_id: "intelia",
    concorrente_nome: "Intelia",
    site_url: "https://intelia.com",
    atualizado_em: data,
    paginas_rastreadas: ["https://intelia.com"],
    posicionamento: {
      tagline: campoFato(input.tagline, "https://intelia.com", data),
      proposito: input.proposito,
      posicionamento: campoFato("Fornecedor de soluções para produção avícola", "https://intelia.com", data),
      diferenciais: [],
      produtos,
      provas: {
        clientes_citados: [campoFato("Exceldor", "https://intelia.com", data)],
        depoimentos: campoNaoEncontrado(data),
        premiacoes: [],
        big_numbers: [],
      },
    },
    canais: {
      site: { presente: true, url: "https://intelia.com", frequencia: null, recencia: null, tipo_conteudo: null, engajamento: null, status: "encontrado" },
      linkedin: canalNaoLocalizado(),
      youtube: canalNaoLocalizado(),
      instagram: canalNaoLocalizado(),
      facebook: canalNaoLocalizado(),
      blog: canalNaoLocalizado(),
    },
    midia_paga: midia,
  };
}

function roda(input: Parameters<typeof varredura>[0]): DiagnosticoConcorrente {
  // espelha o runDiagnostico: diff puro + alertas avaliados fora e anexados.
  const d = aplicarMovimentos(varredura(input));
  appendDisparos(disparosDaVarredura(d, getRegras(d.clientName)));
  saveDiagnostico(d);
  return d;
}
function novosDe(d: DiagnosticoConcorrente): NonNullable<DiagnosticoConcorrente["movimentos"]> {
  return (d.movimentos ?? []).filter((m) => m.data_deteccao === d.atualizado_em);
}

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke F1a — Movimento + Alerta (mudanças semeadas, 5 varreduras) ===\n");

const naoEncontrado = (data: string) => campoNaoEncontrado(data);
const proposito = (data: string) => campoFato("Optimize Livestock Production", "https://intelia.com", data);

// v1 — baseline
const v1 = roda({ data: "2026-07-01T10:00:00.000Z", tagline: "BEYOND DATA", proposito: naoEncontrado("2026-07-01T10:00:00.000Z"), produtos: ["Compass"], nAnuncios: 8 });
add("1ª varredura de todas = ZERO movimentos", novosDe(v1).length === 0, `movimentos=${novosDe(v1).length} · snapshots=${v1.historico?.length}`);

// v2 — tagline muda; propósito aparece; Nano+ aparece (1ª vez); anúncios 8→20
const v2 = roda({ data: "2026-07-08T10:00:00.000Z", tagline: "BEYOND FARMS", proposito: proposito("2026-07-08T10:00:00.000Z"), produtos: ["Compass", "Nano+"], nAnuncios: 20 });
console.log("TIMELINE v2 (tagline + propósito + anúncios; Nano+ fica PENDENTE):");
for (const m of novosDe(v2)) console.log(`  [${m.severidade}] ${m.campo_label} ${m.tipo}: ${m.de ?? "—"} → ${m.para ?? "—"} (${m.data_de?.slice(0, 10) ?? "—"} → ${m.data_para?.slice(0, 10) ?? "—"})`);

const tagMov = novosDe(v2).find((m) => m.campo === "posicionamento.tagline");
add(
  "Tagline alterada = 'mudança' com de/para + AS DUAS fontes/datas (imediato)",
  tagMov?.tipo === "mudança" && tagMov.de === "BEYOND DATA" && tagMov.para === "BEYOND FARMS" && Boolean(tagMov.fonte_url_de && tagMov.fonte_url_para && tagMov.data_de && tagMov.data_para),
  tagMov ? `${tagMov.de} → ${tagMov.para}` : "NÃO DETECTADO",
);
const propMov = novosDe(v2).find((m) => m.campo === "posicionamento.proposito");
add("Campo coletado pela 1ª vez = primeira_coleta (NÃO mudança)", propMov?.tipo === "primeira_coleta", propMov ? `tipo=${propMov.tipo}` : "NÃO DETECTADO");
const adsMov = novosDe(v2).find((m) => m.campo.endsWith(".n_anuncios_ativos"));
add("Anúncios 8→20 = mudança severidade alta (imediato)", adsMov?.tipo === "mudança" && adsMov.de === 8 && adsMov.para === 20 && adsMov.severidade === "alta", adsMov ? `${adsMov.de} → ${adsMov.para} [${adsMov.severidade}]` : "NÃO DETECTADO");
add(
  "ANTI-JITTER: produto visto 1x NÃO vira 'novo' ainda (pendente)",
  !novosDe(v2).some((m) => m.campo === "posicionamento.produtos"),
  `movimentos de produto na v2=${novosDe(v2).filter((m) => m.campo === "posicionamento.produtos").length}`,
);

// v3 — Nano+ persiste → CONFIRMA "novo"; resto estável
const v3 = roda({ data: "2026-07-15T10:00:00.000Z", tagline: "BEYOND FARMS", proposito: proposito("2026-07-15T10:00:00.000Z"), produtos: ["Compass", "Nano+"], nAnuncios: 20 });
console.log("\nTIMELINE v3 (Nano+ confirma):");
for (const m of novosDe(v3)) console.log(`  [${m.severidade}] ${m.campo_label} ${m.tipo}: ${m.de ?? "—"} → ${m.para ?? "—"}`);
const nanoMov = novosDe(v3).find((m) => m.tipo === "novo" && m.para === "Nano+");
add("Produto CONFIRMADO em 2 varreduras seguidas = 'novo' (Nano+ na v3)", Boolean(nanoMov) && nanoMov!.severidade === "alta", nanoMov ? `${nanoMov.para} [${nanoMov.severidade}]` : "NÃO DETECTADO");
add("Estabilidade: nada mais mudou na v3 = só o movimento do produto", novosDe(v3).length === 1, `movimentos v3=${novosDe(v3).length}`);

const disparosAposV3 = listDisparos("TAGAT Foodtech");
console.log("\nALERTAS (após v3):");
for (const d of disparosAposV3) console.log(`  🔔 ${d.regra}: ${d.movimento.campo_label} (${d.movimento.de ?? "—"} → ${d.movimento.para ?? "—"})`);
add(
  "Regras padrão disparam: tagline_mudou + anuncios_variacao (v2) + produto_novo (v3)",
  ["tagline_mudou", "anuncios_variacao", "produto_novo"].every((r) => disparosAposV3.some((d) => d.regra === r)),
  disparosAposV3.map((d) => d.regra).join(", ") || "nenhum",
);
add("primeira_coleta NUNCA dispara alerta", disparosAposV3.every((d) => d.movimento.tipo !== "primeira_coleta"), `${disparosAposV3.length} disparo(s)`);

// v4 — regra produto_novo DESLIGADA; Water Meter aparece (pendente); Compass FLICKER (some 1x)
saveRegras("TAGAT Foodtech", getRegras("TAGAT Foodtech").map((r) => (r.tipo === "produto_novo" ? { ...r, ativo: false } : r)));
const v4 = roda({ data: "2026-07-22T10:00:00.000Z", tagline: "BEYOND FARMS", proposito: proposito("2026-07-22T10:00:00.000Z"), produtos: ["Nano+", "Water Meter"], nAnuncios: 20 });
add(
  "FLICKER: Compass some 1 varredura = SILÊNCIO (nem 'removido', nem alerta)",
  !novosDe(v4).some((m) => m.de === "Compass" || m.para === "Compass"),
  `movimentos v4=${novosDe(v4).length}`,
);

// v5 — Compass volta; Water Meter confirma → movimento SIM, disparo NÃO (regra off)
const v5 = roda({ data: "2026-07-29T10:00:00.000Z", tagline: "BEYOND FARMS", proposito: proposito("2026-07-29T10:00:00.000Z"), produtos: ["Compass", "Nano+", "Water Meter"], nAnuncios: 20 });
const wmMov = novosDe(v5).find((m) => m.tipo === "novo" && m.para === "Water Meter");
const disparosFinais = listDisparos("TAGAT Foodtech");
add("Regra DESLIGADA: Water Meter confirma → movimento registrado, alerta NÃO disparado", Boolean(wmMov) && !disparosFinais.some((d) => d.movimento.para === "Water Meter"), `movimento=${wmMov ? "sim" : "não"} · disparo=${disparosFinais.some((d) => d.movimento.para === "Water Meter") ? "sim" : "não"}`);
add(
  "FLICKER-VOLTA: Compass reaparece = SILÊNCIO (não vira 'novo' de novo)",
  !novosDe(v5).some((m) => m.para === "Compass" || m.de === "Compass"),
  `movimentos v5=${novosDe(v5).map((m) => `${m.campo_label}:${m.para ?? m.de}`).join(", ") || "nenhum"}`,
);

// ── Resultado ────────────────────────────────────────────────────────────────
console.log("\n── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nF1a VERDE ✅ — movimento honesto (2 fontes/datas), anti-jitter, alerta editável.\n" : "\nF1a VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
