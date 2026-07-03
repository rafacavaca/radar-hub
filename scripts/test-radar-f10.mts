/**
 * Smoke test da F10 — o "juiz" dos RELATÓRIOS AGENDADOS.
 *
 * O coração é a LÓGICA DE VENCIMENTO (isDue) — testável sem LLM, com datas
 * fixas. Prova:
 *   1. CRUD: criar persiste; toggle desliga/liga; apagar some;
 *   2. DIÁRIO: vence hoje se não rodou hoje; NÃO vence de novo no mesmo dia;
 *   3. SEMANAL: vence só no dia da semana marcado — não nos outros;
 *   4. PAUSADO nunca vence;
 *   5. fuso Brasil: a virada de dia usa horário de Brasília (uma data UTC que
 *      no Brasil ainda é "ontem" conta como o dia local certo).
 *
 * Custo: 0 LLM, 0 rede (só a lógica pura + o store em disco isolado).
 * Uso: npm run smoke:f10
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEMP_DIR = mkdtempSync(join(tmpdir(), "radar-schedules-"));
process.env.RADAR_DATA_DIR = TEMP_DIR;

const {
  createSchedule,
  deleteSchedule,
  isDue,
  listSchedules,
  localDayKey,
  localWeekday,
  setScheduleEnabled,
} = await import("@/lib/schedules");

type Criterio = { nome: string; feito: boolean; detalhe?: string };

// Datas fixas (UTC) para tornar o vencimento determinístico.
// 2026-07-06 é uma SEGUNDA-feira; 12:00Z = 09:00 no Brasil (mesmo dia local).
const SEG = new Date("2026-07-06T12:00:00Z");
const TER = new Date("2026-07-07T12:00:00Z");

function rodar(): Criterio[] {
  const criterios: Criterio[] = [];

  // 1) CRUD.
  let crudOk = false;
  let crudDet = "";
  try {
    const s = createSchedule({
      clientName: "Moovefy",
      request: "relatório comercial dos concorrentes",
      cadence: { kind: "weekly", weekday: 1 }, // segunda
    });
    const criado = listSchedules().length === 1;
    setScheduleEnabled(s.id, false);
    const desligou = listSchedules()[0].enabled === false;
    setScheduleEnabled(s.id, true);
    const ligou = listSchedules()[0].enabled === true;
    crudOk = criado && desligou && ligou;
    crudDet = `criado=${criado}, desliga=${desligou}, liga=${ligou}`;
    deleteSchedule(s.id);
    crudOk = crudOk && listSchedules().length === 0;
  } catch (err) {
    crudDet = `falhou: ${(err as Error).message}`;
  }
  criterios.push({ nome: "CRUD: criar · pausar/retomar · apagar", feito: crudOk, detalhe: crudDet });

  // 2) SEMANAL vence na segunda, não na terça.
  const semanal = createSchedule({
    clientName: "Moovefy",
    request: "relatório semanal",
    cadence: { kind: "weekly", weekday: 1 },
  });
  const venceSeg = isDue(semanal, SEG);
  const naoVenceTer = !isDue(semanal, TER);
  criterios.push({
    nome: "Semanal (segunda): vence na segunda, NÃO vence na terça",
    feito: venceSeg && naoVenceTer,
    detalhe: `segunda=${venceSeg}, terça=${naoVenceTer} (weekday seg=${localWeekday(SEG)})`,
  });

  // 3) DIÁRIO vence hoje; depois de rodar hoje, não vence de novo no mesmo dia.
  const diario = createSchedule({
    clientName: "Moovefy",
    request: "relatório diário",
    cadence: { kind: "daily" },
  });
  const venceHoje = isDue(diario, SEG);
  // simula "rodou hoje" marcando lastRunDay = dia local de SEG.
  setScheduleEnabled(diario.id, true);
  const rodado = { ...diario, lastRunDay: localDayKey(SEG) };
  const naoRepete = !isDue(rodado, SEG);
  const venceAmanha = isDue(rodado, TER);
  criterios.push({
    nome: "Diário: vence hoje · não repete no mesmo dia · volta a vencer amanhã",
    feito: venceHoje && naoRepete && venceAmanha,
    detalhe: `hoje=${venceHoje}, repete=${!naoRepete}, amanhã=${venceAmanha}`,
  });

  // 4) Pausado nunca vence.
  const pausado = { ...diario, enabled: false };
  criterios.push({
    nome: "Pausado nunca vence",
    feito: !isDue(pausado, SEG),
    detalhe: `due(pausado)=${isDue(pausado, SEG)}`,
  });

  // 5) Fuso Brasil: 2026-07-07T02:00Z é 07/07 em UTC mas ainda 06/07 (23h) no
  //    Brasil -> o dia local é 06 (segunda), então o semanal-segunda vence.
  const madrugadaUtc = new Date("2026-07-07T02:00:00Z");
  const diaLocal = localDayKey(madrugadaUtc);
  const venceComoSegunda = isDue(semanal, madrugadaUtc);
  criterios.push({
    nome: "Fuso Brasil: a virada de dia respeita Brasília (não UTC)",
    feito: diaLocal === "2026-07-06" && venceComoSegunda,
    detalhe: `diaLocalBR=${diaLocal} (UTC seria 07-07), vence como segunda=${venceComoSegunda}`,
  });

  return criterios;
}

function main(): void {
  console.log("\n=== Smoke F10 — Relatórios agendados (a lógica de vencimento) ===\n");
  let tudoVerde = true;
  try {
    for (const c of rodar()) {
      console.log(`${c.feito ? "✅" : "⬜"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
      if (!c.feito) tudoVerde = false;
    }
  } finally {
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  console.log();
  if (tudoVerde) {
    console.log("F10 VERDE ✅ — o agendador vence no dia certo (fuso Brasil) e não repete.");
    process.exit(0);
  }
  console.log("F10 ainda NÃO completa — critérios acima em branco.");
  process.exit(1);
}

main();
