/**
 * PROSPECTS (F1) — o dossiê on-demand que o vendedor leva pra reunião.
 *
 * PRINCÍPIO INEGOCIÁVEL — honestidade reforçada: o vendedor REPETE isto na cara
 * do cliente. Então todo campo carrega `natureza`:
 *   - "fato"          → coletado de uma fonte pública (com URL);
 *   - "inferencia"    → derivado/interpretado (marcado como tal, nunca disfarçado);
 *   - "nao_encontrado"→ o Radar não achou (dito, não inventado).
 * Uma alucinação aqui é o vendedor passando vergonha numa reunião.
 *
 * O dossiê NÃO é vigilância contínua: é efêmero (regenerável) e caro (cada
 * geração debita crédito, medido como feature `prospect_dossie`).
 */

export type Natureza = "fato" | "inferencia" | "nao_encontrado";

/** Uma linha do dossiê: um ponto + de onde veio + o que é. */
export type Ponto = {
  texto: string;
  natureza: Natureza;
  /** URL da fonte pública quando `fato`; ausente em inferência/não-encontrado. */
  fonte_url?: string;
  fonte_titulo?: string;
};

/** O registro do prospect (leve — o dossiê pesado vive à parte). */
export type ProspectStatus = "ativo" | "arquivado" | "promovido";

export type Prospect = {
  id: string;
  /** cliente do Radar (org) dono deste prospect. */
  clientName: string;
  nome: string;
  siteUrl: string;
  /** opcionais informados na entrada. */
  reuniaoEm?: string | null; // ISO — data/hora da reunião (F2)
  contato?: string | null;
  contexto?: string | null;
  status: ProspectStatus;
  criadoEm: string;
  /** quando o dossiê foi gerado pela última vez (null = ainda não). */
  dossieEm?: string | null;
};

// ── seções do dossiê (cada uma honesta e escaneável) ────────────────────────

/** Perfil da empresa (reusa a Lente 1 — posicionamento, com fonte). */
export type PerfilProspect = {
  resumo: Ponto; // o que a empresa faz (1-2 frases)
  tagline?: Ponto | null;
  posicionamento?: Ponto | null;
  produtos: Ponto[]; // soluções nomeadas
  porte?: Ponto | null; // sinais de tamanho (big numbers, clientes citados)
  paginas_lidas: string[]; // transparência: o que o Radar leu
};

/** Um concorrente do prospect (inferido de busca web — marcado como tal). */
export type ConcorrenteProspect = {
  nome: string;
  /** com quem briga / onde está forte ou fraca (1 linha). */
  nota: Ponto;
};

/** Sinal público recente do prospect (movimento com data + fonte). */
export type SinalProspect = {
  titulo: string;
  data?: string | null; // ISO quando a fonte informa
  fonte_url: string;
  fonte_titulo?: string;
  /** categoria: expansão, contratação, notícia, produto, LinkedIn… */
  tipo: string;
};

/** Como NÓS encaixamos — cruza perfil/sinais com a oferta lida do Brain. */
export type EncaixeProspect = {
  /** de onde veio a nossa oferta: Brain real, rascunho, ou nada (honestidade). */
  brain_mode: "live" | "fixture" | "none";
  /** ganchos de conversa (por que faz sentido falar com eles agora). */
  ganchos: Ponto[];
  /** dores prováveis deles que a nossa oferta endereça. */
  dores: Ponto[];
  /** ângulo de abertura sugerido (1 frase). */
  angulo?: Ponto | null;
};

/** Munição de reunião: perguntas + objeções prováveis com resposta. */
export type MunicaoProspect = {
  perguntas: Ponto[];
  objecoes: Array<{ objecao: string; resposta: string }>;
};

export type Dossie = {
  prospectId: string;
  clientName: string;
  nome: string;
  siteUrl: string;
  geradoEm: string;
  perfil: PerfilProspect;
  concorrentes: ConcorrenteProspect[];
  sinais: SinalProspect[];
  encaixe: EncaixeProspect;
  municao: MunicaoProspect;
  /** transparência da base: falhas parciais, coisas não encontradas. */
  observacoes: string[];
};

// ── helpers de honestidade ──────────────────────────────────────────────────

export function pontoFato(texto: string, fonte_url?: string, fonte_titulo?: string): Ponto {
  return { texto, natureza: "fato", fonte_url, fonte_titulo };
}
export function pontoInferencia(texto: string, fonte_url?: string, fonte_titulo?: string): Ponto {
  return { texto, natureza: "inferencia", fonte_url, fonte_titulo };
}
export function pontoNaoEncontrado(texto: string): Ponto {
  return { texto, natureza: "nao_encontrado" };
}

export const NATUREZA_LABEL: Record<Natureza, string> = {
  fato: "fato",
  inferencia: "inferência",
  nao_encontrado: "não encontrado",
};
