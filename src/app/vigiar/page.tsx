/**
 * CONCORRENTES · Vigiar — quem o Radar observa para ESTE cliente (fontes) +
 * atalho para o monitor visual (Identidade). CRM: tudo dentro da conta.
 *
 * Server component: lê a watchlist e o status por fonte; escopa ao cliente
 * selecionado (?cliente=). A troca de conta é pela sidebar.
 */

import Link from "next/link";

import { listSourceStatus } from "@/lib/source-status";
import { readWatchlist } from "@/lib/watchlist";

import { WatchlistEditor } from "@/components/watchlist-editor";

export const dynamic = "force-dynamic";

export default async function VigiarPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const params = await searchParams;
  const watchlist = readWatchlist();
  const allClients = watchlist.clients.map((c) => c.name);
  const cliente =
    params.cliente && allClients.includes(params.cliente) ? params.cliente : (allClients[0] ?? "");

  const sourceStatus = listSourceStatus();
  // escopa a watchlist ao cliente da conta (a sidebar troca de cliente).
  const scoped = cliente
    ? { clients: watchlist.clients.filter((c) => c.name === cliente) }
    : watchlist;
  const client = watchlist.clients.find((c) => c.name === cliente);
  const watchedCount = (client?.competitors ?? []).filter((c) => c.enabled).length;

  const q = cliente ? `?cliente=${encodeURIComponent(cliente)}` : "";

  return (
    <section className="mx-auto max-w-[1080px] px-5 py-8 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
        Concorrentes
      </p>

      {/* sub-nav da seção: fontes (Vigiar) · monitor visual (Identidade) */}
      <div className="mt-2 flex gap-1 border-b border-stone-200">
        <span className="border-b-2 border-stone-900 px-3 py-2 text-sm font-medium text-stone-900">
          Vigiar
        </span>
        <Link
          href={`/identidade${q}`}
          className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-stone-500 hover:text-stone-900"
        >
          Identidade
        </Link>
      </div>

      <p className="mt-4 text-sm text-stone-500">
        {watchedCount} {watchedCount === 1 ? "concorrente vigiado" : "concorrentes vigiados"} para{" "}
        <span className="font-medium text-stone-700">{cliente || "—"}</span>.
      </p>

      <div className="mt-6">
        <WatchlistEditor initial={scoped} sourceStatus={sourceStatus} />
      </div>
    </section>
  );
}
