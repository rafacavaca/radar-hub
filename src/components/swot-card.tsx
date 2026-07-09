"use client";

/**
 * Onda 3 · F — SWOT vivo na tela: 2x2 clássico. Forças/Fraquezas citadas
 * (fonte); Oportunidades/Ameaças rotuladas como leitura estratégica (rascunho).
 * Origem do Brain rotulada. Botão Gerar/Atualizar.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { Swot, SwotItem } from "@/lib/diagnostico/schema";
import { formatDateTimePtBR } from "@/lib/format";

import { SourceRef } from "@/components/signal-meta";

const BRAIN_LABEL: Record<Swot["brain_mode"], string> = {
  live: "leitura externa ancorada no Brain real",
  fixture: "leitura externa com rascunho local do Brain",
  none: "sem Brain do cliente — leitura externa conservadora",
};

function Quadrante({ titulo, cor, itens, vazio, comFonte }: { titulo: string; cor: string; itens: SwotItem[]; vazio: string; comFonte: boolean }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <p className={"text-[11px] font-semibold uppercase tracking-[0.08em] " + cor}>{titulo}</p>
      <ul className="mt-1.5 space-y-1.5">
        {itens.length === 0 ? <li className="text-xs text-stone-400">— {vazio}</li> : null}
        {itens.map((it, i) => (
          <li key={i} className="text-sm text-stone-700">
            {it.texto}{" "}
            {comFonte && it.fonte_url ? <SourceRef url={it.fonte_url} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SwotCard({
  clientName,
  competitorId,
  concorrenteNome,
  swot,
}: {
  clientName: string;
  competitorId: string;
  concorrenteNome: string;
  swot: Swot | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch("/api/diagnostico/swot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, competitorId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falhou, tente de novo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-2 rounded-2xl border border-stone-200 bg-stone-50/50 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-3 sm:px-5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">
          SWOT — {concorrenteNome}
          <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
            forças/fraquezas citadas · oport./ameaças = leitura
          </span>
        </p>
        <div className="flex items-center gap-2">
          {swot ? <span className="text-[11px] text-stone-400">gerado {formatDateTimePtBR(swot.gerado_em)}</span> : null}
          <button
            onClick={gerar}
            disabled={busy}
            className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {busy ? "Gerando…" : swot ? "Atualizar SWOT" : "Gerar SWOT"}
          </button>
        </div>
      </header>

      {erro ? <p className="px-4 pt-2 text-xs text-red-600 sm:px-5">{erro}</p> : null}

      {!swot ? (
        <p className="px-4 py-4 text-sm text-stone-500 sm:px-5">
          Sem SWOT ainda — gera do diagnóstico salvo + Brain (rápido, sem nova varredura).
        </p>
      ) : (
        <div className="px-4 py-4 sm:px-5">
          <p className="mb-2 text-[11px] text-stone-400">{BRAIN_LABEL[swot.brain_mode]}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Quadrante titulo="Forças" cor="text-emerald-700" itens={swot.forcas} vazio="sem evidência coletada" comFonte />
            <Quadrante titulo="Fraquezas" cor="text-red-700" itens={swot.fraquezas} vazio="sem evidência coletada" comFonte />
            <Quadrante titulo="Oportunidades (leitura)" cor="text-sky-700" itens={swot.oportunidades} vazio="—" comFonte={false} />
            <Quadrante titulo="Ameaças (leitura)" cor="text-amber-700" itens={swot.ameacas} vazio="—" comFonte={false} />
          </div>
          <p className="mt-3 rounded-lg bg-sky-50/60 px-3 py-2 text-[11px] text-sky-800">
            Forças e fraquezas saem de evidência coletada (com fonte). Oportunidades e ameaças são
            <span className="font-semibold"> leitura estratégica (rascunho)</span> — o estrategista decide.
          </p>
        </div>
      )}
    </section>
  );
}
