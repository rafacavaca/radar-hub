/**
 * TAGAT FOODTECH — oferta + contas-chave (pilar Clientes, F1a).
 *
 * A TAGAT é uma empresa de tecnologia para a INDÚSTRIA DE ALIMENTOS/PROTEÍNA
 * (o mesmo espaço dos concorrentes que já vigiamos: Mtech, Brainr, Agrosys,
 * CAT2, Atak). No pilar Clientes, o Radar vigia as CONTAS-CHAVE da TAGAT
 * (clientes/prospects grandes) e cruza cada sinal público delas com a OFERTA da
 * TAGAT — classificando o encaixe (direto/adjacente/brecha), sem nunca descartar.
 *
 * ⚠️ ORIGEM DA OFERTA (honestidade): `offerContext` abaixo é um RASCUNHO LOCAL,
 * escrito a partir do posicionamento foodtech da TAGAT e do exemplo do spec.
 * O TITULAR é o BRAIN REAL (lido pela porta, `src/lib/brain.ts`); este texto só
 * entra como fallback rotulado quando a porta não traz fatos confirmados da TAGAT.
 * Como a oferta CLASSIFICA (não filtra), um rascunho incompleto empurra sinais
 * pra `adjacente`/`brecha` (honesto) — nunca a um falso "não tem".
 *
 * `accounts` = as contas-chave prontas pra semear (o seed as grava na watchlist
 * como entidades `pillar: "conta-chave"`, sem tocar nos 5 concorrentes da TAGAT).
 */

import type { SourceKind, SubjectProfile } from "@/lib/watchlist";

/** Uma conta-chave pronta pra semear (o seed converte em `Competitor` conta-chave). */
export type SeedAccount = {
  id: string;
  name: string;
  siteUrl?: string;
  sources: Array<{ kind: SourceKind; url: string; label?: string }>;
  profile: SubjectProfile;
};

export const TAGAT = {
  /** DEVE casar com o nome do cliente na watchlist (data/watchlist.json). */
  clientName: "TAGAT Foodtech",
  isFixture: true,

  /** F4 — buscas de MERCADO/setor pra alimentar o reforço (editável na watchlist). */
  marketQueries: [
    "rastreabilidade exportação carne frango Brasil",
    "certificação halal exportação alimentos Oriente Médio",
    "tendências foodtech indústria de alimentos Brasil",
  ],

  /**
   * Contexto de OFERTA pro analista de relacionamento — rascunho local rotulado.
   * Descreve o que a TAGAT plausivelmente oferece; deixa claras as bordas pra que
   * um sinal fora do escopo vire `brecha` (oportunidade), não um item forçado.
   */
  offerContext: `
O QUE A TAGAT OFERECE (indústria de alimentos / proteína animal)
- Software/ERP para a indústria de alimentos: gestão de produção e chão de fábrica (MES), controle de qualidade e segurança de alimentos.
- RASTREABILIDADE do lote — do recebimento da matéria-prima ao produto acabado; base para recall, auditoria e certificações.
- Gestão MULTI-PLANTA: operar e comparar várias unidades/fábricas num só sistema (indicadores, padronização de processo entre plantas).
- Compliance e documentação para AUDITORIAS e CERTIFICAÇÕES (ex.: exigências sanitárias, exportação); apoio a requisitos de mercados externos.
- Integrações com ERPs/sistemas legados e com equipamentos de fábrica (balanças, etiquetagem, sensores de linha).

PARA QUEM A TAGAT VENDE
- Frigoríficos, laticínios e indústrias de alimentos que precisam de rastreabilidade, qualidade e eficiência de produção — sobretudo operações multi-planta e/ou que exportam.

BORDAS (o núcleo da oferta hoje — o que está DENTRO e o que NÃO está)
- DENTRO: sistemas B2B de produção, qualidade e rastreabilidade para a indústria de alimentos.
- FORA do núcleo hoje: iniciativas voltadas ao CONSUMIDOR FINAL (marca de varejo, marketing e venda ao consumidor) e o DESENVOLVIMENTO do produto do cliente (P&D, novas receitas/linhas) — a TAGAT entrega o sistema, não o produto nem o canal de consumo.
- (Se o Brain real disser o contrário, o Brain manda — este é rascunho.)
`.trim(),

  accounts: [
    {
      id: "bom-gosto",
      name: "Bom Gosto",
      // ⚠️ ilustrativa (do exemplo do spec): confirmar razão social + fonte pública
      // real antes da coleta ao vivo (F1b). No F1a os sinais são seedados no smoke.
      siteUrl: undefined,
      sources: [] as SeedAccount["sources"],
      profile: {
        tipo: "Indústria de alimentos / frigorífico (conta-chave ilustrativa do spec)",
        regiao: "Brasil",
        notas:
          "Conta-chave de exemplo (spec TAGAT × Bom Gosto). Gatilhos a vigiar: nova planta, exportação, vagas, investimento, M&A, novo produto/mercado, troca de gestão. Confirmar fonte pública real (site/notícias) antes de coletar ao vivo.",
      },
    },
  ] satisfies SeedAccount[],
};
