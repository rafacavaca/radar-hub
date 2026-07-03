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

config({ path: ".env.local" });

async function main(): Promise<void> {
  const now = new Date();
  const result = await runDueSchedules(now);
  console.log(
    `[run-schedules ${now.toISOString()}] rodados=${result.ran} pulados=${result.skipped} erros=${result.errors.length}`,
  );
  for (const r of result.reports) console.log(`  ✓ "${r.titulo}" (${r.reportId})`);
  for (const e of result.errors) console.log(`  ✗ ${e.scheduleId}: ${e.error}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("run-schedules falhou:", err);
  process.exit(1);
});
