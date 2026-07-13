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

const { pontoFato, pontoInferencia, pontoNaoEncontrado, NATUREZA_LABEL, mergeConcorrentes, CURADORIA_VAZIA } = await import("@/lib/prospects/schema");
const store = await import("@/lib/prospects/store");

import type { ConcorrenteProspect, Dossie, Prospect } from "@/lib/prospects/schema";

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

// ── 5. CURADORIA de concorrentes (merge PURO — o ajuste do Rafael) ──
const sugeridos: ConcorrenteProspect[] = [
  { nome: "All-Clad", nota: pontoInferencia("premium", "https://b", "busca web") },
  { nome: "Staub", nota: pontoInferencia("ferro fundido", "https://b", "busca web") },
  { nome: "Lodge", nota: pontoInferencia("alternativa", "https://b", "busca web") },
];
// vendedor: indica um manual, confirma All-Clad, descarta Lodge; Staub fica pendente.
const cur = { ...CURADORIA_VAZIA, manuais: [{ nome: "Rival Local", nota: "briga em SP" }], confirmados: ["All-Clad"], rejeitados: ["Lodge"] };
const merged = mergeConcorrentes(sugeridos, cur);
add("Curadoria: manual entra 1º, marcado 'você indicou'", merged[0]?.nome === "Rival Local" && merged[0]?.origem === "manual" && merged[0]?.estado === "manual");
add("Curadoria: sugestão CONFIRMADA aparece marcada confirmado", merged.some((c) => c.nome === "All-Clad" && c.estado === "confirmado"));
add("Curadoria: sugestão DESCARTADA some (Lodge fora)", !merged.some((c) => c.nome === "Lodge"));
add("Curadoria: sugestão não-tocada fica PENDENTE (validar)", merged.some((c) => c.nome === "Staub" && c.estado === "pendente"));
add("Curadoria: manual não é inferência (é 'você indicou', sem fingir fato de busca)", merged[0]?.nota.fonte_titulo === "você indicou" && !merged[0]?.nota.fonte_url);
// dedup: se a mesma sugestão também foi indicada manual, não repete.
const dedup = mergeConcorrentes(sugeridos, { ...CURADORIA_VAZIA, manuais: [{ nome: "staub" }] });
add("Curadoria: sugestão que virou manual não duplica", dedup.filter((c) => c.nome.toLowerCase() === "staub").length === 1);
// persistência org-scoped da curadoria
await store.upsertProspect(mk("Moovefy", "Curated Co", "https://curated.com"));
const cid = store.prospectId("Moovefy", "https://curated.com");
await store.saveCuradoria(cid, cur);
add("Curadoria persiste e relê (sobrevive à regeração)", (await store.loadCuradoria(cid)).confirmados.includes("All-Clad") && (await store.loadCuradoria(cid)).manuais.length === 1);
add("Curadoria ausente → vazia honesta (não inventa)", (await store.loadCuradoria("inexistente")).manuais.length === 0);

// ── 6. F2: .ics + PDF + preparo idempotente ──
const { prospectToIcs } = await import("@/lib/prospects/ics");
const { dossieToPdf } = await import("@/lib/prospects/pdf");
const { prepararReunioes } = await import("@/lib/prospects/preparo");

const reuniaoISO = new Date("2026-07-16T13:00:00.000Z").toISOString();
const pReu: Prospect = { ...mk("Moovefy", "IcsCo", "https://icsco.com"), reuniaoEm: reuniaoISO, contato: "João" };
await store.upsertProspect(pReu);

// .ics
const ics = prospectToIcs(pReu, "https://radar.formare.tech");
add(
  ".ics: VEVENT válido com DTSTART/URL/SUMMARY do prospect",
  Boolean(ics) && ics!.includes("BEGIN:VEVENT") && ics!.includes("DTSTART:20260716T130000Z") && ics!.includes("SUMMARY:Reunião: IcsCo") && ics!.includes("/prospects/"),
);
add(".ics: sem data de reunião → null (não inventa evento)", prospectToIcs({ ...pReu, reuniaoEm: null }, "https://x") === null);

// PDF (reusa o dossiê fake salvo antes? não — gera um mínimo)
const dPdf: Dossie = {
  prospectId: pReu.id, clientName: "Moovefy", nome: "IcsCo", siteUrl: "https://icsco.com", geradoEm: new Date().toISOString(),
  perfil: { resumo: pontoFato("faz X", "https://icsco.com"), produtos: [], paginas_lidas: ["https://icsco.com"] },
  concorrentes: [{ nome: "Rival", nota: pontoInferencia("briga", "https://b", "busca web") }],
  sinais: [], encaixe: { brain_mode: "none", ganchos: [], dores: [], angulo: null }, municao: { perguntas: [pontoInferencia("pergunta?")], objecoes: [] }, observacoes: [],
};
const pdf = await dossieToPdf(dPdf, pReu, mergeConcorrentes(dPdf.concorrentes, CURADORIA_VAZIA));
const head = Buffer.from(pdf.slice(0, 5)).toString("latin1");
add("PDF: bytes válidos (%PDF)", head.startsWith("%PDF"), `${(pdf.length / 1024).toFixed(1)}KB · ${head}`);

// preparo pré-reunião: injeta gerador/e-mail fake; conta idempotência
process.env.RADAR_DATA_DIR && void 0;
let geracoes = 0;
let envios = 0;
// mock do gerarDossie via saveDossie prévio (já tem dossiê → jaProntos, não gera)
await store.saveDossie(dPdf);
const now = new Date("2026-07-15T09:00:00.000Z"); // véspera da reunião (16/07)
const r1 = await prepararReunioes(["Moovefy"], now, { sendPdfEmail: async () => { envios++; return "enviado"; } });
add("Preparo (véspera): dossiê já pronto não re-gera; e-mail enviado 1x", r1.jaProntos === 1 && r1.preparados === 0 && r1.emails.length === 1 && r1.emails[0].envio === "enviado");
const r2 = await prepararReunioes(["Moovefy"], now, { sendPdfEmail: async () => { envios++; return "enviado"; } });
add("Preparo idempotente: 2ª passada NÃO reenvia o e-mail (pdfEnviadoEm)", r2.emails.length === 0, `envios totais=${envios}`);
const foraJanela = await prepararReunioes(["Moovefy"], new Date("2026-07-10T09:00:00.000Z"), { sendPdfEmail: async () => "enviado" });
add("Preparo: reunião fora da véspera não é preparada (janela D-1)", foraJanela.jaProntos === 0 && foraJanela.preparados === 0);
void geracoes;

// ── 7. F3: promover a conta-chave (sem duplicar) + arquivar ──
const { promoverProspect } = await import("@/lib/prospects/promover");
const wl = await import("@/lib/watchlist");

// cliente novo + prospect pra promover (watchlist isolada no RADAR_DATA_DIR)
await wl.addClient("PromoCo Cliente");
const pProm: Prospect = { ...mk("PromoCo Cliente", "AlvoReal", "https://alvoreal.com"), status: "ativo" };
await store.upsertProspect(pProm);
const fakeDiscover = async () => [{ kind: "blog" as const, url: "https://alvoreal.com/blog" }];

const prom1 = await promoverProspect("PromoCo Cliente", pProm.id, { discover: fakeDiscover });
const wlAfter = await wl.loadWatchlist();
const conta = wlAfter.clients.find((c) => c.name === "PromoCo Cliente")?.competitors.find((c) => c.id === prom1.contaId);
add("F3: promover cria conta-chave (pillar conta-chave) na watchlist", Boolean(conta) && conta!.pillar === "conta-chave" && conta!.siteUrl === "https://alvoreal.com", `conta=${conta?.id} pillar=${conta?.pillar}`);
add("F3: prospect vira 'promovido' (dossiê segue acessível)", (await store.getProspect("PromoCo Cliente", pProm.id))?.status === "promovido");
add("F3: fontes descobertas entram (blog)", (conta?.sources ?? []).some((s) => s.kind === "blog"));

// re-promover: idempotente, NÃO duplica
const prom2 = await promoverProspect("PromoCo Cliente", pProm.id, { discover: fakeDiscover });
const nConta = (await wl.loadWatchlist()).clients.find((c) => c.name === "PromoCo Cliente")?.competitors.filter((c) => c.id === prom1.contaId).length;
add("F3: re-promover é no-op (jaExistia, sem 2ª cópia)", prom2.jaExistia === true && nConta === 1, `cópias=${nConta}`);

// dedupe por SITE (mesmo site, nome diferente) → não duplica
const pMesmoSite: Prospect = { ...mk("PromoCo Cliente", "Alvo Real SA", "https://www.alvoreal.com/"), status: "ativo" };
await store.upsertProspect(pMesmoSite);
const prom3 = await promoverProspect("PromoCo Cliente", pMesmoSite.id, { discover: fakeDiscover });
add("F3: dedupe por SITE (mesmo domínio ≠ nome) não cria 2ª entidade", prom3.jaExistia === true);

// fallback: descoberta vazia → registra com o site como notícias
const pFallback: Prospect = { ...mk("PromoCo Cliente", "SemFontes", "https://semfontes.com"), status: "ativo" };
await store.upsertProspect(pFallback);
const prom4 = await promoverProspect("PromoCo Cliente", pFallback.id, { discover: async () => [] });
const contaFb = (await wl.loadWatchlist()).clients.find((c) => c.name === "PromoCo Cliente")?.competitors.find((c) => c.id === prom4.contaId);
add("F3: descoberta vazia → fallback registra o site (notícias)", (contaFb?.sources ?? []).some((s) => s.kind === "noticias"), `fontes=${contaFb?.sources.map((s) => s.kind).join(",")}`);

// arquivar / reativar
await store.patchProspect("PromoCo Cliente", pFallback.id, { status: "arquivado" });
add("F3: arquivar (esfriar) tira da lista ativa", (await store.loadProspects("PromoCo Cliente")).filter((p) => p.status !== "arquivado").every((p) => p.id !== pFallback.id));

// ── 8. CONTEXTO PRIVADO (extração + nota + ilegível + render 'interno') ──
const ctx = await import("@/lib/prospects/contexto");
const { dossieToHtml } = await import("@/lib/prospects/pdf-template");
const { PDFDocument, StandardFonts } = await import("pdf-lib");

const pCtx: Prospect = { ...mk("Moovefy", "CtxCo", "https://ctxco.com"), status: "ativo" };
await store.upsertProspect(pCtx);

// PDF "proposta" com texto real → extrai
const doc = await PDFDocument.create();
const pg = doc.addPage([320, 200]);
const font = await doc.embedFont(StandardFonts.Helvetica);
pg.drawText("Proposta Moovefy: SFA offline, 3 modulos, R$ 45.000/ano, go-live 6 semanas", { x: 16, y: 150, size: 10, font });
const propostaBytes = await doc.save();
const { item: arq, erro } = await ctx.addArquivo(pCtx.id, "Moovefy", "proposta.pdf", "application/pdf", new Uint8Array(propostaBytes));
add("Contexto: PDF extraído (legível, texto real capturado)", arq.legivel && arq.texto.includes("R$ 45.000") && arq.tipo === "arquivo" && arq.temArquivo && !erro, `texto="${arq.texto.slice(0, 40)}"`);

// bytes recuperáveis (rota de download) + remoção
const bytes = await ctx.loadArquivoBytes(arq.id);
add("Contexto: bytes guardados e recuperáveis (download autenticado)", Boolean(bytes) && bytes!.bytes.length > 0 && bytes!.mime === "application/pdf");

// nota livre
const nota = await ctx.addNota(pCtx.id, "Na reunião, o diretor disse que o orçamento é R$ 50k e a dor é integração com o ERP SAP.");
add("Contexto: nota incorporada (interno, sem arquivo)", nota.tipo === "nota" && nota.legivel && !nota.temArquivo && nota.texto.includes("SAP"));

// ilegível: PDF sem texto → legivel=false, não inventa
const vazio = await PDFDocument.create();
vazio.addPage([200, 200]); // página em branco, sem texto
const { item: img, erro: erroImg } = await ctx.addArquivo(pCtx.id, "Moovefy", "escaneado.pdf", "application/pdf", new Uint8Array(await vazio.save()));
add("Contexto: PDF sem texto → 'não foi possível ler' (não inventa)", img.legivel === false && Boolean(erroImg) && img.texto === "");

// lista + render da seção no dossiê (selo 'interno' + o conteúdo do arquivo)
const itensCtx = await ctx.loadContexto(pCtx.id);
add("Contexto: lista traz os 3 itens (proposta, nota, escaneado)", itensCtx.length === 3);
const dossieCtx: Dossie = {
  prospectId: pCtx.id, clientName: "Moovefy", nome: "CtxCo", siteUrl: "https://ctxco.com", geradoEm: new Date().toISOString(),
  perfil: { resumo: pontoFato("faz X", "https://ctxco.com"), produtos: [], paginas_lidas: [] },
  concorrentes: [], sinais: [], encaixe: { brain_mode: "live", ganchos: [], dores: [], angulo: null }, municao: { perguntas: [], objecoes: [] }, observacoes: [],
};
const html = dossieToHtml(dossieCtx, pCtx, [], itensCtx);
add("Dossiê renderiza 'Contexto privado' com selo interno + fonte do arquivo", html.includes("Contexto privado") && html.includes("b-int") && html.includes("proposta.pdf") && html.includes("R$ 45.000"));
add("Dossiê marca o ilegível honestamente (não foi possível ler)", html.includes("não foi possível ler"));

// remover (ação do usuário) apaga item E bytes
await ctx.removeContexto(pCtx.id, arq.id);
add("Contexto: remover apaga item E bytes", (await ctx.loadContexto(pCtx.id)).every((i) => i.id !== arq.id) && (await ctx.loadArquivoBytes(arq.id)) === null);

// ── Resultado ──
console.log("── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nPROSPECTS F1 (motor) VERDE ✅ — honesto, isolado por org, efêmero.\n" : "\nPROSPECTS F1 VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
