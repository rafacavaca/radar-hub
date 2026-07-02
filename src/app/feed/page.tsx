/**
 * FEED — todos os itens de inteligência do dia, em lista compacta.
 *
 * Mesma origem do briefing (o loop com cache diário), mas sem cortar por
 * impacto: aqui está tudo. Cada linha mostra o selo, o sinal, a categoria, a
 * fonte (link) e o botão "Gerar no Formare".
 */

import { buildFeed, categoryOf } from "@/lib/briefing";
import { MOOVEFY } from "@/lib/clients/moovefy";
import { formatDateTimePtBR } from "@/lib/format";
import { runRadarLoop } from "@/lib/loop";
import type { IntelligenceItem } from "@/lib/types";

import { GerarNoFormareButton } from "@/components/gerar-no-formare-button";
import { RodarAgora } from "@/components/rodar-agora";
import { CategoryChip, FonteLink, ScoreBadge } from "@/components/score-badge";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  let items: IntelligenceItem[] = [];
  let ranAt = "";
  let error: string | null = null;

  try {
    const result = await runRadarLoop();
    items = result.items;
    ranAt = result.ranAt;
  } catch (err) {
    error = err instanceof Error ? err.message : "Não foi possível rodar o Radar.";
  }

  const feed = buildFeed(items);

  return (
    <section className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-stone-400">
            Feed
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
            Todos os movimentos
          </h1>
          <p className="mt-1.5 text-sm text-stone-500">
            {feed.length} {feed.length === 1 ? "item" : "itens"} · cliente{" "}
            <span className="font-medium text-stone-700">{MOOVEFY.clientName}</span>
            {ranAt ? <> · atualizado em {formatDateTimePtBR(ranAt)}</> : null}
          </p>
        </div>
        <RodarAgora testId="rodar-agora" />
      </header>

      <div className="mt-8">
        {error ? (
          <ErrorState message={error} />
        ) : feed.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {feed.map((item) => (
              <FeedRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function FeedRow({ item }: { item: IntelligenceItem }) {
  const category = categoryOf(item);
  return (
    <li
      data-testid="feed-item"
      className="flex items-start gap-3 px-4 py-4 sm:gap-4 sm:px-5"
    >
      <ScoreBadge score={item.score} size="sm" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="font-medium leading-snug text-stone-900">{item.sinal}</h2>
          {category ? <CategoryChip category={category} /> : null}
        </div>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-stone-600">
          {item.porQueImporta}
        </p>
        <FonteLink fonte={item.fonte} className="mt-1.5 max-w-full text-xs" />
      </div>

      <div className="flex-none pt-0.5">
        <GerarNoFormareButton itemId={item.id} />
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
      <p className="text-base font-medium text-stone-700">
        Nenhum movimento relevante ainda.
      </p>
      <p className="mt-1 text-sm text-stone-500">
        Rode o Radar para buscar os últimos movimentos do concorrente.
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
      <p className="text-base font-medium text-red-800">
        Não foi possível rodar o Radar agora.
      </p>
      <p className="mt-1 text-sm text-red-600">{message}</p>
      <div className="mt-5 flex justify-center">
        <RodarAgora variant="ghost" />
      </div>
    </div>
  );
}
