-- ============================================================================
-- Radar Hub — Migração 002: org_docs (stores pequenos) + link público de
-- relatório (capability por token). Aplicar APÓS a 001.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ORG_DOCS — documento org-scoped genérico para os STORES PEQUENOS do Radar
-- (lentes, config de diagnóstico, alertas/regras, agendamentos, notas, status
-- de fonte, etc.). Mesmo padrão envelope: (kind, key) identifica o documento,
-- `data` guarda a forma JSON que o app já usa. Evita uma tabela por store sem
-- abrir mão do isolamento: RLS idêntica às demais.
-- ----------------------------------------------------------------------------
create table if not exists org_docs (
  org_id      uuid not null references orgs(id) on delete cascade,
  kind        text not null,          -- ex.: "lenses" | "diag-config" | "alertas" | "schedules" | "notes"
  key         text not null,          -- ex.: nome do cliente, ou "global"
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (org_id, kind, key)
);

alter table org_docs enable row level security;
alter table org_docs force row level security;
drop policy if exists org_isolation on org_docs;
create policy org_isolation on org_docs
  for all
  using (is_super_admin() or org_id in (select auth_org_ids()))
  with check (is_super_admin() or org_id in (select auth_org_ids()));

-- ----------------------------------------------------------------------------
-- LINK PÚBLICO de relatório — capability por token (o "/r/<token>").
-- O visitante NÃO tem sessão; a RLS normal (correta!) devolveria nada. A
-- capability é o token imprevisível: esta função SECURITY DEFINER devolve
-- EXATAMENTE o relatório daquele token — superfície mínima, sem god-key na
-- rota. EXECUTE liberado a anon de propósito (é um link "quem tem, vê").
-- ----------------------------------------------------------------------------
create or replace function report_by_share_token(p_token text)
  returns jsonb
  language sql stable security definer set search_path = public
as $$
  select data from reports
  where share_token = p_token and p_token is not null and length(p_token) >= 16
  limit 1
$$;

grant execute on function report_by_share_token(text) to anon, authenticated;
