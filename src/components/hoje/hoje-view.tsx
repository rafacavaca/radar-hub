"use client";

/**
 * HOJE (view) — a cara de COCKPIT do ritual (F1.2 + F1.4). Server passa o
 * digest já AGRUPADO POR SINAL; aqui a tela:
 *  - abre com um topo glanceável (números do dia + barra de composição);
 *  - marca o NÃO-LIDO desde a última visita (localStorage por sinal) e dispara
 *    o evento que zera o contador da aba;
 *  - rende as seções com voz de software (Adiados · Requer atenção).
 *
 * "Novo" é atributo do sinal (selo + contador), não um balde separado — assim
 * nada reflowa depois da hidratação e um item não aparece em dois lugares.
 */

import { useEffect, useMemo, useState } from "react";

import { AtualizarDigest } from "@/components/atualizar-digest";
import { SignalCard } from "@/components/hoje/signal-card";
import { Tooltip } from "@/components/ui/tooltip";
import { formatDateTimePtBR } from "@/lib/format";
import type { DigestGroup } from "@/lib/digest";

const SEEN_KEY = "radar:hoje:seen";

/** Barra de composição do dia por tipo (mini-visual, sem lib — F2 traz gráficos). */
function CompBar({ grupos }: { grupos: DigestGroup[] }) {
  const KIND_ORDER = ["alerta", "gatilho", "jogada", "leitura", "relatorio"] as const;
  const KIND_LABEL: Record<string, string> = {
    alerta: "Alertas", gatilho: "Gatilhos", jogada: "Relacionamento", leitura: "Leituras", relatorio: "Relatórios",
  };
  // tom: alerta = acento vermelho (o urgente); resto = escala de tinta.
  const KIND_FILL: Record<string, string> = {
    alerta: "bg-red-500", gatilho: "bg-stone-700", jogada: "bg-stone-500", leitura: "bg-stone-400", relatorio: "bg-stone-300",
  };
  const counts = KIND_ORDER.map((k) => ({ k, n: grupos.filter((g) => g.head.kind === k).length })).filter((x) => x.n > 0);
  const total = counts.reduce((s, x) => s + x.n, 0);
  if (total === 0) return null;

  return (
    <div className="mt-3">
      <div className="flex h-2 overflow-hidden rounded-full bg-stone-100">
        {counts.map(({ k, n }) => (
          <div key={k} className={"h-full " + KIND_FILL[k]} style={{ width: `${(n / total) * 100}%` }} title={`${KIND_LABEL[k]}: ${n}`} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {counts.map(({ k, n }) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-stone-500">
            <span aria-hidden className={"inline-block h-2 w-2 rounded-full " + KIND_FILL[k]} />
            {KIND_LABEL[k]} <span className="font-semibold tabular-nums text-stone-700">{n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Metric({ n, label, tip, accent = false }: { n: number; label: string; tip: string; accent?: boolean }) {
  return (
    <Tooltip content={tip}>
      <span className="flex flex-col">
        <span className={"text-[26px] font-bold leading-none tabular-nums " + (accent && n > 0 ? "text-red-600" : "text-stone-900")}>{n}</span>
        <span className="mt-1 text-[11px] font-medium uppercase tracking-[0.06em] text-stone-400">{label}</span>
      </span>
    </Tooltip>
  );
}

export function HojeView({
  grupos,
  adiados,
  tranquilo,
  observacoes,
  clientesCount,
  geradoEm,
  tituloDia,
  now,
}: {
  grupos: DigestGroup[];
  adiados: DigestGroup[];
  tranquilo: boolean;
  observacoes: string[];
  clientesCount: number;
  geradoEm: string;
  tituloDia: string;
  now: string;
}) {
  // NÃO-LIDO: por sinal (group.key), desde a última visita. Marca visto ao ver.
  const allKeys = useMemo(() => [...adiados, ...grupos].map((g) => g.key), [adiados, grupos]);
  const keySig = allKeys.join(",");
  const [unseen, setUnseen] = useState<Set<string>>(new Set());

  useEffect(() => {
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]") as string[];
    } catch {
      seen = [];
    }
    const seenSet = new Set(seen);
    setUnseen(new Set(allKeys.filter((k) => !seenSet.has(k))));
    // marca tudo do dia como visto (cap p/ não crescer sem fim) e zera a aba.
    try {
      const union = Array.from(new Set([...seen, ...allKeys])).slice(-800);
      localStorage.setItem(SEEN_KEY, JSON.stringify(union));
      window.dispatchEvent(new CustomEvent("radar:hoje-seen"));
    } catch {
      /* localStorage indisponível — só não marca */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySig]);

  const novos = grupos.filter((g) => unseen.has(g.key)).length;
  const movimentos = grupos.filter((g) => g.head.kind === "alerta").length;

  return (
    <section className="mx-auto max-w-[860px] px-5 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Hoje</p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-stone-900 first-letter:uppercase">{tituloDia}</h1>
          <p className="mt-1 text-[12px] text-stone-400">
            Digest de {formatDateTimePtBR(geradoEm)} · {clientesCount} cliente(s) na base
          </p>
        </div>
        <AtualizarDigest />
      </header>

      {/* COCKPIT — bate o olho e sabe se o dia tem fogo */}
      {!tranquilo ? (
        <div className="mt-5 rounded-xl border border-stone-200 bg-white px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
            <Metric n={grupos.length} label="Requer atenção" tip="Sinais que ainda não foram processados hoje." />
            <Metric n={novos} label="Novos" tip="Sinais novos desde a sua última visita." accent />
            <Metric n={movimentos} label="Movimentos" tip="Alertas de diagnóstico de concorrentes na base." />
            {adiados.length > 0 ? <Metric n={adiados.length} label="Adiados" tip="Itens que você adiou e retornam hoje." /> : null}
          </div>
          <CompBar grupos={grupos} />
        </div>
      ) : null}

      {tranquilo ? (
        <div className="mt-8 rounded-xl border border-dashed border-stone-300 bg-white/60 px-8 py-16 text-center">
          <p className="text-lg font-medium text-stone-800">Dia tranquilo.</p>
          <p className="mt-1 text-sm text-stone-500">
            Nada requer atenção agora — nenhum movimento forte, alerta novo ou item adiado.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {adiados.length > 0 ? (
            <div>
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-stone-500">Adiados</h2>
              <div className="space-y-2.5">
                {adiados.map((g) => (
                  <SignalCard key={`v-${g.key}`} group={g} now={now} voltou unread={unseen.has(g.key)} />
                ))}
              </div>
            </div>
          ) : null}

          {grupos.length > 0 ? (
            <div>
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-stone-500">Requer atenção</h2>
              <div className="space-y-2.5">
                {grupos.map((g) => (
                  <SignalCard key={g.key} group={g} now={now} unread={unseen.has(g.key)} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {observacoes.length > 0 ? (
        <div className="mt-8 rounded-xl border border-stone-200 bg-stone-100/60 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Transparência da base</p>
          <ul className="mt-1.5 space-y-1 text-[13px] text-stone-500">
            {observacoes.map((o, i) => (
              <li key={i}>· {o}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
