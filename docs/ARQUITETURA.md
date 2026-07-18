# Arquitetura — o desenho real

> Verificado no código (`arquivo:linha`). O *porquê* de cada escolha está em
> [`DECISOES.md`](DECISOES.md); aqui é o *como*.

---

## O desenho, de longe

```
                     radar.formare.tech (público)
                              │
                    ┌─────────▼──────────┐
                    │ Cloudflare Tunnel  │  cloudflared-radar.service
                    └─────────┬──────────┘
                              │  → localhost:3200
        ┌─────────────────────▼─────────────────────────┐
        │  radar-hub  (Next.js 16, next start -p 3200)   │  systemd
        │  ─ proxy (src/proxy.ts): fechadura de sessão   │
        │  ─ app (páginas + /api)                        │
        │  ─ stores → Supabase (RLS) | JSON (clássico)   │
        └───┬───────────────┬───────────────────┬────────┘
            │               │                   │
   ┌────────▼───────┐  ┌────▼─────────┐   ┌─────▼──────────────┐
   │ Supabase       │  │ gateway LLM  │   │ radar-door :8090   │
   │ (banco próprio │  │ (na VPS)     │   │ (porta estreita)   │
   │  do Radar,RLS) │  │ Claude→…     │   │  ↓ 127.0.0.1 só    │
   └────────────────┘  └──────────────┘   │ banco do FORMARE   │
                                          │ (base de conhec.)  │
   coleta:  Firecrawl (rodízio de chaves) └────────────────────┘
   cron:    systemd timers (schedules 1x/h · backup 04:30)
```

- **Dois repos separados:** `radar-hub` (este) e `formare-os` (o executor). Bancos e
  deploys separados. A única ponte é a **porta** (`radar-door`). Ver [`DECISOES.md` (D1, D2)](DECISOES.md).
- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 ·
  Supabase (Postgres + Auth + RLS). Gráficos: recharts. PDF do dossiê: puppeteer
  (Chrome headless). Deploy: **VPS + systemd + Cloudflare Tunnel** (não Vercel).

---

## As peças na VPS

| Peça | O quê | Onde |
|---|---|---|
| `radar-hub` | o app Next.js | `:3200`, systemd |
| `radar-door` | a **porta estreita** para a base do Formare | `127.0.0.1:8090`, systemd, `door/door.mjs` |
| `cloudflared-radar` | o túnel público → `:3200` | systemd |
| gateway de LLM | o motor de raciocínio (Claude, com fallback interno) | serviço na VPS (fora deste repo) |
| Firecrawl | scraping/busca web | API externa, chaves em rodízio |
| cron | dispara coleta/relatórios/backup | systemd timers |

As units estão versionadas em [`ops/systemd/`](../ops/systemd/).

---

## A porta da base de conhecimento (radar-door)

O Radar **não tem** a credencial do banco do Formare. Ele fala com `radar-door`
(`src/lib/brain.ts` → `RADAR_BRAIN_URL=http://localhost:8090/brain`, header
`Authorization: Bearer ${RADAR_BRAIN_SECRET}`). O door valida o segredo, resolve o
workspace por nome, e devolve **só conhecimento confirmado**. Escrita (intake/task)
é gated e desligada por padrão. Detalhe: [`door/README.md`](../door/README.md) e
[`DECISOES.md` (D2)](DECISOES.md#d2--a-base-de-conhecimento-do-formare-é-acessada-por-uma-porta-http-radar-door-não-pelo-banco).

## O gateway de LLM

Um caminho único: `completeViaGateway` (`src/lib/gateway.ts:22-40`) →
`POST {LLM_GATEWAY_URL}/complete` (`Bearer {LLM_GATEWAY_SECRET}`, modelo default
`sonnet-4-6`); visão em `gateway-vision.ts`. **Todos** os analistas usam só o
gateway — não há cliente DeepSeek/OpenAI no repo. O **fallback de provider**
(Claude→DeepSeek) vive **dentro do gateway**, na VPS; do lado do Radar há retry de
2 tentativas consciente do disjuntor 503 (`loop.ts` `withGatewayRetry`) + fallback
de contexto da base (`brain.ts`). Ver [`DECISOES.md` (D11)](DECISOES.md).

## Firecrawl — rodízio de chaves

`src/lib/firecrawl-keys.ts` — slots `FIRECRAWL_API_KEY`..`_8`, quota default 1000/mês
por chave, contador em `data/firecrawl-keys.json`. `src/lib/firecrawl.ts` percorre
`ordemDeTentativa()`; em 401/402/403/429 marca a chave esgotada e vai à próxima; se
todas sem cota, erro claro. Ver [`OPERACAO.md`](OPERACAO.md).

---

## O caminho de um sinal, ponta a ponta

Tudo em `src/lib/`. O motor é `loop.ts` (`runRadarLoop` / `runRadarPartial`),
disparado pelo `radar-schedules.timer` (ou "Coletar agora" na tela).

**1. Coleta.** `runRadarLoop` → `planCollection(watchlist)` → por alvo despacha
`collectBlog` / `collectByDiff` / `collectMarket` / `collectLinkedIn`
(`loop.ts:618-621,685,719`), todos via `firecrawl.ts` (scrape/searchWeb, rodízio de
chaves). Falha de uma fonte é **registrada e pulada** (`loop.ts:633-640`,
`persistSourceRun`) — nunca derruba a rodada (princípio: pare e reporte, não bata cabeça).

**2. Análise por área (as 3 óticas).** Para cada cliente, `loadActiveLensesFor`
(`loop.ts:696`) → `analyzeLens` por lente. As 3 lentes = **comercial / produto /
marketing** (`lenses.ts:22,63-92`; régua/time/ação **editáveis** — critério da
agência). Cada análise é **ancorada** no que a base sabe (`fetchClientBrain(cliente).context`,
`loop.ts:660`). Complementos: `crossReference` (interno × externo), `analyzeVendedor`
(modo carteira), `analyzeRelacionamento` (contas-chave). **Cada lente/analista = 1
chamada ao gateway.** Todo prompt tem o preâmbulo anti-injeção.

**3. Briefing (o cruzamento vira decisão).** `buildGeneralItems(readings)` deriva a
visão geral (1 item por evento, melhor lente, dedupe) (`loop.ts:230-260`);
`briefing.ts` `buildBriefing` = **top-N por score** (só o que passa a régua sobe —
priorização brutal). O resultado é **cacheado por dia/org** em `org_docs` kind
`loop-cache` (`loop.ts:175`).

**4. Digest / e-mail.** `digest.ts` `coletarMaterial` → `peekLoopResult()`
(cache-only) → `candidatos()` filtra por `CORTE_SCORE` → `buildDigest` /
`ensureDigestMatinal`. Envio via **Resend** (`digest-email.ts` `maybeSendDigestEmail`),
destinatário **por org** (config em `/admin`, com fallback global só à org designada).

> **Nuance operacional (bug real, registrado):** o cache do loop é **por dia/org**.
> Se a rodada da madrugada falhar na análise (ex.: Firecrawl sem crédito), o cache
> nasce catastrófico (`items=0`) e **não re-roda sozinho** — as telas ficam vazias o
> dia todo, sem erro visível. Mitigação e o que fazer: [`OPERACAO.md`](OPERACAO.md).

---

## Fronteira com o Formare (o flywheel)

**Radar sente → a base de conhecimento lembra → Formare age.** O Radar **lê** a base
para raciocinar e **escreve** de volta (novo intel → nós de conhecimento, **sempre
pendentes/rascunho**) pela porta; cai na aba **Revisar** do Formare; o Rafael
confirma; vira conhecimento. O Radar é "só mais uma fonte" — nunca escreve verdade
direto. (Escrita da porta hoje **desligada**.)
