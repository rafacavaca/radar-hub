/**
 * F1a — MOTOR DE MOVIMENTO: compara duas varreduras (snapshots) e gera
 * Movimento[] com as duas fontes/datas. Determinístico (código > LLM).
 *
 * HONESTIDADE ANTI-RUÍDO (decisões deliberadas):
 * - Diff SÓ em campos-fato ESTÁVEIS: tagline, produtos (por nome), clientes
 *   citados, canais (determinísticos) e mídia paga (nº/estado de anúncios).
 * - propósito/posicionamento são frases PARAFRASEADAS pelo LLM a cada
 *   varredura — reescrita não é movimento do concorrente. Entram só como
 *   primeira_coleta; nunca como "mudança".
 * - Campo que passa a existir (nao_encontrado→valor) = "primeira_coleta",
 *   nunca "mudança". Primeira varredura de todas = ZERO movimentos.
 * - Mídia paga: só compara quando os DOIS lados foram coletados de verdade
 *   (status "encontrado"); nao_localizado não vira movimento.
 * - JANELA DE CONFIRMAÇÃO (listas + canais): a extração por LLM oscila — um
 *   item de lista só vira "novo" quando aparece em 2 varreduras SEGUIDAS e não
 *   existia antes; só vira "removido" quando some por 2 seguidas. (Provado ao
 *   vivo: re-varrer a Intelia num site inalterado gerou um falso "produto
 *   novo" por reagrupamento do LLM.) Escalares (tagline, nº de anúncios)
 *   seguem imediatos — são cópia quase literal/numérica.
 */

import type {
  AlertaDisparo,
  BlocoPreco,
  BlocoReputacao,
  Campo,
  DiagnosticoConcorrente,
  MidiaPlataforma,
  Movimento,
  RegraAlerta,
  Severidade,
  Snapshot,
} from "@/lib/diagnostico/schema";

// ─── normalização (tolerante a jitter de extração) ──────────────────────────

/** minúsculas, sem acento/pontuação/parênteses — compara ESSÊNCIA, não forma. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** mesmo item de lista? (um contém o outro, normalizado — "Compass" ≈ "Compass Farm"). */
function mesmoItem(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// ─── snapshot ────────────────────────────────────────────────────────────────

/** Projeta a camada de FATO de um diagnóstico num snapshot datado. */
export function toSnapshot(diag: DiagnosticoConcorrente): Snapshot {
  return {
    data: diag.atualizado_em,
    posicionamento: diag.posicionamento,
    canais: diag.canais,
    midia_paga: diag.midia_paga,
    preco: diag.preco,
    reputacao: diag.reputacao,
    campos_custom: diag.campos_custom,
    vagas: diag.vagas,
    news: diag.news,
  };
}

// ─── diff ────────────────────────────────────────────────────────────────────

type Ctx = { agora: string; out: Movimento[] };

function push(ctx: Ctx, m: Omit<Movimento, "data_deteccao">): void {
  ctx.out.push({ ...m, data_deteccao: ctx.agora });
}

/** Campo escalar (envelope Campo): mudança quando os dois lados são reais. */
function diffCampo(
  ctx: Ctx,
  campo: string,
  label: string,
  antes: Campo | undefined,
  depois: Campo | undefined,
  opts: { permiteMudanca: boolean; severidadeMudanca: Severidade },
): void {
  const aVal = antes?.status === "encontrado" ? antes.valor : null;
  const dVal = depois?.status === "encontrado" ? depois.valor : null;
  if (dVal && !aVal) {
    push(ctx, {
      campo,
      campo_label: label,
      de: null,
      para: dVal,
      tipo: "primeira_coleta",
      fonte_url_para: depois?.fonte_url,
      data_para: depois?.data_coleta,
      severidade: "baixa",
    });
    return;
  }
  if (!opts.permiteMudanca) return;
  if (aVal && dVal && norm(aVal) !== norm(dVal)) {
    push(ctx, {
      campo,
      campo_label: label,
      de: aVal,
      para: dVal,
      tipo: "mudança",
      fonte_url_de: antes?.fonte_url,
      fonte_url_para: depois?.fonte_url,
      data_de: antes?.data_coleta,
      data_para: depois?.data_coleta,
      severidade: opts.severidadeMudanca,
    });
  }
}

type ItemNomeado = { nome: string; fonte?: string; data?: string };

/**
 * Lista nomeada (produtos/clientes) com JANELA DE CONFIRMAÇÃO:
 * - "novo": está no ATUAL e no ANTERIOR (2 seguidas) e em NENHUM mais antigo.
 * - "removido": sumiu do ATUAL e do ANTERIOR (2 seguidas) e estava no
 *   imediatamente-antes-do-anterior.
 * Sem snapshots antigos (só baseline) não há como provar novidade → silêncio.
 */
function diffLista(
  ctx: Ctx,
  campo: string,
  label: string,
  older: ItemNomeado[][],
  antes: ItemNomeado[],
  depois: ItemNomeado[],
  sev: { novo: Severidade; removido: Severidade },
): void {
  const contem = (lista: ItemNomeado[], nome: string) => lista.some((x) => mesmoItem(x.nome, nome));

  if (older.length === 0) return; // só baseline: item do baseline não é "novo"

  for (const d of depois) {
    const confirmado = contem(antes, d.nome) && older.every((l) => !contem(l, d.nome));
    if (confirmado) {
      push(ctx, {
        campo,
        campo_label: label,
        de: null,
        para: d.nome,
        tipo: "novo",
        fonte_url_para: d.fonte,
        data_para: d.data,
        severidade: sev.novo,
      });
    }
  }
  const penultimo = older[older.length - 1];
  for (const a of penultimo) {
    const sumiuConfirmado = !contem(antes, a.nome) && !contem(depois, a.nome);
    if (sumiuConfirmado) {
      push(ctx, {
        campo,
        campo_label: label,
        de: a.nome,
        para: null,
        tipo: "removido",
        fonte_url_de: a.fonte,
        data_de: a.data,
        severidade: sev.removido,
      });
    }
  }
}

function diffMidiaPlataforma(
  ctx: Ctx,
  plat: string,
  antes: MidiaPlataforma | undefined,
  depois: MidiaPlataforma | undefined,
  datas: { de: string; para: string },
): void {
  const aOk = antes?.status === "encontrado";
  const dOk = depois?.status === "encontrado";
  if (!dOk) return; // lado novo não coletado → nada a afirmar
  if (!aOk) {
    push(ctx, {
      campo: `midia_paga.${plat}`,
      campo_label: `Mídia paga (${plat})`,
      de: null,
      para: depois!.anuncia === false ? "sem anúncios ativos" : `${depois!.n_anuncios_ativos ?? "?"} anúncio(s)`,
      tipo: "primeira_coleta",
      fonte_url_para: depois!.fonte_url,
      data_para: datas.para,
      severidade: "baixa",
    });
    return;
  }
  // anuncia true↔false = movimento forte
  if (antes!.anuncia !== null && depois!.anuncia !== null && antes!.anuncia !== depois!.anuncia) {
    push(ctx, {
      campo: `midia_paga.${plat}.anuncia`,
      campo_label: `Mídia paga (${plat})`,
      de: antes!.anuncia ? "anunciando" : "sem anúncios",
      para: depois!.anuncia ? "anunciando" : "sem anúncios",
      tipo: "mudança",
      fonte_url_de: antes!.fonte_url,
      fonte_url_para: depois!.fonte_url,
      data_de: datas.de,
      data_para: datas.para,
      severidade: "alta",
    });
  }
  const aN = antes!.n_anuncios_ativos;
  const dN = depois!.n_anuncios_ativos;
  if (aN !== null && dN !== null && aN !== dN) {
    const variacao = aN > 0 ? Math.abs(dN - aN) / aN : 1;
    push(ctx, {
      campo: `midia_paga.${plat}.n_anuncios_ativos`,
      campo_label: `Nº de anúncios (${plat})`,
      de: aN,
      para: dN,
      tipo: "mudança",
      fonte_url_de: antes!.fonte_url,
      fonte_url_para: depois!.fonte_url,
      data_de: datas.de,
      data_para: datas.para,
      severidade: variacao >= 0.5 ? "alta" : "média",
    });
  }
}

// ─── F1b: preço ──────────────────────────────────────────────────────────────

/** "lido" = a página de preço foi de fato lida (público OU sob consulta). */
function precoLido(p: BlocoPreco | undefined): p is BlocoPreco {
  return Boolean(p && (p.status === "encontrado" || p.status === "sob_consulta"));
}

function rotuloPreco(p: BlocoPreco): string {
  return p.status === "encontrado" ? `preço público (${p.planos.filter((x) => x.preco).length} plano(s) com valor)` : "sob consulta";
}

function planosDe(s: Snapshot): ItemNomeado[] {
  if (!precoLido(s.preco)) return [];
  return s.preco.planos.map((p) => ({ nome: p.plano, fonte: p.fonte_url, data: p.data_coleta }));
}

/**
 * Diff de preço: SÓ entre lados LIDOS (falha de coleta não vira "removeu
 * preço"). Mudança de valor no MESMO plano = imediata (numérico literal).
 * Plano novo/removido usa a janela de listas. Público↔sob-consulta = mudança.
 */
function diffPreco(ctx: Ctx, older: Snapshot[], anterior: Snapshot, novo: Snapshot): void {
  const a = anterior.preco;
  const n = novo.preco;
  if (!precoLido(n)) return;
  if (!precoLido(a)) {
    push(ctx, {
      campo: "preco",
      campo_label: "Preço",
      de: null,
      para: rotuloPreco(n),
      tipo: "primeira_coleta",
      fonte_url_para: n.fonte_url,
      data_para: n.data_coleta,
      severidade: "baixa",
    });
    return;
  }

  if (a.status !== n.status) {
    push(ctx, {
      campo: "preco.status",
      campo_label: "Preço",
      de: rotuloPreco(a),
      para: rotuloPreco(n),
      tipo: "mudança",
      fonte_url_de: a.fonte_url,
      fonte_url_para: n.fonte_url,
      data_de: a.data_coleta,
      data_para: n.data_coleta,
      severidade: "alta",
    });
  }

  // valor mudou no MESMO plano (match por nome normalizado) — sinal de ouro
  for (const planoNovo of n.planos) {
    const planoAntes = a.planos.find((p) => mesmoItem(p.plano, planoNovo.plano));
    if (!planoAntes?.preco || !planoNovo.preco) continue;
    if (norm(planoAntes.preco) !== norm(planoNovo.preco)) {
      push(ctx, {
        campo: `preco.plano.${norm(planoNovo.plano).replace(/\s+/g, "_")}`,
        campo_label: `Preço (${planoNovo.plano})`,
        de: planoAntes.preco,
        para: planoNovo.preco,
        tipo: "mudança",
        fonte_url_de: planoAntes.fonte_url,
        fonte_url_para: planoNovo.fonte_url,
        data_de: planoAntes.data_coleta,
        data_para: planoNovo.data_coleta,
        severidade: "alta",
      });
    }
  }

  // planos que entram/saem: janela anti-jitter (lista extraída por LLM)
  diffLista(ctx, "preco.planos", "Plano", older.map(planosDe), planosDe(anterior), planosDe(novo), {
    novo: "média",
    removido: "média",
  });
}

// ─── F1c: reputação ─────────────────────────────────────────────────────────

/** Diff de nota por fonte: SÓ entre lados coletados; numérica = imediata. */
function diffReputacao(ctx: Ctx, anterior: Snapshot, novo: Snapshot): void {
  const fontesNovas = novo.reputacao?.fontes ?? [];
  for (const fn of fontesNovas) {
    if (fn.status !== "coletado") continue;
    const fa = (anterior.reputacao?.fontes ?? []).find((x) => x.fonte === fn.fonte);
    if (!fa || fa.status !== "coletado") {
      push(ctx, {
        campo: `reputacao.${fn.fonte}`,
        campo_label: `Reputação (${fn.fonte})`,
        de: null,
        para: fn.nota !== null ? `nota ${fn.nota}` : `${fn.n_avaliacoes ?? "?"} avaliações`,
        tipo: "primeira_coleta",
        fonte_url_para: fn.fonte_url,
        data_para: fn.data_coleta,
        severidade: "baixa",
      });
      continue;
    }
    if (fa.nota !== null && fn.nota !== null && fa.nota !== fn.nota) {
      const caiu = fn.nota < fa.nota;
      push(ctx, {
        campo: `reputacao.${fn.fonte}.nota`,
        campo_label: `Nota (${fn.fonte})`,
        de: fa.nota,
        para: fn.nota,
        tipo: "mudança",
        fonte_url_de: fa.fonte_url,
        fonte_url_para: fn.fonte_url,
        data_de: fa.data_coleta,
        data_para: fn.data_coleta,
        severidade: caiu ? (fa.nota - fn.nota >= 1 ? "alta" : "média") : "baixa",
      });
    }
  }
}

function produtosDe(s: Snapshot): ItemNomeado[] {
  return s.posicionamento.produtos.map((p) => ({ nome: p.nome, fonte: p.fonte_url, data: p.data_coleta }));
}
function clientesDe(s: Snapshot): ItemNomeado[] {
  return s.posicionamento.provas.clientes_citados
    .filter((c) => c.valor)
    .map((c) => ({ nome: c.valor!, fonte: c.fonte_url, data: c.data_coleta }));
}

/**
 * Compara a varredura NOVA contra o histórico REAL de snapshots (mais antigo →
 * mais novo; o último é a varredura anterior). Histórico vazio (primeira
 * varredura de todas) ⇒ [] — baseline não é movimento.
 */
export function diffSnapshots(historico: Snapshot[], novo: Snapshot, agora: string): Movimento[] {
  const anterior = historico.at(-1) ?? null;
  if (!anterior) return [];
  const older = historico.slice(0, -1);
  const ctx: Ctx = { agora, out: [] };
  const aP = anterior.posicionamento;
  const nP = novo.posicionamento;

  // escalares: tagline compara de verdade; frases parafraseáveis só primeira_coleta
  diffCampo(ctx, "posicionamento.tagline", "Tagline", aP.tagline, nP.tagline, { permiteMudanca: true, severidadeMudanca: "alta" });
  diffCampo(ctx, "posicionamento.proposito", "Propósito", aP.proposito, nP.proposito, { permiteMudanca: false, severidadeMudanca: "baixa" });
  diffCampo(ctx, "posicionamento.posicionamento", "Posicionamento", aP.posicionamento, nP.posicionamento, { permiteMudanca: false, severidadeMudanca: "baixa" });

  // listas com janela de confirmação (anti-jitter de extração)
  diffLista(ctx, "posicionamento.produtos", "Produto", older.map(produtosDe), produtosDe(anterior), produtosDe(novo), { novo: "alta", removido: "média" });
  diffLista(ctx, "posicionamento.provas.clientes_citados", "Cliente citado", older.map(clientesDe), clientesDe(anterior), clientesDe(novo), { novo: "média", removido: "baixa" });

  // canais: mesma janela sobre PRESENÇA (o achado é determinístico, mas o
  // scrape pode falhar uma vez — presença some/volta sem o canal ter fechado)
  for (const key of Object.keys(novo.canais) as Array<keyof typeof novo.canais>) {
    if (older.length === 0) break;
    const presenteEm = (s: Snapshot) => Boolean(s.canais[key]?.presente);
    const n = novo.canais[key];
    if (n?.presente && presenteEm(anterior) && older.every((s) => !presenteEm(s))) {
      push(ctx, {
        campo: `canais.${key}`,
        campo_label: `Canal (${key})`,
        de: null,
        para: n.url ?? "presente",
        tipo: "novo",
        fonte_url_para: n.url ?? undefined,
        data_para: novo.data,
        severidade: "média",
      });
    } else if (!n?.presente && !presenteEm(anterior) && presenteEm(older[older.length - 1])) {
      const antes = older[older.length - 1].canais[key];
      push(ctx, {
        campo: `canais.${key}`,
        campo_label: `Canal (${key})`,
        de: antes?.url ?? "presente",
        para: null,
        tipo: "removido",
        fonte_url_de: antes?.url ?? undefined,
        data_de: older[older.length - 1].data,
        severidade: "média",
      });
    }
  }

  // mídia paga por plataforma (numérica/estado — imediata)
  diffMidiaPlataforma(ctx, "meta", anterior.midia_paga?.meta, novo.midia_paga?.meta, { de: anterior.data, para: novo.data });
  diffMidiaPlataforma(ctx, "linkedin", anterior.midia_paga?.linkedin, novo.midia_paga?.linkedin, { de: anterior.data, para: novo.data });

  // F1b preço + F1c reputação
  diffPreco(ctx, older, anterior, novo);
  diffReputacao(ctx, anterior, novo);

  // D — campos customizados (mudança de valor no mesmo campo = movimento)
  for (const cn of novo.campos_custom ?? []) {
    const ca = (anterior.campos_custom ?? []).find((x) => x.chave === cn.chave);
    diffCampo(ctx, `campo_custom.${cn.chave}`, cn.chave, ca?.resposta, cn.resposta, { permiteMudanca: true, severidadeMudanca: "média" });
  }

  // C2 vagas + C4 releases/notícias
  diffVagas(ctx, older, anterior, novo);
  diffNews(ctx, historico, novo);

  return ctx.out;
}

// ─── C2: vagas ───────────────────────────────────────────────────────────────

/** Diff de vagas: total (numérico, imediato) + área nova (janela). Só entre lados coletados. */
function diffVagas(ctx: Ctx, older: Snapshot[], anterior: Snapshot, novo: Snapshot): void {
  const a = anterior.vagas;
  const n = novo.vagas;
  if (n?.status !== "encontrado") return;
  if (a?.status !== "encontrado") {
    push(ctx, {
      campo: "vagas",
      campo_label: "Vagas",
      de: null,
      para: n.total !== null ? `${n.total} vaga(s)` : `${n.areas.length} área(s) contratando`,
      tipo: "primeira_coleta",
      fonte_url_para: n.fonte_url,
      data_para: n.data_coleta,
      severidade: "baixa",
    });
    return;
  }
  if (a.total !== null && n.total !== null && a.total !== n.total) {
    const variacao = a.total > 0 ? Math.abs(n.total - a.total) / a.total : 1;
    push(ctx, {
      campo: "vagas.total",
      campo_label: "Nº de vagas",
      de: a.total,
      para: n.total,
      tipo: "mudança",
      fonte_url_de: a.fonte_url,
      fonte_url_para: n.fonte_url,
      data_de: a.data_coleta,
      data_para: n.data_coleta,
      severidade: variacao >= 0.5 ? "alta" : "média",
    });
  }
  // área nova contratando = sinal de expansão (janela anti-jitter)
  diffLista(
    ctx,
    "vagas.areas",
    "Área contratando",
    older.filter((s) => s.vagas?.status === "encontrado").map((s) => (s.vagas!.areas).map((x) => ({ nome: x }))),
    a.areas.map((x) => ({ nome: x })),
    n.areas.map((x) => ({ nome: x })),
    { novo: "média", removido: "baixa" },
  );
}

// ─── C4: releases/notícias ───────────────────────────────────────────────────

/** Um release é "novo" se a URL+título não apareceu em NENHUM snapshot anterior. */
function diffNews(ctx: Ctx, historico: Snapshot[], novo: Snapshot): void {
  const n = novo.news;
  if (n?.status !== "encontrado") return;
  const anteriores = historico.filter((s) => s.news?.status === "encontrado");
  if (anteriores.length === 0) {
    // baseline: registra a existência, sem alertar cada item
    push(ctx, {
      campo: "news",
      campo_label: "Notícias/releases",
      de: null,
      para: `${n.itens.length} item(ns) monitorado(s)`,
      tipo: "primeira_coleta",
      fonte_url_para: n.fonte_url,
      data_para: n.data_coleta,
      severidade: "baixa",
    });
    return;
  }
  const vistos = new Set<string>();
  for (const s of anteriores) for (const it of s.news!.itens) vistos.add(chaveNews(it.titulo));
  for (const it of n.itens) {
    if (vistos.has(chaveNews(it.titulo))) continue;
    push(ctx, {
      campo: "news.item",
      campo_label: "Release/notícia",
      de: null,
      para: it.titulo,
      tipo: "novo",
      fonte_url_para: it.fonte_url,
      data_para: it.data_publicacao ?? novo.data,
      severidade: "média",
    });
  }
}
function chaveNews(titulo: string): string {
  return titulo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

// ─── regras de alerta ────────────────────────────────────────────────────────

export const REGRAS_PADRAO: RegraAlerta[] = [
  { tipo: "tagline_mudou", ativo: true },
  { tipo: "produto_novo", ativo: true },
  { tipo: "anuncios_variacao", ativo: true, limiar: 50 },
  { tipo: "preco_mudou", ativo: true },
  { tipo: "nota_caiu", ativo: true, limiar: 0.5 },
  { tipo: "release_novo", ativo: true },
  { tipo: "vagas_variacao", ativo: true, limiar: 50 },
  { tipo: "canal_novo", ativo: false },
  { tipo: "cliente_novo", ativo: false },
];

export const REGRA_LABEL: Record<RegraAlerta["tipo"], string> = {
  tagline_mudou: "Tagline mudou",
  produto_novo: "Produto novo na arquitetura",
  anuncios_variacao: "Anúncios variaram acima do limiar",
  preco_mudou: "Preço mudou (valor, plano ou público↔sob consulta)",
  nota_caiu: "Nota de reviews caiu além do limiar",
  release_novo: "Release/notícia nova publicada",
  vagas_variacao: "Vagas variaram acima do limiar (expansão)",
  canal_novo: "Canal novo aberto",
  cliente_novo: "Novo cliente citado no site",
};

function regraCasa(regra: RegraAlerta, m: Movimento): boolean {
  switch (regra.tipo) {
    case "tagline_mudou":
      return m.campo === "posicionamento.tagline" && m.tipo === "mudança";
    case "produto_novo":
      return m.campo === "posicionamento.produtos" && m.tipo === "novo";
    case "cliente_novo":
      return m.campo === "posicionamento.provas.clientes_citados" && m.tipo === "novo";
    case "canal_novo":
      return m.campo.startsWith("canais.") && m.tipo === "novo";
    case "anuncios_variacao": {
      if (!m.campo.endsWith(".n_anuncios_ativos") || m.tipo !== "mudança") return false;
      const de = typeof m.de === "number" ? m.de : null;
      const para = typeof m.para === "number" ? m.para : null;
      if (de === null || para === null) return false;
      const pct = de > 0 ? (Math.abs(para - de) / de) * 100 : 100;
      return pct >= (regra.limiar ?? 50);
    }
    case "preco_mudou":
      return m.campo.startsWith("preco") && (m.tipo === "mudança" || m.tipo === "novo" || m.tipo === "removido");
    case "nota_caiu": {
      if (!m.campo.startsWith("reputacao.") || !m.campo.endsWith(".nota") || m.tipo !== "mudança") return false;
      const de = typeof m.de === "number" ? m.de : null;
      const para = typeof m.para === "number" ? m.para : null;
      if (de === null || para === null) return false;
      return de - para >= (regra.limiar ?? 0.5);
    }
    case "release_novo":
      // só releases/notícias — "produto novo" é da regra produto_novo (regras independentes)
      return m.campo === "news.item" && m.tipo === "novo";
    case "vagas_variacao": {
      if (m.campo === "vagas.areas" && m.tipo === "novo") return true; // área nova = expansão
      if (m.campo !== "vagas.total" || m.tipo !== "mudança") return false;
      const de = typeof m.de === "number" ? m.de : null;
      const para = typeof m.para === "number" ? m.para : null;
      if (de === null || para === null) return false;
      const pct = de > 0 ? (Math.abs(para - de) / de) * 100 : 100;
      return pct >= (regra.limiar ?? 50);
    }
  }
}

/** Aplica as regras ATIVAS aos movimentos → disparos (primeira_coleta nunca dispara). */
export function avaliarRegras(
  regras: RegraAlerta[],
  movimentos: Movimento[],
  ctx: { clientName: string; concorrenteId: string; concorrenteNome: string },
): AlertaDisparo[] {
  const disparos: AlertaDisparo[] = [];
  for (const m of movimentos) {
    if (m.tipo === "primeira_coleta") continue;
    for (const r of regras) {
      if (!r.ativo || !regraCasa(r, m)) continue;
      disparos.push({
        id: `${ctx.concorrenteId}-${m.campo}-${m.data_deteccao}-${r.tipo}`,
        clientName: ctx.clientName,
        concorrente_id: ctx.concorrenteId,
        concorrente_nome: ctx.concorrenteNome,
        regra: r.tipo,
        movimento: m,
        data: m.data_deteccao,
        visto: false,
      });
    }
  }
  return disparos;
}
