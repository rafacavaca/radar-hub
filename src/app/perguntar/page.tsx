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

export default function PerguntarPage() {
  const clients = readWatchlist().clients.map((c) => c.name);

  return (
    <section className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-10">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-stone-400">
          Pergunte ao Radar
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
          O que você quer saber?
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
