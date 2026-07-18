# Implantação — os 12 parâmetros

> A **implantação** é o ato consultivo que define **como o Radar pensa para uma
> agência**. O resultado é um **registro org-level** (a tela `/implantacao`):
> editável só pelo **super_admin**, **read-only** para a agência (é um ativo de
> venda). Cada parâmetro começa **pendente** até ser revisado — nunca um default
> silencioso. Ver [`DECISOES.md` (D6)](DECISOES.md) e [`PRINCIPIOS.md` (§4)](PRINCIPIOS.md).

**São 12 parâmetros** (não 13 — o antigo "corte de ruído"/severidade foi **fundido**
em `regua_prioridade`). A lista canônica está em `src/lib/parametrizacao.ts` (`PARAM_IDS`).

Dois níveis:
- **Critério da agência** (org-level, vale para todas as contas): régua das áreas ·
  prioridade · cadência · destinatários · alertas · rótulos.
- **Quem observamos** (por conta): concorrentes · contas-chave · base de conhecimento ·
  áreas ativas · fontes e temas.

---

## Nível 1 — Critério da agência (org-level)

| # | Parâmetro (`id`) | O que faz | Onde vive (store) | Quem edita | O que muda no comportamento |
|---|---|---|---|---|---|
| 7 | **Régua das áreas** (`regras_area`) | o texto que diz, por área, **o que faz um sinal subir** | `org_docs` kind `lens-regua` (org-level) | super_admin (tela Áreas) | o analista de cada área lê essa régua para decidir relevância |
| 8 | **Régua de prioridade** (`regua_prioridade`) | os **cortes** que viram score em palavra: Alta ≥ X, Média ≥ Y (inclui o antigo corte de ruído) | `org_docs` kind `prioridade-regua` | super_admin (editor na Implantação) | todo selo de prioridade na interface usa esses cortes |
| 9 | **Cadência** (`cadencia`) | com que frequência varre e manda o resumo | `org_docs` kind `automacoes` (via painel Automações) | super_admin | quando a varredura e o digest rodam (nada roda até ligar) |
| 10 | **Destinatários** (`destinatarios`) | para quem vai o resumo por e-mail | `org_docs` kind `org-config` key `digest` (via `/admin`) | super_admin | quem recebe o digest (hoje: 1 e-mail por org) |
| 11 | **Alertas** (`alertas`) | regras de alerta de mudança de concorrente | `org_docs` kind `diag-alertas-regras` (org-level) | super_admin (Diagnóstico) | o que dispara um alerta a cada varredura |
| 12 | **Rótulos** (`rotulos`) | os termos renomeáveis da agência (Concorrentes→"Rivais"…) | `org_docs` kind `vocab` | super_admin (editor na Implantação) | o vocabulário em **toda** a interface (ver [D13](DECISOES.md)) |

## Nível 2 — Quem observamos (por conta)

| # | Parâmetro (`id`) | O que faz | Onde vive | Quem edita | O que muda |
|---|---|---|---|---|---|
| 1 | **Contas monitoradas** (`clientes`) | quais clientes a agência acompanha | `clients` (+ `clients.data`) | super_admin (Novo cliente) | a lista da sidebar; o que o loop varre |
| 2 | **Concorrentes** (`concorrentes`) | quem vigiar por cliente (pilar concorrente) | `clients.data.competitors[]` | super_admin (Monitorar) | os alvos da coleta/diagnóstico |
| 3 | **Contas-chave** (`contas_chave`) | as contas do cliente a vigiar (pilar conta-chave) | `clients.data.competitors[]` (pillar) | super_admin (Contas → Vigiar) | os alvos do analista de relacionamento |
| 4 | **Base de conhecimento** (`base_conhecimento`) | o que se sabe do cliente | base do Formare (via porta) **ou** base local (`org_docs` kind `base-local`) | super_admin (base local) | a âncora do "por que importa"; sem base, âncora conservadora |
| 5 | **Áreas ativas** (`areas_ativas`) | quais das 3 áreas leem, por cliente | `org_docs` kind `lenses` (por cliente, só `enabled`) | super_admin (Áreas) | quais lentes o loop roda para o cliente |
| 6 | **Fontes e temas** (`fontes_temas`) | as fontes públicas + temas a vigiar por concorrente | fontes em `clients.data`; temas em `org_docs` kind `diag-config` | super_admin (Concorrentes / Diagnóstico) | o que a coleta e o diagnóstico examinam |

> **Regra importante (honestidade):** a régua/prioridade/rótulos/alertas/cadência são
> **critério ÚNICO da agência** (editar por uma conta vale para todas); as **áreas
> ativas** e o **quem observamos** são **por conta**. O re-scope que separou os dois
> foi deliberado — não "unifique" de volta.

---

## A Ficha e o import (fechando o ciclo)

O critério não precisa ser digitado tela a tela. Existe um **instrumento de
diagnóstico** (HTML, **fora** do Radar — é o kit do implantador, o ato consultivo
que se vende) que conduz a sessão com a agência e emite uma **Ficha JSON (v1)**. A
Implantação **importa** essa Ficha (só super_admin):

1. **Preview obrigatório (diff)** — mostra *o que vai mudar, antes de mudar* ("Régua
   de prioridade: Alta 70 → 80"). Nunca aplica direto.
2. **Aplicar** só depois de confirmar. Aplica **apenas** os parâmetros marcados
   `definido`; ausência **nunca apaga**.
3. **Relatório honesto** — o que foi aplicado · o que ficou pendente · o que falhou.
4. **Org-scoped** — uma Ficha nunca cruza orgs.
5. Guarda o **`disseram`** (as palavras da agência que geraram cada parâmetro) e
   exibe sob cada item — o "Mapa de Tradução" (a agência abre e vê a própria fala
   virando regra).

Motor: `src/lib/implantacao/ficha.ts` (`parseFicha`/`diffFicha`/`applyFicha`); API
`src/app/api/implantacao/import/route.ts`. Provado: `npm run smoke:ficha` +
`test:isolation` (item 11). Contrato v1 e o mapeamento parâmetro↔chave: ver o
histórico do projeto (o instrumento fica fora deste repo, de propósito).
