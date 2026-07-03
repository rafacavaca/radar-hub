/**
 * Cartão de LEITURA DE LENTE (F6) — server component compartilhado entre a
 * visão de time do Briefing e o modo Apresentar.
 *
 * Mostra o sinal no idioma do time: leitura, conta afetada (comercial),
 * ação recomendada e fonte. `actions` liga os botões (desligados no modo
 * apresentação, que é limpo/exportável).
 */

import type { LensReading } from "@/lib/types";

import { ApagarNotaButton } from "@/components/apagar-nota-button";
import { GerarNoFormareButton } from "@/components/gerar-no-formare-button";
import { GuardarNotaButton } from "@/components/guardar-nota-button";
import { FonteLink, ScoreBadge } from "@/components/score-badge";

export const LENS_READING_LABEL: Record<LensReading["lens"], string> = {
  comercial: "Leitura comercial",
  produto: "Leitura de produto",
  marketing: "Leitura de marketing",
};

const ACTION_TITLE: Record<LensReading["lens"], string> = {
  comercial: "Ação comercial",
  produto: "Recomendação de roadmap",
  marketing: "Recomendação de conteúdo",
};

export function LensReadingCard({
  reading,
  actions = true,
}: {
  reading: LensReading;
  actions?: boolean;
}) {
  return (
    <article
      data-testid="lens-reading"
      className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6 print:border-stone-300 print:shadow-none"
    >
      <div className="flex items-start gap-4">
        <ScoreBadge score={reading.score} />
        <div className="min-w-0 flex-1">
          {reading.concorrente ? (
            <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
              {reading.concorrente}
            </p>
          ) : null}
          <h2 className="text-lg font-semibold leading-snug tracking-tight text-stone-900">
            {reading.sinal}
          </h2>
          <FonteLink fonte={reading.fonte} className="mt-1 max-w-full text-sm" />
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
            {LENS_READING_LABEL[reading.lens]}
          </p>
          <p className="mt-1 leading-relaxed text-stone-700">{reading.leitura}</p>
        </div>

        {reading.contaAfetada ? (
          <div className="rounded-xl border-l-2 border-amber-400 bg-amber-50/70 py-2.5 pl-4 pr-3">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
              Conta afetada
            </p>
            <p className="mt-0.5 font-medium text-stone-800">{reading.contaAfetada}</p>
          </div>
        ) : null}

        <div className="rounded-xl border-l-2 border-emerald-400 bg-emerald-50/60 py-3 pl-4 pr-3">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
            {ACTION_TITLE[reading.lens]}
          </p>
          <p className="mt-1 leading-relaxed text-stone-800">{reading.acao}</p>
        </div>
      </div>

      {actions ? (
        <div className="mt-5 flex items-center justify-end border-t border-stone-100 pt-4">
          {reading.lens === "produto" ? (
            <GuardarNotaButton readingId={reading.id} />
          ) : (
            <GerarNoFormareButton itemId={reading.id} />
          )}
        </div>
      ) : null}
    </article>
  );
}

/** Linha de nota de roadmap guardada (lista da visão Produto). */
export function RoadmapNoteRow({
  note,
}: {
  note: {
    id: string;
    sinal: string;
    acao: string;
    concorrente?: string;
    createdAt: string;
  };
}) {
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-stone-800">
          {note.concorrente ? `${note.concorrente}: ` : ""}
          {note.sinal}
        </p>
        <p className="mt-0.5 line-clamp-2 text-sm text-stone-500">{note.acao}</p>
      </div>
      <ApagarNotaButton noteId={note.id} />
    </li>
  );
}
