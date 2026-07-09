/**
 * CONTAS · Vigiar — o cadastro das CONTAS-CHAVE (pilar Clientes). MESMO fluxo do
 * cadastro de concorrentes (nome + site → descobrir fontes → confirmar), só que
 * a entidade entra marcada como `pillar: "conta-chave"`. Reusa o WatchlistEditor.
 *
 * Server component: lê a watchlist + status por fonte; escopa ao cliente (?cliente=).
 * Cliente de carteira vai pra /carteira (lá as contas são "hospitais").
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { listSourceStatus } from "@/lib/source-status";
import { pillarOf, loadWatchlist } from "@/lib/watchlist";

import { WatchlistEditor } from "@/components/watchlist-editor";

export const dynamic = "force-dynamic";

export default async function ContasVigiarPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const params = await searchParams;
  const watchlist = await loadWatchlist();
  const allClients = watchlist.clients.map((c) => c.name);
  const cliente =
    params.cliente && allClients.includes(params.cliente) ? params.cliente : (allClients[0] ?? "");

  const client = watchlist.clients.find((c) => c.name === cliente);
  if (!client) redirect("/visao");
  if (client.mode === "carteira") {
    redirect(`/carteira?cliente=${encodeURIComponent(cliente)}`);
  }

  const sourceStatus = listSourceStatus();
  // escopa ao cliente E ao pilar CONTA-CHAVE (o server filtra; o editor só renderiza).
  const scoped = {
    clients: watchlist.clients
      .filter((c) => c.name === cliente)
      .map((c) => ({
        ...c,
        competitors: c.competitors.filter((k) => pillarOf(k, c.mode) === "conta-chave"),
      })),
  };
  const contasCount = (client.competitors ?? []).filter(
    (c) => pillarOf(c, client.mode) === "conta-chave" && c.enabled,
  ).length;

  const q = cliente ? `?cliente=${encodeURIComponent(cliente)}` : "";

  return (
    <section className="mx-auto max-w-[1080px] px-5 py-8 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
        Contas-chave · {cliente}
      </p>

      {/* sub-nav: fichas · vigiar (esta) */}
      <div className="mt-2 flex gap-1 border-b border-stone-200">
        <Link
          href={`/contas${q}`}
          className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-stone-500 hover:text-stone-900"
        >
          Fichas
        </Link>
        <span className="border-b-2 border-stone-900 px-3 py-2 text-sm font-medium text-stone-900">
          Vigiar
        </span>
      </div>

      <p className="mt-4 text-sm text-stone-500">
        {contasCount} {contasCount === 1 ? "conta-chave vigiada" : "contas-chave vigiadas"} para{" "}
        <span className="font-medium text-stone-700">{cliente || "—"}</span>. Cadastre igual você faz
        com concorrentes — o Radar cruza cada sinal da conta com a oferta do cliente (Brain).
      </p>

      <div className="mt-6">
        <WatchlistEditor initial={scoped} sourceStatus={sourceStatus} pillar="conta-chave" />
      </div>
    </section>
  );
}
