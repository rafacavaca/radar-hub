/**
 * FIXTURE DE TESTE — conhecimento da Moovefy (o cliente do F1).
 *
 * Substituto PROVISÓRIO do Brain real, escrito a partir da descrição do Rafael,
 * pra o analista raciocinar ancorado em contexto REAL enquanto a "porta estreita"
 * de leitura do Brain do Formare ainda não existe. Quando a porta estiver pronta
 * e aprovada, isto é trocado pela leitura do Brain de verdade.
 *
 * (`isFixture: true` deixa explícito que é dado de teste, não o Brain real.)
 */

export const MOOVEFY = {
  clientName: "Moovefy",
  isFixture: true,
  /** Contexto do cliente, em texto, pra ancorar o raciocínio do analista. */
  brainContext: `
O QUE A MOOVEFY FAZ
- Empresa de tecnologia B2B: automação comercial/CRM, força de vendas (SFA), e-procurement (E-Proc) e desenvolvimento de software web/mobile sob medida.
- CRM/SFA: plataforma de automação de vendas — relacionamento com clientes, pipeline, tarefas, oportunidades e força de vendas, com dashboards, relatórios e BI em tempo real.
- E-Procurement (E-Proc): organiza o fluxo de compras, dá rastreabilidade e padroniza o processo de suprimentos.
- Software sob medida: web e mobile personalizados — catálogos de produtos, plataformas de pedidos B2B e integrações com ERPs e sistemas legados.

PARA QUEM A MOOVEFY VENDE
- Empresas B2B que precisam organizar processo comercial e força de vendas: indústrias, distribuidores, atacadistas, representantes comerciais.
- Organizações que geram muitos leads e precisam de um CRM robusto e customizável (além dos genéricos de mercado).
- Empresas que querem automatizar compras (suprimentos) via e-procurement e integrar canais de venda/compra com ERPs e sistemas legados.

DIFERENCIAL E POSICIONAMENTO
- "Soluções tecnológicas adaptadas ao seu negócio": forte ênfase em customização — ajusta CRM, B2B, SFA e E-Proc aos processos do cliente, em vez de impor um fluxo padrão.
- Visão B2B ponta a ponta: da força de vendas até suprimentos, sempre apoiada por dados (dashboards, BI) para decisão gerencial.
- Proximidade e suporte humanizado, equipe multidisciplinar, métodos ágeis e projetos sob medida — posiciona-se como "parceiro de transformação digital", não apenas fornecedor de software pronto.
`.trim(),
};
