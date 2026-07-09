/**
 * Executor dos RELATÓRIOS AGENDADOS (F10) + varredura do diagnóstico (0a) —
 * chamado pelo timer do sistema (systemd radar-schedules.timer, de hora em
 * hora). Roda os agendamentos VENCIDOS agora e sai. Idempotente: cada
 * agendamento roda no máximo 1x por dia local (Brasil).
 *
 * MULTI-TENANT (item 2): em modo Supabase, itera as ORGS e roda cada passada
 * dentro de `runAsOrgCollector(org)` — agendamentos, material do loop, alertas
 * e relatórios são os DA ORG (org explícita; falha de uma org não derruba as
 * outras). Em modo clássico, uma passada única no JSON, como sempre.
 *
 * Uso manual: npm run schedules:run
 */

import { config } from "dotenv";

import { markAdminProcess } from "@/lib/db/admin-client";
import { listOrgsAsCollector, runAsOrgCollector } from "@/lib/db/collector-org";
import { supabaseEnabled } from "@/lib/db/supabase";
import { ensureDigestMatinal } from "@/lib/digest";
import { maybeSendDigestEmail } from "@/lib/digest-email";
import { runDueSchedules } from "@/lib/schedules";
import { runDueDiagnosticos } from "@/lib/diagnostico/schedule";

config({ path: ".env.local" });

/** Uma passada completa (relatórios + diagnóstico + digest matinal) no contexto atual. */
async function passada(now: Date, label: string): Promise<void> {
  // 1. Relatórios agendados (F10).
  const result = await runDueSchedules(now);
  console.log(
    `[run-schedules ${now.toISOString()}] (${label}) relatórios: rodados=${result.ran} pulados=${result.skipped} erros=${result.errors.length}`,
  );
  for (const r of result.reports) console.log(`  ✓ "${r.titulo}" (${r.reportId})`);
  for (const e of result.errors) console.log(`  ✗ ${e.scheduleId}: ${e.error}`);

  // 2. Varredura agendada do diagnóstico (0a) — gera movimentos/alertas sozinha.
  const diag = await runDueDiagnosticos(now);
  console.log(
    `[run-schedules ${now.toISOString()}] (${label}) diagnóstico: clientes=${diag.clientesRodados} concorrentes=${diag.concorrentesVarridos} com-movimento=${diag.comMovimento} erros=${diag.erros.length}`,
  );
  for (const d of diag.detalhe) console.log(`  ✓ ${d.clientName}/${d.competitorId}: ${d.movimentosNovos} movimento(s) novo(s)`);
  for (const e of diag.erros) console.log(`  ✗ ${e.clientName}/${e.competitorId}: ${e.error}`);

  // 3. Digest matinal (ritual F1) — a partir das 6h locais, 1x por dia; e-mail
  //    é opt-in (placeholder: sem provedor configurado, só registra).
  const matinal = await ensureDigestMatinal(now);
  console.log(
    `[run-schedules ${now.toISOString()}] (${label}) digest: ${matinal.acao}${matinal.digest ? ` · itens=${matinal.digest.itens.length} adiados=${matinal.digest.adiados.length}${matinal.digest.tranquilo ? " · dia tranquilo" : ""}` : ""}`,
  );
  if (matinal.acao === "gerado" && matinal.digest) {
    const envio = await maybeSendDigestEmail(matinal.digest, label);
    console.log(`[run-schedules ${now.toISOString()}] (${label}) e-mail do digest: ${envio}`);
  }
}

async function main(): Promise<void> {
  const now = new Date();

  if (supabaseEnabled()) {
    markAdminProcess(); // processo de propósito único (cron) — habilita o coletor
    const orgs = await listOrgsAsCollector();
    console.log(`[run-schedules ${now.toISOString()}] modo org: ${orgs.length} org(s)`);
    for (const org of orgs) {
      try {
        await runAsOrgCollector(org.id, () => passada(now, org.slug));
      } catch (err) {
        console.error(`[run-schedules] org ${org.slug} falhou: ${(err as Error).message}`);
      }
    }
  } else {
    await passada(now, "clássico");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("run-schedules falhou:", err);
  process.exit(1);
});
