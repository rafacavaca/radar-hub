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
import { automacaoDevida, loadAutomacoes, marcarRodou } from "@/lib/automacoes";
import { ensureDigestMatinal } from "@/lib/digest";
import { maybeSendDigestEmail } from "@/lib/digest-email";
import { prepararReunioes } from "@/lib/prospects/preparo";
import { sendDossiePdfEmail } from "@/lib/prospects/email";
import { loadWatchlist } from "@/lib/watchlist";
import { runDueSchedules } from "@/lib/schedules";
import { runDueDiagnosticos } from "@/lib/diagnostico/schedule";

config({ path: ".env.local" });

/**
 * Uma passada completa no contexto (org). AS VARREDURAS QUE RODAM SOZINHAS
 * (digest matinal + varredura de concorrentes) só acontecem se LIGADAS no painel
 * de Automações e devidas hoje (default OFF — nada roda sem o Rafael ligar).
 * Relatórios agendados e dossiês de reunião seguem opt-in POR ITEM.
 */
async function passada(now: Date, label: string): Promise<void> {
  const auto = await loadAutomacoes();

  // 1. Relatórios agendados (F10) — opt-in por item (só roda o que foi criado).
  const result = await runDueSchedules(now);
  if (result.ran > 0 || result.errors.length > 0) {
    console.log(`[run-schedules ${now.toISOString()}] (${label}) relatórios: rodados=${result.ran} erros=${result.errors.length}`);
  }

  // 2. Varredura de concorrentes (diagnóstico) — SÓ se ligada no painel e devida.
  if (automacaoDevida(auto.diagnostico, now)) {
    const diag = await runDueDiagnosticos(now, { ignorarAgenda: true });
    await marcarRodou("diagnostico", now);
    console.log(`[run-schedules ${now.toISOString()}] (${label}) varredura: clientes=${diag.clientesRodados} concorrentes=${diag.concorrentesVarridos} com-movimento=${diag.comMovimento} erros=${diag.erros.length}`);
  } else {
    console.log(`[run-schedules ${now.toISOString()}] (${label}) varredura: ${auto.diagnostico.enabled ? "não é o dia" : "desligada"}`);
  }

  // 3. Resumo do dia (digest matinal) — SÓ se ligado no painel e devido; e-mail opt-in.
  if (automacaoDevida(auto.digest, now)) {
    const matinal = await ensureDigestMatinal(now);
    if (matinal.acao !== "cedo") await marcarRodou("digest", now); // antes das 6h, tenta de novo depois
    console.log(`[run-schedules ${now.toISOString()}] (${label}) digest: ${matinal.acao}${matinal.digest ? ` · itens=${matinal.digest.itens.length}${matinal.digest.tranquilo ? " · dia tranquilo" : ""}` : ""}`);
    if (matinal.acao === "gerado" && matinal.digest) {
      const envio = await maybeSendDigestEmail(matinal.digest, label);
      console.log(`[run-schedules ${now.toISOString()}] (${label}) e-mail do digest: ${envio}`);
    }
  } else {
    console.log(`[run-schedules ${now.toISOString()}] (${label}) digest: ${auto.digest.enabled ? "não é o dia" : "desligado"}`);
  }

  // 4. Preparo pré-reunião (F2) — na véspera, gera o dossiê e manda o PDF por
  //    e-mail. Só reuniões de AMANHÃ, dossiê gerado 1x, e-mail 1x (idempotente).
  const clientes = (await loadWatchlist()).clients.map((c) => c.name);
  const prep = await prepararReunioes(clientes, now, { sendPdfEmail: (p, pdf) => sendDossiePdfEmail(p, pdf, label) });
  if (prep.preparados > 0 || prep.jaProntos > 0 || prep.emails.length > 0 || prep.erros.length > 0) {
    console.log(
      `[run-schedules ${now.toISOString()}] (${label}) prospects: dossiês preparados=${prep.preparados} já-prontos=${prep.jaProntos} e-mails=[${prep.emails.map((e) => `${e.nome}:${e.envio}`).join(", ")}] erros=${prep.erros.length}`,
    );
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
