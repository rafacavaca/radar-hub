/**
 * Tipos centrais do Radar Hub.
 *
 * RawEvent      = um sinal cru coletado de uma fonte externa (ex.: um post do
 *                 blog de um concorrente). Vive no banco PRÓPRIO do Radar.
 * IntelligenceItem = o sinal já raciocinado pelo analista, pronto pra decisão.
 *                 É isso que vira briefing/feed e, com aprovação, demanda no Formare.
 */

export type SignalKind = "blog" | "news" | "page" | "release" | "material";

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
  /** F6: quais lentes leram este sinal (o item Geral agrega as leituras). */
  lentes?: Array<"comercial" | "produto" | "marketing">;
  createdAt: string;
};
