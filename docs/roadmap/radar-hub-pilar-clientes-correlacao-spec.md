# Radar Hub — Pilar "Clientes" + motor de correlação (spec)

> Resgata a alma original do Radar: não só monitorar o concorrente, mas **cruzar os pilares** (Cliente × Brain × Concorrente × Mercado) e transformar isso em **jogadas de relacionamento**. Segmento: o tech B2B já estável (Moovefy/TAGAT). Base: `docs/vision.md` e o blueprint de redesign.

## Decisões do Rafael

- **Saída:** uma **ficha por cliente-monitorado** (visão tipo conta de CRM).
- **Escopo:** apenas **contas-chave** (curado — baixo ruído e custo).
- **A oferta é classificação, não portão** (ver seção própria abaixo — mudança que rege o F1a).

## O que é

No workspace de um cliente da agência (ex.: TAGAT), além do pilar **Concorrentes** (já existe), entra o pilar **Clientes**: as **contas-chave** que a TAGAT quer cuidar. O Radar vigia os movimentos dessas contas e — cruzando com o que a TAGAT oferece (Brain), o que o concorrente faz e o que o mercado diz — entrega, na ficha de cada conta, **jogadas de relacionamento** prontas.

## O pilar Clientes

- **Watchlist de contas-chave** (como o Vigiar dos concorrentes, mas pros clientes do cliente). Curado — o Rafael/gestor escolhe as contas que valem.
- **Sinais a vigiar (os gatilhos de cliente):** expansão (nova planta/indústria/região) · **exportação** · contratação (vagas → crescimento) · investimento/captação · aquisição/fusão · novo produto/mercado · troca de gestão.
- **Fontes (reuso do motor):** site/notícias/vagas/LinkedIn/redes da conta. Empresa **anuncia** expansão e exportação — sinal público e rico.
- **Coexistência:** um mesmo workspace (TAGAT) tem os DOIS pilares ao mesmo tempo. Por isso o pilar é uma etiqueta **por entidade** (`concorrente` | `conta-chave`), não do cliente inteiro. O modo `carteira` (Gemmini) fica intacto.

## A oferta é classificação, não portão (a regra que rege o F1a)

O ingrediente "oferta" **não filtra/descarta** o insight. Monitorar o cliente da TAGAT tem valor **independente do catálogo atual** da TAGAT. Em vez de *"sem oferta no Brain → descarta"*, o analista de relacionamento **classifica** cada sinal do cliente em um de **três encaixes** e **sempre registra** o insight na ficha da conta:

- **`direto`** — a TAGAT tem oferta que atende → **jogada de relacionamento** (com "Gerar no Formare").
- **`adjacente`** — a TAGAT tem algo perto → **ângulo pra esticar** o que existe. (Também é aqui que mora o *"possível encaixe — confirmar no Brain"* quando há dúvida.)
- **`brecha`** (white space) — ninguém atende ainda → rotula como **oportunidade estratégica** (munição pra produto/liderança), **NÃO descarta**.

**Duas razões:**
1. O Brain da TAGAT pode estar **incompleto** — se logar "não tem oferta", pode ser **falso-negativo**. Quando não tiver certeza se a TAGAT oferece algo, o insight diz *"possível encaixe — confirmar no Brain"*, **nunca crava "não tem"**.
2. A **brecha** costuma ser o insight **mais valioso** — o caminho novo que a TAGAT poderia seguir.

**Contrato do analista (F1a):** `analyst-relacionamento.ts` recebe **(sinal da conta + contexto de oferta da TAGAT)** e devolve, por sinal:

```
{ sinal, gatilho, encaixe: 'direto'|'adjacente'|'brecha', justificativa, acao, brainRef?, score, fonte }
```

- **Sempre com fonte citada** (a do evento real — nunca inventada).
- `brainRef` = o fato de oferta (do Brain/contexto) que ancorou `direto`/`adjacente`; **vazio em `brecha`** (por construção — não há oferta que ancore).
- **Nunca descarta** um sinal que revela um gatilho real: classifica nos três.

## O motor de correlação (o coração)

Quando um sinal de conta aparece, o analista **"relacionamento"** roda a **receita de ingredientes**:

1. **Gatilho no cliente** → a necessidade nova. *(Bom Gosto abriu planta no Nordeste e começou a exportar.)*
2. **Oferta (Brain)** → o que a TAGAT tem que atende → define o **encaixe** (direto/adjacente/brecha).
3. **Urgência (Concorrente)** → alguém de olho na mesma brecha? *(Mtech lançou compliance de exportação.)* — **F2**
4. **Reforço (Mercado)** → a tendência que valida. *(Demanda halal subindo.)* — **F2**

→ **Jogada de relacionamento** (ou oportunidade estratégica, se brecha), com botão **"Gerar no Formare"**.

**Honestidade por construção:** cada ingrediente **cita a fonte** que o alimentou; ingrediente **ausente é omitido**, não inventado. A jogada é ancorada no **Brain** — se o Brain não tem oferta que case, o analista **classifica como brecha/adjacente e diz**, em vez de forçar `direto`.

## A saída: ficha por cliente-monitorado (F1b)

Visão tipo conta de CRM, por conta-chave: cabeçalho (perfil + última varredura) · últimos sinais (com data de coleta + publicação) · **jogadas de relacionamento** (gatilho → encaixe → justificativa → ação, com "Gerar no Formare") · status/histórico. Roll-up "contas que pedem ação" é F3.

## Reuso vs. novo

- **Reusa:** motor de coleta/descoberta (apontado pras contas-chave), gateway/analista, chat "Pergunte", flywheel, datas/recência, o molde dos analistas-irmãos (`cross-reference`, `analyst-vendedor`).
- **Novo:** o **pilar por entidade** (`conta-chave`), o **analista de relacionamento** (`analyst-relacionamento.ts`, com encaixe), e a **ficha por conta**.

## Verificação (smoke — `npm run smoke:clientes`)

- Dado um sinal seedado de uma conta-chave com **encaixe direto**, o analista produz uma **jogada** (com brainRef + ação + fonte).
- Dado um sinal de **brecha** (white space), o insight **aparece rotulado como oportunidade** — **não some**.
- Todo insight **cita a fonte** e a **conta vem do evento** (nunca do LLM).
- Regressão: o pilar Concorrentes (Moovefy/TAGAT) continua funcionando; o modo carteira (Gemmini) intacto.

## Guardrails

- **Só contas-chave** (curado) — controla ruído e custo. **Só fontes públicas.** **Datas em todo sinal.**
- **Correlação honesta:** classifica, não filtra; ingrediente ausente é omitido; jogada ancorada no Brain; fontes citadas.
- Tudo **dentro do Radar**. Oferta lida do Brain **só por leitura**. **Nada muda no Formare** — "Gerar no Formare" reusa o caminho existente e barrado.

## Faseamento

- **F1a (motor + juiz, sem tela):** pillar por entidade + `analyst-relacionamento` (gatilho × encaixe) + loop despacha conta-chave + oferta TAGAT (Brain/fixture rotulado) + seed Bom Gosto + `smoke:clientes` (prova `direto` E `brecha`).
- **F1b (tela):** ficha por conta + "adicionar conta-chave" no `/vigiar` + "Gerar no Formare".
- **F2:** somar os ingredientes **concorrente + mercado** à jogada (a correlação completa dos 4 pilares).
- **F3:** roll-up "contas que pedem ação" + agendar/relatório por conta.
