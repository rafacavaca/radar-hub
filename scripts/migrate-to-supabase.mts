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

  // 5) STORES PEQUENOS → org_docs (mesmos kinds/keys dos dispatchers do app).
  const docs: Array<{ kind: string; key: string; data: unknown }> = [];

  // diag-config: Record<"cliente::competitorId", DiagConfig>
  const diagCfg = readJson<{ configs: Record<string, unknown> }>("diagnostico-config.json", { configs: {} });
  for (const [key, data] of Object.entries(diagCfg.configs)) docs.push({ kind: "diag-config", key, data });

  // alertas: regras por cliente + disparos agrupados por cliente
  const alertas = readJson<{ regras: Record<string, unknown>; disparos: Array<{ clientName?: string }> }>(
    "diagnostico-alertas.json", { regras: {}, disparos: [] },
  );
  for (const [key, data] of Object.entries(alertas.regras)) docs.push({ kind: "diag-alertas-regras", key, data });
  const dispPorCliente = new Map<string, unknown[]>();
  for (const d of alertas.disparos) {
    const cli = String(d.clientName ?? "");
    if (!cli) continue;
    dispPorCliente.set(cli, [...(dispPorCliente.get(cli) ?? []), d]);
  }
  for (const [key, data] of dispPorCliente) docs.push({ kind: "diag-alertas-disparos", key, data });

  // cobertura: uma por cliente
  const cob = readJson<{ coberturas: Array<{ clientName?: string }> }>("cobertura.json", { coberturas: [] });
  for (const c of cob.coberturas) if (c.clientName) docs.push({ kind: "cobertura", key: String(c.clientName), data: c });

  // lentes: LensConfig[] por cliente
  const lenses = readJson<{ clients: Array<{ clientName?: string; lenses?: unknown }> }>("lenses.json", { clients: [] });
  for (const c of lenses.clients) if (c.clientName) docs.push({ kind: "lenses", key: String(c.clientName), data: c.lenses ?? [] });

  // notas de roadmap: agrupadas por cliente
  const notes = readJson<{ notes: Array<{ clientName?: string }> }>("roadmap-notes.json", { notes: [] });
  const notasPorCliente = new Map<string, unknown[]>();
  for (const n of notes.notes) {
    const cli = String(n.clientName ?? "");
    if (!cli) continue;
    notasPorCliente.set(cli, [...(notasPorCliente.get(cli) ?? []), n]);
  }
  for (const [key, data] of notasPorCliente) docs.push({ kind: "roadmap-notes", key, data });

  // status por fonte: "cid:sid" → doc por concorrente {sid: status}
  const status = readJson<{ status: Record<string, unknown> }>("source-status.json", { status: {} });
  const statusPorCmp = new Map<string, Record<string, unknown>>();
  for (const [k, v] of Object.entries(status.status)) {
    const i = k.indexOf(":");
    if (i <= 0) continue;
    const cid = k.slice(0, i), sid = k.slice(i + 1);
    const doc = statusPorCmp.get(cid) ?? {};
    doc[sid] = v;
    statusPorCmp.set(cid, doc);
  }
  for (const [key, data] of statusPorCmp) docs.push({ kind: "source-status", key, data });

  // relatórios agendados: um doc por agendamento
  const sched = readJson<{ schedules: Array<{ id?: string }> }>("schedules.json", { schedules: [] });
  for (const s of sched.schedules) if (s.id) docs.push({ kind: "schedules", key: String(s.id), data: s });

  // cache do dia do loop (regenerável, mas evita re-rodar o loop já no flip)
  try {
    const dia = new Date().toISOString().slice(0, 10);
    const cachePath = join(process.cwd(), ".cache", `loop-${dia}.json`);
    if (existsSync(cachePath)) {
      docs.push({ kind: "loop-cache", key: dia, data: JSON.parse(readFileSync(cachePath, "utf8")) });
    }
  } catch { /* cache ilegível — o loop regenera */ }

  let nDoc = 0;
  for (const d of docs) {
    await admin.from("org_docs").upsert(
      { org_id: orgId, kind: d.kind, key: d.key, data: d.data ?? {}, updated_at: new Date().toISOString() },
      { onConflict: "org_id,kind,key" },
    );
    nDoc++;
  }
  console.log(`org_docs=${nDoc} (config/alertas/schedule/cobertura/lentes/notas/status/agendados/cache)`);

  // 6) usage_events (medição — item 1). Re-sync limpo: apaga os da org e
  // re-insere do JSONL (fonte da verdade) — re-rodar não duplica.
  const usage = readJsonl("usage-events.jsonl");
  await admin.from("usage_events").delete().eq("org_id", orgId);
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
