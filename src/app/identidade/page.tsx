/**
 * IDENTIDADE — o nó Visão. A tela onde o Rafael acompanha se um concorrente
 * mudou a IDENTIDADE visual/mensagem (rebranding, novo discurso).
 *
 * Server component: lê a watchlist, monta a lista de TODOS os concorrentes com
 * `siteUrl` (os sem site não dão pra printar — viram um aviso) e junta o ÚLTIMO
 * relatório visual de cada um. Como `latestByCompetitor` é por cliente e devolve
 * um Map (que não serializa pro client), chamamos por cliente e achatamos num
 * `Record<competitorId, VisualReport>` simples pra passar ao painel client.
 */

import Link from "next/link";

import { latestByCompetitor, type VisualReport } from "@/lib/visual";
import { loadWatchlist } from "@/lib/watchlist";

import { IdentidadeView } from "@/components/identidade-view";

export const dynamic = "force-dynamic";

export default async function IdentidadePage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const params = await searchParams;
  const watchlist = await loadWatchlist();
  const allClients = watchlist.clients.map((c) => c.name);
  const cliente =
    params.cliente && allClients.includes(params.cliente) ? params.cliente : (allClients[0] ?? "");

  const competitors: Array<{
    competitorId: string;
    competitorName: string;
    clientName: string;
    siteUrl: string;
  }> = [];
  const initialReports: Record<string, VisualReport> = {};
  let semSite = 0;

  // escopado ao cliente selecionado (a sidebar troca de conta).
  for (const client of watchlist.clients) {
    if (cliente && client.name !== cliente) continue;
    for (const [competitorId, report] of latestByCompetitor(client.name)) {
      initialReports[competitorId] = report;
    }
    for (const competitor of client.competitors) {
      if (competitor.siteUrl) {
        competitors.push({
          competitorId: competitor.id,
          competitorName: competitor.name,
          clientName: client.name,
          siteUrl: competitor.siteUrl,
        });
      } else {
        semSite += 1;
      }
    }
  }

  const q = cliente ? `?cliente=${encodeURIComponent(cliente)}` : "";

  return (
    <section className="mx-auto max-w-[1080px] px-5 py-8 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
        Concorrentes
      </p>

      {/* sub-nav: fontes (Vigiar) · monitor visual (Identidade) */}
      <div className="mt-2 flex gap-1 border-b border-stone-200">
        <Link
          href={`/vigiar${q}`}
          className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-stone-500 hover:text-stone-900"
        >
          Monitorar
        </Link>
        <span className="border-b-2 border-stone-900 px-3 py-2 text-sm font-medium text-stone-900">
          Identidade
        </span>
      </div>

      <header className="mt-4">
        <p className="text-sm text-stone-500">
          O Radar olha a página pública de cada concorrente e detecta se mudaram as cores, o visual
          ou o discurso — sinais de rebranding.
        </p>
        {competitors.length > 0 && semSite > 0 ? (
          <p className="mt-2 text-xs text-stone-400">
            {semSite}{" "}
            {semSite === 1
              ? "concorrente sem site cadastrado não aparece aqui"
              : "concorrentes sem site cadastrado não aparecem aqui"}{" "}
            — adicione o site em{" "}
            <Link href={`/vigiar${q}`} className="underline underline-offset-2 hover:text-stone-600">
              Monitorar
            </Link>
            .
          </p>
        ) : null}
      </header>

      <div className="mt-6">
        {competitors.length > 0 ? (
          <IdentidadeView competitors={competitors} initialReports={initialReports} />
        ) : (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
            <p className="text-base font-medium text-stone-700">
              Nenhum concorrente com site cadastrado.
            </p>
            <p className="mt-1 text-sm text-stone-500">
              Adicione o site de um concorrente na tela{" "}
              <Link href="/vigiar" className="underline underline-offset-2 hover:text-stone-700">
                Monitorar
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
