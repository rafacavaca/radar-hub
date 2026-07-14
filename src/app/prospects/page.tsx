/**
 * PROSPECTS (F1) — a tela por cliente: as empresas que o vendedor vai visitar.
 * Adicionar é barato (nome + site); o dossiê (caro, debita crédito) é gerado na
 * tela de cada prospect. Escopo por ?cliente=; org-scoped no store.
 */

import { redirect } from "next/navigation";

import { ProspectsList } from "@/components/prospects/prospects-list";
import { loadProspects } from "@/lib/prospects/store";
import { loadWatchlist } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const params = await searchParams;
  const clientNames = (await loadWatchlist()).clients.map((c) => c.name);
  const cliente = params.cliente && clientNames.includes(params.cliente) ? params.cliente : (clientNames[0] ?? "");
  if (!cliente) redirect("/visao");

  const prospects = await loadProspects(cliente);

  return (
    <section className="mx-auto max-w-[860px] px-5 py-8 sm:px-6">
      <header className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Prospects</p>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-stone-900">Preparo de reunião</h1>
        <p className="mt-1 text-sm text-stone-500">
          Adicione uma empresa que vai visitar — o Radar monta um dossiê (perfil, concorrentes, sinais,
          aderência, preparação) pra você entrar preparado. On-demand, com fonte em tudo.
        </p>
      </header>

      <ProspectsList cliente={cliente} prospects={prospects} />
    </section>
  );
}
