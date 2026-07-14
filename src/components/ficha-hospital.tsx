/**
 * FICHA POR HOSPITAL (2º template — modo carteira). Um card por subject:
 * perfil (tipo, modo de compra, região) + FIT POR LINHA (do profile seedado) +
 * os GATILHOS recentes (leituras de venda, com fonte + data) e o "Gerar no
 * Formare" por gatilho. Estado "sem novidade" quando não há gatilho.
 *
 * Componente de servidor (render puro) — embute o botão client GerarNoFormare.
 * Modelo: identidade-view (card por subject) + visão (tiles/gatilhos).
 */

import type { Competitor, FitLevel } from "@/lib/watchlist";
import type { SalesReading } from "@/lib/types";

import { GerarNoFormareButton } from "@/components/gerar-no-formare-button";
import { ScoreBadge } from "@/components/score-badge";
import { RecencyStamp, SourceRef } from "@/components/signal-meta";

const MODO_LABEL: Record<string, string> = {
  licitacao: "Licitação",
  relacionamento: "Relacionamento",
  operadora: "Operadora",
};

/** Nível de fit → rótulo + peso visual (neutro; cor não codifica). */
const FIT_LABEL: Record<FitLevel, string> = {
  forte: "forte",
  sim: "sim",
  confirmar: "a confirmar",
  nao: "não",
};
const FIT_CLASS: Record<FitLevel, string> = {
  forte: "font-semibold text-stone-900",
  sim: "text-stone-700",
  confirmar: "text-stone-500",
  nao: "text-stone-400 line-through",
};

function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function FichaHospital({
  subject,
  gatilhos,
  now,
}: {
  subject: Competitor;
  gatilhos: SalesReading[];
  now: string;
}) {
  const profile = subject.profile;
  const modo = profile?.modoCompra ? (MODO_LABEL[profile.modoCompra] ?? profile.modoCompra) : null;
  const fit = Object.entries(profile?.fitPorLinha ?? {});

  return (
    <section
      data-testid="ficha-hospital"
      className="rounded-2xl border border-stone-200 bg-white shadow-sm"
    >
      {/* cabeçalho — perfil */}
      <header className="flex items-start gap-3 border-b border-stone-100 px-4 py-4 sm:px-5">
        <span
          aria-hidden
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-stone-100 text-sm font-semibold text-stone-600"
        >
          {monogram(subject.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[17px] font-semibold tracking-tight text-stone-900">
              {subject.name}
            </h2>
            {modo ? (
              <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                {modo}
              </span>
            ) : null}
            {!subject.enabled ? (
              <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                pausado
              </span>
            ) : null}
          </div>
          {profile?.tipo ? <p className="mt-1 text-sm text-stone-500">{profile.tipo}</p> : null}
          {profile?.regiao ? (
            <p className="mt-0.5 text-xs text-stone-400">{profile.regiao}</p>
          ) : null}
        </div>
      </header>

      {/* fit por linha */}
      {fit.length > 0 ? (
        <div className="border-b border-stone-100 px-4 py-3 sm:px-5">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-stone-400">
            Aderência por linha
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {fit.map(([linha, nivel]) => (
              <span key={linha} className="inline-flex items-center gap-1">
                <span className="text-stone-700">{linha}</span>
                <span className={"text-xs " + (FIT_CLASS[nivel as FitLevel] ?? "text-stone-500")}>
                  · {FIT_LABEL[nivel as FitLevel] ?? nivel}
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* gatilhos */}
      <div className="px-4 py-4 sm:px-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">
          Oportunidades {gatilhos.length > 0 ? `(${gatilhos.length})` : ""}
        </p>
        {gatilhos.length === 0 ? (
          <p className="rounded-md border border-dashed border-stone-200 bg-stone-50/60 px-3 py-3 text-sm text-stone-500">
            Sem novidade neste hospital — rode o Radar ou espere a próxima varredura.
          </p>
        ) : (
          <ul className="space-y-3">
            {gatilhos.map((g) => (
              <li
                key={g.id}
                data-testid="gatilho"
                className="rounded-xl border border-stone-200 bg-stone-50/40 p-3.5"
              >
                <div className="flex items-start gap-3">
                  <ScoreBadge score={g.score} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-stone-900 px-2 py-0.5 text-xs font-medium text-stone-50">
                        {g.linha}
                      </span>
                    </div>
                    <p className="mt-1.5 font-semibold leading-snug text-stone-900">{g.sinal}</p>
                  </div>
                </div>

                <div className="mt-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-red-700">
                    Oportunidade
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-stone-700">{g.gatilho}</p>
                </div>
                <div className="mt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
                    Ângulo
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-stone-800">{g.angulo}</p>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <SourceRef url={g.fonte.url} titulo={g.fonte.titulo} />
                  <RecencyStamp publishedAt={g.publishedAt} collectedAt={g.collectedAt} now={now} />
                </div>

                <div className="mt-3">
                  <GerarNoFormareButton itemId={g.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
