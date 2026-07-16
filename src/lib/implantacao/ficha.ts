/**
 * MOTOR DO IMPORT DA FICHA (contrato v1). Fecha o ciclo diagnóstico → Ficha JSON
 * → Radar parametrizado, SEM digitação. O instrumento de diagnóstico (HTML, fora
 * do Radar) emite a Ficha; aqui ela é lida, DIFERENCIADA (o que vai mudar, antes
 * de mudar) e APLICADA — só os `definido`, org-scoped, nunca apagando o que não
 * está na Ficha, com relatório honesto do que ficou de fora e por quê.
 *
 * Puro onde dá (parseFicha, diffFicha) pro smoke testar sem rede; applyFicha faz
 * I/O nos stores da org da sessão (mesmos que a tela usa). Regra de negócio aqui,
 * fora da UI (CLAUDE.md).
 */

import { savePrioridade, type CortePrioridade } from "@/lib/prioridade";
import { loadVocab, saveVocab, VOCAB_TERMS, type VocabKey, type VocabMap } from "@/lib/vocab";
import { loadReguaAgencia, persistLensUpdate, LENS_IDS, LENS_LABEL, type LensId } from "@/lib/lenses";
import { addClient, addEntityByName, loadWatchlist, pillarOf, type EntityPillar } from "@/lib/watchlist";
import { loadBaseLocal, saveBaseLocal } from "@/lib/base-local";
import { loadAutomacoes, saveAutomacoes, type Cadencia } from "@/lib/automacoes";
import { registrarImplantacao, type ParamId } from "@/lib/parametrizacao";

// ─── Tipos do contrato (Ficha v1) ────────────────────────────────────────────

type Wrapped = { status?: unknown; valor?: unknown; disseram?: unknown; origem?: unknown };

export type FichaConcorrente = { nome: string; validar?: boolean };
export type FichaConta = {
  nome: string;
  site?: string;
  concorrentes?: Wrapped;
  contas_chave?: Wrapped;
  base_conhecimento?: Wrapped;
  areas_ativas?: Wrapped;
  fontes_temas?: Wrapped;
};
export type FichaV1 = {
  ficha_version?: unknown;
  agencia?: unknown;
  diagnostico_em?: unknown;
  criterio_agencia?: {
    regua_areas?: Wrapped;
    prioridade?: Wrapped;
    cadencia?: Wrapped;
    destinatarios?: Wrapped;
    alertas?: Wrapped;
    rotulos?: Wrapped;
  };
  contas?: FichaConta[];
  pendencias?: unknown;
};

export type ParseOk = { ok: true; ficha: FichaV1; agencia?: string };
export type ParseErr = { ok: false; error: string };

/**
 * Lê a Ficha crua (texto/objeto) e valida o CONTRATO: só version 1. Campos
 * desconhecidos e `_`-prefixados são ignorados naturalmente (só lemos o que
 * conhecemos). Não adivinha: version ≠ 1 → recusa com mensagem clara.
 */
export function parseFicha(raw: unknown): ParseOk | ParseErr {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { ok: false, error: "O arquivo não é um JSON válido. Cole a Ficha exportada pelo instrumento de diagnóstico." };
    }
  }
  if (!obj || typeof obj !== "object") return { ok: false, error: "Ficha vazia ou em formato inesperado." };
  const f = obj as FichaV1;
  const v = f.ficha_version;
  if (v === undefined) return { ok: false, error: "Ficha sem `ficha_version`. Não dá pra confiar no formato — exporte de novo pelo instrumento." };
  if (v !== 1) return { ok: false, error: `Ficha versão ${String(v)} — este Radar só entende a versão 1. Atualize o instrumento (ou o Radar) e exporte de novo.` };
  const agencia = typeof f.agencia === "string" ? f.agencia.trim() : undefined;
  return { ok: true, ficha: f, agencia };
}

// ─── Extração de um parâmetro `definido` ─────────────────────────────────────

type Definido = { valor: unknown; disseram?: string; origem?: string };

/** Devolve o valor SÓ se o parâmetro está `definido` (senão null — não se importa). */
function definido(w: Wrapped | undefined): Definido | null {
  if (!w || typeof w !== "object" || w.status !== "definido") return null;
  return {
    valor: w.valor,
    disseram: typeof w.disseram === "string" && w.disseram.trim() ? w.disseram.trim() : undefined,
    origem: typeof w.origem === "string" ? w.origem : undefined,
  };
}
function pendente(w: Wrapped | undefined): boolean {
  return !!w && typeof w === "object" && w.status === "pendente";
}

const LENS_SET = new Set<string>(LENS_IDS);
const VOCAB_KEYS = new Set<string>(VOCAB_TERMS.map((t) => t.key));

function asConcorrentes(valor: unknown): FichaConcorrente[] {
  if (!Array.isArray(valor)) return [];
  const out: FichaConcorrente[] = [];
  for (const c of valor) {
    if (!c || typeof c !== "object") continue;
    const nome = String((c as FichaConcorrente).nome ?? "").trim();
    if (nome) out.push({ nome, validar: !!(c as FichaConcorrente).validar });
  }
  return out;
}
function asAreas(valor: unknown): LensId[] {
  if (!Array.isArray(valor)) return [];
  return valor.map((a) => String(a)).filter((a): a is LensId => LENS_SET.has(a));
}

// ─── Cadência: parse do texto semi-estruturado ("segunda 06:00", "diario 08:00")
const WEEKDAYS: Array<[string, number]> = [
  ["domingo", 0], ["segunda", 1], ["terça", 2], ["terca", 2], ["quarta", 3],
  ["quinta", 4], ["sexta", 5], ["sábado", 6], ["sabado", 6],
];
const WEEKDAY_LABEL = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Frequência a partir do texto da agência. O HORÁRIO não tem store hoje (reportado). */
function parseCadencia(s: unknown): Cadencia | null {
  if (typeof s !== "string") return null;
  const low = s.toLowerCase();
  for (const [name, wd] of WEEKDAYS) if (low.includes(name)) return { tipo: "semanal", weekday: wd };
  if (low.includes("diari") || low.includes("diári") || low.includes("todo dia")) return { tipo: "diaria" };
  return null;
}
function labelCadencia(c: Cadencia): string {
  return c.tipo === "diaria" ? "diário" : `semanal (${WEEKDAY_LABEL[c.weekday]})`;
}

// ─── Estado atual (snapshot pro diff) ─────────────────────────────────────────

export type ContaAtual = { nome: string; concorrentes: string[]; contasChave: string[]; areasAtivas: LensId[]; temBase: boolean };
export type CurrentState = {
  corte: CortePrioridade;
  vocab: VocabMap;
  regua: Record<LensId, string>;
  contas: ContaAtual[];
};

/** Lê o estado atual da org da sessão (o que o diff compara). */
export async function loadCurrentState(): Promise<CurrentState> {
  const { loadPrioridade } = await import("@/lib/prioridade");
  const { loadActiveLensesFor } = await import("@/lib/lenses");
  const [corte, vocab, reguaAg, watchlist] = await Promise.all([loadPrioridade(), loadVocab(), loadReguaAgencia(), loadWatchlist()]);
  const regua = {} as Record<LensId, string>;
  for (const id of LENS_IDS) regua[id] = reguaAg[id].regua;
  const contas: ContaAtual[] = await Promise.all(
    watchlist.clients.map(async (c) => {
      const ativas = (await loadActiveLensesFor(c.name)).map((l) => l.id);
      const base = await loadBaseLocal(c.name);
      return {
        nome: c.name,
        concorrentes: c.competitors.filter((k) => pillarOf(k, c.mode) === "concorrente").map((k) => k.name),
        contasChave: c.competitors.filter((k) => pillarOf(k, c.mode) === "conta-chave").map((k) => k.name),
        areasAtivas: ativas,
        temBase: !!base,
      };
    }),
  );
  return { corte, vocab, regua, contas };
}

// ─── DIFF (puro): o que vai mudar, antes de mudar ────────────────────────────

export type DiffGroup = { titulo: string; linhas: string[] };
export type DiffResult = { agencia?: string; avisoOrg?: string; grupos: DiffGroup[]; nada: boolean };

function novoOuAlterado(atual: string | undefined, novo: string): string {
  return !atual ? "(novo)" : atual === novo ? "(igual)" : `(era "${atual}")`;
}

/** Calcula o diff legível entre a Ficha e o estado atual. PURO. */
export function diffFicha(ficha: FichaV1, current: CurrentState, orgName?: string): DiffResult {
  const grupos: DiffGroup[] = [];
  const ca = ficha.criterio_agencia ?? {};

  // aviso de org: a Ficha diz uma agência diferente da sessão?
  let avisoOrg: string | undefined;
  const agencia = typeof ficha.agencia === "string" ? ficha.agencia.trim() : undefined;
  if (agencia && orgName && agencia.toLowerCase() !== orgName.toLowerCase()) {
    avisoOrg = `A Ficha diz "${agencia}", mas você está logado como "${orgName}". O import aplica SEMPRE na org da sessão (${orgName}). Confirme que é a Ficha certa.`;
  }

  // NÍVEL 1 — critério da agência
  const l1: string[] = [];
  const prio = definido(ca.prioridade);
  if (prio) {
    const v = prio.valor as { alta_a_partir_de?: number; media_a_partir_de?: number };
    const alta = Number(v?.alta_a_partir_de), media = Number(v?.media_a_partir_de);
    if (Number.isFinite(alta) && Number.isFinite(media)) {
      const mudaAlta = alta !== current.corte.alta, mudaMedia = media !== current.corte.media;
      l1.push(mudaAlta || mudaMedia
        ? `Régua de prioridade: Alta ${current.corte.alta} → ${alta} · Média ${current.corte.media} → ${media}`
        : `Régua de prioridade: sem mudança (Alta ${alta} · Média ${media})`);
    }
  } else if (pendente(ca.prioridade)) l1.push("Régua de prioridade: pendente na Ficha — não muda.");

  const rot = definido(ca.rotulos);
  if (rot && rot.valor && typeof rot.valor === "object") {
    for (const [k, val] of Object.entries(rot.valor as Record<string, string>)) {
      if (!VOCAB_KEYS.has(k) || typeof val !== "string" || !val.trim()) continue;
      l1.push(`Rótulo "${k}" → "${val.trim()}" ${novoOuAlterado(current.vocab[k as VocabKey], val.trim())}`);
    }
  } else if (pendente(ca.rotulos)) l1.push("Rótulos: pendente na Ficha — não muda.");

  const reg = definido(ca.regua_areas);
  if (reg && reg.valor && typeof reg.valor === "object") {
    const regras = (reg.valor as { regras?: Record<string, string> }).regras ?? {};
    for (const [lens, texto] of Object.entries(regras)) {
      if (!LENS_SET.has(lens) || typeof texto !== "string") continue;
      const mesma = current.regua[lens as LensId]?.trim() === texto.trim();
      l1.push(`Régua da área ${LENS_LABEL[lens as LensId]}: ${mesma ? "sem mudança" : "alterada"}`);
    }
  }

  const cad = definido(ca.cadencia);
  if (cad && cad.valor && typeof cad.valor === "object") {
    const v = cad.valor as { varredura?: string; digest?: string; resumo_semanal?: string };
    const varr = parseCadencia(v.varredura), dig = parseCadencia(v.digest);
    if (varr) l1.push(`Cadência · varredura de concorrentes → ${labelCadencia(varr)} (o horário se ajusta em Automações)`);
    if (dig) l1.push(`Cadência · resumo do dia → ${labelCadencia(dig)}`);
    if (!varr && !dig) l1.push("Cadência: descrita na Ficha, mas sem frequência clara — ajuste em Automações.");
    if (v.resumo_semanal) l1.push("Cadência · resumo semanal: o Radar ainda não agenda semanal — pendente.");
  } else if (pendente(ca.cadencia)) l1.push("Cadência: pendente na Ficha — não muda.");

  if (definido(ca.destinatarios)) {
    const arr = Array.isArray(definido(ca.destinatarios)!.valor) ? (definido(ca.destinatarios)!.valor as unknown[]) : [];
    l1.push(`Destinatários: ${arr.length} descrito(s) na Ficha · o Radar envia para 1 e-mail hoje · configure o e-mail em Agências (o resto fica pendente).`);
  }
  if (definido(ca.alertas)) l1.push("Alertas: regra descrita registrada · o Radar já dispara alertas de concorrente com limiares padrão (ajuste fino no Diagnóstico).");

  if (l1.length) grupos.push({ titulo: "Critério da agência", linhas: l1 });

  // NÍVEL 2 — por conta
  const contas = Array.isArray(ficha.contas) ? ficha.contas : [];
  for (const conta of contas) {
    const nome = String(conta?.nome ?? "").trim();
    if (!nome) continue;
    const atual = current.contas.find((c) => c.nome.toLowerCase() === nome.toLowerCase());
    const linhas: string[] = [];
    if (!atual) linhas.push("Conta nova: será criada.");

    const conc = definido(conta.concorrentes);
    if (conc) {
      const lista = asConcorrentes(conc.valor);
      const jaTem = new Set((atual?.concorrentes ?? []).map((n) => n.toLowerCase()));
      const novos = lista.filter((c) => !jaTem.has(c.nome.toLowerCase()));
      const aValidar = novos.filter((c) => c.validar).length;
      if (novos.length) linhas.push(`+${novos.length} concorrente(s)${aValidar ? ` (${aValidar} a validar — entram como sugestão, não como fato)` : ""}`);
    }
    const cc = definido(conta.contas_chave);
    if (cc) {
      const lista = asConcorrentes(cc.valor);
      const jaTem = new Set((atual?.contasChave ?? []).map((n) => n.toLowerCase()));
      const novos = lista.filter((c) => !jaTem.has(c.nome.toLowerCase()));
      if (novos.length) linhas.push(`+${novos.length} conta(s)-chave`);
    }
    const base = definido(conta.base_conhecimento);
    if (base) {
      if (base.origem === "brain") linhas.push("Base: usa o Brain do Formare — não toca.");
      else if (typeof base.valor === "string" && base.valor.trim()) linhas.push(`Base local: ${base.valor.trim().length} caracteres ${atual?.temBase ? "(substitui a atual)" : "(nova)"}`);
    }
    const areas = definido(conta.areas_ativas);
    if (areas) {
      const lista = asAreas(areas.valor);
      linhas.push(`Áreas ativas → ${lista.length ? lista.map((a) => LENS_LABEL[a]).join(", ") : "nenhuma"}`);
    }
    if (definido(conta.fontes_temas)) linhas.push("Fontes e temas: registrados na Ficha · associe aos concorrentes no Diagnóstico (não aplicado automaticamente).");

    if (linhas.length) grupos.push({ titulo: `Conta "${nome}"`, linhas });
  }

  return { agencia, avisoOrg, grupos, nada: grupos.length === 0 };
}

// ─── APPLY (I/O): aplica só os `definido`, org-scoped, e devolve o relatório ──

export type ReportItem = { param: string; detalhe: string };
export type ApplyReport = {
  agencia?: string;
  aplicado: ReportItem[];
  pendente: ReportItem[];
  ignorado: ReportItem[];
  falha: ReportItem[];
  contasCriadas: string[];
};

/**
 * Aplica a Ficha na org da SESSÃO. Só os `definido`; ausência nunca apaga; conta
 * nova é criada (o diff já mostrou); os selos dos parâmetros APLICADOS viram
 * "definido" com a data, e o "disseram" é guardado (o Mapa de Tradução). Nunca
 * lança — falha de um parâmetro vira linha no relatório, não derruba o resto.
 */
export async function applyFicha(ficha: FichaV1, now: Date): Promise<ApplyReport> {
  const rep: ApplyReport = { agencia: typeof ficha.agencia === "string" ? ficha.agencia : undefined, aplicado: [], pendente: [], ignorado: [], falha: [], contasCriadas: [] };
  const ca = ficha.criterio_agencia ?? {};
  const idsDefinidos: ParamId[] = [];
  const disseram: Partial<Record<ParamId, string>> = {};
  const marca = (id: ParamId, d?: string) => {
    if (!idsDefinidos.includes(id)) idsDefinidos.push(id);
    if (d) disseram[id] = d;
  };

  // — prioridade —
  const prio = definido(ca.prioridade);
  if (prio) {
    const v = prio.valor as { alta_a_partir_de?: number; media_a_partir_de?: number };
    try {
      const salvo = await savePrioridade({ alta: v?.alta_a_partir_de, media: v?.media_a_partir_de });
      rep.aplicado.push({ param: "Régua de prioridade", detalhe: `Alta ≥ ${salvo.alta} · Média ≥ ${salvo.media}` });
      marca("regua_prioridade", prio.disseram);
    } catch (e) {
      rep.falha.push({ param: "Régua de prioridade", detalhe: msg(e) });
    }
  } else if (pendente(ca.prioridade)) rep.pendente.push({ param: "Régua de prioridade", detalhe: "pendente na Ficha — não aplicado." });

  // — rótulos —
  const rot = definido(ca.rotulos);
  if (rot && rot.valor && typeof rot.valor === "object") {
    try {
      const atual = await loadVocab();
      const merge: VocabMap = { ...atual };
      const aplicados: string[] = [];
      for (const [k, val] of Object.entries(rot.valor as Record<string, string>)) {
        if (VOCAB_KEYS.has(k) && typeof val === "string" && val.trim()) {
          merge[k as VocabKey] = val.trim();
          aplicados.push(`${k} → "${val.trim()}"`);
        }
      }
      await saveVocab(merge);
      rep.aplicado.push({ param: "Rótulos", detalhe: aplicados.join(" · ") || "sem termos válidos" });
      marca("rotulos", rot.disseram);
    } catch (e) {
      rep.falha.push({ param: "Rótulos", detalhe: msg(e) });
    }
  } else if (pendente(ca.rotulos)) rep.pendente.push({ param: "Rótulos", detalhe: "pendente na Ficha — não aplicado." });

  // — régua das áreas (org-level) —
  const reg = definido(ca.regua_areas);
  if (reg && reg.valor && typeof reg.valor === "object") {
    const regras = (reg.valor as { regras?: Record<string, string> }).regras ?? {};
    const okAreas: string[] = [];
    for (const [lens, texto] of Object.entries(regras)) {
      if (!LENS_SET.has(lens) || typeof texto !== "string") continue;
      if (texto.trim().length < 10) { rep.falha.push({ param: `Régua ${LENS_LABEL[lens as LensId]}`, detalhe: "régua curta demais (mín. 10 caracteres)." }); continue; }
      try {
        await persistLensUpdate("__ficha__", lens as LensId, { regua: texto });
        okAreas.push(LENS_LABEL[lens as LensId]);
      } catch (e) {
        rep.falha.push({ param: `Régua ${LENS_LABEL[lens as LensId]}`, detalhe: msg(e) });
      }
    }
    if (okAreas.length) { rep.aplicado.push({ param: "Régua das áreas", detalhe: `atualizada: ${okAreas.join(", ")}` }); marca("regras_area", reg.disseram); }
  } else if (pendente(ca.regua_areas)) rep.pendente.push({ param: "Régua das áreas", detalhe: "pendente na Ficha — não aplicado." });

  // — cadência —
  const cad = definido(ca.cadencia);
  if (cad && cad.valor && typeof cad.valor === "object") {
    const v = cad.valor as { varredura?: string; digest?: string };
    const varr = parseCadencia(v.varredura), dig = parseCadencia(v.digest);
    if (varr || dig) {
      try {
        const atual = await loadAutomacoes();
        await saveAutomacoes({
          digest: dig ? { enabled: true, cadencia: dig } : atual.digest,
          diagnostico: varr ? { enabled: true, cadencia: varr } : atual.diagnostico,
        });
        const partes = [varr ? `varredura ${labelCadencia(varr)}` : null, dig ? `resumo ${labelCadencia(dig)}` : null].filter(Boolean);
        rep.aplicado.push({ param: "Cadência", detalhe: `${partes.join(" · ")} (horário se ajusta em Automações)` });
        marca("cadencia", cad.disseram);
      } catch (e) {
        rep.falha.push({ param: "Cadência", detalhe: msg(e) });
      }
    } else {
      rep.pendente.push({ param: "Cadência", detalhe: "sem frequência clara na Ficha — ajuste em Automações." });
    }
  } else if (pendente(ca.cadencia)) rep.pendente.push({ param: "Cadência", detalhe: "pendente na Ficha — não aplicado." });

  // — destinatários (Radar guarda 1 e-mail; declara pendência, nunca omite) —
  const dest = definido(ca.destinatarios);
  if (dest) {
    const arr = Array.isArray(dest.valor) ? (dest.valor as unknown[]) : [];
    rep.pendente.push({ param: "Destinatários", detalhe: `${arr.length} descrito(s) na Ficha · o Radar envia para 1 e-mail hoje · configure em Agências${arr.length > 1 ? ` · ${arr.length - 1} pendente(s)` : ""}.` });
  }

  // — alertas (já ativos com padrão; a descrição fica de referência) —
  if (definido(ca.alertas)) rep.pendente.push({ param: "Alertas", detalhe: "o Radar já dispara alertas de concorrente com limiares padrão · ajuste fino no Diagnóstico." });

  // — NÍVEL 2 · por conta —
  const contas = Array.isArray(ficha.contas) ? ficha.contas : [];
  let algumaConta = false;
  for (const conta of contas) {
    const nome = String(conta?.nome ?? "").trim();
    if (!nome) continue;
    const watchlist = await loadWatchlist();
    let existe = watchlist.clients.find((c) => c.name.toLowerCase() === nome.toLowerCase());
    if (!existe) {
      try {
        await addClient(nome);
        rep.contasCriadas.push(nome);
        existe = (await loadWatchlist()).clients.find((c) => c.name.toLowerCase() === nome.toLowerCase());
      } catch (e) {
        rep.falha.push({ param: `Conta "${nome}"`, detalhe: `não foi possível criar: ${msg(e)}` });
        continue;
      }
    }
    const nomeReal = existe?.name ?? nome;
    algumaConta = true;

    const rc = await aplicarEntidades(conta.concorrentes, "concorrente", nomeReal, existe, rep);
    if (rc.aplicou) marca("concorrentes", rc.disseram);
    const rk = await aplicarEntidades(conta.contas_chave, "conta-chave", nomeReal, existe, rep);
    if (rk.aplicou) marca("contas_chave", rk.disseram);

    // base de conhecimento
    const base = definido(conta.base_conhecimento);
    if (base) {
      if (base.origem === "brain") rep.ignorado.push({ param: `Base · ${nomeReal}`, detalhe: "origem = Brain do Formare — não toca (é a fonte rica)." });
      else if (typeof base.valor === "string" && base.valor.trim()) {
        try {
          await saveBaseLocal(nomeReal, base.valor);
          rep.aplicado.push({ param: `Base local · ${nomeReal}`, detalhe: `${base.valor.trim().length} caracteres` });
          marca("base_conhecimento", base.disseram);
        } catch (e) {
          rep.falha.push({ param: `Base · ${nomeReal}`, detalhe: msg(e) });
        }
      }
    }

    // áreas ativas
    const areas = definido(conta.areas_ativas);
    if (areas) {
      const lista = asAreas(areas.valor);
      const alvo = new Set<string>(lista);
      try {
        for (const id of LENS_IDS) await persistLensUpdate(nomeReal, id, { enabled: alvo.has(id) });
        rep.aplicado.push({ param: `Áreas · ${nomeReal}`, detalhe: lista.length ? lista.map((a) => LENS_LABEL[a]).join(", ") : "nenhuma ativa" });
        marca("areas_ativas", areas.disseram);
      } catch (e) {
        rep.falha.push({ param: `Áreas · ${nomeReal}`, detalhe: msg(e) });
      }
    }

    // fontes e temas — não aplicado estruturalmente (fontes precisam de alvo)
    if (definido(conta.fontes_temas)) rep.pendente.push({ param: `Fontes e temas · ${nomeReal}`, detalhe: "registrados na Ficha · associe aos concorrentes no Diagnóstico." });
  }
  if (algumaConta) marca("clientes");

  // — proveniência + selos + disseram (org-level, na org da sessão) —
  if (idsDefinidos.length) {
    try {
      await registrarImplantacao("__agencia__", idsDefinidos, now, disseram);
    } catch (e) {
      rep.falha.push({ param: "Proveniência", detalhe: `selos não gravados: ${msg(e)}` });
    }
  }

  return rep;
}

/** Adiciona concorrentes/contas-chave de uma conta; `validar:true` vira SUGESTÃO (não fato). */
async function aplicarEntidades(
  w: Wrapped | undefined,
  pillar: EntityPillar,
  nomeConta: string,
  existe: { competitors: Array<{ name: string }> } | undefined,
  rep: ApplyReport,
): Promise<{ aplicou: boolean; disseram?: string }> {
  const d = definido(w);
  if (!d) return { aplicou: false };
  const rotulo = pillar === "concorrente" ? "Concorrentes" : "Contas-chave";
  const lista = asConcorrentes(d.valor);
  const jaTem = new Set((existe?.competitors ?? []).map((c) => c.name.toLowerCase()));
  const confirmados = lista.filter((c) => !c.validar && !jaTem.has(c.nome.toLowerCase()));
  const sugestoes = lista.filter((c) => c.validar && !jaTem.has(c.nome.toLowerCase()));
  let add = 0;
  for (const c of confirmados) {
    try {
      const r = await addEntityByName(nomeConta, c.nome, pillar);
      if (r.added) add++;
    } catch (e) {
      rep.falha.push({ param: `${rotulo} · ${nomeConta}`, detalhe: `${c.nome}: ${msg(e)}` });
    }
  }
  if (add) rep.aplicado.push({ param: `${rotulo} · ${nomeConta}`, detalhe: `+${add} adicionado(s)` });
  if (sugestoes.length) rep.ignorado.push({ param: `${rotulo} · ${nomeConta}`, detalhe: `${sugestoes.length} sugestão(ões) a validar (${sugestoes.map((s) => s.nome).join(", ")}) — não adicionadas como fato; confirme e adicione manualmente.` });
  return { aplicou: add > 0, disseram: d.disseram };
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : "erro inesperado";
}
