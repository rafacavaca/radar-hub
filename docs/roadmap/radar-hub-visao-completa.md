# Radar Hub — Visão completa e roadmap (o destino, além da F1)

> Documento de visão do Radar Hub, anexado pelo Rafael em 02/jul/2026. Cópia limpa (UTF-8) do original.

> A F1 é mínima **de propósito** (1 cliente, 1 concorrente, provar o loop). Este documento é o **mapa de para onde o produto vai** — pra o Claude Code e o Rafael não perderem a visão enquanto constroem o mínimo. **Nada aqui muda a F1.** Os pilares e telas abaixo só entram depois da F1 verde. Complementa `radar-hub-redesign-blueprint.md`.

---

## Os 5 pilares (o que o Radar observa)

1. **Concorrentes** — lançamentos, comunicados, mudanças de preço, E — pilar reforçado — **mudança de posicionamento, visual e mensagem**: o concorrente mudou a identidade? passou a comunicar diferente? ficou agressivo comercialmente? *Fonte segura:* site / landing / blog **públicos** + interpretação multimodal (o mesmo "nó Visão" do Estúdio lê o print da página pública e detecta a mudança).
2. **Clientes** (os clientes do cliente da agência) — movimentos, vagas abertas, posts, sinais de necessidade que casem com o que o cliente da agência vende.
3. **Mercado / Mídia** — tendências, eventos, feiras, temas emergentes.
4. **Decisores** (atividade de pessoas no LinkedIn) — o pilar **mais frágil e arriscado**. Por último (F5), leve, e pelo caminho legítimo (ver "De onde vêm os dados").
5. **Conhecimento interno do cliente** (o "5º pilar" do projeto original) — o roadmap da empresa, features **paradas/em desenvolvimento** que os clientes não sabem, tickets do time de CS. Cruzado com a demanda externa.

## O diferencial que os pilares reforçados criam

- **Concorrente no ângulo visual/estratégia:** ninguém entrega *"seu concorrente mudou o discurso/visual — e isso colide com seu posicionamento"*. Usa a **mesma capacidade multimodal do nó Visão do Estúdio** — os dois projetos compartilham esse motor.
- **Interno × externo (o insight mais valioso):** conectar *"o mercado está procurando X"* com *"a Moovefy começou a desenvolver X e deixou parado"*. Isso é ouro — e **ninguém consegue fazer**, porque exige o **cérebro interno** (o Brain) + o **sensor externo** (o Radar) operando juntos. É o auge do flywheel.

## Analistas por ótica (o mesmo sinal, várias lentes)

Igual ao Formare tem especialistas (Redator, Estrategista, RP…), o Radar tem **analistas por lente** — cada um lê o **mesmo sinal** por uma ótica diferente e entrega pra um time diferente, com suas **próprias regras**:

- **Analista comercial** — o que este movimento significa pro time de vendas (risco de conta, oportunidade de abordagem). Aciona o comercial.
- **Analista de produto** — o que significa pra funcionalidades/roadmap/tendências (o mercado quer X? já temos? está parado?). Aciona produto. É aqui que entra o cruzamento **interno × externo**.
- **Analista de marketing** — o que significa pro discurso/posicionamento/conteúdo. Aciona marketing.
- *(extensível — novas lentes entram sem refazer o resto.)*

Cada lente tem **regras próprias**: o que é relevante pra ela (a régua de impacto), **qual time** ela aciona e **que tipo de relatório/ação** dispara. Assim, um único movimento do concorrente vira, ao mesmo tempo, três entregas — cada uma no idioma do seu time. As lentes ativas são **configuráveis por cliente** (na tela de cadastro): nem todo cliente tem os três times.

Exemplo (RD Station lança previsão de churn):
- **Comercial** — "risco na conta Bom Gosto; fale antes que o RD chegue."
- **Produto** — "o mercado migra pra previsão de churn; vocês começaram algo parecido e parou — reativar?"
- **Marketing** — "reforce seu diferencial de aderência num conteúdo."

## Funcionalidades por fase (o roadmap)

| Fase | O que entra |
|---|---|
| **F1 (rodando)** | Loop mínimo: 1 cliente (Moovefy) + 1 concorrente (RD Station) — briefing + feed — botão "Gerar no Formare" |
| **Cadastro por cliente** | Tela onde a agência registra, no workspace do cliente, **quem monitorar** (concorrentes + clientes) — o sistema passa a varrer |
| **Ação no Formare** | Insight vira **pedido de tarefa** no OS Formare (o botão, formalizado) |
| **Pergunte ao Radar** | **Chat livre**, tipo ChatGPT, sobre tudo que o Radar sabe — com **fontes** e honesto quando sabe pouco |
| **Analistas por ótica** | Comercial / Produto / Marketing — mesmo sinal, lentes diferentes, cada uma com suas regras e time |
| **Multi-cliente** | Cadastrar cliente novo = **workspace novo** que replica a estrutura (é o design desde o início; aqui vira realidade em escala) |
| **Concorrente visual/mensagem** | Monitorar mudança de identidade/discurso via página pública + **nó Visão** (multimodal) |
| **Interno × externo** | Cruzar o 5º pilar (roadmap/features paradas/tickets do CS) com a demanda externa — oportunidades "você já tem meio-pronto" |
| **Decisores / LinkedIn** | O mais frágil — por último, leve, pelo caminho legítimo |

## De onde vêm os dados (a realidade honesta)

- **Seguro e primeiro:** páginas **públicas** (site, blog, notícias, landing), **vagas** (sites de emprego / páginas de carreira), busca web, feiras/portais do setor.
- **Screenshots:** só de páginas **públicas** (site/landing do concorrente) — legal, e ótimo pra detectar mudança visual/mensagem com o nó Visão. **Screenshot de feed logado** (LinkedIn pessoal) = mesmo risco do scraping (violar termos, perfil banido, quebra toda hora) — **evitar**.
- **Firecrawl (ou similar):** usar com **parcimônia**, só pros sites difíceis (que bloqueiam robô ou só carregam com navegador). Pras páginas conhecidas de um concorrente, **busca-direta** resolve — simples e quase de graça, sem gastar chamada. Plano grátis (~1.000/mês) sobra pra 1 cliente; multi-cliente estoura — aí paga pouco ou reserva as chamadas pros sites difíceis. **Não construir um Firecrawl próprio** (é um produto inteiro; não vale).
- **Social / LinkedIn pesado:** se virar central, o caminho legítimo é **provedor licenciado** (Meltwater, Brandwatch) ou ferramenta oficial paga (Sales Navigator) — não raspador caseiro.

## Conexões com o resto do ecossistema

- **Nó Visão (Estúdio) = monitor visual do Radar.** A mesma capacidade multimodal que interpreta referências no Estúdio detecta mudança visual/mensagem de concorrente no Radar.
- **Brain compartilhado.** O 5º pilar (conhecimento interno) é o Brain que o Formare já usa. O Radar lê o Brain pra cruzar interno × externo, e escreve intel destilado de volta (pela porta estreita, "a confirmar").
- **OS Formare = a ação.** Todo insight do Radar pode virar conteúdo/tarefa no Formare a um clique.

## O que NÃO muda na F1

A F1 segue mínima: 1 cliente, 1 concorrente, fontes públicas simples, o loop de ponta a ponta. Este mapa é o **destino**, não o próximo commit. Construir os pilares e telas novas **só depois da F1 verde** e com aprovação — um de cada vez, no mesmo modelo (você valida em cada etapa).
