/**
 * FEED — o HISTÓRICO DURÁVEL de sinais crus de um cliente (F6 + histórico).
 *
 * Lê a tabela `signals` (durável, org-scoped) — NÃO o cache do dia: aqui NADA
 * some. É o que o Radar VIU ao longo do tempo, antes de qualquer leitura —
 * concorrente, tipo, título (link), trecho e as datas. A leitura por área e a
 * curadoria (top do dia) moram no Briefing; este é o arquivo completo.
 */

import { formatDateShort, formatDateTimePtBR } from "@/lib/format";
import { loadSignals } from "@/lib/db/repo-signals";
import { loadRadarForRender } from "@/lib/loop";
import type { ClientEvent } from "@/lib/loop";
import { AutoRefreshStale } from "@/components/auto-refresh-stale";
import { loadWatchlist } from "@/lib/watchlist";

import { FeedList } from "@/components/feed-list";
import { RodarAgora } from "@/components/rodar-agora";

export const dynamic = "force-dynamic";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const params = await searchParams;
  const clientNames = (await loadWatchlist()).clients.map((c) => c.name);
  const cliente =
    params.cliente && clientNames.includes(params.cliente) ? params.cliente : (clientNames[0] ?? "");

  // Histórico durável (tabela signals) + o cache só pra o warm/última varredura.
  let events: ClientEvent[] = [];
  let error: string | null = null;
  const render = await loadRadarForRender().catch(() => ({ items: [], ranAt: "", needsRefresh: false }));
  try {
    events = cliente ? await loadSignals(cliente) : [];
  } catch (err) {
    error = err instanceof Error ? err.message : "Não foi possível carregar o histórico.";
  }

  // desde quando há história (o mais antigo — a lista vem ts desc).
  const desde = events.length ? (events[events.length - 1].collectedAt ?? events[events.length - 1].publishedAt) : null;
  const agora = new Date().toISOString();

  return (
    <section className="mx-auto max-w-[1080px] px-5 py-8 sm:px-6">
      <AutoRefreshStale needsRefresh={render.needsRefresh} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
            Feed · histórico
          </p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-stone-900">
            Todos os sinais coletados
          </h1>
          <p className="mt-1.5 text-sm text-stone-500">
            {events.length > 0 ? (
              <>
                {events.length} {events.length === 1 ? "sinal" : "sinais"}
                {desde ? <> desde {formatDateShort(desde)}</> : null} — nada some daqui.{" "}
              </>
            ) : null}
            {render.ranAt ? <>Última varredura {formatDateTimePtBR(render.ranAt)}. </> : null}
            A leitura por área está no Briefing.
          </p>
        </div>
        <RodarAgora testId="rodar-agora" cliente={cliente || undefined} />
      </header>

      <div className="mt-8">
        {error ? (
          <ErrorState message={error} />
        ) : events.length === 0 ? (
          <EmptyState />
        ) : (
          <FeedList events={events} now={agora} />
        )}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
      <p className="text-base font-medium text-stone-700">Nenhum sinal coletado ainda para este cliente.</p>
      <p className="mt-1 text-sm text-stone-500">
        Rode o Radar para buscar os primeiros movimentos — a partir daí, tudo fica guardado aqui.
      </p>
      <div className="mt-5 flex justify-center">
        <RodarAgora />
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center">
      <p className="text-base font-medium text-red-800">Não foi possível rodar o Radar agora.</p>
      <p className="mt-1 text-sm text-red-600">{message}</p>
      <div className="mt-5 flex justify-center">
        <RodarAgora variant="ghost" />
      </div>
    </div>
  );
}
