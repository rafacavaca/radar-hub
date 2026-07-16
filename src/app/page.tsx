/**
 * BRIEFING DO DIA — a tela-ritual do Radar, agora POR ÓTICA (F6).
 *
 * Seletor no topo: GERAL (a visão do Rafael — os itens mais fortes across as
 * lentes) · COMERCIAL · PRODUTO · MARKETING (o mini-briefing de cada time, no
 * idioma dele). Cada visão de time tem o botão de ação certo (card no Formare
 * pra comercial/marketing; nota de roadmap interna pra produto) e um modo
 * APRESENTAR limpo/exportável. Com mais de um cliente, um seletor de cliente
 * aparece ao lado das lentes.
 *
 * Server component: roda o loop (cache diário — visitas repetidas são baratas)
 * e filtra por lente/cliente dos searchParams.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { buildBriefing } from "@/lib/briefing";
import { formatDateTimePtBR } from "@/lib/format";
import { loadLensesFor, LENS_LABEL, type LensId } from "@/lib/lenses";
import { analiseFalhou, runRadarLoop, type RadarLoopResult } from "@/lib/loop";
import { loadNotes, type RoadmapNote } from "@/lib/notes";
import { loadWatchlist } from "@/lib/watchlist";
import type { IntelligenceItem, LensReading } from "@/lib/types";

import type { CrossInsight, CrossVerdict } from "@/lib/cross-reference";

import { AnaliseFalhouAviso } from "@/components/analise-falhou";
import { CrossActionButton } from "@/components/cross-action-button";
import { GerarNoFormareButton } from "@/components/gerar-no-formare-button";
import { LensReadingCard, RoadmapNoteRow } from "@/components/lens-reading-card";
import { RodarAgora } from "@/components/rodar-agora";
import { FonteLink, ScoreBadge } from "@/components/score-badge";
import { Rotulo } from "@/components/rotulo";
import { loadPrioridade } from "@/lib/prioridade";
import { nivelPorCorte, type CortePrioridade } from "@/lib/prioridade-core";
import { attenuated, RecencyStamp, SourceRef } from "@/components/signal-meta";

export const dynamic = "force-dynamic";

type TabId = "geral" | LensId | "cruzamento";

const LENS_TABS: Array<{ id: TabId; label: string }> = [
  { id: "geral", label: "Geral" },
  { id: "comercial", label: "Comercial" },
  { id: "produto", label: "Produto" },
  { id: "marketing", label: "Marketing" },
  { id: "cruzamento", label: "Recomendações" },
];

const VERDICT_META: Record<CrossVerdict, { label: string; chip: string; hint: string }> = {
  meio_pronto: {
    label: "Meio-pronto — reativar",
    chip: "border-amber-300 bg-amber-50 text-amber-800",
    hint: "Você começou algo assim e parou. Reative antes do concorrente consolidar.",
  },
  gap: {
    label: "Gap — avaliar entrar",
    chip: "border-rose-300 bg-rose-50 text-rose-800",
    hint: "O mercado quer isto e você ainda não tem. Vale decidir se entra.",
  },
  ja_temos: {
    label: "Você já tem",
    chip: "border-emerald-300 bg-emerald-50 text-emerald-800",
    hint: "O mercado quer isto e você já entrega. Arme vendas e marketing.",
  },
  sem_dado_interno: {
    label: "Falta dado interno",
    chip: "border-stone-300 bg-stone-100 text-stone-600",
    hint: "A base de conhecimento não sabe o que você tem por dentro sobre isto — enriqueça-a pra destravar.",
  },
};

/** Texto honesto sobre a origem do contexto dos analistas. */
function brainNote(result: RadarLoopResult, clientName: string): string | null {
  const source = result.brainSources?.find((s) => s.clientName === clientName);
  if (!source) return null;
  if (source.mode === "live") return `Base de conhecimento ao vivo (${source.nodeCount} fatos confirmados)`;
  if (source.mode === "fixture") return "Base de conhecimento indisponível — usando resumo local";
  return "sem base de conhecimento do cliente";
}

export default async function BriefingPage({
  searchParams,
}: {
  searchParams: Promise<{ lente?: string; cliente?: string }>;
}) {
  const params = await searchParams;

  const watchlistClients = (await loadWatchlist()).clients;
  const clients = watchlistClients.map((c) => c.name);
  // P7 — a régua de prioridade da agência (org-level); vira score em palavra.
  const corte = await loadPrioridade();
  const cliente =
    params.cliente && clients.includes(params.cliente) ? params.cliente : (clients[0] ?? "");
  // cliente do modo carteira não tem Briefing de lentes — vai pra a Ficha.
  if (watchlistClients.find((c) => c.name === cliente)?.mode === "carteira") {
    redirect(`/carteira?cliente=${encodeURIComponent(cliente)}`);
  }
  const lente = (LENS_TABS.some((t) => t.id === params.lente) ? params.lente : "geral") as TabId;

  let result: RadarLoopResult = { items: [], ranAt: "" };
  let error: string | null = null;
  try {
    result = await runRadarLoop();
  } catch (err) {
    error = err instanceof Error ? err.message : "Não foi possível rodar o Radar.";
  }
  // Cache "morto": coletou mas a análise inteira falhou → avisa, não finge calmaria.
  const stale = !error && analiseFalhou(result);

  const lensConfig = lente !== "geral" ? (await loadLensesFor(cliente)).find((l) => l.id === lente) : null;
  const readings = (result.readings ?? []).filter(
    (r) => r.clientName === cliente && (lente === "geral" || r.lens === lente),
  );
  const geral = buildBriefing(result.items.filter((it) => it.clientName === cliente));
  const notes = lente === "produto" ? await loadNotes(cliente) : [];
  const crossInsights = (result.crossInsights ?? []).filter((c) => c.clientName === cliente);
  const brain = cliente ? brainNote(result, cliente) : null;

  const title =
    lente === "geral"
      ? "Radar — Briefing do dia"
      : lente === "cruzamento"
        ? "Radar — Recomendações"
        : `Radar ${LENS_LABEL[lente as LensId]}`;

  // No Geral, a manchete editorial ganha a contagem de sinais com análise.
  const editorialMeta =
    lente === "geral"
      ? `${geral.length} ${geral.length === 1 ? "sinal" : "sinais"} com análise`
      : null;

  return (
    <section className="mx-auto max-w-[1080px] px-5 py-8 sm:px-6">
      {/* Cabeçalho editorial — régua 2px de jornal, rótulo no vermelho da marca. */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-stone-900 pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-red-700">
            Briefing do dia
          </p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-stone-900">{title}</h1>
          <p className="mt-1.5 text-sm text-stone-500">
            {result.ranAt ? <>atualizado em {formatDateTimePtBR(result.ranAt)}</> : "ainda não rodou"}
            {editorialMeta ? <> · {editorialMeta}</> : null}
            {brain ? <> · {brain}</> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lente !== "geral" && lente !== "cruzamento" ? (
            <Link
              href={`/apresentar?lente=${lente}&cliente=${encodeURIComponent(cliente)}`}
              target="_blank"
              className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
            >
              Apresentar ↗
            </Link>
          ) : null}
          <RodarAgora testId="rodar-agora" cliente={cliente || undefined} />
        </div>
      </header>

      {/* Filtro de ÓTICA — segmented control FIXO (não é 2ª fileira de menu: fica
          pinado no topo do conteúdo e não some ao rolar). */}
      <div className="sticky top-0 z-20 -mx-5 mt-5 border-b border-stone-200 bg-stone-50/95 px-5 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="overflow-x-auto">
          <nav
            aria-label="Área do briefing"
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-100 p-1"
          >
            {LENS_TABS.map((tab) => {
              const active = tab.id === lente;
              const href = `/?lente=${tab.id}${cliente ? `&cliente=${encodeURIComponent(cliente)}` : ""}`;
              return (
                <Link
                  key={tab.id}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                    (active
                      ? "bg-white text-stone-900 shadow-sm"
                      : "text-stone-500 hover:text-stone-900")
                  }
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="mt-6">
        {error ? (
          <ErrorState message={error} />
        ) : stale ? (
          <AnaliseFalhouAviso failures={result.failures} cliente={cliente || undefined} />
        ) : lente === "geral" ? (
          <GeralView items={geral} now={result.ranAt || new Date().toISOString()} corte={corte} />
        ) : lente === "cruzamento" ? (
          <CrossView insights={crossInsights} />
        ) : !lensConfig?.enabled ? (
          <LensOffState lente={lente as LensId} />
        ) : (
          <TeamView lente={lente as LensId} readings={readings} notes={notes} />
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Visão GERAL — os itens mais fortes across as lentes (a visão do Rafael)
// ─────────────────────────────────────────────────────────────────────────────

function GeralView({ items, now, corte }: { items: IntelligenceItem[]; now: string; corte: CortePrioridade }) {
  if (items.length === 0) return <EmptyState />;
  // coluna editorial de leitura (o "ar de jornal" vem da medida, não da serifa).
  return (
    <div className="mx-auto max-w-[680px] space-y-5">
      {items.map((item) => (
        <BriefingCard key={item.id} item={item} now={now} corte={corte} />
      ))}
    </div>
  );
}

function BriefingCard({ item, now, corte }: { item: IntelligenceItem; now: string; corte: CortePrioridade }) {
  const velho = attenuated(item.publishedAt, item.collectedAt ?? item.createdAt, now);
  return (
    <article
      data-testid="intel-item"
      className={
        "rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7 " +
        (velho ? "opacity-70" : "")
      }
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-[22px] font-bold leading-[1.18] tracking-[-0.01em] text-stone-900 sm:text-[26px]">
          {item.sinal}
        </h2>
        <span
          className="inline-flex min-w-[48px] flex-none flex-col items-center justify-center rounded-md border border-stone-200 bg-stone-100 px-2 py-1"
          title={`Prioridade ${item.score}/100 — ${nivelPorCorte(item.score, corte)}`}
        >
          <span className="text-[15px] font-semibold leading-none tabular-nums text-stone-900">{item.score}</span>
          <span className="mt-0.5 text-[8px] font-medium uppercase leading-none tracking-wide text-stone-400">
            {nivelPorCorte(item.score, corte)}
          </span>
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {(item.lentes ?? []).map((lens) => (
          <span
            key={lens}
            className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-semibold text-stone-500"
          >
            {LENS_LABEL[lens]}
          </span>
        ))}
        <SourceRef url={item.fonte.url} titulo={item.fonte.titulo} />
      </div>

      <RecencyStamp
        publishedAt={item.publishedAt}
        collectedAt={item.collectedAt ?? item.createdAt}
        now={now}
        className="mt-2"
      />

      <div className="mt-5 border-t border-stone-200 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-red-700">
          Por que importa
        </p>
        <p className="mt-1.5 text-[15px] leading-[1.6] text-stone-700">{item.porQueImporta}</p>
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
          Ação recomendada
        </p>
        <p className="mt-1.5 text-[15px] leading-[1.6] text-stone-800">{item.acao}</p>
      </div>

      <div className="mt-5">
        <GerarNoFormareButton itemId={item.id} />
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Visão de TIME — o mini-briefing de uma lente, no idioma do time
// ─────────────────────────────────────────────────────────────────────────────

function TeamView({
  lente,
  readings,
  notes,
}: {
  lente: LensId;
  readings: LensReading[];
  notes: RoadmapNote[];
}) {
  return (
    <div className="space-y-4">
      {readings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
          <p className="text-base font-medium text-stone-700">
            Nenhuma leitura {LENS_LABEL[lente].toLowerCase()} hoje.
          </p>
          <p className="mt-1 text-sm text-stone-500">
            Nada passou na régua desta área — ajuste-a em{" "}
            <Link href="/analistas" className="underline underline-offset-2 hover:text-stone-700">
              Analistas
            </Link>{" "}
            ou rode o Radar de novo.
          </p>
        </div>
      ) : (
        readings.map((reading) => <LensReadingCard key={reading.id} reading={reading} />)
      )}

      {lente === "produto" && notes.length > 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
          <p className="border-b border-stone-100 px-4 py-3 text-xs font-medium uppercase tracking-wide text-stone-400 sm:px-5">
            Notas de roadmap guardadas
          </p>
          <ul className="divide-y divide-stone-100">
            {notes.map((note) => (
              <RoadmapNoteRow key={note.id} note={note} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Visão INTERNO × EXTERNO — o cruzamento (a mina de ouro)
// ─────────────────────────────────────────────────────────────────────────────

function CrossView({ insights }: { insights: CrossInsight[] }) {
  if (insights.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
        <p className="text-base font-medium text-stone-700">Nenhuma recomendação nesta rodada.</p>
        <p className="mt-1 text-sm text-stone-500">
          O Radar cruza os movimentos dos <Rotulo termo="concorrentes" lower /> com o que a <Rotulo termo="base_conhecimento" lower /> sabe do
          cliente. Quanto mais rica a base (o que vocês têm, começaram, deixaram parado), mais ouro aqui.
        </p>
      </div>
    );
  }

  // separa os acionáveis dos "falta dado interno" (mostrados por último, com convite).
  const acionaveis = insights.filter((i) => i.verdict !== "sem_dado_interno");
  const semDado = insights.filter((i) => i.verdict === "sem_dado_interno");

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        O mesmo movimento do <Rotulo termo="concorrentes" singular lower />, cruzado com o que o cliente tem por dentro. O ouro é o{" "}
        <span className="font-medium text-amber-700">meio-pronto</span> — algo que vocês começaram e
        pararam.
      </p>
      {acionaveis.map((insight) => (
        <CrossCard key={insight.id} insight={insight} />
      ))}

      {semDado.length > 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
          <p className="border-b border-stone-100 px-4 py-3 text-xs font-medium uppercase tracking-wide text-stone-400 sm:px-5">
            Falta dado interno — enriqueça a base de conhecimento pra destravar
          </p>
          <ul className="divide-y divide-stone-100">
            {semDado.map((insight) => (
              <li key={insight.id} className="px-4 py-3 sm:px-5">
                <p className="text-sm font-medium text-stone-800">
                  {insight.concorrente ? `${insight.concorrente}: ` : ""}
                  {insight.sinal}
                </p>
                <p className="mt-0.5 text-sm text-stone-500">{insight.interno}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CrossCard({ insight }: { insight: CrossInsight }) {
  const meta = VERDICT_META[insight.verdict];
  return (
    <article
      data-testid="cross-insight"
      className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-start gap-4">
        <ScoreBadge score={insight.score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={"rounded-full border px-2 py-0.5 text-xs font-medium " + meta.chip}
            >
              {meta.label}
            </span>
            {insight.concorrente ? (
              <span className="text-xs font-medium uppercase tracking-wide text-stone-400">
                {insight.concorrente}
              </span>
            ) : null}
          </div>
          <h2 className="mt-1 text-lg font-semibold leading-snug tracking-tight text-stone-900">
            {insight.sinal}
          </h2>
          <FonteLink fonte={insight.fonte} className="mt-1 max-w-full text-sm" />
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Externo</p>
          <p className="mt-1 text-sm leading-relaxed text-stone-700">{insight.externo}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
            Interno (o cliente)
          </p>
          <p className="mt-1 text-sm leading-relaxed text-stone-700">{insight.interno}</p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border-l-2 border-emerald-400 bg-emerald-50/60 py-3 pl-4 pr-3">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700"><Rotulo termo="oportunidade" /></p>
        <p className="mt-1 leading-relaxed text-stone-800">{insight.oportunidade}</p>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-stone-100 pt-4">
        <span className="text-xs text-stone-400">{meta.hint}</span>
        <CrossActionButton insightId={insight.id} verdict={insight.verdict} />
      </div>
    </article>
  );
}

function LensOffState({ lente }: { lente: LensId }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
      <p className="text-base font-medium text-stone-700">
        A área {LENS_LABEL[lente]} está desligada para este cliente.
      </p>
      <p className="mt-1 text-sm text-stone-500">
        Ligue-a em{" "}
        <Link href="/analistas" className="underline underline-offset-2 hover:text-stone-700">
          Analistas
        </Link>{" "}
        e rode o Radar de novo.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
      <p className="text-base font-medium text-stone-700">Nenhum movimento relevante ainda.</p>
      <p className="mt-1 text-sm text-stone-500">
        Rode o Radar para buscar os últimos movimentos dos <Rotulo termo="concorrentes" lower />.
      </p>
      <div className="mt-5 flex justify-center">
        <RodarAgora />
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center">
      <p className="text-base font-medium text-red-800">Não foi possível rodar o Radar agora.</p>
      <p className="mt-1 text-sm text-red-600">{message}</p>
      <div className="mt-5 flex justify-center">
        <RodarAgora variant="ghost" />
      </div>
    </div>
  );
}
