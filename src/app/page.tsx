/**
 * BRIEFING DO DIA — a tela-ritual do Radar.
 *
 * Server component: roda o loop (com cache diário, então visitas repetidas são
 * baratas) e mostra os itens de maior impacto para o cliente do F1 (Moovefy).
 * Cada item é um CARD: selo de impacto, o sinal (título), "por que importa",
 * "ação recomendada", a fonte (link) e o botão "Gerar no Formare".
 */

import { buildBriefing } from "@/lib/briefing";
import { MOOVEFY } from "@/lib/clients/moovefy";
import { formatDateTimePtBR } from "@/lib/format";
import { runRadarLoop } from "@/lib/loop";
import type { IntelligenceItem } from "@/lib/types";

import { GerarNoFormareButton } from "@/components/gerar-no-formare-button";
import { RodarAgora } from "@/components/rodar-agora";
import { FonteLink, ScoreBadge } from "@/components/score-badge";

export const dynamic = "force-dynamic";

export default async function BriefingPage() {
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

  const briefing = buildBriefing(items);

  return (
    <section className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-stone-400">
            Briefing do dia
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
            Radar — Briefing do dia
          </h1>
          <p className="mt-1.5 text-sm text-stone-500">
            Cliente{" "}
            <span className="font-medium text-stone-700">{MOOVEFY.clientName}</span>
            {ranAt ? <> · atualizado em {formatDateTimePtBR(ranAt)}</> : null}
          </p>
        </div>
        <RodarAgora testId="rodar-agora" />
      </header>

      <div className="mt-8">
        {error ? (
          <ErrorState message={error} />
        ) : briefing.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {briefing.map((item) => (
              <BriefingCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function BriefingCard({ item }: { item: IntelligenceItem }) {
  return (
    <article
      data-testid="intel-item"
      className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-start gap-4">
        <ScoreBadge score={item.score} />
        <div className="min-w-0 flex-1">
          {item.concorrente ? (
            <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
              {item.concorrente}
            </p>
          ) : null}
          <h2 className="text-lg font-semibold leading-snug tracking-tight text-stone-900">
            {item.sinal}
          </h2>
          <FonteLink fonte={item.fonte} className="mt-1 max-w-full text-sm" />
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
            Por que importa
          </p>
          <p className="mt-1 leading-relaxed text-stone-700">{item.porQueImporta}</p>
        </div>

        <div className="rounded-xl border-l-2 border-emerald-400 bg-emerald-50/60 py-3 pl-4 pr-3">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
            Ação recomendada
          </p>
          <p className="mt-1 leading-relaxed text-stone-800">{item.acao}</p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end border-t border-stone-100 pt-4">
        <GerarNoFormareButton itemId={item.id} />
      </div>
    </article>
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
