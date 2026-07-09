/**
 * Executor dos RELATÓRIOS AGENDADOS (F10) — chamado pelo timer do sistema
 * (systemd radar-schedules.timer, de hora em hora). Roda os agendamentos
 * VENCIDOS agora e sai. Idempotente: cada agendamento roda no máximo 1x por
 * dia local (Brasil), então rodar de hora em hora é seguro.
 *
 * Uso manual: npm run schedules:run
 */

import { config } from "dotenv";

import { runDueSchedules } from "@/lib/schedules";
import { runDueDiagnosticos } from "@/lib/diagnostico/schedule";

config({ path: ".env.local" });

async function main(): Promise<void> {
  const now = new Date();

  // 1. Relatórios agendados (F10).
  const result = await runDueSchedules(now);
  console.log(
    `[run-schedules ${now.toISOString()}] relatórios: rodados=${result.ran} pulados=${result.skipped} erros=${result.errors.length}`,
  );
  for (const r of result.reports) console.log(`  ✓ "${r.titulo}" (${r.reportId})`);
  for (const e of result.errors) console.log(`  ✗ ${e.scheduleId}: ${e.error}`);

  // 2. Varredura agendada do diagnóstico (0a) — gera movimentos/alertas sozinha.
  const diag = await runDueDiagnosticos(now);
  console.log(
    `[run-schedules ${now.toISOString()}] diagnóstico: clientes=${diag.clientesRodados} concorrentes=${diag.concorrentesVarridos} com-movimento=${diag.comMovimento} erros=${diag.erros.length}`,
  );
  for (const d of diag.detalhe) console.log(`  ✓ ${d.clientName}/${d.competitorId}: ${d.movimentosNovos} movimento(s) novo(s)`);
  for (const e of diag.erros) console.log(`  ✗ ${e.clientName}/${e.competitorId}: ${e.error}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("run-schedules falhou:", err);
  process.exit(1);
});
