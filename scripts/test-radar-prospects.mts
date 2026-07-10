/**
 * Smoke PROSPECTS F1 — dossiê honesto, store org-scoped, custo atribuído.
 * Zero rede/LLM: injeta o motor (runLente1/searchWeb/gateway/brain) por mocks
 * via variáveis de módulo? Não — em vez disso testa as PEÇAS PURAS e o store,
 * que é onde mora a lógica de honestidade e isolamento. O caminho de rede
 * (gerarDossie completo) é provado AO VIVO no checkpoint, com empresa real.
 *
 * Prova:
 *  1. Schema de honestidade: helpers marcam natureza certa; selo/label coerentes.
 *  2. Store: upsert idempotente por (cliente, site); patch de status; remove
 *     apaga prospect E dossiê; TUDO escopado por cliente (isolamento).
 *  3. Dossiê ausente ≠ inventado: loadDossie devolve null honesto.
 *  4. prospectId estável (mesmo cliente+site → mesmo id; site case-insensitive).
 *
 * Uso: npm run smoke:prospects
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-prospects-"));
delete process.env.RADAR_DB; // modo clássico (JSON isolado)

const { pontoFato, pontoInferencia, pontoNaoEncontrado, NATUREZA_LABEL } = await import("@/lib/prospects/schema");
const store = await import("@/lib/prospects/store");

import type { Dossie, Prospect } from "@/lib/prospects/schema";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke PROSPECTS F1 — honestidade + store org-scoped ===\n");

// ── 1. honestidade dos helpers ──
add("Helper 'fato' carrega fonte e natureza fato", pontoFato("faz X", "https://x.com").natureza === "fato" && pontoFato("faz X", "https://x.com").fonte_url === "https://x.com");
add("Helper 'inferência' é marcado (sem fingir fato)", pontoInferencia("provavelmente Y").natureza === "inferencia");
add("Helper 'não encontrado' não inventa (sem fonte, natureza própria)", pontoNaoEncontrado("não achei").natureza === "nao_encontrado" && !pontoNaoEncontrado("x").fonte_url);
add("Labels pt-BR coerentes", NATUREZA_LABEL.fato === "fato" && NATUREZA_LABEL.inferencia === "inferência" && NATUREZA_LABEL.nao_encontrado === "não encontrado");

// ── 4. id estável ──
const id1 = store.prospectId("Moovefy", "https://Acme.com/");
const id2 = store.prospectId("Moovefy", "https://acme.com/");
add("prospectId estável e case-insensitive no site", id1 === id2, `id=${id1}`);
add("prospectId separa por cliente", store.prospectId("TAGAT", "https://acme.com/") !== id1);

// ── 2. store CRUD + isolamento por cliente ──
const mk = (cliente: string, nome: string, site: string): Prospect => ({
  id: store.prospectId(cliente, site), clientName: cliente, nome, siteUrl: site, status: "ativo", criadoEm: new Date("2026-07-10T10:00:00Z").toISOString(), reuniaoEm: null, contato: null, contexto: null, dossieEm: null,
});

await store.upsertProspect(mk("Moovefy", "Acme Log", "https://acme.com"));
await store.upsertProspect(mk("Moovefy", "Acme Log", "https://acme.com")); // idempotente
await store.upsertProspect(mk("TAGAT Foodtech", "BovineCo", "https://bovine.com"));
const moove = await store.loadProspects("Moovefy");
const tagat = await store.loadProspects("TAGAT Foodtech");
add("Upsert idempotente (mesmo cliente+site = 1 registro)", moove.length === 1, `moovefy=${moove.length}`);
add("Isolamento por cliente (TAGAT não vê o da Moovefy)", tagat.length === 1 && tagat[0].nome === "BovineCo" && !tagat.some((p) => p.nome === "Acme Log"));

const patched = await store.patchProspect("Moovefy", id1, { status: "arquivado" });
add("Patch de status persiste", patched?.status === "arquivado" && (await store.getProspect("Moovefy", id1))?.status === "arquivado");

// ── 3. dossiê ausente é null honesto; salvar e reler ──
add("Dossiê nunca gerado → null (não inventa)", (await store.loadDossie(id1)) === null);
const dossieFake: Dossie = {
  prospectId: id1, clientName: "Moovefy", nome: "Acme Log", siteUrl: "https://acme.com", geradoEm: new Date("2026-07-10T11:00:00Z").toISOString(),
  perfil: { resumo: pontoFato("logística B2B", "https://acme.com"), produtos: [], paginas_lidas: ["https://acme.com"] },
  concorrentes: [{ nome: "Rival", nota: pontoInferencia("briga em SP", "https://busca", "busca web") }],
  sinais: [{ titulo: "abriu filial", tipo: "expansão", data: "2026-07-01", fonte_url: "https://news", fonte_titulo: "Portal" }],
  encaixe: { brain_mode: "live", ganchos: [pontoInferencia("frota crescendo")], dores: [], angulo: pontoInferencia("abrir por eficiência") },
  municao: { perguntas: [pontoInferencia("como medem custo por rota?")], objecoes: [{ objecao: "já temos sistema", resposta: "e a integração?" }] },
  observacoes: [],
};
await store.saveDossie(dossieFake);
const relido = await store.loadDossie(id1);
add("Dossiê salvo e relido íntegro (com fontes)", relido?.perfil.resumo.fonte_url === "https://acme.com" && relido?.sinais[0].fonte_url === "https://news");

// remove apaga prospect E dossiê
await store.removeProspect("Moovefy", id1);
add("Remove apaga prospect E dossiê (efêmero, sem custo contínuo)", (await store.getProspect("Moovefy", id1)) === null && (await store.loadDossie(id1)) === null);
add("Remove não vaza pra outro cliente", (await store.loadProspects("TAGAT Foodtech")).length === 1);

// ── Resultado ──
console.log("── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nPROSPECTS F1 (motor) VERDE ✅ — honesto, isolado por org, efêmero.\n" : "\nPROSPECTS F1 VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
