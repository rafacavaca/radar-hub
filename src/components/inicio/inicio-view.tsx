/**
 * VIEW da Home (Início) — Zona A "O negócio" (só quando `negocio` vem, i.e.
 * super_admin) + Zona B cockpit "Meus clientes". Server component: só desenho;
 * o único pedaço cliente é o <AutoRefreshStale> (aquece o cache se morno).
 */

import Link from "next/link";

import { AutoRefreshStale } from "@/components/auto-refresh-stale";
import { formatDateTimePtBR } from "@/lib/format";
import type { Cockpit, ClienteSaude } from "@/lib/inicio/cockpit";
import type { NegocioResumo } from "@/lib/inicio/negocio";

const fmtUSD = (n: number) => `$${n.toFixed(2)}`;

function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ── Zona A — O negócio (plataforma, cross-org, só super_admin) ───────────────

function StatTile({ label, valor, sub, alerta = false }: { label: string; valor: string; sub: string; alerta?: boolean }) {
  return (
    <div className={"rounded-xl border p-3 " + (alerta ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-stone-50/60")}>
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-stone-400">{label}</p>
      <p className={"mt-1 text-[22px] font-bold tabular-nums " + (alerta ? "text-amber-800" : "text-stone-900")}>{valor}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-stone-500">{sub}</p>
    </div>
  );
}

function ZonaNegocio({ negocio }: { negocio: NegocioResumo }) {
  const fc = negocio.firecrawl;
  return (
    <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-stone-900" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-500">O negócio · plataforma</p>
        <span className="ml-auto text-[11px] text-stone-400">só você vê</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Agências ativas"
          valor={String(negocio.agencias)}
          sub={negocio.agencias === 1 ? "só a sua, por ora" : "orgs na plataforma"}
        />
        <StatTile label={`Custo · ${negocio.mesLabel}`} valor={fmtUSD(negocio.custoMesUSD)} sub="LLM + coleta (estimativa)" />
        <StatTile
          label="Contas monitoradas"
          valor={String(negocio.contasMonitoradas)}
          sub={`${negocio.clientes} cliente${negocio.clientes === 1 ? "" : "s"} no total`}
        />
        <StatTile
          label="Cota Firecrawl"
          valor={String(fc.restante)}
          sub={fc.quota > 0 ? `de ${fc.quota} no ciclo${fc.alerta ? " — apertado" : ""}` : "sem chave configurada"}
          alerta={fc.alerta}
        />
      </div>
    </section>
  );
}

// ── Zona B — Cockpit "Meus clientes" (org-scoped) ────────────────────────────

function ClienteRow({ c }: { c: ClienteSaude }) {
  return (
    <Link
      href={c.href}
      className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-stone-300 hover:bg-stone-50/60"
    >
      <span aria-hidden className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-stone-900 text-xs font-semibold text-white">
        {monogram(c.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-stone-900">{c.name}</p>
        <p className="text-[12px] text-stone-500">{c.mode === "carteira" ? "carteira" : "concorrentes"}</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className={"text-[18px] font-bold tabular-nums " + (c.acao > 0 ? "text-red-700" : "text-stone-300")}>{c.acao}</p>
          <p className="text-[9.5px] uppercase tracking-wide text-stone-400">precisa de ação</p>
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-[18px] font-bold tabular-nums text-stone-700">{c.novos}</p>
          <p className="text-[9.5px] uppercase tracking-wide text-stone-400">novos hoje</p>
        </div>
        <span aria-hidden className="text-stone-300">→</span>
      </div>
    </Link>
  );
}

function ZonaCockpit({ cockpit }: { cockpit: Cockpit }) {
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-stone-900">Meus clientes</h2>
        <Link href="/hoje" className="text-[13px] font-semibold text-red-700 hover:text-red-800">
          Ver o dia no Hoje →
        </Link>
      </div>

      {/* saúde da operação — honesto (última varredura, coleta, cadência) */}
      <p className="mt-1 text-[13px] text-stone-500">
        {cockpit.ultimaVarredura ? <>última varredura {formatDateTimePtBR(cockpit.ultimaVarredura)}</> : "nunca rodou"}
        {" · "}
        {cockpit.falhasColeta > 0 ? (
          <span className="text-amber-700">coleta com {cockpit.falhasColeta} falha{cockpit.falhasColeta === 1 ? "" : "s"}</span>
        ) : (
          <span className="text-emerald-700">coleta ok</span>
        )}
        {" · "}
        <span className={cockpit.cadencia.ligada ? "text-stone-600" : "text-stone-400"}>{cockpit.cadencia.label}</span>
      </p>

      <div className="mt-4 space-y-2">
        {cockpit.clientes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
            <p className="text-base font-medium text-stone-700">Nenhum cliente ainda.</p>
            <p className="mt-1 text-sm text-stone-500">Adicione um cliente pela barra lateral (&ldquo;+ Novo cliente&rdquo;).</p>
          </div>
        ) : (
          cockpit.clientes.map((c) => <ClienteRow key={c.name} c={c} />)
        )}
      </div>
    </section>
  );
}

export function InicioView({
  cockpit,
  negocio,
  agora,
}: {
  cockpit: Cockpit;
  negocio: NegocioResumo | null;
  agora: string;
}) {
  return (
    <div className="mx-auto max-w-[1080px] px-5 py-8 sm:px-6">
      <AutoRefreshStale needsRefresh={cockpit.needsRefresh} />

      <header className="border-b-2 border-stone-900 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-red-700">Início</p>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-stone-900">O seu Radar</h1>
        <p className="mt-1.5 text-sm text-stone-500">
          O que precisa de você hoje — e a saúde das suas contas. · {formatDateTimePtBR(agora)}
        </p>
      </header>

      {negocio ? <ZonaNegocio negocio={negocio} /> : null}

      <ZonaCockpit cockpit={cockpit} />
    </div>
  );
}
