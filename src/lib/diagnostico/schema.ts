/**
 * SCHEMA DO DIAGNÓSTICO DE CONCORRENTE (F1 do diagnóstico vivo).
 *
 * A espinha que transforma sinais soltos em diagnóstico: um objeto por
 * concorrente, cada campo num ENVELOPE com valor + proveniência + data + tipo.
 *
 * REGRA DE OURO (honesto por construção): campo não achado vira
 * `status:"nao_encontrado"` com `valor:null` — NUNCA um valor plausível inventado.
 * Na F1, `tipo` é sempre "fato" (a opinião/maturidade só entra na Lente 4).
 */

export type CampoTipo = "fato" | "opiniao";
export type CampoStatus = "encontrado" | "nao_encontrado";

/** Um campo do diagnóstico — valor + de onde veio + quando + o que é. */
export type Campo = {
  valor: string | null;
  fonte_url?: string;
  data_coleta: string;
  /** data de publicação/atualização do conteúdo, quando aplicável (ABSOLUTA). */
  data_publicacao?: string | null;
  tipo: CampoTipo;
  status: CampoStatus;
};

/** Um produto/solução nomeado (nome próprio + descrição curta) com fonte. */
export type Produto = {
  nome: string;
  descricao: string | null;
  fonte_url?: string;
  data_coleta: string;
};

export type Posicionamento = {
  tagline: Campo;
  proposito: Campo;
  posicionamento: Campo;
  diferenciais: Campo[];
  produtos: Produto[];
  provas: {
    clientes_citados: Campo[];
    depoimentos: Campo;
    premiacoes: Campo[];
    big_numbers: Campo[];
  };
};

/** Status de um canal: achado, não localizado, ou (LinkedIn) precisa do botão. */
export type CanalStatus = "encontrado" | "nao_localizado" | "requer_captura_linkedin";

export type CanalAudit = {
  presente: boolean;
  url: string | null;
  frequencia: Campo | null;
  recencia: Campo | null;
  tipo_conteudo: Campo | null;
  engajamento: Campo | null;
  status: CanalStatus;
};

export type CanalKey = "site" | "linkedin" | "youtube" | "instagram" | "facebook" | "blog";
export const CANAL_KEYS: readonly CanalKey[] = [
  "site",
  "linkedin",
  "youtube",
  "instagram",
  "facebook",
  "blog",
];

export type Canais = Record<CanalKey, CanalAudit>;

// ─────────────────────────────────────────────────────────────────────────────
// F2 — LENTE 3 (mídia paga) + F3 — LENTE 4 (maturidade, OPINIÃO) + estratégia.
// Blocos OPCIONAIS: um diagnóstico F1 (sem eles) segue válido.
// ─────────────────────────────────────────────────────────────────────────────

/** Uma plataforma de anúncios (Meta/LinkedIn/Google). null = não deu pra saber. */
export type MidiaPlataforma = {
  anuncia: boolean | null;
  n_anuncios_ativos: number | null;
  /** exemplos de mensagens/criativos vistos. */
  mensagens: string[];
  fonte_url?: string;
  data_coleta: string;
  status: "encontrado" | "nao_localizado";
  /** nota de honestidade/escopo (ex.: "via API oficial", limite do arquivo, erro). */
  observacao?: string | null;
};

export type MidiaPaga = {
  meta: MidiaPlataforma;
  linkedin: MidiaPlataforma;
  google: MidiaPlataforma;
};

/** Lente 4 — maturidade de comunicação. É OPINIÃO (rotulada), não fato. */
export type Maturidade = {
  /** ex.: "referência", "diferenciada", "padronizada", "defasada". */
  nivel: string | null;
  evidencia: string | null;
  /** 0-100 (profissionalismo/consistência/modernidade). */
  score: number | null;
  tipo: "opiniao";
  data_coleta: string;
  status: "avaliado" | "nao_avaliado";
};

/** F3 — a camada estratégica RASCUNHADA (humano decide; o Radar embasa). */
export type EstrategiaRascunho = {
  percepcao_atual: string | null;
  percepcao_ideal: string | null;
  caminhos: string[];
  recomendacoes: string[];
  data_coleta: string;
  status: "rascunhado" | "nao_rascunhado";
};

// ─────────────────────────────────────────────────────────────────────────────
// ONDA 1 / F1b — PREÇO/PLANOS (fato coletável; B2B esconde → sob_consulta).
// ─────────────────────────────────────────────────────────────────────────────

export type PlanoPreco = {
  plano: string;
  /** preço LITERAL da página (ex.: "R$ 499/mês"). null = plano sem valor exposto. */
  preco: string | null;
  periodicidade: string | null;
  features: string[];
  fonte_url?: string;
  data_coleta: string;
};

export type BlocoPreco = {
  /** encontrado = preço público; sob_consulta = página existe mas "fale com
   *  vendas"; nao_encontrado = sem página de preço pública. NUNCA inventado. */
  status: "encontrado" | "sob_consulta" | "nao_encontrado";
  planos: PlanoPreco[];
  /** quando não estruturável: resumo honesto do que a página realmente diz. */
  resumo: string | null;
  fonte_url?: string;
  data_coleta: string;
  tipo: "fato";
};

export function precoNaoEncontrado(dataColeta: string): BlocoPreco {
  return { status: "nao_encontrado", planos: [], resumo: null, data_coleta: dataColeta, tipo: "fato" };
}

// ─────────────────────────────────────────────────────────────────────────────
// ONDA 1 / F1c — REVIEWS/REPUTAÇÃO. Nota/nº = FATO; temas = DERIVADO de
// reviews (interpretação com evidência/citações) — rotulado na ficha.
// ─────────────────────────────────────────────────────────────────────────────

export type FonteReview = "reclame_aqui" | "google" | "g2" | "capterra";

export type ReviewFonte = {
  fonte: FonteReview;
  /** nao_coletado = fonte inalcançável/bloqueada (honesto, não finge cobertura). */
  status: "coletado" | "nao_coletado";
  /** nota na ESCALA DA FONTE (RA 0-10; G2/Capterra/Google 0-5). Só se explícita. */
  nota: number | null;
  escala: string | null;
  n_avaliacoes: number | null;
  /** DERIVADOS (interpretação sobre textos reais) — exigem citações. */
  temas_elogio: string[];
  temas_reclamacao: string[];
  /** até 3 trechos LITERAIS de reviews que evidenciam os temas. */
  citacoes: string[];
  fonte_url?: string;
  data_coleta: string;
  observacao?: string | null;
};

export type BlocoReputacao = {
  /** sempre as 4 fontes, cada uma com status honesto. */
  fontes: ReviewFonte[];
  data_coleta: string;
};

export function reviewNaoColetado(fonte: FonteReview, dataColeta: string, observacao?: string): ReviewFonte {
  return {
    fonte,
    status: "nao_coletado",
    nota: null,
    escala: null,
    n_avaliacoes: null,
    temas_elogio: [],
    temas_reclamacao: [],
    citacoes: [],
    data_coleta: dataColeta,
    observacao: observacao ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ONDA 1 / F1d — BATTLECARD (artefato comercial DERIVADO: cada afirmação
// citada; "como ganhar" ancorado no Brain — sem cobertura = dizer, não forçar).
// ─────────────────────────────────────────────────────────────────────────────

export type BattlecardItem = {
  texto: string;
  fonte_url?: string;
  /** trecho literal (ex.: de review) que evidencia o item. */
  citacao?: string | null;
};

export type ComoGanhar = {
  /** a fraqueza DELES (citada). */
  fraqueza: string;
  fonte_url?: string;
  /** nosso diferencial REAL (do Brain). null = Brain não cobre esta fraqueza. */
  nosso_diferencial: string | null;
  /** como usar na conversa. null quando não há diferencial mapeado. */
  resposta: string | null;
};

export type Objecao = { objecao: string; resposta: string };

export type Battlecard = {
  quem_sao: string;
  forcas: BattlecardItem[];
  fraquezas: BattlecardItem[];
  como_ganhar: ComoGanhar[];
  objecoes: Objecao[];
  /** de onde vieram os "nossos diferenciais" (honestidade do Brain). */
  brain_mode: "live" | "fixture" | "none";
  gerado_em: string;
  tipo: "derivado";
  /** rascunho de abordagem/e-mail gerado a partir do card (opcional). */
  abordagem?: { texto: string; gerado_em: string } | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// ONDA 1 / F1a — MOVIMENTO + ALERTA (versionamento + diff + regras).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snapshot de UMA varredura — só a camada de FATO (posicionamento/canais/mídia).
 * Opinião (maturidade) e rascunho (estratégia) ficam de fora do diff de
 * propósito: reescrita de LLM não é "movimento do concorrente".
 */
export type Snapshot = {
  /** quando esta varredura rodou (ISO). */
  data: string;
  posicionamento: Posicionamento;
  canais: Canais;
  midia_paga?: MidiaPaga;
  preco?: BlocoPreco;
  reputacao?: BlocoReputacao;
};

export type MovimentoTipo = "mudança" | "primeira_coleta" | "novo" | "removido";
export type Severidade = "baixa" | "média" | "alta";

/** Um evento de mudança detectado entre duas varreduras REAIS. */
export type Movimento = {
  /** caminho do campo, ex.: "posicionamento.tagline", "midia_paga.meta.n_anuncios_ativos". */
  campo: string;
  /** rótulo humano do campo (pra timeline), ex.: "Tagline". */
  campo_label: string;
  de: string | number | null;
  para: string | number | null;
  tipo: MovimentoTipo;
  data_deteccao: string;
  /** as DUAS proveniências (regra de ouro: fonte + data dos dois lados). */
  fonte_url_de?: string;
  fonte_url_para?: string;
  data_de?: string;
  data_para?: string;
  severidade: Severidade;
};

export type RegraAlertaTipo =
  | "tagline_mudou"
  | "produto_novo"
  | "anuncios_variacao"
  | "canal_novo"
  | "cliente_novo"
  | "preco_mudou"
  | "nota_caiu";

/** Regra de alerta editável (por cliente — vale pra todos os concorrentes dele). */
export type RegraAlerta = {
  tipo: RegraAlertaTipo;
  ativo: boolean;
  /** só pra anuncios_variacao: variação mínima em % (ex.: 50). */
  limiar?: number;
};

/** Um alerta disparado: um movimento que casou com uma regra ativa. */
export type AlertaDisparo = {
  id: string;
  clientName: string;
  concorrente_id: string;
  concorrente_nome: string;
  regra: RegraAlertaTipo;
  movimento: Movimento;
  data: string;
  visto: boolean;
};

export type DiagnosticoConcorrente = {
  clientName: string;
  concorrente_id: string;
  concorrente_nome: string;
  site_url: string;
  atualizado_em: string;
  /** de onde as lentes leram (transparência): as páginas rastreadas. */
  paginas_rastreadas: string[];
  posicionamento: Posicionamento;
  canais: Canais;
  /** F2 — Lente 3 (mídia paga). */
  midia_paga?: MidiaPaga;
  /** F3 — Lente 4 (maturidade, opinião rotulada). */
  maturidade?: Maturidade;
  /** F3 — rascunho estratégico pro estrategista. */
  estrategia?: EstrategiaRascunho;
  /** F1a — snapshots datados das varreduras (mais antigo → mais novo). */
  historico?: Snapshot[];
  /** F1a — timeline de movimentos detectados (mais novo primeiro). */
  movimentos?: Movimento[];
  /** F1b — preço/planos (fato; sob_consulta quando o site esconde). */
  preco?: BlocoPreco;
  /** F1c — reputação por fonte (nota=fato; temas=derivados de reviews). */
  reputacao?: BlocoReputacao;
  /** F1d — battlecard (derivado citado; gerado sob demanda do diag salvo). */
  battlecard?: Battlecard | null;
};

export function midiaNaoLocalizada(dataColeta: string): MidiaPlataforma {
  return { anuncia: null, n_anuncios_ativos: null, mensagens: [], data_coleta: dataColeta, status: "nao_localizado" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Construtores — garantem o envelope certo (e o "nao_encontrado" honesto).
// ─────────────────────────────────────────────────────────────────────────────

export function campoFato(
  valor: string,
  fonte_url: string | undefined,
  dataColeta: string,
  dataPublicacao?: string | null,
): Campo {
  return {
    valor,
    fonte_url,
    data_coleta: dataColeta,
    data_publicacao: dataPublicacao ?? null,
    tipo: "fato",
    status: "encontrado",
  };
}

export function campoNaoEncontrado(dataColeta: string): Campo {
  return { valor: null, data_coleta: dataColeta, tipo: "fato", status: "nao_encontrado" };
}

export function canalNaoLocalizado(): CanalAudit {
  return {
    presente: false,
    url: null,
    frequencia: null,
    recencia: null,
    tipo_conteudo: null,
    engajamento: null,
    status: "nao_localizado",
  };
}
