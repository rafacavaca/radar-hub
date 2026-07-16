/**
 * ANALISTAS — a tela onde o Rafael vê e afina COMO cada uma das três lentes
 * pensa, por cliente (comercial, produto, marketing).
 *
 * Server component no espírito de "transparência dos agentes": lê a config das
 * lentes (`loadLenses`, org-scoped ou JSON; nunca lança e semeia o padrão) e
 * entrega ao editor client. Sem lógica aqui — só leitura e enquadramento.
 */

import { loadLenses } from "@/lib/lenses";
import { loadWatchlist } from "@/lib/watchlist";

import { LensConfigEditor } from "@/components/lens-config-editor";
import { Rotulo } from "@/components/rotulo";

export const dynamic = "force-dynamic";

export default async function AnalistasPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const params = await searchParams;
  const allClients = (await loadWatchlist()).clients.map((c) => c.name);
  const cliente =
    params.cliente && allClients.includes(params.cliente) ? params.cliente : (allClients[0] ?? "");

  // escopado ao cliente: as lentes DELE (o CRM mostra tudo dentro da conta).
  const file = await loadLenses();
  const scoped = cliente
    ? { clients: file.clients.filter((c) => c.clientName === cliente) }
    : file;

  return (
    <section className="mx-auto max-w-[1080px] px-5 py-8 sm:px-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
          Ajustes · <Rotulo termo="areas" lower />
        </p>
        <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-stone-900">
          Como cada <Rotulo termo="areas" singular lower /> pensa
        </h1>
        <p className="mt-1.5 text-sm text-stone-500">
          Três áreas leem cada sinal — comercial, produto e marketing. Ajuste a régua de cada
          uma; o padrão já vem pronto.
        </p>
        <p className="mt-2 max-w-[70ch] rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-[12px] text-stone-500">
          A <span className="font-medium text-stone-700">régua</span>, o time e a ação de cada área são <span className="font-medium text-stone-700">critério da agência</span>: você ajusta uma vez e vale para todas as contas. Só <span className="font-medium text-stone-700">ligar/desligar</span> uma área é por conta.
        </p>
      </header>

      <div className="mt-8">
        <LensConfigEditor initial={scoped} />
      </div>
    </section>
  );
}
