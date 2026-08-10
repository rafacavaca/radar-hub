/**
 * BASE DE CONHECIMENTO (D14) — a Revisar/Curadoria por cliente: o que o Radar
 * sabe deste cliente, com fonte. A IA infere (do site); o humano confirma o que
 * é verdade. Só o CONFIRMADO alimenta a correlação, o encaixe e o dossiê.
 *
 * Server component: resolve o cliente (?cliente=), carrega itens + contadores +
 * o site salvo, e entrega pra a view (curadoria interativa via /api/base).
 */

import { brainStats, loadBrainItems, loadBrainSite } from "@/lib/brain-nativo/store";
import { loadWatchlist } from "@/lib/watchlist";

import { BaseView } from "@/components/base/base-view";

export const dynamic = "force-dynamic";

export default async function BasePage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const params = await searchParams;
  const watchlist = await loadWatchlist();
  const clientNames = watchlist.clients.map((c) => c.name);
  const cliente =
    params.cliente && clientNames.includes(params.cliente) ? params.cliente : (clientNames[0] ?? "");

  if (!cliente) {
    return (
      <div className="mx-auto max-w-[1080px] px-6 py-8">
        <div className="rounded-lg border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
          <p className="text-base font-medium text-stone-700">Nenhum cliente ainda.</p>
          <p className="mt-1 text-sm text-stone-500">
            Cadastre uma conta na barra lateral pra começar a construir a base de conhecimento.
          </p>
        </div>
      </div>
    );
  }

  const [itens, stats, site] = await Promise.all([
    loadBrainItems(cliente),
    brainStats(cliente),
    loadBrainSite(cliente),
  ]);

  return (
    <div className="mx-auto max-w-[1080px] px-5 py-8 sm:px-6">
      <BaseView cliente={cliente} itens={itens} stats={stats} site={site} />
    </div>
  );
}
