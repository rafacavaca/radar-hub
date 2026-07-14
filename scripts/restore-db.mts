/**
 * RESTORE do backup lógico (par do backup-db.mts). Re-insere (upsert) as tabelas
 * de dado a partir de um arquivo .json.gz. Ordem: pais antes de filhos.
 *
 * Uso:
 *   tsx scripts/restore-db.mts <arquivo.json.gz>            # restaura TUDO (recuperação)
 *   tsx scripts/restore-db.mts <arquivo.json.gz> --org <id> # só uma org (restore parcial)
 *
 * Auth (usuários): NÃO é restaurado por aqui (senha é hash; recria-se por convite,
 * ou usa-se o backup/PITR gerenciado do Supabase). Este restore é o DADO do app;
 * o SCHEMA/RLS/funções vêm das migrations (001-003).
 */

import { createGunzip } from "node:zlib";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";

import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

const { createClient } = await import("@supabase/supabase-js");

const arquivo = process.argv[2];
const orgFiltro = process.argv.includes("--org") ? process.argv[process.argv.indexOf("--org") + 1] : null;
if (!arquivo) {
  console.error("Uso: tsx scripts/restore-db.mts <arquivo.json.gz> [--org <id>]");
  process.exit(1);
}

const URL = process.env.RADAR_SUPABASE_URL!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(URL, SVC, { auth: { persistSession: false } });

// tabela -> colunas do onConflict (a PK real; ver migrations 001/002)
const ONCONFLICT: Record<string, string> = {
  orgs: "id",
  memberships: "id",
  clients: "org_id,id",
  competitors: "org_id,id",
  signals: "org_id,id",
  diagnostics: "org_id,id",
  reports: "org_id,id",
  org_docs: "org_id,kind,key",
  usage_events: "id",
};
const ORDEM = ["orgs", "memberships", "clients", "competitors", "signals", "diagnostics", "reports", "org_docs", "usage_events"];

// lê o gzip inteiro
let buf = "";
await pipeline(createReadStream(arquivo), createGunzip(), async function* (src) {
  for await (const chunk of src) buf += chunk;
  yield;
});
const dump = JSON.parse(buf) as Record<string, Array<Record<string, unknown>>>;

console.log(`Restaurando de ${arquivo}${orgFiltro ? ` (só org ${orgFiltro.slice(0, 8)}…)` : " (tudo)"}\n`);
let total = 0;
for (const t of ORDEM) {
  let linhas = dump[t] ?? [];
  if (orgFiltro) linhas = linhas.filter((r) => r.org_id === orgFiltro || (t === "orgs" && r.id === orgFiltro));
  if (linhas.length === 0) continue;
  // upsert em lotes de 500
  for (let i = 0; i < linhas.length; i += 500) {
    const lote = linhas.slice(i, i + 500);
    const { error } = await sb.from(t).upsert(lote, { onConflict: ONCONFLICT[t] });
    if (error) throw new Error(`${t}: ${error.message}`);
  }
  console.log(`  ${t}: ${linhas.length} restaurada(s)`);
  total += linhas.length;
}
console.log(`\n✅ restore concluído: ${total} linha(s).`);
