/**
 * PERGUNTAR — a tela onde o Rafael conversa com o Radar.
 *
 * Server component simples: só o cabeçalho editorial e o chat client (`AskRadar`),
 * que faz todo o trabalho (POST /api/ask). Sem dados no servidor — a resposta,
 * as fontes e a honestidade vêm da API, que só afirma o que o Radar coletou.
 */

import { readWatchlist } from "@/lib/watchlist";

import { AskRadar } from "@/components/ask-radar";

export const dynamic = "force-dynamic";

export default async function PerguntarPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const params = await searchParams;
  const allClients = readWatchlist().clients.map((c) => c.name);
  const cliente =
    params.cliente && allClients.includes(params.cliente) ? params.cliente : (allClients[0] ?? "");
  // Conhecimento é por conta: o chat foca no cliente selecionado.
  const clients = cliente ? [cliente] : allClients;

  return (
    <section className="mx-auto max-w-[1080px] px-5 py-8 sm:px-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
          Conhecimento
        </p>
        <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-stone-900">
          O que o Radar sabe sobre {cliente || "o cliente"}
        </h1>
        <p className="mt-1.5 text-sm text-stone-500">
          Responde só com o que o Radar coletou e o Brain do cliente — sempre com fontes, e honesto
          quando não sabe.
        </p>
      </header>

      <div className="mt-8">
        <AskRadar clients={clients} />
      </div>
    </section>
  );
}
