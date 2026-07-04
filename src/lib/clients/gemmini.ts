/**
 * CARTEIRA GEMMINI BAURU — o 2º template do Radar (modo "carteira" / sales-enablement).
 *
 * A Gemmini é uma distribuidora médico-cirúrgica: o Radar NÃO vigia concorrentes
 * dela, e sim a CARTEIRA de hospitais-clientes, casando cada sinal com as 5 LINHAS
 * de produto da Gemmini. Este módulo é a fonte única do seed:
 *  - `brainContext`  — as 5 linhas + a matriz hospital↔linha, em texto, pro analista
 *    "vendedor" (entra pelo fallback do Brain, `src/lib/brain.ts`, quando não há
 *    conhecimento confirmado na porta — que é o caso da Gemmini hoje).
 *  - `hospitals`     — os 3 subjects reais (perfil + fonte pública de notícias), que
 *    `scripts/seed-gemmini.mts` grava na watchlist.
 *
 * Só fonte PÚBLICA (sites oficiais dos hospitais). Datas em 1º plano, honesto por
 * construção — herda do Radar.
 */

import type { SourceKind, SubjectProfile } from "@/lib/watchlist";

/** As 5 linhas de produto da Gemmini (a chave que casa hospital ↔ oportunidade). */
export const GEMMINI_LINES = [
  "Cirurgia Geral",
  "Coronária",
  "Material Hospitalar",
  "Ortopedia e Trauma",
  "Urologia",
] as const;

/** Um hospital-subject pronto pra semear (o seed converte em `Competitor`). */
export type SeedSubject = {
  id: string;
  name: string;
  siteUrl: string;
  sources: Array<{ kind: SourceKind; url: string; label?: string }>;
  profile: SubjectProfile;
};

export const GEMMINI = {
  /** DEVE casar com o nome do cliente na watchlist (data/watchlist.json). */
  clientName: "Gemmini Distribuidora",
  isFixture: true,
  lines: GEMMINI_LINES,

  hospitals: [
    {
      id: "hc-bauru",
      name: "HC Bauru",
      siteUrl: "https://hcbauru.faepa.br/",
      sources: [
        { kind: "noticias", url: "https://hcbauru.faepa.br/noticias/", label: "Notícias HC Bauru" },
      ],
      profile: {
        tipo: "Público / ensino (SUS), gestão FAEPA — ~170 leitos, centro cirúrgico, multi-especialidade",
        modoCompra: "licitacao",
        regiao: "Bauru/SP (DRS-6)",
        fitPorLinha: {
          "Cirurgia Geral": "forte",
          "Material Hospitalar": "forte",
          "Coronária": "confirmar",
          "Ortopedia e Trauma": "confirmar",
          "Urologia": "confirmar",
        },
        notas:
          "Gatilho nº1 = edital de licitação (BEC-SP/PNCP). Especialidades adicionais a confirmar via CNES.",
      },
    },
    {
      id: "beneficencia-bauru",
      name: "Beneficência Portuguesa de Bauru",
      siteUrl: "https://www.benebauru.com.br/",
      sources: [
        {
          kind: "noticias",
          url: "https://www.benebauru.com.br/site/conteudo/noticias",
          label: "Notícias Beneficência",
        },
      ],
      profile: {
        tipo: "Privado / filantrópico — convênios + particular. Centro cirúrgico, UTI, hemodinâmica, PA",
        modoCompra: "relacionamento",
        regiao: "Bauru/SP",
        fitPorLinha: {
          "Cirurgia Geral": "sim",
          "Material Hospitalar": "sim",
          "Coronária": "sim",
          "Ortopedia e Trauma": "sim",
          "Urologia": "sim",
        },
        notas:
          "Prime target — encaixa nas 5 linhas (hemodinâmica→Coronária). Gatilhos: investimento/novo equipamento, ampliação de hemodinâmica/ortopedia, vaga de cirurgião.",
      },
    },
    {
      id: "unimed-bauru",
      name: "Unimed Bauru",
      siteUrl: "https://www.unimedbauru.com.br/",
      sources: [
        {
          kind: "noticias",
          url: "https://www.unimedbauru.com.br/noticias",
          label: "Notícias Unimed Bauru",
        },
      ],
      profile: {
        tipo: "Operadora de plano de saúde (cooperativa) + Hospital Unimed Bauru (HUB) próprio",
        modoCompra: "operadora",
        regiao: "Bauru/SP",
        fitPorLinha: {
          "Cirurgia Geral": "sim",
          "Material Hospitalar": "sim",
          "Coronária": "sim",
          "Ortopedia e Trauma": "sim",
          "Urologia": "sim",
        },
        notas:
          "Papel duplo: cliente (o HUB compra OPME/equipamento) + payer (a cobertura/OPME da operadora afeta a demanda de toda a rede de Bauru). Gatilhos: mudança de cobertura, investimento no HUB, sinal financeiro.",
      },
    },
  ] satisfies SeedSubject[],

  /** Contexto textual pro analista "vendedor" — as 5 linhas + a matriz. */
  brainContext: `
O QUE A GEMMINI DISTRIBUIDORA FAZ
- Distribuidora de produtos médicos, cirúrgicos e hospitalares (Bauru/SP). Vende POR REGIÃO (carteira por cidade), não por linha.
- 5 LINHAS DE PRODUTO (a chave para casar hospital ↔ oportunidade):
  1. Cirurgia Geral
  2. Coronária (OPME/implante — hemodinâmica)
  3. Material Hospitalar
  4. Ortopedia e Traumatologia (OPME/implante)
  5. Urologia (OPME/implante)
- Coronária, Ortopedia e Urologia são OPME/implante → cobertura ANS + registro ANVISA são decisivos.

A CARTEIRA (região de Bauru) E O FIT POR LINHA
- HC Bauru (público/ensino SUS, gestão FAEPA): compra por LICITAÇÃO. Forte em Cirurgia Geral + Material Hospitalar; Coronária/Ortopedia/Urologia a confirmar via CNES. Gatilho nº1 = edital aberto.
- Beneficência Portuguesa de Bauru (privado/filantrópico, convênios): compra por RELACIONAMENTO/REEMBOLSO. Encaixa nas 5 linhas (tem hemodinâmica→Coronária, Ortopedia, Urologia, Centro Cirúrgico). Prime target.
- Unimed Bauru (operadora + Hospital Unimed próprio, HUB): papel DUPLO — cliente (o HUB compra OPME/equipamento) E payer (a cobertura/OPME da operadora afeta a demanda de TODA a rede de Bauru).

GATILHOS DE COMPRA POR MODO
- Licitação (HC): edital aberto de material/equipamento; novo serviço/leitos.
- Relacionamento (Beneficência): notícia de investimento; novo serviço; ampliação de hemodinâmica/ortopedia; vaga de cirurgião.
- Operadora (Unimed): mudança de cobertura/OPME; investimento no hospital próprio; sinal financeiro da operadora.
- Transversal (OPME): recall ANVISA de dispositivo concorrente; mudança no rol da ANS.

ÂNGULOS / OBJEÇÕES (o que preparar): registro ANVISA do dispositivo; cobertura do plano para a OPME; prazo/assistência técnica.
`.trim(),
};
