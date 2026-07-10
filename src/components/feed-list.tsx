"use client";

/**
 * FEED (lista + filtros) — o painel client do Feed de sinais crus.
 *
 * Filtra/ordena os eventos JÁ carregados pelo server (não re-roda o loop):
 *  - recência (janela) + "priorizar recentes";
 *  - CONCORRENTE (qual fonte olhar);
 *  - cada linha EXPANDE pra ver o conteúdo coletado ("conhecimento todo").
 * Fiel ao princípio: velho ATENUA, nunca some — padrão "Tudo" com recentes no
 * topo. Datas em 1º plano (RecencyStamp), fonte citada.
 */

import { useEffect, useMemo, useState } from "react";

import { ageInDays } from "@/lib/format";
import type { ClientEvent } from "@/lib/loop";

import { attenuated, RecencyStamp, SourceRef } from "@/components/signal-meta";

const FEED_SEEN_KEY = "radar:feed:seen";

const KIND_LABEL: Record<string, string> = {
  blog: "artigo",
  news: "notícia",
  release: "novidade",
  page: "página",
  material: "material",
};

type Range = "all" | "180" | "30";

const SELECT_CLASS =
  "rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-none";

export function FeedList({ events, now }: { events: ClientEvent[]; now: string }) {
  const [range, setRange] = useState<Range>("all");
  const [recentes, setRecentes] = useState(true);
  const [competitor, setCompetitor] = useState<string>("all");

  // NÃO-LIDO (F1.4): sinais novos desde a última visita ganham ponto vermelho.
  const idSig = useMemo(() => events.map((e) => e.id).join(","), [events]);
  const [unseen, setUnseen] = useState<Set<string>>(new Set());
  useEffect(() => {
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem(FEED_SEEN_KEY) || "[]") as string[];
    } catch {
      seen = [];
    }
    const seenSet = new Set(seen);
    const ids = events.map((e) => e.id);
    setUnseen(new Set(ids.filter((id) => !seenSet.has(id))));
    try {
      localStorage.setItem(FEED_SEEN_KEY, JSON.stringify(Array.from(new Set([...seen, ...ids])).slice(-1500)));
    } catch {
      /* localStorage indisponível */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSig]);

  // concorrentes presentes nos eventos (pra o filtro), em ordem alfabética.
  const competitors = Array.from(new Set(events.map((e) => e.competitorName)))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  const ageOf = (e: ClientEvent) => ageInDays(e.publishedAt ?? e.collectedAt, now);

  let list = events.filter((e) => {
    if (competitor !== "all" && e.competitorName !== competitor) return false;
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
          <select value={range} onChange={(e) => setRange(e.target.value as Range)} className={SELECT_CLASS}>
            <option value="all">Tudo (marcar antigos)</option>
            <option value="30">Últimos 30 dias</option>
            <option value="180">Últimos 6 meses</option>
          </select>
        </label>

        {competitors.length > 1 ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Concorrente</span>
            <select
              value={competitor}
              onChange={(e) => setCompetitor(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="all">Todos</option>
              {competitors.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        ) : null}

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
            <p className="text-base font-medium text-stone-700">Nenhum sinal neste filtro.</p>
            <button
              type="button"
              onClick={() => {
                setRange("all");
                setCompetitor("all");
              }}
              className="mt-3 text-sm font-medium text-red-600 hover:underline"
            >
              Ver tudo
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-lg border border-stone-200 bg-white">
            {list.map((event) => (
              <FeedRow key={`${event.clientName}-${event.id}`} event={event} now={now} unread={unseen.has(event.id)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FeedRow({ event, now, unread = false }: { event: ClientEvent; now: string; unread?: boolean }) {
  const [open, setOpen] = useState(false);
  const velho = attenuated(event.publishedAt, event.collectedAt, now);
  const conteudo = (event.excerpt || event.description || "").trim();

  return (
    <li
      data-testid="feed-item"
      className={"px-4 py-3.5 sm:px-5 " + (velho ? "opacity-70 " : "") + (unread ? "border-l-2 border-l-red-500" : "")}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {unread ? (
          <span aria-hidden title="Novo desde a sua última visita" className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
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
        className="mt-1 block font-semibold leading-snug text-stone-900 underline-offset-2 hover:underline"
      >
        {event.title}
      </a>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <SourceRef url={event.url} titulo={event.title} />
        <RecencyStamp publishedAt={event.publishedAt} collectedAt={event.collectedAt} now={now} />
        <button
          type="button"
          data-testid="feed-expand"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="text-xs font-medium text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline"
        >
          {open ? "ocultar conteúdo" : "ver conteúdo"}
        </button>
      </div>

      {open ? (
        <div className="mt-2 rounded-md border border-stone-200 bg-stone-50/70 p-3 text-sm leading-relaxed text-stone-600">
          {conteudo ? (
            <p className="whitespace-pre-line">{conteudo}</p>
          ) : (
            <p className="text-stone-400">
              O Radar guardou só o título deste sinal — abra a fonte para o conteúdo completo.
            </p>
          )}
          <a
            href={event.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-red-600 underline-offset-2 hover:underline"
          >
            abrir na fonte ↗
          </a>
        </div>
      ) : null}
    </li>
  );
}
