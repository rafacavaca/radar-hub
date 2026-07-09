/**
 * RELATÓRIOS — a tela onde o Rafael LÊ, APAGA e leva pro Formare os relatórios
 * do Radar. Dois caminhos alimentam a lista: capturados do Pergunte ao Radar
 * (kind "chat") e montados sob medida por um pedido em linguagem natural
 * (kind "sob-medida", composto aqui mesmo pelo compositor).
 *
 * Server component: lê os relatórios guardados (`listReports`, mais novos
 * primeiro) e a lista de clientes da watchlist (só pro seletor do compositor)
 * e entrega tudo ao painel client `ReportsView`. Nenhuma chamada de LLM aqui —
 * o "montar sob medida" bate na API, que reúne o material coletado + o Brain.
 */

import { loadReports } from "@/lib/reports";
import { listSchedules } from "@/lib/schedules";
import { loadWatchlist } from "@/lib/watchlist";

import { ReportsView } from "@/components/reports-view";
import { SchedulesManager } from "@/components/schedules-manager";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const params = await searchParams;
  const allClients = (await loadWatchlist()).clients.map((c) => c.name);
  const cliente =
    params.cliente && allClients.includes(params.cliente) ? params.cliente : (allClients[0] ?? "");

  // escopado ao cliente da conta (relatórios e agendamentos dele).
  const reports = await loadReports(cliente || undefined);
  const schedules = cliente
    ? listSchedules().filter((s) => s.clientName === cliente)
    : listSchedules();
  const clients = cliente ? [cliente] : allClients;

  return (
    <section className="mx-auto max-w-[1080px] px-5 py-8 sm:px-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
          Relatórios
        </p>
        <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-stone-900">
          Relatórios do Radar
        </h1>
        <p className="mt-1.5 text-sm text-stone-500">
          Capture as boas respostas do chat ou monte um relatório sob medida — e leve pro Formare
          quando quiser.
        </p>
      </header>

      <div className="mt-8 space-y-6">
        <ReportsView reports={reports} clients={clients} />
        <SchedulesManager schedules={schedules} clients={clients} />
      </div>
    </section>
  );
}
