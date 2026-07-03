/**
 * Selo de impacto (0-100) — UM tratamento só: número em caixa NEUTRA.
 * A cor não codifica impacto (um papel por cor: vermelho é só da marca). A
 * urgência lê-se pelo número e pela ordenação — nunca pela cor do selo.
 * Componente puro (sem estado) — serve em server e client.
 */

import type { IntelligenceItem } from "@/lib/types";

const SIZE = {
  md: { box: "h-14 w-14", num: "text-xl", cap: "text-[9px]" },
  sm: { box: "h-11 w-11", num: "text-base", cap: "text-[8px]" },
} as const;

export function ScoreBadge({
  score,
  size = "md",
}: {
  score: number;
  size?: keyof typeof SIZE;
}) {
  const s = SIZE[size];
  return (
    <span
      className={`inline-flex flex-none flex-col items-center justify-center rounded-lg border border-stone-200 bg-stone-100 ${s.box}`}
      title={`Impacto ${score}/100`}
      aria-label={`Impacto ${score} de 100`}
    >
      <span className={`font-semibold leading-none tabular-nums text-stone-900 ${s.num}`}>
        {score}
      </span>
      <span className={`mt-0.5 font-medium uppercase leading-none tracking-wide text-stone-400 ${s.cap}`}>
        impacto
      </span>
    </span>
  );
}

/** Chip textual da categoria (ex.: "marketing") — reaproveitado no feed. */
export function CategoryChip({ category }: { category: string }) {
  return (
    <span className="inline-flex flex-none items-center rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-stone-500">
      {category}
    </span>
  );
}

/** Link para a fonte do sinal — abre o post do concorrente em nova aba. */
export function FonteLink({
  fonte,
  className = "",
}: {
  fonte: IntelligenceItem["fonte"];
  className?: string;
}) {
  return (
    <a
      href={fonte.url}
      target="_blank"
      rel="noopener noreferrer"
      className={
        "inline-flex items-center gap-1 text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline " +
        className
      }
    >
      <span className="truncate">Fonte: {fonte.titulo}</span>
      <span aria-hidden>↗</span>
    </a>
  );
}
