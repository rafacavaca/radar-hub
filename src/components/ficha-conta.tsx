/**
 * FICHA POR CONTA-CHAVE (pilar Clientes). Um card por conta vigiada: perfil
 * (tipo, região) + as JOGADAS DE RELACIONAMENTO recentes — cada uma com o
 * ENCAIXE (direto/adjacente/brecha), o gatilho, a justificativa, a oferta que
 * ancora (quando há), a ação e o "Gerar no Formare". Estado "sem novidade"
 * quando não há jogada.
 *
 * Componente de servidor (render puro) — embute o botão client GerarNoFormare.
 * Molde: ficha-hospital (o mesmo desenho do modo carteira, generalizado).
 *
 * O encaixe se distingue por PESO e RÓTULO (não só por cor) — coerente com a
 * régua do desenho ("cor não codifica"): direto = sólido (aja agora),
 * adjacente = fill suave (confirmar), brecha = contorno tracejado (estratégico).
 */

import type { Competitor } from "@/lib/watchlist";
import type { Encaixe, RelationshipPlay } from "@/lib/types";

import { ContaReportButton } from "@/components/conta-report-button";
import { GerarNoFormareButton } from "@/components/gerar-no-formare-button";
import { ScoreBadge } from "@/components/score-badge";
import { RecencyStamp, SourceRef } from "@/components/signal-meta";

const ENCAIXE_LABEL: Record<Encaixe, string> = {
  direto: "Direto",
  adjacente: "Adjacente · confirmar",
  brecha: "Brecha · oportunidade",
};
const ENCAIXE_CLASS: Record<Encaixe, string> = {
  direto: "bg-stone-900 text-stone-50",
  adjacente: "bg-stone-100 text-stone-700",
  brecha: "border border-dashed border-stone-300 text-stone-500",
};

function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function FichaConta({
  conta,
  jogadas,
  now,
  clientName,
}: {
  conta: Competitor;
  jogadas: RelationshipPlay[];
  now: string;
  clientName: string;
}) {
  const profile = conta.profile;

  return (
    <section
      data-testid="ficha-conta"
      className="rounded-2xl border border-stone-200 bg-white shadow-sm"
    >
      {/* cabeçalho — perfil da conta */}
      <header className="flex items-start gap-3 border-b border-stone-100 px-4 py-4 sm:px-5">
        <span
          aria-hidden
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-stone-100 text-sm font-semibold text-stone-600"
        >
          {monogram(conta.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[17px] font-semibold tracking-tight text-stone-900">{conta.name}</h2>
            <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
              conta-chave
            </span>
            {!conta.enabled ? (
              <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                pausada
              </span>
            ) : null}
          </div>
          {profile?.tipo ? <p className="mt-1 text-sm text-stone-500">{profile.tipo}</p> : null}
          {profile?.regiao ? <p className="mt-0.5 text-xs text-stone-400">{profile.regiao}</p> : null}
        </div>
      </header>

      {/* jogadas de relacionamento */}
      <div className="px-4 py-4 sm:px-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">
          Jogadas de relacionamento {jogadas.length > 0 ? `(${jogadas.length})` : ""}
        </p>
        {jogadas.length === 0 ? (
          <p className="rounded-md border border-dashed border-stone-200 bg-stone-50/60 px-3 py-3 text-sm text-stone-500">
            {conta.sources.length === 0
              ? "Sem fonte pública desta conta ainda — adicione o site/notícias em Contas → Monitorar pra o Radar varrer."
              : "Sem novidade nesta conta — rode o Radar ou espere a próxima varredura."}
          </p>
        ) : (
          <ul className="space-y-3">
            {jogadas.map((j) => (
              <li
                key={j.id}
                data-testid="jogada"
                className="rounded-xl border border-stone-200 bg-stone-50/40 p-3.5"
              >
                <div className="flex items-start gap-3">
                  <ScoreBadge score={j.score} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          "rounded-md px-2 py-0.5 text-xs font-medium " + ENCAIXE_CLASS[j.encaixe]
                        }
                      >
                        {ENCAIXE_LABEL[j.encaixe]}
                      </span>
                    </div>
                    <p className="mt-1.5 font-semibold leading-snug text-stone-900">{j.sinal}</p>
                  </div>
                </div>

                <div className="mt-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-red-700">
                    Oportunidade
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-stone-700">{j.gatilho}</p>
                </div>
                <div className="mt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
                    Por que esta aderência
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-stone-700">{j.justificativa}</p>
                </div>
                <div className="mt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
                    {j.brainRef ? "Oferta que atende" : "Oferta"}
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-stone-800">
                    {j.brainRef ?? "Sem oferta que atenda hoje — leve como oportunidade estratégica."}
                  </p>
                </div>
                {j.urgencia ? (
                  <div className="mt-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-red-700">
                      Urgência{j.urgenciaConcorrente ? ` · ${j.urgenciaConcorrente}` : ""}
                    </p>
                    <p className="mt-0.5 text-sm leading-relaxed text-stone-700">{j.urgencia}</p>
                    {j.urgenciaFonte ? (
                      <div className="mt-1">
                        <SourceRef url={j.urgenciaFonte.url} titulo={j.urgenciaFonte.titulo} />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {j.reforco ? (
                  <div className="mt-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
                      Reforço de mercado
                    </p>
                    <p className="mt-0.5 text-sm leading-relaxed text-stone-700">{j.reforco}</p>
                    {j.reforcoFonte ? (
                      <div className="mt-1">
                        <SourceRef url={j.reforcoFonte.url} titulo={j.reforcoFonte.titulo} />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
                    Ação
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-stone-800">{j.acao}</p>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <SourceRef url={j.fonte.url} titulo={j.fonte.titulo} />
                  <RecencyStamp publishedAt={j.publishedAt} collectedAt={j.collectedAt} now={now} />
                </div>

                <div className="mt-3">
                  <GerarNoFormareButton itemId={j.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ação da conta: empacotar as jogadas num briefing (Relatórios). */}
      {jogadas.length > 0 ? (
        <div className="border-t border-stone-100 px-4 py-3 sm:px-5">
          <ContaReportButton clientName={clientName} conta={conta.name} />
        </div>
      ) : null}
    </section>
  );
}
