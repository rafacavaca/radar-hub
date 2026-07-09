"use client";

/**
 * Onda 3 · E3 — COBERTURA DE CONTEÚDO na tela: grade tema × concorrente, com
 * WHITESPACE (tema que ≤1 cobre = oportunidade) destacado. Nota de escopo
 * honesta: é cobertura de conteúdo, não ranking de SEO (ferramenta paga = fila).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { CoberturaConteudo } from "@/lib/diagnostico/cobertura";
import { formatDateTimePtBR } from "@/lib/format";

export function CoberturaCard({ cliente, cobertura }: { cliente: string; cobertura: CoberturaConteudo | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch("/api/diagnostico/cobertura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: cliente }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falhou, tente de novo");
    } finally {
      setBusy(false);
    }
  }

  const concorrentes = cobertura?.concorrentes ?? [];
  const whitespace = (cobertura?.temas ?? []).filter((t) => t.whitespace);

  return (
    <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-3 sm:px-5">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
          Cobertura de conteúdo
          <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">derivado</span>
        </p>
        <div className="flex items-center gap-2">
          {cobertura ? <span className="text-[11px] text-stone-400">gerado {formatDateTimePtBR(cobertura.gerado_em)}</span> : null}
          <button onClick={gerar} disabled={busy} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-50">
            {busy ? "Analisando…" : cobertura ? "Atualizar" : "Analisar cobertura"}
          </button>
        </div>
      </header>

      {erro ? <p className="px-4 pt-2 text-xs text-red-600 sm:px-5">{erro}</p> : null}

      {!cobertura ? (
        <p className="px-4 py-4 text-sm text-stone-500 sm:px-5">
          Mapa de quais temas cada concorrente cobre no conteúdo — e onde há espaço vazio (oportunidade
          editorial). Precisa de ≥2 concorrentes com conteúdo coletado.
        </p>
      ) : (
        <div className="px-4 py-4 sm:px-5">
          {whitespace.length > 0 ? (
            <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Whitespace — pouco disputado</p>
              <p className="mt-1 text-sm text-stone-700">{whitespace.map((t) => t.tema).join(" · ")}</p>
              <p className="mt-1 text-[11px] text-emerald-800">Temas que ≤1 concorrente cobre — espaço para o cliente liderar.</p>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-xs">
              <thead>
                <tr className="text-left text-stone-400">
                  <th className="py-1.5 pr-3 font-semibold">Tema</th>
                  {concorrentes.map((c) => (
                    <th key={c} className="px-1.5 py-1.5 text-center font-medium">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cobertura.temas.map((t) => (
                  <tr key={t.tema} className={"border-t border-stone-100 " + (t.whitespace ? "bg-emerald-50/30" : "")}>
                    <td className="py-1.5 pr-3 font-medium text-stone-800">
                      {t.tema}
                      {t.whitespace ? <span className="ml-1 text-[10px] text-emerald-700">◦ whitespace</span> : null}
                    </td>
                    {concorrentes.map((c) => (
                      <td key={c} className="px-1.5 py-1.5 text-center">
                        {t.cobertoPor.includes(c) ? <span className="text-emerald-700">●</span> : <span className="text-stone-300">·</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11px] leading-snug text-stone-400">{cobertura.observacao}</p>
        </div>
      )}
    </section>
  );
}
