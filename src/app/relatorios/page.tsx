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

import { listReports } from "@/lib/reports";
import { readWatchlist } from "@/lib/watchlist";

import { ReportsView } from "@/components/reports-view";

export const dynamic = "force-dynamic";

export default function RelatoriosPage() {
  const reports = listReports();
  const clients = readWatchlist().clients.map((c) => c.name);

  return (
    <section className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-10">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-stone-400">Relatórios</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
          Relatórios do Radar
        </h1>
        <p className="mt-1.5 text-sm text-stone-500">
          Capture as boas respostas do chat ou monte um relatório sob medida — e leve pro Formare
          quando quiser.
        </p>
      </header>

      <div className="mt-8">
        <ReportsView reports={reports} clients={clients} />
      </div>
    </section>
  );
}
