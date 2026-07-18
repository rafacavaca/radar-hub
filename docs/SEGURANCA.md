# Segurança — multi-tenant, isolamento e a porta

> O inegociável nº 1 é **isolamento no banco (RLS), testado antes de qualquer
> acesso externo**. "Confiança é o fosso": um vazamento entre agências seria fatal.
> Este doc é o *como*; o *porquê* está em [`PRINCIPIOS.md` (§2)](PRINCIPIOS.md).
> Absorve e atualiza o `docs/MULTITENANT.md` original (o modelo dele está certo;
> alguns nomes de arquivo derivaram — aqui estão os atuais, verificados).

---

## O modelo de isolamento

- **Tenant = `org`** (a agência). Um `user` (Supabase Auth) pertence a orgs via
  `memberships`, com papel `super_admin` / `org_admin` / `member`.
- **Toda tabela de dados tem `org_id` + RLS habilitada + FORCE.** Política padrão:
  `is_super_admin() OR org_id ∈ auth_org_ids()` em **USING** (leitura/update/delete)
  **e** em **WITH CHECK** (impede gravar em org alheia) — `001_init_multitenant.sql:67-88`.
- `auth_org_ids()` e `is_super_admin()` derivam de `auth.uid()` (o JWT da sessão).
  **Fora de sessão (cron), `auth.uid()` é nulo → a RLS não libera nada.**
- O app opera **sempre com a sessão do usuário** (`supabaseRouteClient()` →
  `createServerClient` com os cookies). A org **não é um filtro que o app escolhe** —
  é a RLS que recusa a linha. É isso que torna o isolamento **real, não cosmético**.

**FORCE em 9 tabelas** (verificado): `clients, competitors, signals, diagnostics,
reports, usage_events` (`001:184-186`), `orgs` (`001:199-200`), `memberships`
(`001:210-211`), `org_docs` (`002:22-23`).

---

## `isSuperAdmin` — por que uma RPC, e não uma query

`src/lib/db/session.ts:80-88` → `sb.rpc("is_super_admin")` (função `SECURITY
DEFINER`, `001:67-74`, `select exists(... where user_id = auth.uid() and role =
'super_admin')`).

> **Não dá para consultar `memberships` direto** (`session.ts:82-86`): a política
> `memberships_visiveis` deixa um membro **ver os co-membros da própria org** — então
> um `select … where role='super_admin'` no cliente veria o super_admin da org e
> retornaria `true` para **qualquer** membro. O furo. A RPC `SECURITY DEFINER` olha
> só o **próprio** papel (`auth.uid()`).

---

## `service_role` — a god-key, fora do caminho do usuário

`service_role` **ignora a RLS**. Regras (verificadas):

- **Nunca** no fluxo do usuário. Em `src/app/**`, `adminClient`/`SERVICE_ROLE` só
  aparecem em `/admin` e `/api/admin`, **ambos com gate `isSuperAdmin`**
  (`src/app/api/admin/route.ts:22`, `src/app/admin/page.tsx:22`).
- `adminClient()` **lança** se criado sem o selo `RADAR_ADMIN_CONTEXT=1`
  (`src/lib/db/admin-client.ts:41-46`) — um import acidental numa rota falha
  **barulhento**, não silencioso.
- O coletor/cron usa admin **por dentro de** `runAsOrgCollector(orgId, fn)`
  (`src/lib/db/collector-org.ts`), que marca a org via `AsyncLocalStorage`.

---

## O coletor (candidato nº 1 a furo) — defesa dupla

O cron escreve sinais **sem sessão**. Em vez de espalhar god-key:

1. **`org_id` explícito nos repos.** Dentro de `runAsOrgCollector`, `currentOrgId()`
   devolve a org do coletor (`session.ts:104-105`) e os repos filtram
   `.eq("org_id", orgId)` (`repo-org-docs.ts`, `repo-signals.ts`, `repo-watchlist.ts`,
   `repo-diagnostico.ts`).
2. **RPC controlada no banco.** O insert de sinal do cron passa por
   `collector_insert_signal(p_org_id, …)` — `SECURITY DEFINER`, superfície mínima,
   **`org_id` obrigatório** (recusa org nula); `EXECUTE` revogado de `anon`/`authenticated`.
   O `org_id` vem da linha da watchlist que originou a coleta, **nunca adivinhado**.

---

## O checklist de isolamento — a PAUSA OBRIGATÓRIA

`npm run test:isolation` (`scripts/test-isolation.mts`). Cria 2 orgs de teste (A, B)
com dados distintos e prova, item a item — **11 itens** (1 estático + 10 ao vivo):

1. *(estático, sempre roda)* Nenhuma rota do usuário chama `service_role` (grep em `src/app`).
2. A não vê **nenhum** dado de B (clients/competitors/signals/diagnostics/reports).
3. Deep-link por id de B → negado (0 linhas, não a tela de B).
4. Escrita cruzada (A grava em org de B) → recusada pela RLS (`WITH CHECK`).
5. Invertido: B não vê o sinal de A.
6. Contexto privado (arquivo/texto confidencial em `org_docs`) — A não vê o de B, nem por deep-link.
7. Coletor grava na org A (`org_id` explícito) e B não vê.
8. **Base de conhecimento org-scoped — cliente HOMÔNIMO:** A (dona) lê; B, com um cliente de **nome idêntico**, recebe `"none"`.
9. **LinkedIn org-scoped — HOMÔNIMO:** A lê os posts; B (mesmo nome) não vê.
10. **Base local org-scoped — HOMÔNIMO (o GAP-1):** duas orgs não-donas com cliente de nome idêntico leem **só a própria** base.
11. Import da Ficha org-scoped: aplicar na org A não toca a org B.

> **O caso do cliente homônimo** (duas agências com um cliente de mesmo nome — ex.:
> duas agências que atendem "Moovefy") aparece em **3** verificações (8, 9, 10). É o
> furo mais sutil e o mais importante de garantir. **Só libere acesso externo com o
> checklist 100% verde.**

---

## A porta da base de conhecimento (`radar-door`)

O Radar **nunca** tem a credencial do banco do Formare. Ele lê/escreve por um
serviço isolado (`door/door.mjs`, `127.0.0.1:8090`), com **URL + segredo
compartilhado**. Detalhe completo em [`door/README.md`](../door/README.md) e na
decisão [`DECISOES.md` (D2)](DECISOES.md#d2--a-base-de-conhecimento-do-formare-é-acessada-por-uma-porta-http-radar-door-não-pelo-banco).
Garantias: leitura só de conhecimento **confirmado**; escrita sempre **pendente +
rascunho** e **desligada** por padrão; INSERT-only; escuta só em `127.0.0.1`.

---

## Anti-injeção — conteúdo coletado é dado, nunca instrução

Todo prompt que recebe conteúdo raspado carrega o preâmbulo anti-injeção — **12
prompts, 8 arquivos** (`analyst.ts`, `analyst-lens.ts`, `analyst-vendedor.ts`,
`analyst-relacionamento.ts`, `cross-reference.ts`, `diagnostico/lente1.ts`,
`ask.ts`, `prospects/dossie.ts` ×5). Ver [`PRINCIPIOS.md` (§3)](PRINCIPIOS.md).

---

## Rate-limit por org

`src/lib/rate-limit.ts` — janela deslizante, chave `acao:orgId`, 429 +
`Retry-After`. Aplicado em 5 rotas caras: `run` (40/h), `diagnostico` (30/h),
`visual` (30/h), `upload` (60/h), `dossie` (20/h).

> **Limitação honesta:** é **in-memory, single-process** — some no restart e não
> cobre múltiplas instâncias. É um **freio de abuso**, não uma cota distribuída. Se
> o Radar escalar para várias instâncias, isto precisa de um backend compartilhado
> (Redis/DB).

---

## ⛔ Não faça isso

- **Não** use a `service_role` do Formare — o Radar não tem e não deve ter.
- **Não** filtre por org no app "para simplificar" — confie na RLS (senão o próximo
  `bug` de query vaza).
- **Não** importe `adminClient`/`SERVICE_ROLE` numa rota que serve o browser.
- **Não** dê `EXECUTE` das funções do coletor para `anon`/`authenticated`.
- **Não** libere acesso externo com o `test:isolation` incompleto.
- **Não** modifique o app nem o banco do **Formare** — exceto pela porta, com OK explícito.
- **Não** commite segredos (token do túnel, chaves) — nomes de env var sim, valores nunca.
