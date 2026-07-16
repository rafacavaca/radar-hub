/**
 * DIAGNÓSTICO — o diagnóstico de marca VIVO por concorrente (complementa o pilar
 * Concorrentes). Uma ficha por concorrente (Lentes 1-2: posicionamento + canais),
 * com fonte + data em cada campo, e um botão "Gerar/Atualizar" (sob demanda).
 * Sub-nav junto de Vigiar/Identidade. Escopo por ?cliente=.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { loadDisparos, loadRegras } from "@/lib/diagnostico/alertas-store";
import { loadDiagConfig } from "@/lib/diagnostico/config";
import { loadDiagnosticos } from "@/lib/diagnostico/store";
import { pillarOf, loadWatchlist } from "@/lib/watchlist";

import { loadCobertura } from "@/lib/diagnostico/cobertura";
import { buildDiagnosticoCharts, buildMapaPosicionamento } from "@/lib/diagnostico/report-charts";

import { AlertasDiagnostico } from "@/components/alertas-diagnostico";
import { Rotulo } from "@/components/rotulo";
import { BattlecardCard } from "@/components/battlecard-card";
import { CoberturaCard } from "@/components/cobertura-card";
import { SwotCard } from "@/components/swot-card";
import { ReportChart, ReportCharts } from "@/components/charts/report-charts";
import { DiagConfigEditor } from "@/components/diag-config-editor";
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
  const watchlist = await loadWatchlist();
  const clientNames = watchlist.clients.map((c) => c.name);
  const cliente =
    params.cliente && clientNames.includes(params.cliente) ? params.cliente : (clientNames[0] ?? "");

  const client = watchlist.clients.find((c) => c.name === cliente);
  if (!client) redirect("/visao");
  if (client.mode === "carteira") redirect(`/carteira?cliente=${encodeURIComponent(cliente)}`);

  const concorrentes = client.competitors.filter((c) => pillarOf(c, client.mode) === "concorrente");
  const [diagnosticos, regras, disparos, cobertura] = await Promise.all([
    loadDiagnosticos(cliente),
    loadRegras(cliente),
    loadDisparos(cliente),
    loadCobertura(cliente),
  ]);
  // config por concorrente (usada dentro do map JSX — pré-carregada aqui).
  const configs = new Map(
    await Promise.all(
      concorrentes.map(async (c) => [c.id, await loadDiagConfig(cliente, c.id)] as const),
    ),
  );
  const byId = new Map(diagnosticos.map((d) => [d.concorrente_id, d]));
  const mapa = buildMapaPosicionamento(diagnosticos);
  // F2 — o dashboard do mercado: maturidade, canais, reputação, mix e evolução
  // (o mapa 2x2 já tem bloco próprio acima — sai daqui pra não duplicar).
  const graficos = buildDiagnosticoCharts(diagnosticos).filter((c) => c.tipo !== "dispersao");
  const now = new Date().toISOString();
  const q = cliente ? `?cliente=${encodeURIComponent(cliente)}` : "";

  return (
    <section className="mx-auto max-w-[1080px] px-5 py-8 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400"><Rotulo termo="concorrentes" /></p>

      <div className="mt-2 flex gap-1 border-b border-stone-200">
        <Link href={`/vigiar${q}`} className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-stone-500 hover:text-stone-900">
          Monitorar
        </Link>
        <Link href={`/identidade${q}`} className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-stone-500 hover:text-stone-900">
          Identidade
        </Link>
        <span className="border-b-2 border-stone-900 px-3 py-2 text-sm font-medium text-stone-900">Diagnóstico</span>
      </div>

      <p className="mt-4 text-sm text-stone-500">
        Diagnóstico de marca — posicionamento
        + canais de cada <Rotulo termo="concorrentes" singular lower />, com fonte e data. O que o site não diz aparece como “não
        encontrado” (honesto). Rode sob demanda.
      </p>

      <div className="mt-6">
        <AlertasDiagnostico cliente={cliente} regrasIniciais={regras} disparos={disparos} />
      </div>

      {mapa ? (
        <div className="mt-6">
          <ReportChart chart={mapa} />
        </div>
      ) : null}

      {graficos.length > 0 ? (
        <div className="mt-6">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-stone-500">
            Mercado em gráficos
          </h2>
          <ReportCharts charts={graficos} />
        </div>
      ) : null}

      {byId.size >= 2 ? (
        <div className="mt-6">
          <CoberturaCard cliente={cliente} cobertura={cobertura} />
        </div>
      ) : null}

      {byId.size >= 2 ? (
        <div className="mt-6">
          <PainelComparativo diagnosticos={[...byId.values()]} />
        </div>
      ) : null}

      <div className="mt-6 space-y-6">
        {concorrentes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
            <p className="text-base font-medium text-stone-700">Nenhum <Rotulo termo="concorrentes" singular lower /> ainda.</p>
            <p className="mt-1 text-sm text-stone-500">
              Cadastre em <Link href={`/vigiar${q}`} className="font-medium text-stone-700 underline-offset-2 hover:underline">Monitorar</Link>.
            </p>
          </div>
        ) : (
          concorrentes.map((c) => {
            const diag = byId.get(c.id);
            return (
              <div key={c.id} id={`diag-${c.id}`} className="scroll-mt-6">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-stone-900">{c.name}</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <DiagConfigEditor
                      cliente={cliente}
                      competitorId={c.id}
                      concorrenteNome={c.name}
                      config={configs.get(c.id)!}
                    />
                    <DiagnosticoRunButton
                      clientName={cliente}
                      competitorId={c.id}
                      temDiagnostico={Boolean(diag)}
                    />
                  </div>
                </div>
                {diag ? (
                  <>
                    <FichaDiagnostico diag={diag} now={now} />
                    <SwotCard
                      clientName={cliente}
                      competitorId={c.id}
                      concorrenteNome={c.name}
                      swot={diag.swot ?? null}
                    />
                    <BattlecardCard
                      clientName={cliente}
                      competitorId={c.id}
                      concorrenteNome={c.name}
                      battlecard={diag.battlecard ?? null}
                      posicionamento={diag.posicionamento}
                      movimentos={diag.movimentos}
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
