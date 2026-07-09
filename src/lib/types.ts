/**
 * Tipos centrais do Radar Hub.
 *
 * RawEvent      = um sinal cru coletado de uma fonte externa (ex.: um post do
 *                 blog de um concorrente). Vive no banco PRÓPRIO do Radar.
 * IntelligenceItem = o sinal já raciocinado pelo analista, pronto pra decisão.
 *                 É isso que vira briefing/feed e, com aprovação, demanda no Formare.
 */

export type SignalKind = "blog" | "news" | "page" | "release" | "material" | "market";

/** Um sinal cru, como coletado — sem raciocínio ainda. */
export type RawEvent = {
  /** id estável (hash da url) — serve pra deduplicar entre coletas. */
  id: string;
  /** id do concorrente na watchlist de onde o sinal veio (ex.: "rd-station"). */
  source: string;
  /** nome do concorrente, pra exibir e pro analista citar (ex.: "RD Station"). */
  competitorName: string;
  kind: SignalKind;
  url: string;
  title: string;
  description?: string;
  /** categoria derivada do caminho da url (ex.: "marketing", "vendas"). */
  category?: string;
  /** data de publicação, se conhecida (ISO). */
  publishedAt?: string | null;
  /** quando o Radar coletou (ISO). */
  collectedAt: string;
  /** trecho inicial do conteúdo (para o analista ter contexto sem o texto todo). */
  excerpt?: string;
};

/** Fonte citável de um item de inteligência. */
export type Fonte = {
  url: string;
  titulo: string;
};

/**
 * LEITURA DE LENTE (F6): o mesmo sinal lido por UM analista-lente (comercial,
 * produto ou marketing), no idioma do time dele. 1 sinal -> 0..3 leituras.
 */
export type LensReading = {
  id: string;
  clientName: string;
  /** qual lente produziu ("comercial" | "produto" | "marketing"). */
  lens: "comercial" | "produto" | "marketing";
  /** o que aconteceu (1 frase objetiva). */
  sinal: string;
  /** a leitura NO IDIOMA DO TIME (risco/oportunidade, roadmap, discurso…). */
  leitura: string;
  /** ação recomendada no formato da lente. */
  acao: string;
  /** SÓ comercial: a conta/cliente afetado, quando identificável. */
  contaAfetada?: string;
  /** impacto pra ESTE time (0-100). */
  score: number;
  fonte: Fonte;
  concorrente?: string;
  eventIds: string[];
  /** data de PUBLICAÇÃO da fonte (do evento) — datas são cidadãs de 1ª classe. */
  publishedAt?: string | null;
  /** quando o Radar COLETOU o sinal (do evento). */
  collectedAt?: string;
  createdAt: string;
};

/**
 * O item de inteligência: um sinal já cruzado com o Brain do cliente e
 * transformado em decisão. Este é o "produto" do Radar.
 */
export type IntelligenceItem = {
  id: string;
  /** cliente do Radar a quem este item interessa (ex.: "Moovefy"). */
  clientName: string;
  /** o que aconteceu (o movimento do concorrente, resumido). */
  sinal: string;
  /** por que importa PRA ESTE cliente — ancorado no Brain, citando o que se sabe dele. */
  porQueImporta: string;
  /** ação recomendada, concreta. */
  acao: string;
  /** de onde veio o sinal. */
  fonte: Fonte;
  /** nome do concorrente que fez o movimento (com multi-concorrente, situa o leitor). */
  concorrente?: string;
  /** impacto estimado em VOCÊ (0-100), não popularidade. */
  score: number;
  /** trechos/fatos do Brain que ancoraram o raciocínio (pra explicabilidade). */
  brainRefs?: string[];
  /** de qual(is) RawEvent este item nasceu. */
  eventIds?: string[];
  /** data de PUBLICAÇÃO da fonte (do evento). */
  publishedAt?: string | null;
  /** quando o Radar COLETOU o sinal (do evento). */
  collectedAt?: string;
  /** F6: quais lentes leram este sinal (o item Geral agrega as leituras). */
  lentes?: Array<"comercial" | "produto" | "marketing">;
  createdAt: string;
};

/**
 * LEITURA DE VENDA (2º template — modo "carteira"): um sinal PÚBLICO de um
 * hospital-cliente lido pela lente "vendedor", casado com uma LINHA de produto
 * do cliente do Radar. É o "produto" do Radar no modo carteira — a ficha por
 * hospital e o feed de gatilhos consomem isto. 1 sinal -> 0..N leituras.
 */
export type SalesReading = {
  id: string;
  clientName: string;
  /** o sinal (o que aconteceu no hospital, 1 frase). */
  sinal: string;
  /** o hospital (subject) de onde o sinal veio. */
  hospital: string;
  /** a linha de produto do cliente que o sinal aciona (ex.: "Coronária"). */
  linha: string;
  /** o gatilho de compra — por que isto é oportunidade agora. */
  gatilho: string;
  /** o ângulo de abordagem / objeção a preparar. */
  angulo: string;
  /** valor/urgência da oportunidade pro vendedor (0-100). */
  score: number;
  fonte: Fonte;
  /** de qual(is) RawEvent este item nasceu. */
  eventIds: string[];
  /** data de PUBLICAÇÃO da fonte (do evento). */
  publishedAt?: string | null;
  /** quando o Radar COLETOU o sinal (do evento). */
  collectedAt?: string;
  createdAt: string;
};

/**
 * O ENCAIXE de uma jogada de relacionamento — a OFERTA é CLASSIFICAÇÃO, não portão:
 *  - "direto"    → a empresa TEM oferta que atende o gatilho (jogada pronta);
 *  - "adjacente" → tem algo PERTO (esticar) OU há dúvida ("possível encaixe — confirmar no Brain");
 *  - "brecha"    → white space: ninguém atende ainda (oportunidade estratégica, NÃO se descarta).
 * Nenhum sinal com gatilho real é jogado fora — todos caem num dos três.
 */
export type Encaixe = "direto" | "adjacente" | "brecha";

/**
 * JOGADA DE RELACIONAMENTO (pilar Clientes): um sinal PÚBLICO de uma CONTA-CHAVE
 * (o cliente do cliente do Radar) cruzado com a OFERTA da empresa (do Brain).
 * O analista classifica o encaixe e SEMPRE registra — a ficha da conta consome isto.
 * 1 sinal -> 0..N jogadas. É o "produto" do Radar no pilar Clientes.
 */
export type RelationshipPlay = {
  id: string;
  /** cliente do Radar dono do pilar (ex.: "TAGAT Foodtech"). */
  clientName: string;
  /** a conta-chave (subject) de onde o sinal veio — derivada do evento, nunca do LLM. */
  conta: string;
  /** o sinal (o que a conta fez, 1 frase). */
  sinal: string;
  /** o gatilho — a necessidade nova que o sinal revela. */
  gatilho: string;
  /** o encaixe com a oferta da empresa (classificação, não portão). */
  encaixe: Encaixe;
  /** por que este encaixe — ancorado e honesto (na dúvida, "confirmar no Brain"). */
  justificativa: string;
  /** a ação recomendada: a jogada (direto/adjacente) ou a munição estratégica (brecha). */
  acao: string;
  /** o fato de OFERTA (do Brain) que ancorou direto/adjacente. VAZIO em brecha. */
  brainRef?: string;
  /**
   * F2 — URGÊNCIA (concorrente): um concorrente vigiado mirando a mesma brecha.
   * Ancorado num sinal REAL de concorrente (nunca inventado). Omitido se não há.
   */
  urgencia?: string;
  /** nome do concorrente do sinal que ancorou a urgência (do evento, não do LLM). */
  urgenciaConcorrente?: string;
  /** fonte do sinal do concorrente (do evento real). */
  urgenciaFonte?: Fonte;
  /**
   * F2 — REFORÇO (mercado): tendência do setor que valida a jogada. Derivada do
   * Brain + dos sinais visíveis; omitida se não houver evidência (nunca inventada).
   */
  reforco?: string;
  /** F4 — fonte do reforço quando ancorado num SINAL DE MERCADO coletado (não inventada). */
  reforcoFonte?: Fonte;
  /** valor/urgência da jogada pra empresa (0-100). */
  score: number;
  /** de onde veio o sinal (do evento real — nunca inventada). */
  fonte: Fonte;
  /** de qual(is) RawEvent este item nasceu. */
  eventIds: string[];
  /** data de PUBLICAÇÃO da fonte (do evento). */
  publishedAt?: string | null;
  /** quando o Radar COLETOU o sinal (do evento). */
  collectedAt?: string;
  createdAt: string;
};
