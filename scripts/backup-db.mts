/**
 * BACKUP LÓGICO do banco do Radar (independente do dashboard). Dump de TODAS as
 * tabelas de dado via service_role (bypassa RLS de propósito — é backup), + os
 * usuários de auth (id/email, sem senha). Grava gzip em /root/radar-backups,
 * chmod 600 (contém dado de todas as orgs — nunca world-readable), retenção 14 dias.
 *
 * Restaura: `tsx scripts/restore-db.mts <arquivo.json.gz>` (re-insere via upsert).
 * O SCHEMA/RLS/funções vêm das migrations (001-003) — este backup é o DADO.
 * (O pg_dump completo, quando houver a string de conexão, é o padrão-ouro.)
 *
 * Uso: tsx scripts/backup-db.mts
 */

import { createGzip } from "node:zlib";
import { createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

const { createClient } = await import("@supabase/supabase-js");

const URL = process.env.RADAR_SUPABASE_URL!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DIR = process.env.RADAR_BACKUP_DIR || "/root/radar-backups";
const RETENCAO_DIAS = 14;
const DATA = process.env.RADAR_BACKUP_STAMP || new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

// Tabelas de DADO (a ordem importa no restore: pais antes de filhos).
const TABELAS = ["orgs", "memberships", "clients", "competitors", "signals", "diagnostics", "reports", "org_docs", "usage_events"];

if (!URL || !SVC) {
  console.error("Faltam RADAR_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sb = createClient(URL, SVC, { auth: { persistSession: false } });

/** Lê uma tabela inteira, paginando (o PostgREST limita a 1000/página). */
async function dumpTabela(t: string): Promise<unknown[]> {
  const linhas: unknown[] = [];
  const passo = 1000;
  for (let from = 0; ; from += passo) {
    const { data, error } = await sb.from(t).select("*").range(from, from + passo - 1);
    if (error) throw new Error(`${t}: ${error.message}`);
    linhas.push(...(data ?? []));
    if (!data || data.length < passo) break;
  }
  return linhas;
}

const dump: Record<string, unknown> = { _meta: { geradoEm: new Date().toISOString(), projeto: URL.replace(/^https?:\/\//, "").split(".")[0] } };
let total = 0;
for (const t of TABELAS) {
  const linhas = await dumpTabela(t);
  dump[t] = linhas;
  total += linhas.length;
  console.log(`  ${t}: ${linhas.length} linha(s)`);
}
// usuários de auth (só id/email/criado — SEM senha; a senha é recriada por convite)
const { data: usersData } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
dump._auth_users = (usersData?.users ?? []).map((u) => ({ id: u.id, email: u.email, created_at: u.created_at }));
console.log(`  auth.users: ${dump._auth_users.length} (id/email, sem senha)`);

mkdirSync(DIR, { recursive: true });
const arquivo = join(DIR, `radar-${DATA}.json.gz`);
await pipeline(Readable.from([JSON.stringify(dump)]), createGzip(), createWriteStream(arquivo));
chmodSync(arquivo, 0o600); // só o root lê — contém dado de todas as orgs
const kb = Math.round(statSync(arquivo).size / 1024);
console.log(`\n✅ backup: ${arquivo} (${kb} KB, ${total} linhas de dado)`);

// retenção: apaga backups com mais de RETENCAO_DIAS
const limite = Date.now() - RETENCAO_DIAS * 86400000;
let apagados = 0;
for (const f of readdirSync(DIR)) {
  if (!f.startsWith("radar-") || !f.endsWith(".json.gz")) continue;
  const p = join(DIR, f);
  if (statSync(p).mtimeMs < limite) { unlinkSync(p); apagados++; }
}
if (apagados) console.log(`retenção: ${apagados} backup(s) antigo(s) apagado(s) (> ${RETENCAO_DIAS} dias)`);
