/**
 * SIGNAL META (design system) — datas e fonte são cidadãs de 1ª classe.
 *
 * RecencyStamp: semáforo simples de recência (fresco ≤30d verde / resto cinza
 * com a idade real), sempre com a data de PUBLICAÇÃO e a de COLETA visíveis.
 * Nunca inventa: sem data de publicação -> "sem data de publicação" (nunca o
 * epoch 1969). `attenuated()` diz se o conteúdo é velho (>6 meses) pra o card
 * atenuar — velho atenua, nunca esconde.
 *
 * SourceRef: a fonte SEMPRE citada (host do link + ícone), abre em nova aba.
 *
 * Componentes puros (server-safe) — recebem ISO strings e `now` pra decidir.
 */

import { ageInDays, formatDateShort } from "@/lib/format";

/** Nível de recência pela PUBLICAÇÃO (fallback: coleta). */
function recency(
  publishedAt: string | null | undefined,
  collectedAt: string | null | undefined,
  now: string,
): { fresco: boolean; ageText: string; hasDate: boolean } {
  const ref = publishedAt ?? collectedAt;
  const age = ageInDays(ref, now);
  if (age === null) return { fresco: false, ageText: "sem data de publicação", hasDate: false };
  if (age <= 30) return { fresco: true, ageText: "fresco", hasDate: Boolean(publishedAt) };
  if (age <= 365) {
    const meses = Math.max(1, Math.round(age / 30));
    return { fresco: false, ageText: `há ${meses} ${meses === 1 ? "mês" : "meses"}`, hasDate: true };
  }
  const ano = new Date(ref as string).getUTCFullYear();
  return { fresco: false, ageText: `publicado em ${ano}`, hasDate: true };
}

/** True quando o conteúdo é velho (>6 meses) — o card deve atenuar. */
export function attenuated(
  publishedAt: string | null | undefined,
  collectedAt: string | null | undefined,
  now: string,
): boolean {
  const age = ageInDays(publishedAt ?? collectedAt, now);
  return age !== null && age > 182;
}

export function RecencyStamp({
  publishedAt,
  collectedAt,
  now,
  className = "",
}: {
  publishedAt?: string | null;
  collectedAt?: string | null;
  now: string;
  className?: string;
}) {
  const r = recency(publishedAt, collectedAt, now);
  const pub = formatDateShort(publishedAt);
  const col = formatDateShort(collectedAt);

  return (
    <span className={"inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs " + className}>
      <span
        className={
          "inline-flex items-center gap-1 font-medium " +
          (r.fresco ? "text-emerald-700" : "text-stone-400")
        }
      >
        <span
          aria-hidden
          className={
            "inline-block h-[5px] w-[5px] rounded-full " +
            (r.fresco ? "bg-emerald-600" : "bg-stone-300")
          }
        />
        {r.ageText}
      </span>
      {pub ? <span className="text-stone-400">publicado {pub}</span> : null}
      {col ? <span className="text-stone-400">coletado {col}</span> : null}
    </span>
  );
}

/** Fonte citada — sempre. Host do link + ícone de link externo. */
export function SourceRef({
  url,
  titulo,
  className = "",
}: {
  url: string;
  titulo?: string;
  className?: string;
}) {
  let host = titulo ?? url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* mantém o fallback */
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={titulo ?? url}
      className={
        "inline-flex items-center gap-1 text-xs text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline " +
        className
      }
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      {host}
    </a>
  );
}
