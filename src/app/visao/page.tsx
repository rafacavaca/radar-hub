/**
 * VISÃO DO CLIENTE — a home de cada conta no CRM (o dashboard do design).
 *
 * Três cartões de estado (sinais frescos · concorrentes vigiados · rodar) +
 * "Últimos gatilhos" (os sinais mais recentes, com data em 1º plano e fonte
 * citada). Tudo escopado ao cliente selecionado (?cliente=).
 *
 * Server component: roda o loop (cache diário) e lê watchlist + monitor visual.
 */

import Link from "next/link";

import { buildBriefing } from "@/lib/briefing";
import { ageInDays, formatDateShort, formatDateTimePtBR } from "@/lib/format";
import { analiseFalhou, runRadarLoop, type RadarLoopResult } from "@/lib/loop";
import { listVisualReports } from "@/lib/visual";
import { loadWatchlist } from "@/lib/watchlist";
import type { IntelligenceItem } from "@/lib/types";

import { AnaliseFalhouAviso } from "@/components/analise-falhou";
import { Rotulo } from "@/components/rotulo";
import { RodarAgora } from "@/components/rodar-agora";
import { ScoreBadge } from "@/components/score-badge";

export const dynamic = "force-dynamic";

export default async function VisaoPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const params = await searchParams;
  const watchlist = await loadWatchlist();
  const clientNames = watchlist.clients.map((c) => c.name);
  const cliente =
    params.cliente && clientNames.includes(params.cliente) ? params.cliente : (clientNames[0] ?? "");

  if (!cliente) {
    return (
      <div className="mx-auto max-w-[1080px] px-6 py-8">
        <EmptyClients />
      </div>
    );
  }

  let result: RadarLoopResult = { items: [], ranAt: "" };
  let error = false;
  try {
    result = await runRadarLoop();
  } catch {
    error = true;
  }
  // Cache "morto": coletou mas a análise inteira falhou → avisa, não finge calmaria.
  const stale = !error && analiseFalhou(result);

  const client = watchlist.clients.find((c) => c.name === cliente);
  const competitors = client?.competitors ?? [];
  const enabled = competitors.filter((c) => c.enabled).length;

  const events = (result.events ?? []).filter((e) => e.clientName === cliente);
  const now = result.ranAt || new Date().toISOString();
  const frescos = events.filter((e) => {
    const age = ageInDays(e.publishedAt ?? e.collectedAt, now);
    return age !== null && age <= 7;
  }).length;

  const visual = listVisualReports(cliente);
  const comMudanca = new Set(
    visual.filter((v) => v.verdict === "mudou").map((v) => v.competitorId),
  ).size;

  const gatilhos = buildBriefing(result.items.filter((it) => it.clientName === cliente), 4);

  return (
    <div className="mx-auto max-w-[1080px] px-5 py-8 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
        Visão do cliente
      </p>

      {/* três cartões de estado */}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <StatCard label="Sinais recentes">
          <span className="text-3xl font-bold text-emerald-600">{frescos}</span>
          <span className="ml-2 text-sm text-stone-500">nos últimos 7 dias</span>
        </StatCard>

        <StatCard label={<><Rotulo termo="concorrentes" /> monitorados</>}>
          <span className="text-3xl font-bold text-stone-900">{enabled}</span>
          <span className="ml-2 text-sm text-stone-500">
            {comMudanca > 0
              ? `${comMudanca} com mudança visual`
              : "identidade estável"}
          </span>
        </StatCard>

        <StatCard label="Última varredura">
          <span className="text-sm text-stone-600">
            {result.ranAt ? formatDateTimePtBR(result.ranAt) : "ainda não rodou"}
          </span>
          <div className="mt-3">
            <RodarAgora cliente={cliente} />
          </div>
        </StatCard>
      </div>

      {/* últimos gatilhos */}
      <div className="mt-8 flex items-baseline justify-between">
        <h2 className="text-[20px] font-semibold tracking-tight text-stone-900">
          Últimas oportunidades
        </h2>
        <Link
          href={`/?cliente=${encodeURIComponent(cliente)}`}
          className="text-sm font-medium text-red-600 hover:underline"
        >
          Ver o briefing
        </Link>
      </div>

      {stale ? (
        <div className="mt-3">
          <AnaliseFalhouAviso failures={result.failures} cliente={cliente} />
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-white">
          {error ? (
            <p className="px-5 py-6 text-sm text-stone-500">
              Não foi possível rodar o Radar agora.
            </p>
          ) : gatilhos.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium text-stone-700">Nenhum movimento ainda.</p>
              <div className="mt-4 flex justify-center">
                <RodarAgora cliente={cliente} />
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-stone-200">
              {gatilhos.map((item) => (
                <GatilhoRow key={item.id} item={item} now={now} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <p className="text-[13px] font-semibold text-stone-900">{label}</p>
      <div className="mt-3 flex items-baseline">{children}</div>
    </div>
  );
}

function GatilhoRow({ item, now }: { item: IntelligenceItem; now: string }) {
  const pub = item.eventIds?.length ? null : null; // items não guardam publishedAt; usamos coleta.
  void pub;
  return (
    <li className="flex items-start gap-4 px-4 py-3.5 sm:px-5">
      <ScoreBadge score={item.score} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug text-stone-900">{item.sinal}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-400">
          {item.concorrente ? <span>{item.concorrente}</span> : null}
          <SourceRef url={item.fonte.url} titulo={item.fonte.titulo} />
          <RecencyDot iso={item.createdAt} now={now} kind="coletado" />
        </div>
      </div>
      {(item.lentes ?? []).length > 0 ? (
        <div className="hidden flex-wrap gap-1 sm:flex">
          {(item.lentes ?? []).map((l) => (
            <span
              key={l}
              className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500"
            >
              {l[0].toUpperCase() + l.slice(1)}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}

/** Fonte citada — sempre. Host do link + ícone de link. */
function SourceRef({ url, titulo }: { url: string; titulo: string }) {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    host = titulo;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={titulo}
      className="text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline"
    >
      {host}
    </a>
  );
}

/** Semáforo simples de recência (fresco ≤30d / resto com a idade). */
function RecencyDot({ iso, now, kind }: { iso: string; now: string; kind: string }) {
  const age = ageInDays(iso, now);
  const label = formatDateShort(iso);
  if (age === null || !label) return <span className="text-stone-400">sem data</span>;
  const fresco = age <= 30;
  return (
    <span className={fresco ? "text-emerald-700" : "text-stone-400"}>
      {kind} {label}
    </span>
  );
}

function EmptyClients() {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
      <p className="text-base font-medium text-stone-700">Nenhum cliente ainda.</p>
      <p className="mt-1 text-sm text-stone-500">
        Use o “+ Novo cliente” no rodapé da barra lateral para cadastrar a primeira conta.
      </p>
    </div>
  );
}
