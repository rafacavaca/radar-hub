/**
 * CONCORRENTES · Vigiar — quem o Radar observa para ESTE cliente (fontes) +
 * atalho para o monitor visual (Identidade). CRM: tudo dentro da conta.
 *
 * Server component: lê a watchlist e o status por fonte; escopa ao cliente
 * selecionado (?cliente=). A troca de conta é pela sidebar.
 */

import Link from "next/link";

import { loadSourceStatus } from "@/lib/source-status";
import { pillarOf, loadWatchlist } from "@/lib/watchlist";

import { WatchlistEditor } from "@/components/watchlist-editor";
import { Rotulo } from "@/components/rotulo";

export const dynamic = "force-dynamic";

export default async function VigiarPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const params = await searchParams;
  const watchlist = await loadWatchlist();
  const allClients = watchlist.clients.map((c) => c.name);
  const cliente =
    params.cliente && allClients.includes(params.cliente) ? params.cliente : (allClients[0] ?? "");

  const sourceStatus = await loadSourceStatus();
  const client = watchlist.clients.find((c) => c.name === cliente);
  // escopa ao cliente E ao pilar CONCORRENTE (contas-chave têm a própria tela em Contas → Vigiar).
  const scoped = {
    clients: (cliente ? watchlist.clients.filter((c) => c.name === cliente) : watchlist.clients).map(
      (c) => ({
        ...c,
        competitors: c.competitors.filter((k) => pillarOf(k, c.mode) === "concorrente"),
      }),
    ),
  };
  const watchedCount = (client?.competitors ?? []).filter(
    (c) => c.enabled && pillarOf(c, client?.mode) === "concorrente",
  ).length;

  const q = cliente ? `?cliente=${encodeURIComponent(cliente)}` : "";

  return (
    <section className="mx-auto max-w-[1080px] px-5 py-8 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
        <Rotulo termo="concorrentes" />
      </p>

      {/* sub-nav da seção: fontes (Vigiar) · monitor visual (Identidade) */}
      <div className="mt-2 flex gap-1 border-b border-stone-200">
        <span className="border-b-2 border-stone-900 px-3 py-2 text-sm font-medium text-stone-900">
          Monitorar
        </span>
        <Link
          href={`/identidade${q}`}
          className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-stone-500 hover:text-stone-900"
        >
          Identidade
        </Link>
        <Link
          href={`/diagnostico${q}`}
          className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-stone-500 hover:text-stone-900"
        >
          Diagnóstico
        </Link>
      </div>

      <p className="mt-4 text-sm text-stone-500">
        {watchedCount} {watchedCount === 1 ? "concorrente monitorado" : "concorrentes monitorados"} para{" "}
        <span className="font-medium text-stone-700">{cliente || "—"}</span>.
      </p>

      <div className="mt-6">
        <WatchlistEditor initial={scoped} sourceStatus={sourceStatus} />
      </div>
    </section>
  );
}
