# Operação — o runbook

> Como rodar, deployar, testar e socorrer. Os comandos vêm de `package.json`
> (verificado). **Nomes** de variáveis de ambiente aparecem aqui; **valores nunca**.

---

## Rodar e buildar

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build       # next build
npm run dev         # next dev (local)
```

Sem as variáveis do Supabase → modo **clássico** (JSON, single-tenant). Com elas →
**multi-tenant** (Supabase + RLS). Ver [`DADOS.md`](DADOS.md).

## Deployar (na VPS)

O deploy é **`next start` via systemd** + Cloudflare Tunnel — não Vercel.

```bash
cd /root/radar-hub && git pull
npm run build                 # ⚠️ FOREGROUND (ver o perigo abaixo)
cat .next/BUILD_ID            # confirme que existe e mudou
sudo systemctl restart radar-hub
systemctl is-active radar-hub
```

> ⚠️ **PERIGO — `next build` na VPS.** Nunca rode o build em **background**: se for
> cortado, apaga o `BUILD_ID` e o `radar-hub.service` entra em **crash-loop**.
> Sempre **foreground**, confira o `BUILD_ID`, encadeie `build && restart` com `&&`
> (não `;`). A VPS é apertada de RAM — há um **swapfile** para o build não ser
> OOM-killed. Confie só no `BUILD_ID` (o "✓ Compiled" vem antes do typecheck/geração).

As units systemd (o que roda sozinho) estão em [`ops/systemd/`](../ops/systemd/).

---

## Os smokes — e o que cada um prova

Rode `npm run <nome>`. Cada um é **offline** (sem rede, sem LLM) salvo indicação.

| Comando | Prova |
|---|---|
| `test:isolation` | **o isolamento entre agências** (11 itens, inclui o cliente homônimo) — precisa das chaves Supabase; sem elas roda só o item estático |
| `smoke` | o loop F1 ponta-a-ponta (≥1 item de briefing bem-formado) |
| `smoke:ficha` | o import da Ficha (parse v1 / diff read-only / apply org-scoped / `validar`→sugestão) |
| `test:route-auth` | **a PORTA** — rota real + sessão real de super_admin pelo proxy (o teste que pega o "página concede, rota nega") |
| `smoke:vocab` | o resolvedor de rótulos (padrão/override/singular) |
| `smoke:prioridade` | a régua de prioridade (o corte muda a palavra de verdade) |
| `smoke:param` · `smoke:rescope` | a parametrização e o re-scope org-level |
| `smoke:charts` | os gráficos (via jsdom — prova sem Chromium) |
| `smoke:prospects` · `smoke:automacoes` · `smoke:firecrawl` · `smoke:diagnostico` … | as features correspondentes |

> **A régua:** só considere uma tarefa pronta com **typecheck + build + o(s) smoke(s)
> relevante(s) verde(s)**. E lembre: **o smoke testa a lógica, não a porta** — para
> mudanças de auth/sessão, rode também `test:route-auth`.

---

## O cron (na VPS)

Systemd timers (versionados em [`ops/systemd/`](../ops/systemd/)):

- **`radar-schedules.timer`** — de hora em hora → `scripts/run-schedules.mts`: gera
  relatórios agendados vencidos, o digest matinal (+ e-mail), prepara reuniões.
- **`radar-backup.timer`** — diário 04:30 UTC → backup do banco (dump lógico JSON +
  `pg_dump` padrão-ouro, retenção 14d em `/root/radar-backups`).

```bash
systemctl list-timers | grep radar
journalctl -u radar-schedules.service --since "2 hours ago"
```

---

## Onde vivem as chaves (nomes, nunca valores)

A lista autoritativa está em **`.env.example`**. As que importam:

- **Supabase (banco do Radar):** `RADAR_SUPABASE_URL`, `RADAR_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (server-only, nunca no fluxo do usuário), `RADAR_DB=supabase`.
- **Porta da base (o Radar só tem isto):** `RADAR_BRAIN_URL`, `RADAR_BRAIN_SECRET`,
  `RADAR_BRAIN_ORG_ID` (ou `RADAR_INGEST_ORG_ID`) — a org dona da base.
- **LLM:** `LLM_GATEWAY_URL`, `LLM_GATEWAY_SECRET`.
- **Coleta:** `FIRECRAWL_API_KEY`, `FIRECRAWL_API_KEY_2` … `_8` (rodízio).
- **App/e-mail:** `RADAR_APP_URL`, `RADAR_APP_PASSWORD` (fechadura clássica),
  `RESEND_*` / `RADAR_DIGEST_EMAIL_FROM`.
- **Internos:** `RADAR_DATA_DIR` (isola stores JSON em teste), `RADAR_ADMIN_CONTEXT=1`
  (só scripts/ações de admin — libera o `adminClient`).
- **A porta (`/root/radar-door/.env`, fora do repo):** `SUPABASE_DB_URL` (a
  credencial do banco do **Formare** — **só aqui**), `RADAR_INTAKE_SECRET`,
  `RADAR_DOOR_PORT=8090`, `DOOR_WRITE_ENABLED` (comentado; ligar só com OK do Rafael).

## Limites conhecidos

- **Firecrawl:** ~1000 requisições/mês por chave; o código faz **rodízio** entre as
  chaves (slots 1..8). Em produção são ~3 contas que renovam em dias diferentes.
  Quando todas esgotam, a coleta falha com erro claro. Painel: `/custo`.
- **Rate-limit** é in-memory single-process (freio de abuso, não cota) — ver [`SEGURANCA.md`](SEGURANCA.md).
- **puppeteer (PDF)** roda **1 Chrome por vez** na VPS.

---

## O que fazer quando…

**…o Firecrawl estoura (coleta falha por cota).** Confira `/custo` e
`data/firecrawl-keys.json`. As chaves renovam em dias diferentes — normalmente basta
esperar o reset, ou adicionar uma chave nova (`FIRECRAWL_API_KEY_N`). Nunca é
motivo para "bater cabeça": o loop registra a falha da fonte e segue.

**…as telas do dia ficam vazias (sem erro visível).** É o **cache do loop
envenenado**: a rodada da madrugada falhou na análise, o cache do dia nasceu
`items=0` e **não re-roda sozinho**. Force uma rodada por cliente
(`RADAR_ADMIN_CONTEXT=1` + `runAsOrgCollector(org, runRadarPartial(...))`, ou o
"Coletar agora" na tela). Ver [`ARQUITETURA.md`](ARQUITETURA.md).

**…o digest não sai.** Confira `journalctl -u radar-schedules.service`; o
destinatário por org (`/admin`, kind `org-config`/`digest`); e se o cache do dia
existe (o digest lê o cache, não re-roda). Resend precisa das chaves.

**…um POST volta "não autorizado" com sessão válida ("a página concede, a rota
nega").** É o bug do refresh de token no proxy (já corrigido). Rode
`npm run test:route-auth` para confirmar a porta; a correção vive em
`src/lib/db/session-proxy.ts` (`getResponse()`). Ver [`DECISOES.md` (D12)](DECISOES.md).

**…o `test:isolation` falha.** **Pare tudo.** Não libere acesso externo. Leia qual
item quebrou (a saída é item a item) e trate como incidente de segurança — ver
[`SEGURANCA.md`](SEGURANCA.md).

**…o build quebra / a app não sobe.** Confira `cat .next/BUILD_ID` (existe?),
`journalctl -u radar-hub`, e se o build foi foreground. Se o BUILD_ID sumiu,
rebuilde foreground e `systemctl restart radar-hub`.

**…uma rajada de restarts derruba o login (429 do Supabase Auth).** O Auth tem
rate-limit; espaçar restarts/builds resolve.
