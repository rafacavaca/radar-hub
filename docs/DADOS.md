# Dados — o modelo, e as armadilhas

> O modelo de dados do Radar é **"envelope jsonb"**: a verdade de runtime vive em
> poucas colunas `jsonb`, não nas tabelas relacionais que o schema sugere. Um dev
> que olha só o schema **se engana** — por isso as armadilhas estão marcadas com ⚠️.
>
> Tudo aqui foi verificado no código (`arquivo:linha`).

---

## As tabelas (migrations `supabase/migrations/`)

O schema é criado em `001_init_multitenant.sql` e `002_org_docs_share_token.sql`.

| Tabela | Para quê | Usada em runtime? |
|---|---|---|
| `orgs` | a agência (tenant) — `id`, `slug`, `name` | ✅ |
| `memberships` | usuário ↔ org, com papel (`radar_role`) | ✅ |
| `clients` | os clientes que a agência monitora — **o `data jsonb` é a verdade** | ✅ (via `data`) |
| `signals` | sinais coletados (eventos) | ✅ (`repo-signals.ts`) |
| `diagnostics` | diagnósticos de marca por concorrente | ✅ (`repo-diagnostico.ts`) |
| `reports` | relatórios gerados | ✅ (`repo-reports.ts`) |
| `org_docs` | **store genérico** (kind + key + jsonb) — dezenas de "mini-tabelas" | ✅ (o cavalo de batalha) |
| `competitors` | (relacional) concorrentes | ⚠️ **FANTASMA** |
| `usage_events` | (relacional) custo | ⚠️ **FANTASMA** |

---

## ⚠️ Armadilha nº 1 — as tabelas fantasma

**`competitors` e `usage_events` existem no schema mas NÃO são gravadas em runtime.**
Verificado: zero `.from("competitors")` e zero `.from("usage_events")` em `src/`
(só em scripts de teste/migração).

- Os **concorrentes reais** vivem dentro de **`clients.data`** (jsonb) como
  `WatchClient.competitors[]` — gravados em `src/lib/db/repo-watchlist.ts:41-49`
  (`data: c`, o `WatchClient` inteiro). A tabela `competitors` fica **vazia**.
- O **custo** vai para um arquivo **JSONL** (`data/usage-events.jsonl`), não para a
  tabela — `src/lib/usage/store.ts`. A tabela `usage_events` fica **vazia**.

> **Por que isso importa.** Um dev novo que precisa "listar os concorrentes" vai
> escrever `select * from competitors` e achar que o banco está quebrado (0 linhas).
> **Não está.** A fonte é `clients.data`. (Já `signals` e `diagnostics`, apesar de
> parecerem candidatas ao mesmo destino, **são** gravadas — não confunda.)

O porquê dessa escolha (envelope jsonb) está em
[`DECISOES.md` (D5)](DECISOES.md#d5--a-verdade-de-runtime-vive-em-clientsdata-jsonb-e-org_docs-não-nas-tabelas-relacionais).

---

## `clients.data` — o envelope do cliente

`clients.data` (jsonb) guarda o `WatchClient` completo. Tipo em
`src/lib/watchlist.ts:117-126`:

```ts
type WatchClient = {
  name: string;
  mode?: "concorrentes" | "carteira";   // também espelhado numa coluna real
  competitors: Competitor[];            // concorrentes E contas-chave (ver pillar)
  market?: string[];                    // temas/queries de mercado
};
```

- Montado/lido em `src/lib/db/repo-watchlist.ts` (`id: c.name`, `data: c`).
- `Competitor` tem `pillar?: "concorrente" | "conta-chave"` — o **mesmo array**
  guarda concorrentes e contas-chave; `pillarOf()` separa. Ausente ⇒ "concorrente".
- Dispatch JSON (modo clássico) ↔ Supabase em `watchlist.ts` via `supabaseEnabled()`.

---

## `org_docs` — o store genérico (o cavalo de batalha)

Definido em `002_org_docs_share_token.sql:13-20`. **PK = `(org_id, kind, key)`**;
colunas `org_id`, `kind`, `key`, `data jsonb`, `updated_at`. RLS por org. Repo:
`src/lib/db/repo-org-docs.ts` (`sbGetDoc`/`sbListDocs`/`sbSetDoc`/`sbDeleteDoc`,
upsert `onConflict: "org_id,kind,key"`).

É onde vivem **~24 "mini-tabelas"** — cada `kind` é uma feature. Os `kind` em uso
(verificados):

| kind | o quê |
|---|---|
| `automacoes` | liga/desliga + cadência das rotinas (por org) |
| `parametrizacao` | proveniência + status pendente/definido dos 12 params |
| `vocab` | os rótulos renomeáveis da agência (D13) |
| `prioridade-regua` | os cortes Alta/Média (P7) |
| `lenses` | as áreas ATIVAS por cliente |
| `lens-regua` | a régua/time/ação de cada área (org-level) |
| `base-local` | a base de conhecimento local por cliente |
| `diag-config` · `diag-alertas-regras` · `diag-alertas-disparos` · `diag-schedule` · `cobertura` | diagnóstico de concorrentes |
| `prospects` · `prospect-dossie` · `prospect-concorrentes` · `prospect-contexto` · `prospect-arquivo` | prospecção (dossiê, curadoria, contexto privado) |
| `schedules` · `roadmap-notes` · `source-status` · `briefing-estado` · `loop-cache` · `digest` · `org-config` | agendamentos, notas, status de fontes, cache do dia, config |

> Padrão de todo store: **org-scoped** (usa `currentOrgId()`), com **fallback JSON**
> (`RADAR_DATA_DIR`) no modo clássico; nunca lança na leitura; sanitiza na entrada.

---

## `orgs` / `memberships` / papéis

- `orgs` (`001:34-39`): `id uuid`, `slug unique`, `name`, `created_at`.
- `memberships` (`001:41-48`): `org_id → orgs`, `user_id → auth.users`, `role
  radar_role`, `unique(org_id, user_id)` (N:N).
- ⚠️ **Correção a uma suposição comum:** o enum `radar_role` tem **três** papéis
  (`001:26`): **`super_admin`** (o Rafael — edita o critério, vê tudo),
  **`org_admin`** (dono da agência), **`member`**. Não são dois.
- `is_super_admin()` / `is_org_admin()` são funções `SECURITY DEFINER` que olham
  **só o próprio** `auth.uid()` (`001:67-88`) — ver [`SEGURANCA.md`](SEGURANCA.md).

---

## `brainOwnerOrgId` — só uma org lê a base do Formare

`src/lib/brain.ts:75-77`: `RADAR_BRAIN_ORG_ID || RADAR_INGEST_ORG_ID`. Gateia a
leitura da base de conhecimento do Formare: em `fetchClientBrain` (`brain.ts:269-292`),
só a org **dona** chama a porta real (`realBrain`); qualquer outra org recebe
apenas a **própria base local** ou contexto `"none"` — **nunca** a base do Formare,
mesmo com um cliente de nome idêntico (o caso homônimo, provado em `test:isolation`).

---

## `usage_events` / custo — assíncrono, só metadados, em JSONL

`src/lib/usage/store.ts` — `recordLLMUsage`/`recordColetaUsage` são
**fire-and-forget** (sem `await` no caminho quente). O `UsageEvent` carrega **só
metadados** (ts, org, feature, provider, modelo, tokens, custo, latência) — **nunca**
o conteúdo do prompt nem do sinal. Grava em `data/usage-events.jsonl`. (Ver a
armadilha nº 1: a tabela `usage_events` do banco **não** é usada.)

---

## Modo clássico vs. multi-tenant

- **Sem** as variáveis do Supabase: modo **clássico** — todos os stores caem no
  fallback **JSON** (`data/*.json`, `RADAR_DATA_DIR`), single-tenant. Bom para dev.
- **Com** elas (`supabaseEnabled()` = true): modo **multi-tenant** — Supabase + RLS.

O switch é `supabaseEnabled()` (`src/lib/db/supabase.ts`), checado em cada store.
