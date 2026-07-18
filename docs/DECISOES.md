# Decisões — os porquês (ADRs curtos)

> Um dev bom recupera **o quê** lendo o código. O que ele **não recupera** é **por
> que** — e sem isso "limpa" uma decisão boa por engano. Cada entrada aqui:
> **contexto · decisão · por quê · consequência de desfazer.**
>
> As afirmações técnicas foram verificadas no código (`arquivo:linha`). Onde não
> deu para confirmar, está escrito.

---

## D1 — Radar é um repositório e um banco SEPARADOS do Formare

**Contexto.** O Radar nasceu para alimentar o OS Formare (que está em produção em
`os.formare.tech`) com inteligência de mercado.

**Decisão.** Manter o Radar como **produto separado** — repo próprio
(`/root/radar-hub`), banco Supabase próprio, deploy próprio — e **nunca** modificar
o app ou o banco do Formare, exceto pela porta estreita (D2), só com OK explícito.

**Por quê.** O Formare está no ar servindo trabalho real. Acoplar os dois (mesmo
repo, mesmo banco, migrations cruzadas) faria um `bug` do Radar poder derrubar o
Formare. Separado, o Radar pode falhar sozinho sem contaminar o executor.

**Consequência de desfazer.** Fundir os repos/bancos reacopla os fossos: uma
mudança de schema do Radar pode quebrar o Formare em produção. É o inverso do que
o produto quer (dois órgãos de um organismo, não um monólito).

*Fonte: `CLAUDE.md` (Guardrails 1-4), `docs/MULTITENANT.md`.*

---

## D2 — A base de conhecimento do Formare é acessada por uma PORTA HTTP (radar-door), não pelo banco

**Contexto.** O Radar precisa **ler** o que o Formare sabe de um cliente (para
cruzar com os sinais) e às vezes **escrever** de volta (novo intel).

**Decisão.** Um serviço isolado — **`radar-door`** (`door/door.mjs`, roda em
`/root/radar-door/`, escuta só em `127.0.0.1:8090`) — é o **único** caminho entre
o Radar e o banco do Formare. O Radar tem apenas uma **URL + um segredo
compartilhado**; a **credencial do banco do Formare vive só no `.env` da porta**,
fora deste repo.
- `GET /brain` — leitura: só conhecimento **confirmado** (`is_confirmed=true`, `authority IN (canonical, reference)`), truncado.
- `POST /intake` — escrita no Brain: sempre **pendente + rascunho** (`is_confirmed=false`, `authority='draft'`, `origin='radar'`, literais no SQL). **Travada** por padrão (`DOOR_WRITE_ENABLED` ausente).
- `POST /task` — cria um card no Formare (`stage='ideias'`, `tags=['radar']`, INSERT-only). Travada por padrão.

**Por quê.** Dar ao Radar a `service_role` do Formare seria entregar a chave-mestra
de um sistema em produção a um coletor que raspa a internet. A porta é uma
**superfície mínima e auditável**: o Radar não consegue apagar/alterar nada, só
pedir leitura (confirmada) e depositar rascunhos que **o Rafael revisa** antes de
virarem verdade. A escrita fica **desligada** até ele autorizar.

**Consequência de desfazer.** Trocar a porta por acesso direto ao banco do Formare
quebra o princípio 2 (isolamento) na sua forma mais grave: um `bug` ou uma injeção
no Radar poderia corromper o conhecimento de produção do Formare. Também mata a
**curadoria** (tudo entra como rascunho a confirmar) — o Radar deixa de ser "só
mais uma fonte" e vira um escritor não-supervisionado.

*Fonte: `door/README.md`, `door/door.mjs`, `src/lib/brain.ts`, `CLAUDE.md` (Guardrail 3).*

---

## D3 — Não copiar a descoberta de conhecimento do Formare

**Contexto.** O Formare tem um pipeline sofisticado de descoberta/onboarding que
constrói a base de conhecimento rica de um cliente.

**Decisão.** O Radar **não reimplementa** essa descoberta. Ele **lê** a base pronta
via porta (D2); e, para as agências do piloto que ainda não têm a base rica,
oferece uma **base local enxuta** digitada na implantação — rotulada honestamente
como "base local", nunca como a base rica (princípio 1).

**Por quê.** Duas implementações de "descobrir o que se sabe de um cliente"
**divergem** com o tempo — e aí o Radar e o Formare passam a "saber" coisas
diferentes do mesmo cliente, o pior tipo de inconsistência num organismo que se
vende como um só cérebro.

**Consequência de desfazer.** Copiar a descoberta cria uma segunda fonte da verdade
que deriva da primeira; o flywheel ("Radar sente → a base lembra → Formare age")
se rompe quando as duas memórias discordam.

> **Parcialmente verificado:** é uma decisão de **não-fazer** (uma ausência), então
> a "prova" é que o Radar não tem pipeline de descoberta próprio — ele lê via
> `brain.ts`/porta e cai na base local (`src/lib/base-local.ts`) quando não é a org
> dona. A intenção está em `docs/vision.md` e no histórico do projeto.

---

## D4 — Multi-tenant com RLS + `org_id` em tudo, isolamento no banco

**Contexto.** O Radar vai receber **várias agências**. Cada uma só pode ver os
próprios dados.

**Decisão.** Tenant = **org**. Toda tabela de dados tem `org_id` + **RLS FORCE**; o
app opera com a **sessão do usuário** e deixa o banco recusar linhas de outra org.
A `service_role` nunca entra no caminho do usuário; o coletor grava `org_id`
explícito por uma RPC controlada.

**Por quê.** É o princípio 2 — um vazamento entre agências é fatal, e isolamento na
tela vaza no primeiro `bug`. (Detalhe completo em [`PRINCIPIOS.md`](PRINCIPIOS.md#2--isolamento-no-banco-rls-nunca-só-na-tela) e [`SEGURANCA.md`](SEGURANCA.md).)

**Consequência de desfazer.** Trocar RLS por filtro-no-app reintroduz a classe de
`bug` mais perigosa do produto (vazamento cross-org), agora sem a rede de proteção
do banco.

*Fonte: `supabase/migrations/001_init_multitenant.sql`, `002_org_docs_share_token.sql`, `src/lib/db/*`, `scripts/test-isolation.mts` (verificado).*

---

## D5 — A verdade de runtime vive em `clients.data` (jsonb) e `org_docs`, não nas tabelas relacionais

**Contexto.** O schema tem tabelas relacionais (`competitors`, `signals`, …), mas o
produto evoluiu rápido e o formato dos dados muda com frequência.

**Decisão.** Guardar a configuração e o estado em **envelopes jsonb**: a watchlist
inteira de um cliente (incluindo os concorrentes) vive em `clients.data`; dezenas de
stores pequenos por org vivem em `org_docs` (`kind`+`key`+`data jsonb`). As tabelas
`competitors` e `usage_events` acabaram **não sendo usadas** em runtime (ver a
armadilha em [`DADOS.md`](DADOS.md)).

**Por quê.** Um formato que muda toda semana em jsonb evita uma migration a cada
mudança e mantém o ritmo de "lotes pequenos verificáveis". O custo (perder queries
relacionais/índices) foi aceito porque o volume é pequeno (config por org, não
big-data).

**Consequência de desfazer.** "Normalizar" tudo para tabelas relacionais é um
projeto grande **e** confunde: um dev novo que olha só o schema pensa que
`competitors` é a fonte da verdade — e ela está vazia. **Documentar essa armadilha
é obrigatório** ([`DADOS.md`](DADOS.md)).

*Fonte: `src/lib/db/repo-watchlist.ts`, `repo-org-docs.ts`, `src/lib/watchlist.ts` (verificado); tabelas fantasma confirmadas.*

---

## D6 — A Implantação é um REGISTRO org-level (super_admin edita, agência read-only)

**Contexto.** O critério de cada agência (régua, prioridade, áreas, rótulos,
cadência) precisa ser configurável — mas por quem?

**Decisão.** O critério vive num **registro da implantação** (org-level): editável
**só pelo super_admin**; a agência **vê** (read-only), com a proveniência
("parametrizado na implantação de [data]"). Cada parâmetro começa **pendente** até
ser revisado — nunca um default silencioso.

**Por quê.** A implantação é o **ato consultivo que se vende** (princípio 4). Se a
própria agência editasse, a parametrização deixaria de ser um serviço; se fosse um
default no código, não haveria diferença entre agências. O read-only é um **ativo
de venda** (a agência abre e vê o próprio critério virando regra — o "Mapa de
Tradução").

**Consequência de desfazer.** Deixar `member` editar, ou cravar o critério em
constantes, quebra o modelo comercial e a diferenciação por agência.

*Fonte: telas `src/app/implantacao/`, stores `parametrizacao`/`vocab`/`lens-regua`/`prioridade-regua`, gate `isSuperAdmin` (`src/lib/db/session.ts`) — verificado nesta sessão.*

---

## D7 — A cadência ancora no RITUAL do cliente, não num horário do dev

**Contexto.** O Radar varre concorrentes e manda um resumo do dia (digest). Quando?

**Decisão.** A cadência (frequência da varredura e do digest) é **parâmetro da
implantação** (D6) — ancorada no ritual da agência (ex.: "a reunião é terça"), não
num cron fixo escolhido pelo desenvolvedor. Nada varre sozinho até ser **ligado**
(painel de Automações, default OFF).

**Por quê.** Inteligência que chega na hora errada é ignorada. E "varrer sozinho por
padrão" gasta crédito e surpreende — o controle é do cliente.

**Consequência de desfazer.** Um cron global fixo ignora o ritual de cada agência
(o digest chega depois da reunião) e liga varredura sem consentimento (custo +
surpresa).

*Fonte: `src/lib/automacoes.ts` (config de cadência por org, default OFF) — verificado nesta sessão; a cadência como parâmetro está em [`IMPLANTACAO.md`](IMPLANTACAO.md).*

---

## D8 — PDF do dossiê via HTML → Chrome headless (puppeteer), não gerador de texto

**Contexto.** O dossiê de prospect e os relatórios são levados a uma **reunião
real** — precisam ser **fiéis** a uma referência visual (o Rafael pediu "idêntico
à tela").

**Decisão.** O **dossiê de prospect** é gerado por **HTML renderizado no Chrome
headless** (puppeteer): um único template serve a **tela = o PDF**
(`src/lib/prospects/render-pdf.ts:43-73` — `puppeteer.launch → page.setContent →
page.pdf({format:"A4"})`). O **`pdf-lib`** é usado num caminho **separado**: o
export de **relatórios** com gráficos vetoriais nativos (`src/lib/reports-export.ts`).

**Por quê.** Um gerador de texto (pdf-lib "na mão") não reproduz um layout
editorial fiel — fontes, espaçamento, faixas. HTML→Chrome dá **pixel-fidelidade**
com um template só (menos divergência tela/PDF).

**Consequência de desfazer.** Trocar o dossiê para pdf-lib perde a fidelidade que o
Rafael validou; o PDF deixa de parecer o que ele mostra na tela.

> **Ressalva (comentário mentiroso a corrigir):** `src/app/api/prospects/pdf/route.ts:3`
> diz `"Server-safe (pdf-lib)"`, mas o código chama o caminho **puppeteer**. O
> comentário está **errado** — vale corrigir para não confundir o próximo dev.
> Operacional: puppeteer na VPS roda **um Chrome por vez** (lock); `puppeteer` está
> em `serverExternalPackages`.

---

## D9 — Gráficos por lib temada (recharts), não `<div>` na mão

**Contexto.** Relatórios e battlecards mostram gráficos (barras, área, pizza,
dispersão).

**Decisão.** Na tela, os gráficos usam **recharts** (`src/components/charts/report-charts.tsx`).
No export PDF/PPTX, são desenhados como **vetor** via pdf-lib/pptxgenjs (caminho
independente).

**Por quê.** Uma lib de gráficos dá eixos, labels, escala e responsividade
corretos; `<div>` estilizado à mão é frágil, feio e quebra com dados reais.

**Consequência de desfazer.** Reimplementar gráficos com `<div>` é retrabalho e
introduz bugs de layout que a lib já resolveu.

*Fonte: `package.json` (`recharts`), `src/components/charts/report-charts.tsx` (verificado).*

---

## D10 — Coletores e cron na VPS, não serverless

**Contexto.** A coleta (scraping via Firecrawl + análise por LLM) é **longa** e
**agendada**.

**Decisão.** Coletores + cron rodam na **VPS** (ao lado do gateway de LLM), via
**systemd timer** (`radar-schedules.timer`, de hora em hora → `scripts/run-schedules.mts`
→ `runDueSchedules`/`runDueDiagnosticos`/`ensureDigestMatinal`/`prepararReunioes`).
O motor de coleta+análise é `src/lib/loop.ts` (`runRadarLoop`).

**Por quê.** Serverless tem limites de tempo/execução ruins para scraping longo +
o gateway de LLM já vive na VPS (proximidade e reuso). E o controle de "quando
varrer" é da agência (D7), não de um cron global.

**Consequência de desfazer.** Mover para serverless esbarra em timeouts no meio de
uma varredura e afasta do gateway.

> **Ressalva de evidência:** as units systemd (`.timer`/`.service`) **não estão
> versionadas** neste repo — vivem na VPS (`/etc/systemd/system/`). A evidência é o
> comentário em `scripts/run-schedules.mts:2-6` + `CLAUDE.md:19,70`, não um arquivo
> committado. **Recomendação:** versionar cópias das units em `docs/` ou `ops/`.

---

## D11 — LLM por um GATEWAY único; o fallback de provider vive no gateway, não no app

**Contexto.** O analista precisa de LLM **resiliente** (se um provider cai, outro
assume) sem espalhar chaves de vários providers pelo código.

**Decisão.** O Radar fala com **um** gateway — `completeViaGateway`
(`src/lib/gateway.ts:22-40`) → `POST {LLM_GATEWAY_URL}/complete` (default model
`sonnet-4-6`). O **fallback de provider** (Claude → DeepSeek) vive **dentro do
gateway, na VPS** — **não** neste repo. Do lado do Radar, a resiliência é: **retry
de 2 tentativas** consciente do disjuntor 503 (`loop.ts` `withGatewayRetry`) +
**fallback de contexto** da base de conhecimento (`brain.ts`).

**Por quê.** Centralizar o fallback num gateway mantém o Radar **simples** (um
endpoint, um segredo) e **reusa** o mesmo motor do Formare. Espalhar N providers no
app duplicaria chaves e lógica de fallback.

**Consequência de desfazer.** Embutir clientes de provider no app reintroduz chaves
espalhadas e uma segunda implementação de fallback para manter em sincronia.

> **Ressalva:** o fallback Claude→DeepSeek **não é verificável neste repositório**
> (é do gateway na VPS). As menções a "DeepSeek" no código do Radar são só
> **contabilidade de custo** (deriva o provider do id do modelo — `src/lib/usage/context.ts:57`).

---

## D12 — App público atrás de uma fechadura própria (proxy) + Cloudflare Tunnel

**Contexto.** O Radar tem endereço público (`radar.formare.tech`) — nada pode
passar sem login.

**Decisão.** Um **proxy** (`src/proxy.ts`, ex-middleware do Next 16) exige sessão
em **toda** rota (páginas e APIs); sem sessão → `/entrar` (ou 401 JSON em `/api/*`).
O acesso público entra por um **Cloudflare Tunnel** (`cloudflared-radar`) apontando
para o `next start` local (`:3200`).

**Por quê.** O produto é multi-tenant e público; a porta de entrada tem que ser
inegociável e centralizada. (O papel fino — super_admin — é reforçado **também** nas
próprias páginas/rotas + RLS.)

**Consequência de desfazer.** Tirar o proxy ou confiar só na checagem por-página
abre buracos (uma rota nova sem gate fica exposta).

> **Cuidado documentado (bug real, corrigido):** o proxy precisa devolver a
> resposta **pós-refresh** do token; um `bug` onde ele devolvia a resposta velha
> (sem o cookie novo) fazia POSTs caírem em **401 "não autorizado"** com sessão
> válida ("a página concede, a rota nega"). Fix em `src/lib/db/session-proxy.ts`
> (`getResponse()`) — ver o teste da porta `npm run test:route-auth`.

*Fonte: `src/proxy.ts`, `src/lib/db/session-proxy.ts`, `CLAUDE.md:70` (verificado nesta sessão).*

---

## D13 — Vocabulário por agência: store de RÓTULO ÚNICO (com 3 limitações aceitas)

> **Se você lê uma decisão só neste documento, leia esta.** É o caso clássico de
> "escopo deliberado que parece bug" — e é exatamente o dano que esta documentação
> existe para impedir.

**Contexto.** Cada agência pode **renomear** os termos que vê na interface para o
nome que ela já usa (Concorrentes → "Rivais", Contas-chave → "Alvos", Áreas,
Prioridade, Oportunidade, Base de conhecimento). É o parâmetro de **rótulos** da
implantação (org-level).

**Decisão.** O vocabulário é um **store de rótulo único** por termo: a agência
guarda **um** rótulo por termo (`org_docs` kind `vocab`; padrão em
`src/lib/vocab-terms.ts`). Um núcleo puro resolve (`rotulo`/`rotuloSingular`) e
componentes aplicam em toda a UI (`<Rotulo>`, `useRotulo`, `useRotuloSingular`).
Derivamos duas formas de apresentação — `singular` (slot de um item) e `lower`
(meio de frase). **Deliberadamente NÃO** modelamos gênero, plural completo, nem
conjugamos a frase ao redor do substantivo.

**Por quê.** Um rótulo único é **simples, previsível e cobre a esmagadora maioria
dos casos** (renomear para outro substantivo de mesmo gênero e número — ex.:
concorrentes → rivais). Modelar flexão completa (gênero + singular/plural +
concordância de artigos e adjetivos vizinhos) seria um **mini-motor de morfologia
do português** — desproporcional ao ganho e **frágil**: para um rename **custom**,
não há como derivar as formas com confiança (só a agência saberia o plural/gênero
da palavra que ela escolheu). A régua do produto é "simples e honesto" > "clever e
quebradiço".

**As 3 limitações ACEITAS (isto NÃO é bug — é escopo):**
1. **Concordância de gênero.** Os artigos/adjetivos ao redor do termo são fixos
   para o **gênero padrão**: "4 rivais monitorad**os**", "**Nenhuma** conta-chave".
   Se a agência renomear para o **gênero oposto** (ex.: "a concorrência", feminino),
   o substantivo troca mas o "monitorados"/"Nenhuma" **não concorda**.
2. **Singular de um rename custom.** `rotuloSingular` de um custom plural ("rivais")
   devolve o próprio custom ("rivais"), **não** "rival" — o singular do português
   não é derivável com confiança. No **padrão** (sem rename) o singular sai certo
   ("concorrente").
3. **Plural de "oportunidade".** O rótulo canônico desse termo é singular; slots
   **plurais** ("Oportunidades", "Últimas oportunidades") não têm forma modelada.

**Consequência de desfazer / o aviso ao próximo dev.** Se você olhar
"4 rivais monitorados" depois de um rename de gênero oposto e achar que é um `bug`,
**pare** — não é. "Consertar" isso significa dar ao vocab **gênero + número por
termo** (schema novo + editor com várias formas por termo + reescrever os ~22
arquivos que consomem os rótulos) **e**, para renames custom, ainda depender da
agência digitar cada forma. É um **projeto**, não um fix — e uma decisão de produto
do Rafael, não do dev. Confirme que o ganho justifica antes de tocar.

**Fonte.** `src/lib/vocab-terms.ts` (rótulo único + `rotulo`/`rotuloSingular`),
`src/components/rotulo.tsx` (`<Rotulo singular lower>`), `src/components/vocab-context.tsx`,
store `org_docs` kind `vocab` (`src/lib/vocab.ts`). Aplicado em ~22 arquivos
(commit `efdff89`). Provado: `npm run smoke:vocab`.


