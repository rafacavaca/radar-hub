# Radar Hub — Visão (destilada)

> Destilação fiel dos dois documentos-fonte do Rafael: **`radar-hub-redesign-blueprint.md`** (o quê) e **`radar-hub-kickoff-desenvolvimento.md`** (como começar). Em caso de conflito, os documentos originais mandam.

## A tese

- O Radar Hub é a **metade sensorial** de um organismo que o Rafael já está construindo. O OS Formare é a metade que **age**.
- **Flywheel:** **Radar sente → Brain lembra → Formare age.** O Radar percebe um movimento de concorrente, escreve no Brain do cliente, e o Formare vira post / argumento no mesmo dia.
- O **"5º Pilar — Base de Conhecimento"** do projeto original **já existe**: é o Brain do OS Formare. Metade do Radar já está pronta.
- O que envelheceu (do projeto de 2023): a engine de correlação por embeddings + cosseno + threshold. Hoje um **LLM raciocina** sobre eventos + Brain e explica **por que importa, pra quem, e o que fazer**. A vetorização vira **busca**, não juiz.
- O gargalo mudou: em 2023 era a IA; **hoje é o dado** (coletar sinal limpo, fresco e legal).

## Princípios

1. **Módulo, não SaaS standalone.** Compartilha o Brain com o Formare (moat máximo).
2. **Entrega é decisão, não notificação.** Cada item: sinal → por que importa (ancorado no Brain) → ação recomendada → rascunho a um clique (via Formare).
3. **Filtro por impacto em VOCÊ, não por popularidade.** Só sobe o que toca seus clientes/deals/posicionamento.
4. **Honestidade no claim.** Alerta precoce + ligar os pontos — não "bola de cristal".
5. **Priorização brutal.** 1 insight excelente/dia > 20 mornos. Fadiga de alerta mata o produto.
6. **Dois surfaces + Q&A:** briefing diário (ritual) + feed contínuo (liberdade) + "Pergunte ao Radar" + alertas urgentes (a exceção que interrompe).

## O ciclo de um sinal

1. **Coleta** — um coletor capta um evento (ex.: concorrente publicou novo módulo).
2. **Compreensão** — um LLM resume + classifica + extrai (o quê, quem, quando).
3. **Cruzamento com o Brain** — o analista busca o que a empresa sabe do cliente e raciocina sobre o impacto.
4. **Pontuação de impacto** — relevância/urgência **em relação a você**. Abaixo da régua, não sobe.
5. **Vira item de decisão** — sinal + por que importa + ação + rascunho a um clique.
6. **Loop** — o confirmado realimenta o Brain (o flywheel).

## Fontes (por viabilidade)

- **Sólidas (entram primeiro):** notícias/comunicados/páginas de solução de concorrentes; menções e tendências de mercado (busca web); páginas de notícias dos clientes; feiras/portais do setor.
- **Frágil (depois, com cautela):** monitoramento granular de decisores no LinkedIn (ToS + anti-scraping). **Não** deixar o MVP depender disso.

## Faseamento

| Fase | Entrega |
|---|---|
| **F1 — Loop mínimo** | 1 cliente + 1 concorrente + Brain → analista → briefing + feed |
| **F2 — Ação acoplada** | Botão em cada item → dispara demanda no Formare |
| **F3 — Pergunte ao Radar + urgentes** | Q&A com fontes + alertas que furam a fila |
| **F4 — Mais pilares/fontes** | Clientes, mercado/mídia; mais concorrentes |
| **F5 — Decisores** | A fonte mais frágil, só depois de tudo provado |

## F1 em detalhe (a fatia que estamos construindo)

**Moovefy** (cliente) + **RD Station** (concorrente) + o Brain da Moovefy. Loop completo:
coletar movimentos do RD → analista cruza com o Brain → pontua impacto → briefing + feed → "Pergunte ao Radar" → (1 clique) demanda no Formare.

**Critérios de aceite** e a verificação automática estão em `CLAUDE.md` e no smoke `scripts/test-radar-f1.mts`.

## Riscos

1. **Dado (crítico, externo):** coleta confiável e legal. Mitigar: fontes sólidas primeiro; decisores só na F5.
2. **Ruído / fadiga de alerta:** mata o produto. Mitigar: priorização brutal + régua de impacto-em-você.
3. **Overpromise de "previsão":** mitigar com o claim honesto.
4. **Qualidade do Brain:** o raciocínio é tão bom quanto o Brain.
5. **Confiança/explicabilidade:** todo insight cita a fonte e mostra o raciocínio.

## Relação com o OS Formare

- **Brain compartilhado.** O Radar **escreve** (novo intel → nós de conhecimento, sempre pendentes/draft); o Formare **lê** pra produzir.
- **Arquitetura reaproveitada:** orquestração agêntica (analista → especialistas → priorizador), "decisão é a ação principal", "Pergunte ao Brain/Radar", tabela de concorrentes — tudo já existe ou está em spec no Formare.
- **Fronteira de escrita = curadoria:** o Radar grava só pela porta estreita → cai na aba *Revisar* do Formare → o Rafael confirma → vira conhecimento. Radar é "só mais uma fonte".
