/**
 * ZONA A da Home — "O NEGÓCIO" (só super_admin, CROSS-ORG). Os números da
 * PLATAFORMA (as agências que o dono vende): quantas agências, custo do mês,
 * contas monitoradas no total e a cota de Firecrawl. Reusa a medição do /custo
 * (JSONL global) + /admin (listOrgs) + o rodízio de chaves Firecrawl.
 *
 * Roda em contexto ADMIN (service_role, via runAsAdmin) — por isso o chamador
 * (a página) TEM que confirmar isSuperAdmin() antes. Cross-org de propósito.
 */

import { adminClient, runAsAdmin } from "@/lib/db/admin-client";
import { listOrgs } from "@/lib/db/admin-ops";
import { statusChaves, type StatusChave } from "@/lib/firecrawl-keys";
import { totais } from "@/lib/usage/aggregate";
import { readUsageEventsAsync } from "@/lib/usage/store";

export type NegocioResumo = {
  agencias: number;
  clientes: number;
  /** concorrentes/contas monitoradas somando todas as orgs. */
  contasMonitoradas: number;
  custoMesUSD: number;
  mesLabel: string;
  firecrawl: {
    restante: number;
    quota: number;
    /** true se apertado (≤15% da cota) ou alguma chave esgotada. */
    alerta: boolean;
    chaves: StatusChave[];
  };
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export async function loadNegocio(now: Date = new Date()): Promise<NegocioResumo> {
  return runAsAdmin(async () => {
    const orgs = await listOrgs();

    // contas monitoradas cross-org: os concorrentes vivem em clients.data (WatchClient).
    const sb = adminClient();
    const { data: clients } = await sb.from("clients").select("id, data");
    let contasMonitoradas = 0;
    for (const c of (clients ?? []) as Array<{ data?: { competitors?: unknown[] } }>) {
      const comps = c.data?.competitors;
      if (Array.isArray(comps)) contasMonitoradas += comps.length;
    }

    // custo do mês (JSONL global = plataforma inteira). Datas absolutas.
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const eventosMes = (await readUsageEventsAsync()).filter((e) => (e.ts ?? "") >= inicioMes);
    const custoMesUSD = totais(eventosMes).custo;

    // cota Firecrawl (rodízio de chaves).
    const chaves = statusChaves(now);
    const restante = chaves.reduce((s, c) => s + c.restante, 0);
    const quota = chaves.reduce((s, c) => s + c.quota, 0);
    // Alerta só quando o TOTAL do ciclo está baixo (≤15%). Uma chave esgotada
    // sozinha é NORMAL no rodízio (enche uma, passa pra próxima) — não alarma.
    const alerta = quota > 0 && restante / quota <= 0.15;

    return {
      agencias: orgs.length,
      clientes: (clients ?? []).length,
      contasMonitoradas,
      custoMesUSD,
      mesLabel: `${MESES[now.getMonth()]} de ${now.getFullYear()}`,
      firecrawl: { restante, quota, alerta, chaves },
    };
  });
}
