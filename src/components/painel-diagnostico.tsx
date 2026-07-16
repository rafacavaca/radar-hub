/**
 * PAINEL COMPARATIVO (F2) — a matriz "avaliação das marcas" VIVA, cruzando todos
 * os concorrentes com diagnóstico. Ranqueia pela régua de maturidade
 * (referência → defasado) e mostra produtos, canais e mídia paga lado a lado.
 * Render puro sobre os diagnósticos salvos.
 */

import type { DiagnosticoConcorrente } from "@/lib/diagnostico/schema";
import { Rotulo } from "@/components/rotulo";

/** Régua de maturidade, do melhor pro pior (para o ranking). */
const NIVEL_ORDER = ["icônica", "proprietária", "diferenciada", "padronizada", "clichê", "desestruturada", "defasada"];
function nivelRank(nivel: string | null | undefined): number {
  const i = NIVEL_ORDER.indexOf((nivel ?? "").toLowerCase());
  return i < 0 ? 99 : i;
}

function canaisPresentes(d: DiagnosticoConcorrente): number {
  return Object.values(d.canais).filter((c) => c.presente).length;
}

function precoResumo(d: DiagnosticoConcorrente): string | null {
  const p = d.preco;
  if (!p) return null;
  if (p.status === "encontrado") return `público (${p.planos.filter((x) => x.preco).length})`;
  if (p.status === "sob_consulta") return "sob consulta";
  return null;
}

/** melhor nota coletada, com a fonte (fato). */
function reputacaoResumo(d: DiagnosticoConcorrente): string | null {
  const nomes = { reclame_aqui: "RA", google: "Google", g2: "G2", capterra: "Capterra" } as const;
  const coletadas = (d.reputacao?.fontes ?? []).filter((f) => f.status === "coletado" && f.nota !== null);
  if (coletadas.length === 0) return null;
  return coletadas.map((f) => `${nomes[f.fonte]} ${f.nota}`).join(" · ");
}

/** true/false/null (null = não localizado em nenhuma plataforma). */
function anuncia(d: DiagnosticoConcorrente): boolean | null {
  const mp = d.midia_paga;
  if (!mp) return null;
  const plats = [mp.meta, mp.linkedin, mp.google];
  if (plats.some((p) => p.anuncia === true)) return true;
  if (plats.every((p) => p.status === "nao_localizado")) return null;
  return false;
}

export function PainelComparativo({ diagnosticos }: { diagnosticos: DiagnosticoConcorrente[] }) {
  if (diagnosticos.length === 0) return null;
  const sorted = [...diagnosticos].sort(
    (a, b) => nivelRank(a.maturidade?.nivel) - nivelRank(b.maturidade?.nivel),
  );

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
        Painel comparativo — referência → defasado
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-[11px] uppercase tracking-wide text-stone-400">
              <th className="py-2 pr-3 font-semibold"><Rotulo termo="concorrentes" singular /></th>
              <th className="py-2 pr-3 font-semibold">Maturidade</th>
              <th className="py-2 pr-3 font-semibold">Produtos</th>
              <th className="py-2 pr-3 font-semibold">Canais</th>
              <th className="py-2 pr-3 font-semibold">Mídia paga</th>
              <th className="py-2 pr-3 font-semibold">Preço</th>
              <th className="py-2 pr-3 font-semibold">Reputação</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => {
              const ad = anuncia(d);
              return (
                <tr key={d.concorrente_id} className="border-b border-stone-100 last:border-0">
                  <td className="py-2 pr-3 font-medium text-stone-900">{d.concorrente_nome}</td>
                  <td className="py-2 pr-3">
                    {d.maturidade?.status === "avaliado" ? (
                      <span className="text-stone-700">
                        {d.maturidade.nivel}
                        {d.maturidade.score != null ? ` · ${d.maturidade.score}` : ""}
                        <span className="ml-1 text-[10px] text-amber-700">(opinião)</span>
                      </span>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-stone-700">{d.posicionamento.produtos.length}</td>
                  <td className="py-2 pr-3 text-stone-700">{canaisPresentes(d)}/6</td>
                  <td className="py-2 pr-3">
                    {ad === true ? (
                      <span className="text-emerald-700">anunciando</span>
                    ) : ad === false ? (
                      <span className="text-stone-500">sem anúncios</span>
                    ) : (
                      <span className="text-stone-400">não localizado</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {precoResumo(d) ? <span className="text-stone-700">{precoResumo(d)}</span> : <span className="text-stone-400">—</span>}
                  </td>
                  <td className="py-2 pr-3">
                    {reputacaoResumo(d) ? <span className="text-stone-700">{reputacaoResumo(d)}</span> : <span className="text-stone-400">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-stone-400">
        Ranking pela régua de maturidade (análise de maturidade). Fato e opinião distinguidos; cada
        campo tem fonte e data na ficha.
      </p>
    </section>
  );
}
