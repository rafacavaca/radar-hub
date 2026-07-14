#!/usr/bin/env bash
# ============================================================================
# BACKUP PADRÃO-OURO do banco do Radar: pg_dump completo (schema + dado + RLS +
# funções) do schema public. Complementa o dump lógico (backup-db.mts): este
# é um .sql restaurável direto por psql; aquele é o dado em JSON (upsert).
#
# Servidor Supabase é Postgres 17 → precisa do pg_dump 17 (client-17 instalado
# via PGDG). Retenção 14 dias. chmod 600 (contém dado de todas as orgs).
#
# Uso: scripts/backup-pgdump.sh   (lê RADAR_DB_URL do .env.local)
# ============================================================================
set -euo pipefail

DIR="${RADAR_BACKUP_DIR:-/root/radar-backups}"
PGDUMP="${PGDUMP_BIN:-/usr/lib/postgresql/17/bin/pg_dump}"
RETENCAO_DIAS=14
STAMP="$(date -u +%Y-%m-%d-%H-%M-%S)"
ENVFILE="$(dirname "$0")/../.env.local"

# string de conexão vem do .env.local (nunca versionada)
URL="$(grep -E '^RADAR_DB_URL=' "$ENVFILE" | head -1 | cut -d= -f2-)"
if [ -z "${URL:-}" ]; then echo "Falta RADAR_DB_URL no .env.local"; exit 1; fi
if [ ! -x "$PGDUMP" ]; then echo "pg_dump 17 não encontrado em $PGDUMP"; exit 1; fi

mkdir -p "$DIR"
OUT="$DIR/radar-full-$STAMP.sql.gz"
PGCONNECT_TIMEOUT=20 "$PGDUMP" "$URL" -n public --no-owner --no-privileges | gzip > "$OUT"
chmod 600 "$OUT"
KB=$(du -k "$OUT" | cut -f1)
echo "✅ pg_dump: $OUT (${KB} KB)"

# retenção: apaga dumps completos com mais de RETENCAO_DIAS dias
find "$DIR" -maxdepth 1 -name 'radar-full-*.sql.gz' -mtime +$RETENCAO_DIAS -print -delete | sed 's/^/retenção apagou: /' || true
