"use client";

/**
 * FEED (lista + filtro de recência) — o painel client do Feed de sinais crus.
 *
 * Filtra/ordena os eventos JÁ carregados pelo server (não re-roda o loop): um
 * seletor de recência + "priorizar recentes". Fiel ao princípio: velho ATENUA,
 * nunca some — por isso o padrão é "Tudo" com os recentes no topo; quem quiser
 * estreita a janela. Datas ficam em 1º plano (RecencyStamp), fonte citada.
 */

import { useState } from "react";

import { ageInDays } from "@/lib/format";
import type { ClientEvent } from "@/lib/loop";

import { attenuated, RecencyStamp, SourceRef } from "@/components/signal-meta";

const KIND_LABEL: Record<string, string> = {
  blog: "artigo",
  news: "notícia",
  release: "novidade",
  page: "página",
  material: "material",
};

type Range = "all" | "180" | "30";

export function FeedList({ events, now }: { events: ClientEvent[]; now: string }) {
  const [range, setRange] = useState<Range>("all");
  const [recentes, setRecentes] = useState(true);

  const ageOf = (e: ClientEvent) => ageInDays(e.publishedAt ?? e.collectedAt, now);

  let list = events.filter((e) => {
    if (range === "all") return true;
    const age = ageOf(e);
    return age !== null && age <= Number(range);
  });
  if (recentes) {
    // sem data vai pro fim (idade "infinita"); nunca some, só afunda.
    list = [...list].sort((a, b) => (ageOf(a) ?? Infinity) - (ageOf(b) ?? Infinity));
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">Recência</span>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-none"
          >
            <option value="all">Tudo (marcar antigos)</option>
            <option value="30">Últimos 30 dias</option>
            <option value="180">Últimos 6 meses</option>
          </select>
        </label>

        <label className="flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            checked={recentes}
            onChange={(e) => setRecentes(e.target.checked)}
            className="h-4 w-4 accent-stone-900"
          />
          <span className="text-sm text-stone-600">Priorizar recentes</span>
        </label>

        <span className="ml-auto pb-2 text-xs text-stone-400">
          {list.length} {list.length === 1 ? "sinal" : "sinais"}
        </span>
      </div>

      <div className="mt-4">
        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
            <p className="text-base font-medium text-stone-700">Nenhum sinal neste período.</p>
            <button
              type="button"
              onClick={() => setRange("all")}
              className="mt-3 text-sm font-medium text-red-600 hover:underline"
            >
              Ver tudo
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-lg border border-stone-200 bg-white">
            {list.map((event) => (
              <FeedRow key={`${event.clientName}-${event.id}`} event={event} now={now} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FeedRow({ event, now }: { event: ClientEvent; now: string }) {
  const velho = attenuated(event.publishedAt, event.collectedAt, now);
  return (
    <li data-testid="feed-item" className={"px-4 py-3.5 sm:px-5 " + (velho ? "opacity-70" : "")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
        className="mt-1 block font-semibold leading-snug text-stone-900 underline-offset-2 hover:underline"
      >
        {event.title}
      </a>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <SourceRef url={event.url} titulo={event.title} />
        <RecencyStamp publishedAt={event.publishedAt} collectedAt={event.collectedAt} now={now} />
      </div>
    </li>
  );
}
