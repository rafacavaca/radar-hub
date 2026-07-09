/**
 * MODO APRESENTAÇÃO (F6) — a visão de um time em formato LIMPO e exportável:
 * "este é o radar comercial da sua semana". Sem nav, sem botões de ação —
 * só as leituras, com fontes, pronto pra projetar ou salvar em PDF.
 *
 * Abre do Briefing ("Apresentar ↗"), em aba própria. `?lente=` + `?cliente=`.
 */

import { formatDateTimePtBR } from "@/lib/format";
import { lensesFor, LENS_LABEL, type LensId } from "@/lib/lenses";
import { runRadarLoop } from "@/lib/loop";
import { loadWatchlist } from "@/lib/watchlist";

import { LensReadingCard } from "@/components/lens-reading-card";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

const LENSES: LensId[] = ["comercial", "produto", "marketing"];

export default async function ApresentarPage({
  searchParams,
}: {
  searchParams: Promise<{ lente?: string; cliente?: string }>;
}) {
  const params = await searchParams;

  const clients = (await loadWatchlist()).clients.map((c) => c.name);
  const cliente =
    params.cliente && clients.includes(params.cliente) ? params.cliente : (clients[0] ?? "");
  const lente = (LENSES.includes(params.lente as LensId) ? params.lente : "comercial") as LensId;

  const result = await runRadarLoop().catch(() => null);
  const readings = (result?.readings ?? []).filter(
    (r) => r.clientName === cliente && r.lens === lente,
  );
  const team = lensesFor(cliente).find((l) => l.id === lente)?.team ?? "";

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 print:py-4">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-6">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-stone-400">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full bg-red-500 ring-4 ring-red-500/15"
            />
            Radar · Inteligência de mercado
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
            Radar {LENS_LABEL[lente]} — {cliente}
          </h1>
          <p className="mt-1.5 text-sm text-stone-500">
            {team ? <>{team} · </> : null}
            {result?.ranAt ? <>atualizado em {formatDateTimePtBR(result.ranAt)}</> : null} ·{" "}
            {readings.length} {readings.length === 1 ? "leitura" : "leituras"}
          </p>
        </div>
        <PrintButton />
      </header>

      <div className="mt-8 space-y-5">
        {readings.length === 0 ? (
          <p className="py-16 text-center text-stone-500">
            Nenhuma leitura {LENS_LABEL[lente].toLowerCase()} nesta rodada.
          </p>
        ) : (
          readings.map((reading) => (
            <LensReadingCard key={reading.id} reading={reading} actions={false} />
          ))
        )}
      </div>

      <footer className="mt-10 border-t border-stone-200 pt-4 text-center text-xs text-stone-400">
        Gerado pelo Radar — Formare · fontes citadas em cada leitura
      </footer>
    </section>
  );
}
