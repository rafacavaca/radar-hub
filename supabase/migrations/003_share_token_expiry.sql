-- ============================================================================
-- Radar Hub — Migração 003: EXPIRAÇÃO + REVOGAÇÃO do link público de relatório.
-- Aplicar no SQL editor do Supabase (projeto do Radar). Idempotente.
--
-- Contexto: a função capability `report_by_share_token` (002) tem EXECUTE pra
-- `anon` — então pode ser chamada direto via PostgREST. A checagem de validade
-- PRECISA estar aqui (no banco), senão um portador do token burlaria a checagem
-- do app. A app já:
--   - REVOGA limpando `share_token` (a RPC não acha o token → nega na hora);
--   - grava `data->>'shareExpiresAt'` (ISO) e `data->>'shareRevoked'` no upsert.
-- Esta migração leva a EXPIRAÇÃO/REVOGAÇÃO pra dentro da RPC (à prova de bypass).
-- ============================================================================

create or replace function report_by_share_token(p_token text)
  returns jsonb
  language sql stable security definer set search_path = public
as $$
  select data from reports
  where share_token = p_token
    and p_token is not null and length(p_token) >= 16
    -- link não revogado
    and coalesce(data->>'shareRevoked', 'false') <> 'true'
    -- link não expirado (sem validade = compat com links antigos; novos sempre têm)
    and (
      data->>'shareExpiresAt' is null
      or (data->>'shareExpiresAt')::timestamptz > now()
    )
  limit 1
$$;

grant execute on function report_by_share_token(text) to anon, authenticated;
