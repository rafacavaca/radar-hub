"use client";

/**
 * Editor da RÉGUA DE PRIORIDADE (P7) — só o super_admin vê (a Implantação
 * decide). Dois cortes: "Alta a partir de X", "Média a partir de Y". Prévia ao
 * vivo (uma régua de exemplos cai em Alta/Média/Baixa conforme afina) — pra ver
 * o efeito ANTES de salvar. Grava em /api/prioridade e recarrega (vale em toda a
 * interface: todo selo de prioridade passa a usar estes cortes).
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CORTE_PADRAO, nivelPorCorte, sanitizarCorte, type CortePrioridade } from "@/lib/prioridade-core";
import { Rotulo } from "@/components/rotulo";

const EXEMPLOS = [85, 72, 55, 40, 25]; // régua de prévia — cobre os três níveis
const COR: Record<string, string> = {
  Alta: "bg-stone-900 text-stone-50",
  Média: "bg-stone-200 text-stone-700",
  Baixa: "bg-stone-100 text-stone-400",
};

export function PrioridadeEditor({ initial }: { initial: CortePrioridade }) {
  const router = useRouter();
  const [alta, setAlta] = useState(String(initial.alta));
  const [media, setMedia] = useState(String(initial.media));
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // prévia sempre coerente (sanitiza o que o usuário digitou, sem gravar)
  const corte: CortePrioridade = sanitizarCorte({ alta: Number(alta), media: Number(media) });
  const padrao = corte.alta === CORTE_PADRAO.alta && corte.media === CORTE_PADRAO.media;

  async function salvar() {
    setBusy(true);
    setErro(null);
    setOk(false);
    try {
      const res = await fetch("/api/prioridade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alta: Number(alta), media: Number(media) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      const saved = (await res.json())?.data?.corte as CortePrioridade | undefined;
      if (saved) {
        setAlta(String(saved.alta));
        setMedia(String(saved.media));
      }
      setOk(true);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-[13px] text-stone-700">
          <Rotulo termo="prioridade" /> <span className="font-medium">Alta</span> a partir de
          <input
            type="number"
            min={2}
            max={100}
            value={alta}
            onChange={(e) => {
              setOk(false);
              setAlta(e.target.value);
            }}
            className="w-16 rounded-md border border-stone-300 bg-white px-2 py-1 text-[13px] tabular-nums text-stone-900 focus:border-stone-500 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-[13px] text-stone-700">
          <span className="font-medium">Média</span> a partir de
          <input
            type="number"
            min={1}
            max={99}
            value={media}
            onChange={(e) => {
              setOk(false);
              setMedia(e.target.value);
            }}
            className="w-16 rounded-md border border-stone-300 bg-white px-2 py-1 text-[13px] tabular-nums text-stone-900 focus:border-stone-500 focus:outline-none"
          />
        </label>
        <span className="text-[12px] text-stone-400">Abaixo disso, Baixa.</span>
      </div>

      {/* prévia ao vivo — prova visível de que o corte tem efeito */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] uppercase tracking-[0.06em] text-stone-400">Prévia</span>
        {EXEMPLOS.map((score) => {
          const nivel = nivelPorCorte(score, corte);
          return (
            <span key={score} className={"inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] " + COR[nivel]}>
              <span className="font-semibold tabular-nums">{score}</span>
              <span className="opacity-80">{nivel}</span>
            </span>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={salvar}
          disabled={busy}
          className="inline-flex min-h-[36px] items-center rounded-md bg-stone-900 px-3.5 py-1.5 text-[13px] font-medium text-stone-50 transition-colors hover:bg-stone-700 disabled:opacity-50"
        >
          {busy ? "Salvando…" : <>Salvar régua de <Rotulo termo="prioridade" lower /></>}
        </button>
        {padrao ? <span className="text-[12px] text-stone-400">Cortes no padrão do sistema.</span> : null}
        {ok ? <span className="text-[12px] text-emerald-700">Salvo — vale em toda a interface.</span> : null}
        {erro ? <span className="text-[12px] text-red-600">{erro}</span> : null}
      </div>
    </div>
  );
}
