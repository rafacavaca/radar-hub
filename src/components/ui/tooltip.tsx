"use client";

/**
 * TOOLTIP (design system) — explicação por hover/focus, pra tirar prosa do
 * corpo dos cards (F1.5). Leve: só CSS + estado local; abre em hover E em foco
 * (teclado/leitor). Não usa portal — posiciona relativo ao gatilho (o conteúdo
 * do Radar não tem overflow que corte). Respeita a pele: papel/tinta, cantos
 * crispos, sombra baixa.
 */

import { useId, useState, type ReactNode } from "react";

export function Tooltip({
  content,
  children,
  side = "top",
  className = "",
}: {
  /** o texto curto da explicação (1 frase). */
  content: ReactNode;
  /** o gatilho (o elemento que ganha o "?" implícito). */
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const pos =
    side === "top"
      ? "bottom-full left-1/2 -translate-x-1/2 mb-1.5"
      : "top-full left-1/2 -translate-x-1/2 mt-1.5";

  return (
    <span
      className={"relative inline-flex " + className}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined} tabIndex={0} className="inline-flex cursor-help outline-none">
        {children}
      </span>
      {open ? (
        <span
          role="tooltip"
          id={id}
          className={
            "pointer-events-none absolute z-30 w-max max-w-[240px] rounded-md border border-stone-200 bg-white px-2.5 py-1.5 " +
            "text-[12px] font-normal normal-case leading-snug tracking-normal text-stone-600 shadow-md " +
            pos
          }
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
