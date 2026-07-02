/**
 * VIGIAR — a tela onde o Rafael diz QUEM o Radar observa.
 *
 * Server component: lê a watchlist direto do disco (`readWatchlist`, nunca lança)
 * e entrega ao editor client. O cabeçalho resume a lista (nº de clientes e de
 * concorrentes efetivamente vigiados). Sem "Rodar agora" aqui — esta tela é de
 * cadastro; a varredura mora no Briefing/Feed.
 */

import { readWatchlist } from "@/lib/watchlist";

import { WatchlistEditor } from "@/components/watchlist-editor";

export const dynamic = "force-dynamic";

export default function VigiarPage() {
  const watchlist = readWatchlist();

  const clientCount = watchlist.clients.length;
  const watchedCount = watchlist.clients.reduce(
    (total, client) => total + client.competitors.filter((c) => c.enabled).length,
    0,
  );

  return (
    <section className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-10">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-stone-400">Vigiar</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
          Quem o Radar observa
        </h1>
        <p className="mt-1.5 text-sm text-stone-500">
          {clientCount} {clientCount === 1 ? "cliente" : "clientes"} · {watchedCount}{" "}
          {watchedCount === 1 ? "concorrente vigiado" : "concorrentes vigiados"}
        </p>
      </header>

      <div className="mt-8">
        <WatchlistEditor initial={watchlist} />
      </div>
    </section>
  );
}
