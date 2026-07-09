/**
 * BACKFILL (item 2) — leva os dados JSON de hoje pro Supabase, tudo sob a org
 * "Formare" (o tenant do Rafael). Nada se perde: os arquivos JSON continuam
 * intactos; isto só POPULA o banco. Idempotente (upsert por (org_id, id)).
 *
 * Requer as chaves (SUA VEZ): RADAR_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Roda em contexto admin (service_role) — é migração de dados, fora do fluxo
 * do usuário. Uso: npm run migrate:supabase
 */

import { config } from "dotenv";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local" });

const URL = process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATA = process.env.RADAR_DATA_DIR || join(process.cwd(), "data");

function readJson<T>(file: string, fallback: T): T {
  const p = join(DATA, file);
  if (!existsSync(p)) return fallback;
  try { return JSON.parse(readFileSync(p, "utf8")) as T; } catch { return fallback; }
}
function readJsonl(file: string): Record<string, unknown>[] {
  const p = join(DATA, file);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split("\n").map((l) => l.trim()).filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

async function main(): Promise<void> {
  if (!URL || !SERVICE) {
    console.error("⚠ Faltam RADAR_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (SUA VEZ). Nada foi feito.");
    process.exit(2);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  // 1) org "Formare" (idempotente por slug)
  const slug = "formare";
  let { data: org } = await admin.from("orgs").select("id").eq("slug", slug).maybeSingle();
  if (!org) {
    const ins = await admin.from("orgs").insert({ slug, name: "Formare" }).select("id").single();
    org = ins.data;
  }
  const orgId = org!.id as string;
  console.log(`org Formare = ${orgId}`);

  // 1b) vincula o Rafael (super_admin) se o usuário existir no Auth
  const email = process.env.RADAR_APP_EMAIL?.toLowerCase();
  if (email) {
    const users = await admin.auth.admin.listUsers();
    const u = users.data.users.find((x) => x.email?.toLowerCase() === email);
    if (u) {
      await admin.from("memberships").upsert({ org_id: orgId, user_id: u.id, role: "super_admin" }, { onConflict: "org_id,user_id" });
      console.log(`membership: ${email} → super_admin`);
    } else {
      console.log(`(usuário ${email} ainda não existe no Auth — crie-o e rode de novo p/ vincular)`);
    }
  }

  // 2) watchlist → clients + competitors
  const wl = readJson<{ clients: Array<{ name: string; mode?: string; competitors?: Array<Record<string, unknown>> }> }>("watchlist.json", { clients: [] });
  let nCli = 0, nCmp = 0;
  for (const c of wl.clients) {
    const clientId = c.name; // id estável do app é o nome
    await admin.from("clients").upsert({ id: clientId, org_id: orgId, name: c.name, mode: c.mode ?? "concorrentes", data: c }, { onConflict: "org_id,id" });
    nCli++;
    for (const cmp of c.competitors ?? []) {
      const id = String((cmp as { id?: string }).id ?? "");
      if (!id) continue;
      await admin.from("competitors").upsert({ id, org_id: orgId, client_id: clientId, name: String((cmp as { name?: string }).name ?? ""), site_url: (cmp as { siteUrl?: string }).siteUrl ?? null, data: cmp }, { onConflict: "org_id,id" });
      nCmp++;
    }
  }
  console.log(`clients=${nCli} competitors=${nCmp}`);

  // 3) diagnósticos
  const diag = readJson<{ diagnosticos: Array<Record<string, unknown>> }>("diagnostico.json", { diagnosticos: [] });
  let nDia = 0;
  for (const d of diag.diagnosticos) {
    const id = `${(d as { concorrente_id?: string }).concorrente_id ?? ""}`;
    if (!id) continue;
    await admin.from("diagnostics").upsert({ id, org_id: orgId, client_id: String((d as { clientName?: string }).clientName ?? ""), competitor_id: id, data: d }, { onConflict: "org_id,id" });
    nDia++;
  }
  console.log(`diagnostics=${nDia}`);

  // 4) relatórios
  const rep = readJson<{ reports: Array<Record<string, unknown>> }>("reports.json", { reports: [] });
  let nRep = 0;
  for (const r of rep.reports) {
    const id = String((r as { id?: string }).id ?? "");
    if (!id) continue;
    await admin.from("reports").upsert({ id, org_id: orgId, client_id: String((r as { clientName?: string }).clientName ?? "") || null, kind: (r as { kind?: string }).kind ?? null, share_token: (r as { shareToken?: string }).shareToken ?? null, data: r }, { onConflict: "org_id,id" });
    nRep++;
  }
  console.log(`reports=${nRep}`);

  // 5) usage_events (medição — item 1)
  const usage = readJsonl("usage-events.jsonl");
  let nUse = 0;
  for (const e of usage) {
    await admin.from("usage_events").insert({
      org_id: orgId,
      client_id: (e as { clientName?: string }).clientName ?? null,
      feature: String((e as { feature?: string }).feature ?? "outro"),
      entidade_tipo: (e as { entidadeTipo?: string }).entidadeTipo ?? null,
      entidade_id: (e as { entidadeId?: string }).entidadeId ?? null,
      provider: String((e as { provider?: string }).provider ?? "desconhecido"),
      modelo: (e as { modelo?: string }).modelo ?? null,
      tokens_in: (e as { tokensIn?: number }).tokensIn ?? null,
      tokens_out: (e as { tokensOut?: number }).tokensOut ?? null,
      unidades: (e as { unidades?: number }).unidades ?? null,
      custo_estimado: Number((e as { custoEstimado?: number }).custoEstimado ?? 0),
      ts: (e as { ts?: string }).ts ?? new Date().toISOString(),
      data: e,
    });
    nUse++;
  }
  console.log(`usage_events=${nUse}`);
  console.log("\n✅ Backfill concluído — dados atuais viram a org Formare. Os JSON seguem intactos.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
