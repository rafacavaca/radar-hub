# Multi-tenant + isolamento no banco (item 2)

> O portão para deixar uma agência externa entrar: ela loga e vê **só o banco
> dela**. O inegociável é **isolamento no BANCO (RLS)**, não na tela — e
> **testado** antes de qualquer acesso externo. "Confiança é o fosso": um
> vazamento entre orgs seria fatal.

## Estado desta entrega

**Fundação construída e revisável — ainda NÃO provada ao vivo** (falta o
projeto Supabase, que é *SUA VEZ*). Nada em produção mudou: enquanto
`RADAR_DB != "supabase"`, o app segue no armazenamento JSON single-tenant de
hoje. O multi-tenant só acende com a flag + as chaves.

| Peça | Arquivo | Estado |
|------|---------|--------|
| Schema + RLS (o núcleo de segurança) | `supabase/migrations/001_init_multitenant.sql` | ✅ escrito, revisável |
| Clientes Supabase (user × admin + guarda) | `src/lib/db/supabase.ts` | ✅ typecheck ok |
| Contexto de org da sessão | `src/lib/db/org-context.ts` | ✅ typecheck ok |
| Caminho do coletor (org explícito) | `src/lib/db/collector.ts` | ✅ typecheck ok |
| Backfill JSON → org "Formare" | `scripts/migrate-to-supabase.mts` | ✅ pronto (roda nas chaves) |
| Checklist de isolamento (harness) | `scripts/test-isolation.mts` | ✅ estático verde; banco pendente |
| Auth Supabase na app + cutover dos stores | — | ⏳ na fase com o DB vivo (verificável) |

Por que a app e o cutover dos stores ficam para depois das chaves: reescrever a
camada de dados de um app em produção **sem poder testar** seria exatamente o
"fluxo opaco impossível de debugar" que o projeto proíbe. Com o DB vivo, cada
store migra e é **verificado** — incrementos pequenos e verificáveis.

## O modelo de isolamento

- **Tenant = `org`** (a agência). `user` (do Supabase Auth) pertence a org via
  `memberships`, com papel: `super_admin` (Rafael), `org_admin`, `member`.
- **Toda tabela de dados tem `org_id`** e **RLS habilitada + FORCE**. A política
  padrão: `is_super_admin() OR org_id ∈ auth_org_ids()` em **USING** (leitura/
  update/delete) e em **WITH CHECK** (impede gravar em org alheia).
- `auth_org_ids()` e `is_super_admin()` derivam de `auth.uid()` (o JWT da
  sessão). Fora de sessão (cron), `auth.uid()` é nulo → a RLS não libera nada.
- O app opera **sempre com `userClient(token)`** (a sessão do usuário). A org
  **não é um filtro que o app escolhe** — é a RLS do banco que recusa a linha.
  Isso é o que torna o isolamento real, não cosmético.

## `service_role` — a god-key, fora do caminho do usuário

`service_role` **ignora a RLS**. Regras:

- **Nunca** no fluxo do usuário (rotas/páginas que servem o browser).
- Só **cron/coletor** e **server actions de admin**, que rodam fora de request.
- `adminClient()` **recusa** ser criado sem o selo `RADAR_ADMIN_CONTEXT=1` (que
  só scripts/ações de admin põem) — um import acidental numa rota falha
  barulhento, não silencioso.
- O checklist tem um item **estático** (grep em `src/app`) que falha se qualquer
  rota importar `adminClient`/`SERVICE_ROLE`.

## O coletor (candidato nº 1 a furo)

O cron escreve **sinais** sem sessão. Em vez de espalhar god-key, passa por
**uma** função controlada e auditável no banco:
`collector_insert_signal(p_org_id, …)` — `SECURITY DEFINER`, superfície mínima,
**`org_id` obrigatório** (a função recusa org nula). O `org_id` vem da linha da
watchlist que originou a coleta, nunca adivinhado. `EXECUTE` revogado de
`anon`/`authenticated`.

## Checklist de isolamento (a PAUSA OBRIGATÓRIA)

`npm run test:isolation` cria 2 orgs (A, B) com dados distintos e prova, item a
item (o que o Rafael pediu):

1. **A não vê nenhum dado de B** — clients, competitors, signals, diagnostics, reports.
2. **Deep-link por id de B → negado** (0 linhas, não a tela de B).
3. **Escrita cruzada (A grava em org de B) → recusada** pela RLS (`WITH CHECK`).
4. **Invertido** — B não vê A.
5. **Coletor grava na org certa** (org_id explícito) e a outra não vê.
6. **Nenhuma rota de usuário usa `service_role`** (estático — já roda hoje, ✅).

Busca / "Pergunte ao Radar" não vazar entre orgs decorre do mesmo mecanismo: o
`ask` passa a ler via `userClient(token)`, então a RLS já filtra por org.

**Só liberar acesso externo quando o checklist passar 100%.**

## SUA VEZ, Rafael (para destravar a prova)

1. Crie um **projeto Supabase** para o Radar (ou reaproveite um dedicado — não o
   do Formare, para separar os fossos).
2. Aplique a migração `supabase/migrations/001_init_multitenant.sql` (SQL editor
   ou CLI).
3. Ponha no `.env.local` do Radar:
   ```
   RADAR_DB=supabase
   RADAR_SUPABASE_URL=...
   RADAR_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...        # server-only; nunca no fluxo do usuário
   ```
4. Crie o seu usuário no Supabase Auth (e-mail/senha — **você** define a senha).
5. Rode `npm run migrate:supabase` (backfill → org "Formare", vincula você como
   super_admin) e depois `npm run test:isolation` (o checklist ao vivo).

Aí eu sigo o cutover dos stores + a auth na app, **verificando** cada passo — e
te entrego o checklist 100% antes de qualquer acesso externo.
