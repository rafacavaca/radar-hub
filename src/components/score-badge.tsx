/**
 * Selo de impacto (0-100) — comunica a urgência pela COR, sem exigir leitura.
 * Tiers:  >=70 vermelho (urgente) · 40-69 âmbar (relevante) · <40 cinza (baixo).
 * Componente puro (sem estado) — serve em server e client.
 */

import type { IntelligenceItem } from "@/lib/types";

type Tier = { ring: string; text: string; caption: string; label: string };

function tierFor(score: number): Tier {
  if (score >= 70) {
    return {
      ring: "border-red-200 bg-red-50",
      text: "text-red-700",
      caption: "text-red-600/80",
      label: "urgente",
    };
  }
  if (score >= 40) {
    return {
      ring: "border-amber-200 bg-amber-50",
      text: "text-amber-700",
      caption: "text-amber-600/80",
      label: "relevante",
    };
  }
  return {
    ring: "border-stone-200 bg-stone-100",
    text: "text-stone-600",
    caption: "text-stone-400",
    label: "baixo",
  };
}

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
  const tier = tierFor(score);
  const s = SIZE[size];
  return (
    <span
      className={`inline-flex flex-none flex-col items-center justify-center rounded-xl border ${tier.ring} ${s.box}`}
      title={`Impacto ${score}/100 — ${tier.label}`}
      aria-label={`Impacto ${score} de 100, ${tier.label}`}
    >
      <span className={`font-semibold leading-none tabular-nums ${tier.text} ${s.num}`}>
        {score}
      </span>
      <span
        className={`mt-0.5 font-medium uppercase leading-none tracking-wide ${tier.caption} ${s.cap}`}
      >
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
