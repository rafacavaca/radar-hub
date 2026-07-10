/**
 * PONTO + SELO DE NATUREZA (F1) — a unidade de honestidade do dossiê. Todo
 * ponto mostra o que é: fato (com fonte clicável), inferência (marcada) ou não
 * encontrado. É o que o vendedor confere antes de repetir na reunião.
 *
 * Server-safe (sem "use client") — usado direto nas páginas.
 */

import { SourceRef } from "@/components/signal-meta";
import type { Natureza, Ponto } from "@/lib/prospects/schema";

const SELO: Record<Natureza, { txt: string; cls: string }> = {
  fato: { txt: "fato", cls: "bg-blue-50 text-blue-700" },
  inferencia: { txt: "inferência", cls: "bg-amber-50 text-amber-800" },
  nao_encontrado: { txt: "não encontrado", cls: "bg-stone-100 text-stone-500" },
};

export function SeloNatureza({ natureza }: { natureza: Natureza }) {
  const s = SELO[natureza];
  return <span className={"shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold " + s.cls}>{s.txt}</span>;
}

/** Uma linha do dossiê: texto + selo + fonte (quando fato). */
export function PontoLinha({ ponto }: { ponto: Ponto }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm leading-relaxed text-stone-700">
      <span>{ponto.texto}</span>
      <SeloNatureza natureza={ponto.natureza} />
      {ponto.fonte_url ? <SourceRef url={ponto.fonte_url} titulo={ponto.fonte_titulo} /> : null}
      {!ponto.fonte_url && ponto.fonte_titulo ? (
        <span className="text-[11px] text-stone-400">via {ponto.fonte_titulo}</span>
      ) : null}
    </li>
  );
}
