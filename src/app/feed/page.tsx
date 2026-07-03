/**
 * FEED — os SINAIS CRUS coletados, sem lente (F6).
 *
 * Transversal por definição (a spec das lentes): aqui é o que o Radar VIU,
 * antes de qualquer leitura — concorrente, tipo, título (link) e um trecho.
 * As leituras por time moram no Briefing; ações também.
 */

import { formatDateTimePtBR } from "@/lib/format";
import { runRadarLoop, type ClientEvent, type RadarLoopResult } from "@/lib/loop";
import { readWatchlist } from "@/lib/watchlist";

import { RodarAgora } from "@/components/rodar-agora";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  blog: "artigo",
  news: "notícia",
  release: "novidade",
  page: "página",
  material: "material",
};

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const params = await searchParams;
  const clientNames = readWatchlist().clients.map((c) => c.name);
  const cliente =
    params.cliente && clientNames.includes(params.cliente) ? params.cliente : (clientNames[0] ?? "");

  let result: RadarLoopResult = { items: [], ranAt: "" };
  let error: string | null = null;
  try {
    result = await runRadarLoop();
  } catch (err) {
    error = err instanceof Error ? err.message : "Não foi possível rodar o Radar.";
  }

  // escopado ao cliente selecionado (CRM: tudo dentro da conta).
  const events = (result.events ?? []).filter((e) => !cliente || e.clientName === cliente);

  return (
    <section className="mx-auto max-w-[1080px] px-5 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
            Feed
          </p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-stone-900">
            Sinais crus coletados
          </h1>
          <p className="mt-1.5 text-sm text-stone-500">
            {events.length} {events.length === 1 ? "sinal" : "sinais"}
            {result.ranAt ? <> · atualizado em {formatDateTimePtBR(result.ranAt)}</> : null} · as
            leituras por time estão no Briefing
          </p>
        </div>
        <RodarAgora testId="rodar-agora" cliente={cliente || undefined} />
      </header>

      <div className="mt-8">
        {error ? (
          <ErrorState message={error} />
        ) : events.length === 0 ? (
          <EmptyState hasItems={result.items.length > 0} />
        ) : (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {events.map((event) => (
              <FeedRow
                key={`${event.clientName}-${event.id}`}
                event={event}
                showClient={new Set(events.map((e) => e.clientName)).size > 1}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function FeedRow({ event, showClient }: { event: ClientEvent; showClient: boolean }) {
  return (
    <li data-testid="feed-item" className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {showClient ? (
          <span className="rounded-full border border-stone-200 px-2 py-0.5 text-xs font-medium text-stone-500">
            {event.clientName}
          </span>
        ) : null}
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
          {event.competitorName}
        </span>
        <span className="text-xs text-stone-400">{KIND_LABEL[event.kind] ?? event.kind}</span>
        {event.category ? <span className="text-xs text-stone-400">· {event.category}</span> : null}
      </div>
      <a
        href={event.url}
        target="_blank"
        rel="noreferrer"
        className="mt-1 block font-medium leading-snug text-stone-900 underline-offset-2 hover:underline"
      >
        {event.title}
      </a>
      {event.description || event.excerpt ? (
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-stone-600">
          {event.description || event.excerpt}
        </p>
      ) : null}
    </li>
  );
}

function EmptyState({ hasItems }: { hasItems: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
      <p className="text-base font-medium text-stone-700">
        {hasItems ? "Os sinais crus desta rodada não foram guardados." : "Nenhum sinal coletado ainda."}
      </p>
      <p className="mt-1 text-sm text-stone-500">
        {hasItems
          ? "Rode o Radar de novo para ver os sinais crus (a rodada atual é de uma versão anterior)."
          : "Rode o Radar para buscar os últimos movimentos dos concorrentes."}
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
