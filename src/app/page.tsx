/**
 * BRIEFING DO DIA — a tela-ritual do Radar, agora POR ÓTICA (F6).
 *
 * Seletor no topo: GERAL (a visão do Rafael — os itens mais fortes across as
 * lentes) · COMERCIAL · PRODUTO · MARKETING (o mini-briefing de cada time, no
 * idioma dele). Cada visão de time tem o botão de ação certo (card no Formare
 * pra comercial/marketing; nota de roadmap interna pra produto) e um modo
 * APRESENTAR limpo/exportável. Com mais de um cliente, um seletor de cliente
 * aparece ao lado das lentes.
 *
 * Server component: roda o loop (cache diário — visitas repetidas são baratas)
 * e filtra por lente/cliente dos searchParams.
 */

import Link from "next/link";

import { buildBriefing } from "@/lib/briefing";
import { formatDateTimePtBR } from "@/lib/format";
import { lensesFor, LENS_LABEL, type LensId } from "@/lib/lenses";
import { runRadarLoop, type RadarLoopResult } from "@/lib/loop";
import { listNotes } from "@/lib/notes";
import { readWatchlist } from "@/lib/watchlist";
import type { IntelligenceItem, LensReading } from "@/lib/types";

import { GerarNoFormareButton } from "@/components/gerar-no-formare-button";
import { LensReadingCard, RoadmapNoteRow } from "@/components/lens-reading-card";
import { RodarAgora } from "@/components/rodar-agora";
import { FonteLink, ScoreBadge } from "@/components/score-badge";

export const dynamic = "force-dynamic";

const LENS_TABS: Array<{ id: "geral" | LensId; label: string }> = [
  { id: "geral", label: "Geral" },
  { id: "comercial", label: "Comercial" },
  { id: "produto", label: "Produto" },
  { id: "marketing", label: "Marketing" },
];

/** Texto honesto sobre a origem do contexto dos analistas. */
function brainNote(result: RadarLoopResult, clientName: string): string | null {
  const source = result.brainSources?.find((s) => s.clientName === clientName);
  if (!source) return null;
  if (source.mode === "live") return `Brain ao vivo (${source.nodeCount} fatos confirmados)`;
  if (source.mode === "fixture") return "Brain indisponível — usando resumo local";
  return "sem base de conhecimento do cliente";
}

export default async function BriefingPage({
  searchParams,
}: {
  searchParams: Promise<{ lente?: string; cliente?: string }>;
}) {
  const params = await searchParams;

  const clients = readWatchlist().clients.map((c) => c.name);
  const cliente =
    params.cliente && clients.includes(params.cliente) ? params.cliente : (clients[0] ?? "");
  const lente = (LENS_TABS.some((t) => t.id === params.lente) ? params.lente : "geral") as
    | "geral"
    | LensId;

  let result: RadarLoopResult = { items: [], ranAt: "" };
  let error: string | null = null;
  try {
    result = await runRadarLoop();
  } catch (err) {
    error = err instanceof Error ? err.message : "Não foi possível rodar o Radar.";
  }

  const lensConfig = lente !== "geral" ? lensesFor(cliente).find((l) => l.id === lente) : null;
  const readings = (result.readings ?? []).filter(
    (r) => r.clientName === cliente && (lente === "geral" || r.lens === lente),
  );
  const geral = buildBriefing(result.items.filter((it) => it.clientName === cliente));
  const notes = lente === "produto" ? listNotes(cliente) : [];
  const brain = cliente ? brainNote(result, cliente) : null;

  const title =
    lente === "geral" ? "Radar — Briefing do dia" : `Radar ${LENS_LABEL[lente as LensId]}`;

  return (
    <section className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-stone-400">
            Briefing do dia
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
          <p className="mt-1.5 text-sm text-stone-500">
            Cliente <span className="font-medium text-stone-700">{cliente || "—"}</span>
            {result.ranAt ? <> · atualizado em {formatDateTimePtBR(result.ranAt)}</> : null}
            {brain ? <> · {brain}</> : null}
          </p>
        </div>
        <RodarAgora testId="rodar-agora" />
      </header>

      {/* Seletor de lente (+ cliente, quando houver mais de um). */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-1" aria-label="Lentes">
          {LENS_TABS.map((tab) => {
            const active = tab.id === lente;
            const href = `/?lente=${tab.id}${cliente ? `&cliente=${encodeURIComponent(cliente)}` : ""}`;
            return (
              <Link
                key={tab.id}
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors " +
                  (active
                    ? "bg-stone-900 text-stone-50"
                    : "text-stone-600 hover:bg-stone-200/70 hover:text-stone-900")
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {clients.length > 1 ? (
            <nav className="flex flex-wrap items-center gap-1" aria-label="Clientes">
              {clients.map((name) => (
                <Link
                  key={name}
                  href={`/?lente=${lente}&cliente=${encodeURIComponent(name)}`}
                  className={
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                    (name === cliente
                      ? "border-stone-900 bg-stone-900 text-stone-50"
                      : "border-stone-300 text-stone-600 hover:bg-stone-100")
                  }
                >
                  {name}
                </Link>
              ))}
            </nav>
          ) : null}

          {lente !== "geral" ? (
            <Link
              href={`/apresentar?lente=${lente}&cliente=${encodeURIComponent(cliente)}`}
              target="_blank"
              className="rounded-full border border-stone-300 bg-white px-3.5 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
            >
              Apresentar ↗
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        {error ? (
          <ErrorState message={error} />
        ) : lente === "geral" ? (
          <GeralView items={geral} />
        ) : !lensConfig?.enabled ? (
          <LensOffState lente={lente as LensId} />
        ) : (
          <TeamView lente={lente as LensId} readings={readings} notes={notes} />
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Visão GERAL — os itens mais fortes across as lentes (a visão do Rafael)
// ─────────────────────────────────────────────────────────────────────────────

function GeralView({ items }: { items: IntelligenceItem[] }) {
  if (items.length === 0) return <EmptyState />;
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <BriefingCard key={item.id} item={item} />
      ))}
    </div>
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
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {item.concorrente ? (
              <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
                {item.concorrente}
              </p>
            ) : null}
            {(item.lentes ?? []).map((lens) => (
              <span
                key={lens}
                className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500"
              >
                {LENS_LABEL[lens]}
              </span>
            ))}
          </div>
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

// ─────────────────────────────────────────────────────────────────────────────
// Visão de TIME — o mini-briefing de uma lente, no idioma do time
// ─────────────────────────────────────────────────────────────────────────────

function TeamView({
  lente,
  readings,
  notes,
}: {
  lente: LensId;
  readings: LensReading[];
  notes: ReturnType<typeof listNotes>;
}) {
  return (
    <div className="space-y-4">
      {readings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
          <p className="text-base font-medium text-stone-700">
            Nenhuma leitura {LENS_LABEL[lente].toLowerCase()} hoje.
          </p>
          <p className="mt-1 text-sm text-stone-500">
            Nada passou na régua desta lente — ajuste-a em{" "}
            <Link href="/analistas" className="underline underline-offset-2 hover:text-stone-700">
              Analistas
            </Link>{" "}
            ou rode o Radar de novo.
          </p>
        </div>
      ) : (
        readings.map((reading) => <LensReadingCard key={reading.id} reading={reading} />)
      )}

      {lente === "produto" && notes.length > 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
          <p className="border-b border-stone-100 px-4 py-3 text-xs font-medium uppercase tracking-wide text-stone-400 sm:px-5">
            Notas de roadmap guardadas
          </p>
          <ul className="divide-y divide-stone-100">
            {notes.map((note) => (
              <RoadmapNoteRow key={note.id} note={note} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function LensOffState({ lente }: { lente: LensId }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
      <p className="text-base font-medium text-stone-700">
        A lente {LENS_LABEL[lente]} está desligada para este cliente.
      </p>
      <p className="mt-1 text-sm text-stone-500">
        Ligue-a em{" "}
        <Link href="/analistas" className="underline underline-offset-2 hover:text-stone-700">
          Analistas
        </Link>{" "}
        e rode o Radar de novo.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
      <p className="text-base font-medium text-stone-700">Nenhum movimento relevante ainda.</p>
      <p className="mt-1 text-sm text-stone-500">
        Rode o Radar para buscar os últimos movimentos dos concorrentes.
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
