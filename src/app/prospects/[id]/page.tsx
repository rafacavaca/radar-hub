/**
 * DOSSIÊ de um prospect (F1) — mobile-first. Cabeçalho com a empresa + reunião,
 * ações (gerar/atualizar — caro; Gerar no Formare) e o dossiê renderizado, ou o
 * estado vazio ("gerar" quando ainda não existe). Escopo por ?cliente=.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DossieActions } from "@/components/prospects/dossie-actions";
import { DossieView } from "@/components/prospects/dossie-view";
import { ProspectLifecycle } from "@/components/prospects/prospect-lifecycle";
import { formatDateTimePtBR } from "@/lib/format";
import { getProspect, loadDossie } from "@/lib/prospects/store";
import { loadWatchlist } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export default async function DossiePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cliente?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const clientNames = (await loadWatchlist()).clients.map((c) => c.name);
  const cliente = sp.cliente && clientNames.includes(sp.cliente) ? sp.cliente : (clientNames[0] ?? "");
  if (!cliente) redirect("/visao");

  const prospect = await getProspect(cliente, id);
  if (!prospect) notFound();
  const dossie = await loadDossie(id);

  return (
    <section className="mx-auto max-w-[760px] px-4 py-6 sm:px-6 sm:py-8">
      <Link href={`/prospects?cliente=${encodeURIComponent(cliente)}`} className="text-[13px] text-stone-400 hover:text-stone-700">
        ← Prospects
      </Link>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-tight text-stone-900">{prospect.nome}</h1>
          <a href={prospect.siteUrl} target="_blank" rel="noreferrer" className="text-sm text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline">
            {prospect.siteUrl.replace(/^https?:\/\//, "")}
          </a>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-400">
            {prospect.reuniaoEm ? <span className="font-medium text-stone-600">Reunião: {formatDateTimePtBR(prospect.reuniaoEm)}</span> : null}
            {prospect.contato ? <span>Contato: {prospect.contato}</span> : null}
            {dossie ? <span>dossiê de {formatDateTimePtBR(dossie.geradoEm)}</span> : null}
          </div>
          {prospect.contexto ? <p className="mt-1.5 max-w-prose text-sm text-stone-600">{prospect.contexto}</p> : null}
        </div>
        <ProspectLifecycle cliente={cliente} id={id} status={prospect.status} />
      </header>

      <div className="mt-4">
        <DossieActions cliente={cliente} id={id} temDossie={Boolean(dossie)} />
      </div>

      <div className="mt-6">
        {dossie ? (
          <DossieView dossie={dossie} />
        ) : (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
            <p className="text-base font-medium text-stone-700">Dossiê ainda não gerado.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-stone-500">
              Clique <span className="font-medium text-stone-700">Gerar dossiê</span> — o Radar lê o site, farejando
              concorrentes e sinais públicos, e cruza com a nossa oferta (Brain). Leva ~1 min e consome crédito.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
