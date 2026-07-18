# Produto — o que é, para quem, e o vocabulário

> Legível por não-dev. O que o Radar entrega e por que as palavras dele são
> **escolhidas** (mexer nelas sem entender quebra o produto — ver [`DECISOES.md` (D13)](DECISOES.md)).

---

## O que é

O Radar Hub é um **analista de inteligência de mercado operado por IA**, para
**agências**. Para cada cliente da agência, ele:

1. **Monitora** os concorrentes, as contas-chave e o mercado (coleta sinais reais).
2. **Cruza** cada sinal com o que a agência sabe daquele cliente (a **base de conhecimento**).
3. **Entrega uma recomendação pronta para agir** — sinal + *por que importa* (ancorado
   na base, com fonte) + *ação sugerida*. Não um alerta cru; uma decisão.

É a **metade sensorial** de um organismo cujo braço executor é o **OS Formare**:

> **Radar sente → a base de conhecimento lembra → Formare age.**

**Para quem.** O usuário é um **vendedor / estrategista de agência** — não um
analista de dados. Ele abre o Radar para saber *"o que mudou no mercado do meu
cliente e o que eu faço com isso hoje"*, e leva a resposta para uma reunião. Por
isso a régua de produto é **honestidade + priorização brutal** (ver [`PRINCIPIOS.md`](PRINCIPIOS.md)).

## O conceito, em uma frase

**As bases** (o que a agência sabe de cada cliente) **× os sinais** (o que se move
no mercado) **= recomendações** (o que fazer). O valor não é coletar muito; é
**cruzar** e **filtrar** para caber "1 recomendação excelente por dia".

---

## O glossário — e por que ele é INTENCIONAL

O vocabulário foi **traduzido do jargão técnico para a língua do gestor**. Um dev
que "corrige" um desses de volta ao termo antigo quebra a experiência de venda.
Estes rótulos são, além disso, **renomeáveis por cada agência** (a implantação —
ver [`IMPLANTACAO.md`](IMPLANTACAO.md) e [`DECISOES.md` (D13)](DECISOES.md)).

| Termo no produto | O que é | Substituiu (ABOLIDO) |
|---|---|---|
| **Área** | uma das 3 óticas que leem cada sinal (comercial · produto · marketing) | ~~lente~~ |
| **Prioridade** | o peso de um sinal (Alta · Média · Baixa), pela régua da agência | ~~impacto~~ / ~~score~~ cru |
| **Base de conhecimento** | o que o Radar/a agência sabe do cliente | ~~Brain~~ |
| **Oportunidade** | um gancho acionável num sinal | ~~gatilho~~ |
| **Monitorar** | acompanhar um concorrente/conta | ~~vigiar~~ |
| **Concorrentes** · **Contas-chave** | quem a agência observa (dois pilares) | — |
| **Recomendações** | a correlação sinal × oferta virada em jogada | ~~correlação~~ |
| **Aderência** · **Preparação** | encaixe com a oferta · munição para a reunião | ~~encaixe~~ · ~~munição~~ |

Também **abolido** como conceito de UI: ~~flywheel~~ (é a tese interna, não um rótulo
de tela). O mapa completo do rename vive em `docs/design/vocabulario-executivo.md`.

> **Regra:** os textos de **prosa** (tooltips, explicações) podem usar a palavra
> natural; os **rótulos** (títulos, contagens, labels, eyebrows) resolvem pelo
> vocabulário da agência via `<Rotulo>` / `useRotulo`. As limitações conhecidas
> disso (gênero, singular de custom, plural de "oportunidade") estão em
> [`DECISOES.md` (D13)](DECISOES.md) — **não são bugs.**

---

## O fluxo das telas

A unidade primária é o **cliente** (a sidebar lista os clientes da agência). Cada
cliente abre um conjunto de telas. Há dois modos: **concorrentes** (padrão) e
**carteira** (sales-enablement — a Ficha no lugar de Visão/Briefing).

| Tela | Pergunta que responde |
|---|---|
| **Hoje** | "o que eu faço agora?" — o ritual diário: alertas, oportunidades, relacionamento, leituras, relatórios do dia (com Atuado/Ignorado/Adiado) |
| **Briefing** | "os sinais que importam" — já com a leitura por área e a ação sugerida |
| **Feed** | "tudo que o Radar coletou" — os sinais crus, sem análise |
| **Concorrentes** | monitorar + identidade (rebranding) + diagnóstico de marca por concorrente |
| **Contas** | as contas-chave — o que se move nelas e o que oferecer |
| **Prospects** | preparar uma reunião — dossiê completo de uma empresa a visitar (com PDF fiel, ritual pré-reunião) |
| **Conhecimento** | "pergunte qualquer coisa sobre este cliente" — Q&A com fonte e data |
| **Relatórios** | montar/exportar relatórios com gráficos, prontos para reunião |
| **Áreas** | ver e afinar como cada área (comercial/produto/marketing) pensa |
| **Implantação** *(Administração)* | o **registro do critério da agência** (os 12 parâmetros) — super_admin edita, agência vê |

Administração (super_admin): **Agências**, **Custo**, **Automações**, **Implantação**.

---

## O que o Radar NÃO é

- **Não** é um agregador de notícias (entrega decisão, não volume).
- **Não** é "bola de cristal" — o claim é **alerta precoce + ligar os pontos**, honesto.
- **Não** é dependente do LinkedIn/decisores (a fonte mais frágil — fica para o fim).
- **Não** é um segundo cérebro que diverge do Formare — ele **lê** a mesma base e
  **escreve de volta como rascunho a confirmar**.
