/**
 * CARTEIRA — a home do modo carteira (2º template / sales-enablement). Uma
 * FICHA por hospital (perfil + fit por linha + gatilhos + "Gerar no Formare").
 * O "feed de gatilhos" da região é a soma das fichas. Escopo por ?cliente=.
 *
 * Server component: roda o loop (cache diário) e agrupa as leituras de venda
 * por hospital. Cliente de modo "concorrentes" cai na Visão (esta tela é da carteira).
 */

import { redirect } from "next/navigation";

import { formatDateTimePtBR } from "@/lib/format";
import { loadRadarForRender, type RadarLoopResult } from "@/lib/loop";
import { AutoRefreshStale } from "@/components/auto-refresh-stale";
import { loadWatchlist } from "@/lib/watchlist";

import { FichaHospital } from "@/components/ficha-hospital";
import { RodarAgora } from "@/components/rodar-agora";

export const dynamic = "force-dynamic";

export default async function CarteiraPage({
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
  // esta tela é do modo carteira; cliente de concorrentes vai pra Visão.
  if (!client || client.mode !== "carteira") {
    redirect(`/visao${cliente ? `?cliente=${encodeURIComponent(cliente)}` : ""}`);
  }

  const subjects = client.competitors;

  let result: RadarLoopResult = { items: [], ranAt: "" };
  let error = false;
  try {
    result = await loadRadarForRender();
  } catch {
    error = true;
  }
  const now = result.ranAt || new Date().toISOString();
  const gatilhos = (result.salesReadings ?? []).filter((s) => s.clientName === cliente);
  const byHospital = (name: string) => gatilhos.filter((g) => g.hospital === name);

  return (
    <div className="mx-auto max-w-[1080px] px-5 py-8 sm:px-6">
      <AutoRefreshStale needsRefresh={result.needsRefresh} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
            Carteira · {cliente}
          </p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-stone-900">
            Fichas dos hospitais
          </h1>
          <p className="mt-1.5 text-sm text-stone-500">
            {gatilhos.length} {gatilhos.length === 1 ? "oportunidade ativa" : "oportunidades ativas"} em{" "}
            {subjects.length} {subjects.length === 1 ? "hospital" : "hospitais"}
            {result.ranAt ? <> · atualizado em {formatDateTimePtBR(result.ranAt)}</> : null}
          </p>
        </div>
        <RodarAgora testId="rodar-agora" cliente={cliente || undefined} />
      </header>

      <div className="mt-6">
        {error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-6 py-6 text-sm text-red-700">
            Não foi possível rodar o Radar agora.
          </p>
        ) : subjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
            <p className="text-base font-medium text-stone-700">Nenhum hospital na carteira ainda.</p>
            <p className="mt-1 text-sm text-stone-500">
              Adicione hospitais na aba Hospitais.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {subjects.map((s) => (
              <FichaHospital key={s.id} subject={s} gatilhos={byHospital(s.name)} now={now} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
