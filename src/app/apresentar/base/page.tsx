/**
 * APRESENTAR — BASE DE CONHECIMENTO (D14, F3). O dossiê do que sabemos de um
 * cliente: SÓ os fatos CONFIRMADOS, agrupados nos tipos, com fonte — limpo, sem
 * ações, pronto pra projetar/exportar (PDF) ou virar argumento. Chromeless
 * (fora do shell). Abre da aba Base ("Apresentar ↗"), em aba própria. `?cliente=`.
 */

import Link from "next/link";

import { BRAIN_TIPOS, BRAIN_TIPO_LABEL, type BrainAutoridade, type BrainItem } from "@/lib/brain-nativo/schema";
import { loadBrainItems } from "@/lib/brain-nativo/store";
import { formatDateShort, formatDateTimePtBR } from "@/lib/format";
import { loadWatchlist } from "@/lib/watchlist";

import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

function host(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** verdade primeiro (a verdade institucional puxa o dossiê), referência depois. */
function ordenar(itens: BrainItem[]): BrainItem[] {
  return [...itens].sort((a, b) => (a.autoridade === b.autoridade ? 0 : a.autoridade === "verdade" ? -1 : 1));
}

export default async function ApresentarBasePage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const params = await searchParams;
  const clients = (await loadWatchlist()).clients.map((c) => c.name);
  const cliente =
    params.cliente && clients.includes(params.cliente) ? params.cliente : (clients[0] ?? "");

  const confirmados = cliente ? (await loadBrainItems(cliente)).filter((i) => i.status === "confirmado") : [];
  const grupos = BRAIN_TIPOS.map((t) => ({ tipo: t, itens: ordenar(confirmados.filter((i) => i.tipo === t)) })).filter(
    (g) => g.itens.length > 0,
  );
  const fontes = new Set(confirmados.map((i) => i.fonte_url || i.fonte_titulo).filter(Boolean)).size;

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 print:py-4">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-6">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-stone-400">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-red-500 ring-4 ring-red-500/15" />
            Radar · Base de conhecimento
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">{cliente || "—"}</h1>
          <p className="mt-1.5 text-sm text-stone-500">
            {confirmados.length} {confirmados.length === 1 ? "fato confirmado" : "fatos confirmados"}
            {fontes > 0 ? <> · {fontes} {fontes === 1 ? "fonte" : "fontes"}</> : null} · gerado em{" "}
            {formatDateTimePtBR(new Date().toISOString())}
          </p>
        </div>
        <PrintButton />
      </header>

      {confirmados.length === 0 ? (
        <p className="py-16 text-center text-stone-500">
          Ainda não há conhecimento confirmado deste cliente.{" "}
          <Link href={`/base?cliente=${encodeURIComponent(cliente)}`} className="text-red-600 underline print:hidden">
            Confirme na aba Base
          </Link>{" "}
          pra montar o dossiê.
        </p>
      ) : (
        <div className="mt-8 space-y-8">
          {grupos.map((g) => (
            <section key={g.tipo} className="break-inside-avoid">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">
                {BRAIN_TIPO_LABEL[g.tipo]}
              </h2>
              <ul className="mt-3 space-y-3">
                {g.itens.map((it) => (
                  <li key={it.id} className="border-l-2 border-stone-200 pl-4">
                    <p className="text-[15px] leading-relaxed text-stone-800">{it.texto}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-400">
                      <SeloAut autoridade={it.autoridade} />
                      {it.fonte_url ? (
                        <a
                          href={it.fonte_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline-offset-2 hover:text-stone-700 hover:underline"
                        >
                          {host(it.fonte_url)}
                        </a>
                      ) : it.fonte_titulo ? (
                        <span title="material enviado">{it.fonte_titulo}</span>
                      ) : it.origem === "manual" ? (
                        <span>você</span>
                      ) : null}
                      {it.data ? <span>{formatDateShort(it.data)}</span> : null}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <footer className="mt-12 border-t border-stone-200 pt-4 text-center text-xs text-stone-400">
        Gerado pelo Radar · base de conhecimento (implantação) · cada item com fonte
      </footer>
    </section>
  );
}

function SeloAut({ autoridade }: { autoridade: BrainAutoridade }) {
  const verdade = autoridade === "verdade";
  return (
    <span
      className={
        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
        (verdade ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700")
      }
    >
      {verdade ? "Verdade" : "Referência"}
    </span>
  );
}
