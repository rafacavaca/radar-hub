/**
 * CONTAS — a home do pilar Clientes. Uma FICHA por conta-chave (perfil +
 * jogadas de relacionamento + "Gerar no Formare"). É o análogo da /carteira,
 * mas pro pilar Clientes de um cliente em modo CONCORRENTES (ex.: TAGAT):
 * convive com os concorrentes, sem virar carteira. Escopo por ?cliente=.
 *
 * Sub-nav: "Fichas" (esta) · "Vigiar" (cadastro das contas-chave, /contas/vigiar).
 * Server component: roda o loop (cache diário) e agrupa as jogadas por conta.
 * Cliente de carteira vai pra /carteira.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { formatDateTimePtBR } from "@/lib/format";
import { runRadarLoop, type RadarLoopResult } from "@/lib/loop";
import { pillarOf, loadWatchlist } from "@/lib/watchlist";

import { FichaConta } from "@/components/ficha-conta";
import { Rotulo } from "@/components/rotulo";
import { RodarAgora } from "@/components/rodar-agora";
import { ScoreBadge } from "@/components/score-badge";

/** Prioridade de triagem: aja no direto, depois no adjacente; brecha é estratégica. */
const ENCAIXE_RANK: Record<string, number> = { direto: 3, adjacente: 2, brecha: 1 };
const ENCAIXE_WORD: Record<string, string> = {
  direto: "Direto",
  adjacente: "Adjacente",
  brecha: "Brecha",
};

export const dynamic = "force-dynamic";

export default async function ContasPage({
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
  // carteira tem a própria tela; o pilar Clientes é dos clientes de concorrentes.
  if (client.mode === "carteira") {
    redirect(`/carteira?cliente=${encodeURIComponent(cliente)}`);
  }

  const q = cliente ? `?cliente=${encodeURIComponent(cliente)}` : "";
  const contas = client.competitors.filter((c) => pillarOf(c, client.mode) === "conta-chave");

  let result: RadarLoopResult = { items: [], ranAt: "" };
  let error = false;
  try {
    result = await runRadarLoop();
  } catch {
    error = true;
  }
  const now = result.ranAt || new Date().toISOString();
  const jogadas = (result.relationshipPlays ?? []).filter((p) => p.clientName === cliente);
  const byConta = (name: string) => jogadas.filter((j) => j.conta === name);

  // Roll-up "contas que pedem ação": contas com ≥1 jogada acionável (direto/adjacente),
  // ranqueadas pela jogada mais forte. Brecha é estratégica — não entra na triagem de ação.
  // (As jogadas já vêm ordenadas por encaixe+score do loop, então byConta[0] é a mais forte.)
  const rollup = contas
    .map((c) => {
      const ps = byConta(c.name);
      return { conta: c, top: ps[0], acionaveis: ps.filter((p) => p.encaixe !== "brecha").length };
    })
    .filter((r) => r.top && r.acionaveis > 0)
    .sort(
      (a, b) => ENCAIXE_RANK[b.top.encaixe] - ENCAIXE_RANK[a.top.encaixe] || b.top.score - a.top.score,
    );

  return (
    <section className="mx-auto max-w-[1080px] px-5 py-8 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
        <Rotulo termo="contas_chave" /> · {cliente}
      </p>

      {/* sub-nav: fichas (esta) · vigiar (cadastro) */}
      <div className="mt-2 flex gap-1 border-b border-stone-200">
        <span className="border-b-2 border-stone-900 px-3 py-2 text-sm font-medium text-stone-900">
          Fichas
        </span>
        <Link
          href={`/contas/vigiar${q}`}
          className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-stone-500 hover:text-stone-900"
        >
          Monitorar
        </Link>
      </div>

      <header className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-stone-500">
          {jogadas.length} {jogadas.length === 1 ? "jogada ativa" : "jogadas ativas"} em{" "}
          {contas.length} {contas.length === 1 ? "conta" : "contas"}
          {result.ranAt ? <> · atualizado em {formatDateTimePtBR(result.ranAt)}</> : null}
        </p>
        {contas.length > 0 ? <RodarAgora testId="rodar-agora" cliente={cliente || undefined} /> : null}
      </header>

      {/* Roll-up: contas que pedem ação AGORA (a ficha continua sendo a estrela). */}
      {rollup.length > 0 ? (
        <section
          data-testid="contas-rollup"
          className="mt-5 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
            Contas que pedem ação ({rollup.length})
          </p>
          <ul className="mt-2 divide-y divide-stone-100">
            {rollup.map((r) => (
              <li key={r.conta.id} className="flex items-center gap-3 py-2.5">
                <ScoreBadge score={r.top.score} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-semibold text-stone-900">{r.conta.name}</span>
                    <span className="text-xs text-stone-400">· {ENCAIXE_WORD[r.top.encaixe]}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-stone-600">{r.top.sinal}</span>
                </span>
                <a
                  href={`#conta-${r.conta.id}`}
                  className="shrink-0 text-xs font-medium text-stone-500 underline-offset-2 hover:text-stone-900 hover:underline"
                >
                  ver ficha →
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-6">
        {error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-6 py-6 text-sm text-red-700">
            Não foi possível rodar o Radar agora.
          </p>
        ) : contas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
            <p className="text-base font-medium text-stone-700">Nenhuma conta-chave ainda.</p>
            <p className="mt-1 text-sm text-stone-500">
              Vá em <Link href={`/contas/vigiar${q}`} className="font-medium text-stone-700 underline-offset-2 hover:underline">Monitorar</Link>{" "}
              e cadastre as contas que quer acompanhar — igual você faz com concorrentes.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {contas.map((c) => (
              <div key={c.id} id={`conta-${c.id}`} className="scroll-mt-6">
                <FichaConta conta={c} jogadas={byConta(c.name)} now={now} clientName={cliente} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
