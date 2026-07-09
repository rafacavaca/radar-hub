/**
 * DIAGNÓSTICO — o diagnóstico de marca VIVO por concorrente (complementa o pilar
 * Concorrentes). Uma ficha por concorrente (Lentes 1-2: posicionamento + canais),
 * com fonte + data em cada campo, e um botão "Gerar/Atualizar" (sob demanda).
 * Sub-nav junto de Vigiar/Identidade. Escopo por ?cliente=.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { getRegras, listDisparos } from "@/lib/diagnostico/alertas-store";
import { listDiagnosticos } from "@/lib/diagnostico/store";
import { pillarOf, readWatchlist } from "@/lib/watchlist";

import { AlertasDiagnostico } from "@/components/alertas-diagnostico";
import { BattlecardCard } from "@/components/battlecard-card";
import { DiagnosticoRunButton } from "@/components/diagnostico-run-button";
import { FichaDiagnostico } from "@/components/ficha-diagnostico";
import { PainelComparativo } from "@/components/painel-diagnostico";

export const dynamic = "force-dynamic";

export default async function DiagnosticoPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const params = await searchParams;
  const watchlist = readWatchlist();
  const clientNames = watchlist.clients.map((c) => c.name);
  const cliente =
    params.cliente && clientNames.includes(params.cliente) ? params.cliente : (clientNames[0] ?? "");

  const client = watchlist.clients.find((c) => c.name === cliente);
  if (!client) redirect("/visao");
  if (client.mode === "carteira") redirect(`/carteira?cliente=${encodeURIComponent(cliente)}`);

  const concorrentes = client.competitors.filter((c) => pillarOf(c, client.mode) === "concorrente");
  const byId = new Map(listDiagnosticos(cliente).map((d) => [d.concorrente_id, d]));
  const now = new Date().toISOString();
  const q = cliente ? `?cliente=${encodeURIComponent(cliente)}` : "";

  return (
    <section className="mx-auto max-w-[1080px] px-5 py-8 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Concorrentes</p>

      <div className="mt-2 flex gap-1 border-b border-stone-200">
        <Link href={`/vigiar${q}`} className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-stone-500 hover:text-stone-900">
          Vigiar
        </Link>
        <Link href={`/identidade${q}`} className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-stone-500 hover:text-stone-900">
          Identidade
        </Link>
        <span className="border-b-2 border-stone-900 px-3 py-2 text-sm font-medium text-stone-900">Diagnóstico</span>
      </div>

      <p className="mt-4 text-sm text-stone-500">
        Diagnóstico de marca <span className="font-medium text-stone-700">vivo</span> — posicionamento
        + canais de cada concorrente, com fonte e data. O que o site não diz aparece como “não
        encontrado” (honesto). Rode sob demanda.
      </p>

      <div className="mt-6">
        <AlertasDiagnostico
          cliente={cliente}
          regrasIniciais={getRegras(cliente)}
          disparos={listDisparos(cliente)}
        />
      </div>

      {byId.size >= 2 ? (
        <div className="mt-6">
          <PainelComparativo diagnosticos={[...byId.values()]} />
        </div>
      ) : null}

      <div className="mt-6 space-y-6">
        {concorrentes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
            <p className="text-base font-medium text-stone-700">Nenhum concorrente ainda.</p>
            <p className="mt-1 text-sm text-stone-500">
              Cadastre em <Link href={`/vigiar${q}`} className="font-medium text-stone-700 underline-offset-2 hover:underline">Vigiar</Link>.
            </p>
          </div>
        ) : (
          concorrentes.map((c) => {
            const diag = byId.get(c.id);
            return (
              <div key={c.id} id={`diag-${c.id}`} className="scroll-mt-6">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-stone-900">{c.name}</h3>
                  <DiagnosticoRunButton
                    clientName={cliente}
                    competitorId={c.id}
                    temDiagnostico={Boolean(diag)}
                  />
                </div>
                {diag ? (
                  <>
                    <FichaDiagnostico diag={diag} now={now} />
                    <BattlecardCard
                      clientName={cliente}
                      competitorId={c.id}
                      concorrenteNome={c.name}
                      battlecard={diag.battlecard ?? null}
                    />
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-stone-200 bg-white/60 px-5 py-8 text-sm text-stone-500">
                    Sem diagnóstico ainda — clique <span className="font-medium text-stone-700">Gerar diagnóstico</span> (lê o site, leva ~1 min).
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
