-- ============================================================================
-- Radar Hub — Multi-tenant + isolamento no BANCO (item 2). Migração 001.
--
-- O ponto inegociável: uma agência só lê/escreve as PRÓPRIAS linhas — garantido
-- por Row Level Security (RLS) no Postgres, não só na tela. `service_role`
-- ignora RLS e por isso NUNCA entra no caminho do usuário (só cron/admin,
-- fora de request). Um vazamento entre orgs seria fatal ("confiança é o fosso").
--
-- Padrão de dados: ENVELOPE jsonb. Cada tabela carrega as colunas de
-- isolamento/consulta (org_id + chaves) como colunas REAIS e o resto do
-- documento (as formas JSON que o app já usa) em `data jsonb`. Isso torna a
-- migração dos stores JSON direta (o app guarda a mesma forma em `data`, ganha
-- org_id + RLS) sem uma normalização arriscada e especulativa.
--
-- Idempotente onde dá (IF NOT EXISTS). Aplicar no projeto Supabase do Radar.
-- ============================================================================

-- gen_random_uuid() — nativo no Postgres do Supabase (pgcrypto).
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Papéis. super_admin = Rafael (vê tudo, com cuidado). org_admin = dono da
-- agência. member = usuário da agência.
-- ----------------------------------------------------------------------------
do $$ begin
  create type radar_role as enum ('super_admin', 'org_admin', 'member');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- TENANT: org (a agência) e membership (usuário ↔ org, com papel).
-- O usuário vem do Supabase Auth (auth.users). Um usuário pode pertencer a mais
-- de uma org (ex.: o super_admin), por isso membership é N:N.
-- ----------------------------------------------------------------------------
create table if not exists orgs (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        radar_role not null default 'member',
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists memberships_user_idx on memberships(user_id);
create index if not exists memberships_org_idx  on memberships(org_id);

-- ----------------------------------------------------------------------------
-- Helpers de RLS. SECURITY DEFINER + search_path fixo (não deixa a resolução
-- de nome ser sequestrada). STABLE: o planner cacheia dentro da query.
--
-- auth_org_ids(): as orgs a que o CHAMADOR pertence (via memberships).
-- is_super_admin(): o chamador é super_admin em ALGUMA org?
-- auth.uid() vem do JWT da sessão do Supabase — nulo fora de sessão (cron).
-- ----------------------------------------------------------------------------
create or replace function auth_org_ids()
  returns setof uuid
  language sql stable security definer set search_path = public, auth
as $$
  select org_id from memberships where user_id = auth.uid()
$$;

create or replace function is_super_admin()
  returns boolean
  language sql stable security definer set search_path = public, auth
as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid() and role = 'super_admin'
  )
$$;

-- is_org_admin(org): o chamador é org_admin DAQUELA org? SECURITY DEFINER de
-- propósito — a política de `memberships` NÃO pode consultar `memberships`
-- inline (recursão infinita de RLS). O definer lê ignorando a RLS e corta o laço.
create or replace function is_org_admin(p_org uuid)
  returns boolean
  language sql stable security definer set search_path = public, auth
as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid() and org_id = p_org and role = 'org_admin'
  )
$$;

-- ----------------------------------------------------------------------------
-- DADOS do Radar (envelope jsonb). Toda tabela tem org_id NOT NULL + RLS.
-- ids em text: o app já usa ids string estáveis (sha1/slug); mantemos.
-- ----------------------------------------------------------------------------
create table if not exists clients (
  id          text not null,
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null,
  mode        text not null default 'concorrentes',
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (org_id, id),
  unique (org_id, name)   -- nomes únicos DENTRO da org (podem repetir entre orgs)
);

create table if not exists competitors (
  id          text not null,
  org_id      uuid not null references orgs(id) on delete cascade,
  client_id   text not null,
  name        text not null,
  site_url    text,
  pillar      text,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (org_id, id)
);
create index if not exists competitors_client_idx on competitors(org_id, client_id);

create table if not exists signals (
  id            text not null,
  org_id        uuid not null references orgs(id) on delete cascade,
  client_id     text,
  competitor_id text,
  ts            timestamptz not null default now(),
  data          jsonb not null default '{}'::jsonb,
  primary key (org_id, id)
);
create index if not exists signals_client_idx on signals(org_id, client_id, ts desc);

create table if not exists diagnostics (
  id            text not null,
  org_id        uuid not null references orgs(id) on delete cascade,
  client_id     text not null,
  competitor_id text not null,
  data          jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (org_id, id),
  unique (org_id, client_id, competitor_id)
);

create table if not exists reports (
  id           text not null,
  org_id       uuid not null references orgs(id) on delete cascade,
  client_id    text,
  kind         text,
  share_token  text,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  primary key (org_id, id)
);
-- share_token é uma capability pública (link compartilhável) — único global.
create unique index if not exists reports_share_token_idx on reports(share_token) where share_token is not null;

create table if not exists usage_events (
  id             bigint generated always as identity,
  org_id         uuid references orgs(id) on delete cascade,
  client_id      text,
  feature        text not null,
  entidade_tipo  text,
  entidade_id    text,
  provider       text not null,
  modelo         text,
  tokens_in      integer,
  tokens_out     integer,
  unidades       integer,
  custo_estimado double precision not null default 0,
  ts             timestamptz not null default now(),
  data           jsonb not null default '{}'::jsonb,
  primary key (id)
);
create index if not exists usage_events_org_idx on usage_events(org_id, ts desc);

-- ----------------------------------------------------------------------------
-- RLS. Habilita em TODAS as tabelas e cria a política de isolamento por org.
-- Padrão: (is_super_admin() OR org_id ∈ auth_org_ids()) tanto em USING (leitura/
-- update/delete) quanto em WITH CHECK (insert/update — impede gravar em org
-- alheia). FORCE garante que nem o dono da tabela escapa da RLS.
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clients','competitors','signals','diagnostics','reports','usage_events']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists org_isolation on %I', t);
    execute format($f$
      create policy org_isolation on %I
        for all
        using (is_super_admin() or org_id in (select auth_org_ids()))
        with check (is_super_admin() or org_id in (select auth_org_ids()))
    $f$, t);
  end loop;
end $$;

-- orgs: o usuário vê as orgs a que pertence; super_admin vê todas. Só
-- super_admin cria/edita orgs (o app faz isso por server action de admin).
alter table orgs enable row level security;
alter table orgs force row level security;
drop policy if exists orgs_visiveis on orgs;
create policy orgs_visiveis on orgs
  for select using (is_super_admin() or id in (select auth_org_ids()));
drop policy if exists orgs_admin_write on orgs;
create policy orgs_admin_write on orgs
  for all using (is_super_admin()) with check (is_super_admin());

-- memberships: o usuário vê as próprias e as da(s) sua(s) org(s); super_admin
-- vê todas. Escrita (convite/remoção): super_admin, ou org_admin da MESMA org.
alter table memberships enable row level security;
alter table memberships force row level security;
drop policy if exists memberships_visiveis on memberships;
create policy memberships_visiveis on memberships
  for select using (
    is_super_admin() or user_id = auth.uid() or org_id in (select auth_org_ids())
  );
-- escrita via helper SECURITY DEFINER (sem subconsulta inline em memberships,
-- que causaria recursão de RLS): super_admin, ou org_admin da MESMA org.
drop policy if exists memberships_admin_write on memberships;
create policy memberships_admin_write on memberships
  for all
  using (is_super_admin() or is_org_admin(org_id))
  with check (is_super_admin() or is_org_admin(org_id));

-- ----------------------------------------------------------------------------
-- CAMINHO DO COLETOR (cron da VPS) — o candidato nº 1 a virar o furo.
-- O cron escreve SINAIS mas não tem sessão de usuário (auth.uid() é nulo), logo
-- a RLS normal barraria. Em vez de dar service_role ao caminho do usuário,
-- expomos UMA função controlada e auditável: recebe o org_id EXPLÍCITO e insere
-- só sinais. SECURITY DEFINER (roda como dono, além da RLS), mas a superfície é
-- mínima e o org_id é obrigatório — nada de god-key solta no fluxo do usuário.
-- ----------------------------------------------------------------------------
create or replace function collector_insert_signal(
  p_org_id        uuid,
  p_id            text,
  p_client_id     text,
  p_competitor_id text,
  p_ts            timestamptz,
  p_data          jsonb
) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  if p_org_id is null then
    raise exception 'collector_insert_signal: org_id é obrigatório (sem org, não grava)';
  end if;
  insert into signals (id, org_id, client_id, competitor_id, ts, data)
  values (p_id, p_org_id, p_client_id, p_competitor_id, coalesce(p_ts, now()), coalesce(p_data, '{}'::jsonb))
  on conflict (org_id, id) do update
    set data = excluded.data, ts = excluded.ts;
end $$;

-- só o backend do coletor (role de serviço) chama isto; nunca o cliente anon.
revoke all on function collector_insert_signal(uuid, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
